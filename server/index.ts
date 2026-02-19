// Global error handlers — safety net for unhandled errors
// MUST be at top of file before any other code
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, exit to let container orchestrator restart
  // In development, keep running for debugging
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // Always exit on uncaught exception — process state is unreliable
  process.exit(1);
});

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes, setSessionMiddleware } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeRedis, shutdownRedis, isRedisConnected } from "./redis";
import { configurePassport } from "./auth/passport.js";
import { validateEnv } from "./config/env.js";
import { checkDatabaseHealth } from "./db/health.js";
import { storage, PgStorage } from "./storage.js";

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
    errorLog: console.error.bind(console),
  });
  console.log("Using PostgreSQL session store (pruning every 15 min, 7-day TTL)");
} else {
  console.log("Using in-memory session store (no DATABASE_URL set)");
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

// Initialize Passport
const passport = configurePassport();
app.use(passport.initialize());
app.use(passport.session());

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
    console.log('📦 Redis caching enabled');
  } else {
    console.log('📦 Running without Redis cache (in-memory only)');
  }

  // Verify database connectivity (fail-fast if DATABASE_URL set but DB unreachable)
  await checkDatabaseHealth();

  const server = await registerRoutes(app);

  // Configure server timeouts for production stability
  // Replit-specific: More generous timeouts for their proxy layer
  const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === '1';

  server.keepAliveTimeout = isReplitDeployment ? 95000 : 65000; // 95s for Replit (> 90s ping cycle)
  server.headersTimeout = isReplitDeployment ? 96000 : 66000; // Slightly higher than keepAliveTimeout
  server.requestTimeout = 120000; // 2 minutes for long-running requests

  console.log(`⚙️  Server timeouts configured:`);
  console.log(`   - Keep-alive: ${server.keepAliveTimeout}ms`);
  console.log(`   - Headers: ${server.headersTimeout}ms`);
  console.log(`   - Request: ${server.requestTimeout}ms`);

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
  // Use port 5000 for Replit, 5001 for local development
  const isReplit = process.env.REPLIT_DEPLOYMENT === '1' || process.env.REPLIT_DEV_DOMAIN;
  const port = isReplit ? 5000 : env.PORT;
  server.listen({
    port,
    host: process.env.HOST || "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);

    // Clean up WebSocket intervals
    if ((server as any).cleanupWebSocket) {
      (server as any).cleanupWebSocket();
    }

    await shutdownRedis();

    // Close database connections
    if (storage instanceof PgStorage) {
      console.log("Closing database connections...");
      await storage.close();
      console.log("Database connections closed");
    }

    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
