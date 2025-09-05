import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./websocket.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Lobby invite redirect endpoint
  app.get('/join/:lobbyId', (req, res) => {
    const { lobbyId } = req.params;
    // Redirect to frontend with lobby ID
    res.redirect(`/?join=${lobbyId}`);
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket server
  setupWebSocket(httpServer);

  return httpServer;
}
