import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./websocket.js";
import authRoutes from "./auth/routes.js";
import profileRoutes from "./auth/profileRoutes.js";

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

  // Mount auth routes
  app.use("/api/auth", authRoutes);
  app.use("/api/user", profileRoutes);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
    // Redirect to frontend with lobby ID
    res.redirect(`/?join=${lobbyId}`);
  });

  // Marketing page route
  app.get('/marketing', (req, res) => {
    // Redirect to frontend landing page (default behavior)
    res.redirect('/');
  });

  // Direct game access route
  app.get('/game', (req, res) => {
    // Redirect to frontend with game menu parameter
    res.redirect('/?game=menu');
  });

  // About page route
  app.get('/about', (req, res) => {
    // Redirect to frontend with about parameter
    res.redirect('/?page=about');
  });

  // Features page route
  app.get('/features', (req, res) => {
    // Redirect to frontend with features parameter
    res.redirect('/?page=features');
  });

  // Pricing page route
  app.get('/pricing', (req, res) => {
    // Redirect to frontend with pricing parameter
    res.redirect('/?page=pricing');
  });

  // Support page route
  app.get('/support', (req, res) => {
    // Redirect to frontend with support parameter
    res.redirect('/?page=support');
  });

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
