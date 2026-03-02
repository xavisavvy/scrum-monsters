import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./websocket.js";
import authRoutes from "./auth/routes.js";
import profileRoutes from "./auth/profileRoutes.js";
import { profileLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { generateToken, csrfSynchronisedProtection } from './middleware/csrf.js';
import { storage, PgStorage } from './storage.js';

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

  // Lobby invite redirect endpoint
  app.get('/join/:lobbyId', (req, res) => {
    const { lobbyId } = req.params;
    // Validate: 6 alphanumeric chars (matches generateLobbyCode output)
    // Case-insensitive so users can type lowercase URLs, normalized to uppercase
    if (!/^[A-Z0-9]{6}$/i.test(lobbyId)) {
      return res.redirect('/?error=invalid-invite');
    }
    res.redirect(`/?join=${encodeURIComponent(lobbyId.toUpperCase())}`);
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
