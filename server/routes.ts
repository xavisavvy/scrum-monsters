import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./websocket.js";
import authRoutes from "./auth/routes.js";
import profileRoutes from "./auth/profileRoutes.js";
import { profileLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { generateToken, csrfSynchronisedProtection } from './middleware/csrf.js';
import { storage, PgStorage } from './storage.js';
import { getMetrics, getMetricsContentType, metricsMiddleware } from "./metrics.js";

// Import session middleware from index (circular import avoided by lazy loading)
let sessionMiddlewareRef: RequestHandler | null = null;
export function setSessionMiddleware(middleware: RequestHandler) {
  sessionMiddlewareRef = middleware;
}
export function getSessionMiddleware(): RequestHandler | null {
  return sessionMiddlewareRef;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server first
  const httpServer = createServer(app);

  // Prometheus metrics endpoint — before rate limiter so Prometheus can always scrape
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', getMetricsContentType());
      res.end(await getMetrics());
    } catch (err) {
      res.status(500).end(String(err));
    }
  });

  // HTTP metrics middleware — after /metrics route to avoid self-referential noise
  app.use(metricsMiddleware());

  // Rate limiting (applied before route handlers)
  app.use('/api/user', profileLimiter);
  app.use('/api', apiLimiter);

  // CSRF token endpoint — GET so no CSRF check needed, session must exist first
  app.get('/api/csrf-token', (req, res) => {
    const token = generateToken(req);
    res.json({ csrfToken: token });
  });

  // CSRF protection on state-changing endpoints
  // GET/HEAD/OPTIONS automatically skipped by csrfSynchronisedProtection
  app.use('/api/user', csrfSynchronisedProtection);

  // Mount auth routes
  app.use("/api/auth", authRoutes);
  app.use("/api/user", profileRoutes);

  // Helper function for readiness checks
  async function checkReadiness(): Promise<{ status: number; body: object }> {
    const checks: Record<string, { healthy: boolean; message?: string }> = {};

    if (storage instanceof PgStorage) {
      try {
        const sql = storage.getSql();
        await Promise.race([
          sql`SELECT 1 as health`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database health check timeout (3s)')), 3000)
          ),
        ]);
        checks.database = { healthy: true };
      } catch (error) {
        checks.database = {
          healthy: false,
          message: error instanceof Error ? error.message : 'Unknown database error',
        };
      }
    } else {
      checks.database = { healthy: true, message: 'in-memory storage' };
    }

    const isReady = Object.values(checks).every((check) => check.healthy);
    return {
      status: isReady ? 200 : 503,
      body: {
        status: isReady ? 'ok' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Liveness probe - simple heartbeat, never checks database
  // Kubernetes uses this to decide when to restart container
  app.get('/api/health/livez', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness probe - comprehensive check including database
  // Kubernetes uses this to decide when to route traffic to this pod
  app.get('/api/health/readyz', async (_req, res) => {
    const result = await checkReadiness();
    res.status(result.status).json(result.body);
  });

  // Backward-compatible health check endpoint (delegates to readyz)
  app.get('/api/health', async (_req, res) => {
    const result = await checkReadiness();
    res.status(result.status).json(result.body);
  });

  // Version endpoint — lets users/operators verify which deploy is live
  // by hitting `https://scrummonsters.com/api/version` in a browser.
  // `commit` and `builtAt` come from build-time env vars (set by Docker
  // build via GIT_COMMIT/BUILD_TIME args); `version` from package.json.
  app.get('/api/version', (_req, res) => {
    let pkgVersion = 'unknown';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      pkgVersion = require('../package.json').version || 'unknown';
    } catch {
      // package.json not resolvable in some bundled-server scenarios;
      // fall through to 'unknown'.
    }
    res.json({
      version: pkgVersion,
      commit: process.env.GIT_COMMIT || 'unknown',
      builtAt: process.env.BUILD_TIME || 'unknown',
      uptime: Math.round(process.uptime()),
    });
  });

  // WebSocket health check endpoint
  app.get('/api/ws-health', (req, res) => {
    const io = (httpServer as any).io;
    if (!io) {
      return res.status(503).json({
        status: 'error',
        message: 'WebSocket server not initialized',
        timestamp: new Date().toISOString()
      });
    }

    const sockets = Array.from(io.sockets.sockets.values());
    const connectedCount = sockets.length;

    // Import gameState to check lobby status
    const { gameState } = require('./gameState.js');
    const lobbies = (gameState as any).lobbies;
    const lobbyCount = lobbies ? lobbies.size : 0;

    res.json({
      status: 'ok',
      websocket: {
        connected: connectedCount,
        lobbies: lobbyCount,
        transports: sockets.map((s: any) => s.conn.transport.name),
      },
      timestamp: new Date().toISOString()
    });
  });

  // Lobby invite redirect endpoint — direct single-hop to /game/:lobbyId.
  // The legacy `?join=` query-param form still works (handled by the SPA's
  // index loader for backwards compatibility with any links in the wild).
  app.get('/join/:lobbyId', (req, res) => {
    const { lobbyId } = req.params;
    // Validate: 6 alphanumeric chars (matches generateLobbyCode output)
    // Case-insensitive so users can type lowercase URLs, normalized to uppercase
    if (!/^[A-Z0-9]{6}$/i.test(lobbyId)) {
      return res.redirect('/?error=invalid-invite');
    }
    res.redirect(`/game/${encodeURIComponent(lobbyId.toUpperCase())}`);
  });

  // Marketing page route
  app.get('/marketing', (req, res) => {
    // Redirect to frontend landing page (default behavior)
    res.redirect('/');
  });

  // REMOVED: Legacy server-side redirects for /about, /features, /pricing, /support, /game
  // These routes are now handled by React Router v7 (client-side) for clean URLs and SEO
  // The Vite SPA fallback (server/vite.ts) serves index.html with injected meta tags for all routes

  // Recurring lobby route - for bookmarkable meeting rooms
  app.get('/room/:roomId', (req, res) => {
    const { roomId } = req.params;
    // Validate roomId format (alphanumeric, hyphens, 3-30 chars)
    if (!/^[a-zA-Z0-9-]{3,30}$/.test(roomId)) {
      return res.redirect('/?error=invalid-room-id');
    }
    // Redirect to frontend with room parameter
    res.redirect(`/?room=${roomId.toLowerCase()}`);
  });

  // Setup WebSocket server and attach to httpServer for health checks
  const { io, cleanup } = setupWebSocket(httpServer, sessionMiddlewareRef);
  (httpServer as any).io = io; // Attach for health check access
  (httpServer as any).cleanupWebSocket = cleanup; // Attach cleanup for graceful shutdown

  return httpServer;
}
