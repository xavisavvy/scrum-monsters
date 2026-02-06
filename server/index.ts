import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import rateLimit from "express-rate-limit";
import { registerRoutes, setSessionMiddleware } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeRedis, shutdownRedis, isRedisConnected } from "./redis";
import { configurePassport } from "./auth/passport.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Session configuration
const sessionSecret = process.env.SESSION_SECRET || "scrumquest-dev-secret-change-in-production";

// Configure session store
let sessionStore: session.Store | undefined;
if (process.env.DATABASE_URL) {
  const PgSession = connectPgSimple(session);
  sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",
    createTableIfMissing: true,
  });
  console.log("🔐 Using PostgreSQL session store");
} else {
  console.log("🔐 Using in-memory session store (no DATABASE_URL set)");
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

// Configure CSRF protection (Double Submit Cookie pattern)
const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => sessionSecret,
  getSessionIdentifier: (req) => req.sessionID || "",
  cookieName: "x-csrf-token",
  cookieOptions: {
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"] as string | undefined,
});

// Expose CSRF token generation for routes that need it
export const csrfProtection = doubleCsrfProtection;

// Expose CSRF token endpoint (no protection needed - GET request)
app.get("/api/csrf-token", (req, res) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken });
});

// Configure rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: { error: "Too many authentication attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/api/health") || req.path.startsWith("/api/ws-health"),
});

// Apply rate limiting to API routes
app.use("/api/auth/", authLimiter);
app.use("/api/profile/", authLimiter);
app.use("/api/", apiLimiter);

// Apply CSRF protection to all mutation endpoints
app.use(doubleCsrfProtection);

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
    // Handle CSRF token errors
    if (err === invalidCsrfTokenError) {
      return res.status(403).json({
        error: "Invalid CSRF token",
        message: "Form submission rejected due to invalid security token. Please refresh and try again.",
      });
    }

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
  const port = parseInt(process.env.PORT || '5001', 10);
  server.listen({
    port,
    host: process.env.HOST || "127.0.0.1",
  }, () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    await shutdownRedis();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
