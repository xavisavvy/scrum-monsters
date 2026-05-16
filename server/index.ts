// Import logger first for error handlers
import logger, { httpLogger } from "./logger.js";

// Global error handlers — safety net for unhandled errors
// MUST be at top of file before any other code
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  httpLogger.fatal({ reason, promise }, 'Unhandled Rejection');
  // In production, exit to let container orchestrator restart
  // In development, keep running for debugging
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  httpLogger.fatal({ err: error }, 'Uncaught Exception');
  // Always exit on uncaught exception — process state is unreliable
  process.exit(1);
});

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes, setSessionMiddleware } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeRedis, shutdownRedis } from "./redis";
import { configureAuth0, syncAuth0ToSession } from "./auth/auth0.js";
import { globalAuthLimiter } from "./middleware/rateLimiter.js";
import { validateEnv } from "./config/env.js";
import { checkDatabaseHealth } from "./db/health.js";
import { storage, PgStorage } from "./storage.js";
import { dbLogger } from "./logger.js";

// Validate environment variables (fail-fast on misconfiguration)
const env = validateEnv();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Trust first proxy hop (Kubernetes ingress / Cloudflare) for correct client IP
// in X-Forwarded-For headers. Required for express-rate-limit to use real IPs.
app.set('trust proxy', 1);

// Session configuration
const sessionSecret = env.SESSION_SECRET;

// Configure session store
let sessionStore: session.Store | undefined;
if (process.env.DATABASE_URL) {
  const PgSession = connectPgSimple(session);
  sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 900,    // Prune expired sessions every 15 minutes (seconds)
    ttl: 7 * 24 * 60 * 60,       // 7-day session lifetime (seconds) — matches cookie maxAge
    errorLog: dbLogger.error.bind(dbLogger),
  });
  dbLogger.info('Using PostgreSQL session store (pruning every 15 min, 7-day TTL)');
} else {
  httpLogger.info('Using in-memory session store (no DATABASE_URL set)');
}

// Create session middleware (exported for Socket.IO integration)
export const sessionMiddleware = session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: "lax",
  },
  name: "scrumquest.sid",
});

app.use(sessionMiddleware);

// Share session middleware with routes for Socket.IO
setSessionMiddleware(sessionMiddleware);

// Initialize Auth0 (only if configured)
if (process.env.AUTH0_CLIENT_ID && process.env.AUTH0_ISSUER_BASE_URL && process.env.AUTH0_SECRET) {
  // Gate Auth0 middlewares with a generous app-level rate limit.
  // syncAuth0ToSession does a per-request DB lookup; without this an
  // unauthenticated attacker could DoS the storage layer. Probe paths
  // (/api/health*, /api/version, /api/ws-health, /metrics) are exempt.
  app.use(globalAuthLimiter);
  app.use(configureAuth0());
  app.use(syncAuth0ToSession());
  httpLogger.info('Auth0 authentication enabled');
} else {
  httpLogger.info('Auth0 not configured — running without authentication');
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize Redis (optional - app works without it)
  const redisAvailable = await initializeRedis();
  if (redisAvailable) {
    dbLogger.info('Redis caching enabled');
  } else {
    dbLogger.info('Running without Redis cache (in-memory only)');
  }

  // Verify database connectivity (fail-fast if DATABASE_URL set but DB unreachable)
  await checkDatabaseHealth();

  const server = await registerRoutes(app);

  // Configure server timeouts for production stability
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000; // Slightly higher than keepAliveTimeout
  server.requestTimeout = 120000; // 2 minutes for long-running requests

  httpLogger.info({
    keepAlive: server.keepAliveTimeout,
    headers: server.headersTimeout,
    request: server.requestTimeout
  }, 'Server timeouts configured');

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app (both API and client)
  const port = env.PORT;
  server.listen({
    port,
    host: process.env.HOST || "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);

    // Structured startup configuration logging
    logger.info({
      msg: 'Scrum Monsters server started',
      environment: env.NODE_ENV,
      nodeVersion: process.version,
      database: storage instanceof PgStorage ? 'PostgreSQL' : 'In-Memory',
      dbPoolMax: storage instanceof PgStorage ? env.DB_POOL_MAX : undefined,
      dbPoolIdleTimeout: storage instanceof PgStorage ? `${env.DB_POOL_IDLE_TIMEOUT}s` : undefined,
      port,
      sessionStore: sessionStore ? 'PostgreSQL' : 'In-Memory',
      redis: redisAvailable ? 'connected' : 'disabled',
    });
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    httpLogger.info({ signal }, 'Graceful shutdown initiated');

    // Force exit after 30s to prevent hanging (Kubernetes SIGKILL at 30s)
    const forceExitTimeout = setTimeout(() => {
      httpLogger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000);
    forceExitTimeout.unref(); // Don't keep event loop alive

    try {
      // 1. Notify all connected WebSocket clients
      const io = (server as any).io;
      if (io) {
        io.emit('server_shutdown', {
          message: 'Server shutting down for maintenance',
          reconnectDelayMs: 30000,
        });
        // Wait for clients to receive notification
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Close Socket.IO connections (server.close() alone does NOT close WebSockets)
        await new Promise<void>((resolve) => {
          io.close(() => resolve());
        });
      }

      // 2. Stop accepting new connections and clean up intervals
      if ((server as any).cleanupWebSocket) {
        (server as any).cleanupWebSocket();
      }

      // 3. Close Redis connections
      await shutdownRedis();

      // 4. Close database connections
      if (storage instanceof PgStorage) {
        dbLogger.info('Closing database connections');
        await storage.close();
        dbLogger.info('Database connections closed');
      }

      // 5. Close HTTP server (stops accepting new requests)
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      clearTimeout(forceExitTimeout);
      httpLogger.info('Server closed');
      process.exit(0);
    } catch (error) {
      httpLogger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
