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

  const httpServer = createServer(app);
  
  // Setup WebSocket server
  setupWebSocket(httpServer);

  return httpServer;
}
