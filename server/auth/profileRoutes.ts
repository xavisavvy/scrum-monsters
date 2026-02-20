import { Router, Request, Response } from "express";
import { storage } from "../storage.js";
import { isAuthenticated } from "./routes.js";
import { authLogger } from '../logger.js';

const router = Router();

// Get user profile
router.get("/profile", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const profile = await storage.getUserProfile(userId);

    if (!profile) {
      // Create default profile if it doesn't exist
      const newProfile = await storage.createUserProfile({ userId });
      return res.json({ profile: newProfile });
    }

    res.json({ profile });
  } catch (err) {
    authLogger.error({ err }, 'Error fetching profile');
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Update user profile
router.put("/profile", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { preferredAvatar, preferredTeam, audioEnabled, musicVolume, sfxVolume, settings } = req.body;

    // Validate team if provided
    if (preferredTeam && !["developers", "qa", "spectators"].includes(preferredTeam)) {
      return res.status(400).json({ error: "Invalid team. Must be developers, qa, or spectators" });
    }

    // Validate volumes if provided
    if (musicVolume !== undefined && (musicVolume < 0 || musicVolume > 1)) {
      return res.status(400).json({ error: "Music volume must be between 0 and 1" });
    }
    if (sfxVolume !== undefined && (sfxVolume < 0 || sfxVolume > 1)) {
      return res.status(400).json({ error: "SFX volume must be between 0 and 1" });
    }

    const profile = await storage.updateUserProfile(userId, {
      preferredAvatar,
      preferredTeam,
      audioEnabled,
      musicVolume,
      sfxVolume,
      settings,
    });

    if (!profile) {
      // Profile doesn't exist, create it
      const newProfile = await storage.createUserProfile({
        userId,
        preferredAvatar,
        preferredTeam,
        audioEnabled,
        musicVolume,
        sfxVolume,
        settings,
      });
      return res.json({ profile: newProfile });
    }

    res.json({ profile });
  } catch (err) {
    authLogger.error({ err }, 'Error updating profile');
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Get user stats
router.get("/stats", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getUserStats(userId);

    if (!stats) {
      // Create default stats if they don't exist
      const newStats = await storage.createUserStats({ userId });
      return res.json({ stats: newStats });
    }

    res.json({ stats });
  } catch (err) {
    authLogger.error({ err }, 'Error fetching stats');
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Get estimation history
router.get("/history", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const history = await storage.getEstimationHistory(userId, Math.min(limit, 100));

    res.json({ history });
  } catch (err) {
    authLogger.error({ err }, 'Error fetching history');
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Get connected OAuth accounts
router.get("/accounts", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const accounts = await storage.getUserOAuthAccounts(userId);

    // Don't expose tokens
    const safeAccounts = accounts.map((acc) => ({
      id: acc.id,
      provider: acc.provider,
      createdAt: acc.createdAt,
    }));

    res.json({ accounts: safeAccounts });
  } catch (err) {
    authLogger.error({ err }, 'Error fetching accounts');
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// Update display name
router.put("/display-name", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { displayName } = req.body;

    if (!displayName || displayName.length < 2 || displayName.length > 50) {
      return res.status(400).json({ error: "Display name must be 2-50 characters" });
    }

    const user = await storage.updateUser(userId, { displayName });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    authLogger.error({ err }, 'Error updating display name');
    res.status(500).json({ error: "Failed to update display name" });
  }
});

export default router;
