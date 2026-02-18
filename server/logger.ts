import pino, { Logger, LoggerOptions } from "pino";
import { randomBytes } from "crypto";

/**
 * Log levels in order of severity
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Base configuration for all loggers
 */
const baseConfig: LoggerOptions = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  // Redact sensitive fields
  redact: {
    paths: [
      "password",
      "token",
      "secret",
      "authorization",
      "cookie",
      "*.password",
      "*.token",
      "*.secret",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
  // Format options based on environment
  ...(process.env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
};

/**
 * Root logger instance
 * Use child loggers for component-specific logging
 */
export const logger: Logger = pino(baseConfig);

/**
 * HTTP request logger
 * Use for Express middleware and request/response logging
 */
export const httpLogger: Logger = logger.child({
  component: "http",
});

/**
 * WebSocket/Socket.IO logger
 * Use for connection events, message handling, room management
 */
export const socketLogger: Logger = logger.child({
  component: "socket",
});

/**
 * Game logic logger
 * Use for game state changes, combat, voting, phase transitions
 */
export const gameLogger: Logger = logger.child({
  component: "game",
});

/**
 * Database logger
 * Use for queries, connections, migrations
 */
export const dbLogger: Logger = logger.child({
  component: "db",
});

/**
 * Authentication logger
 * Use for login, logout, session, OAuth
 */
export const authLogger: Logger = logger.child({
  component: "auth",
});

/**
 * Create a scoped logger for a specific lobby/session
 * @param lobbyCode - The lobby code to scope to
 */
export function createLobbyLogger(lobbyCode: string): Logger {
  return gameLogger.child({ lobbyCode });
}

/**
 * Create a scoped logger for a specific player
 * @param playerId - The player ID to scope to
 * @param playerName - Optional player name for readability
 */
export function createPlayerLogger(playerId: string, playerName?: string): Logger {
  return gameLogger.child({
    playerId,
    ...(playerName ? { playerName } : {}),
  });
}

/**
 * Express HTTP request logging middleware
 * Logs request start and response with timing
 */
export function httpLoggerMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const requestId = req.headers["x-request-id"] || crypto.randomUUID?.() || randomBytes(8).toString('hex');

    // Add request ID to response headers
    res.setHeader("X-Request-ID", requestId);

    // Create request-scoped logger
    const reqLogger = httpLogger.child({ requestId });

    // Log request start
    reqLogger.debug({
      msg: "Request started",
      method: req.method,
      url: req.url,
      userAgent: req.headers["user-agent"],
      ip: req.ip || req.connection?.remoteAddress,
    });

    // Log response on finish
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const logLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

      reqLogger[logLevel]({
        msg: "Request completed",
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get?.("content-length"),
      });
    });

    next();
  };
}

/**
 * Log a game event with structured data
 */
export function logGameEvent(
  event: string,
  data: Record<string, unknown>,
  lobbyCode?: string
): void {
  const log = lobbyCode ? createLobbyLogger(lobbyCode) : gameLogger;
  log.info({ event, ...data });
}

/**
 * Log a socket event with structured data
 */
export function logSocketEvent(
  event: string,
  data: Record<string, unknown>,
  socketId?: string
): void {
  socketLogger.info({
    event,
    socketId,
    ...data,
  });
}

export default logger;
