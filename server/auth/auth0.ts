import { auth } from "express-openid-connect";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { storage } from "../storage.js";
import { authLogger } from "../logger.js";

// Augment express-session with userId
declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

/**
 * Configure Auth0 middleware using express-openid-connect.
 * Returns the auth() middleware to mount on the Express app.
 * Auth0 auto-registers /api/auth/login, /api/auth/logout, /api/auth/callback.
 */
export function configureAuth0(): RequestHandler {
  return auth({
    authRequired: false, // Anonymous play preserved
    auth0Logout: true,
    baseURL: process.env.BASE_URL || "http://localhost:5000",
    clientID: process.env.AUTH0_CLIENT_ID!,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL!,
    secret: process.env.AUTH0_SECRET!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    routes: {
      login: "/api/auth/login",
      logout: "/api/auth/logout",
      callback: "/api/auth/callback",
    },
    session: {
      absoluteDuration: 7 * 24 * 60 * 60, // 7 days
    },
    afterCallback: async (_req: Request, _res: Response, session: any) => {
      // Find or create user in local DB from Auth0 claims
      const { sub, email, nickname, name, picture } = session.claims || {};
      if (sub) {
        try {
          let user = await storage.getUserByAuth0Sub(sub);
          if (!user) {
            // Try matching by email first
            if (email) {
              user = await storage.getUserByEmail(email);
              if (user) {
                // Link Auth0 sub to existing user
                await storage.updateUser(user.id, { auth0Sub: sub });
                authLogger.info({ userId: user.id, sub }, "Linked Auth0 sub to existing user");
              }
            }
            if (!user) {
              // Create new user
              const username = nickname || email?.split("@")[0] || `user_${sub.split("|").pop()}`;
              user = await storage.createUser({
                username,
                email: email || undefined,
                displayName: name || nickname || undefined,
                avatarUrl: picture || undefined,
                auth0Sub: sub,
              });
              // Create default profile and stats
              await storage.createUserProfile({ userId: user.id });
              await storage.createUserStats({ userId: user.id });
              authLogger.info({ userId: user.id, sub }, "Created new user from Auth0");
            }
          } else {
            // Update profile info from Auth0 (email, name, picture may change)
            const updates: Record<string, string | undefined> = {};
            if (email && email !== user.email) updates.email = email;
            if ((name || nickname) && (name || nickname) !== user.displayName) {
              updates.displayName = name || nickname;
            }
            if (picture && picture !== user.avatarUrl) updates.avatarUrl = picture;
            if (Object.keys(updates).length > 0) {
              await storage.updateUser(user.id, updates);
            }
          }
        } catch (err) {
          authLogger.error({ err, sub }, "Error in Auth0 afterCallback");
        }
      }
      return session;
    },
  });
}

/**
 * Bridge middleware: syncs Auth0 identity into express-session for Socket.IO.
 * After each request, if user is authenticated via Auth0, write userId to session.
 */
export function syncAuth0ToSession(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if ((req as any).oidc?.isAuthenticated()) {
        const sub = (req as any).oidc.user?.sub;
        if (sub && !req.session.userId) {
          const user = await storage.getUserByAuth0Sub(sub);
          if (user) {
            req.session.userId = user.id;
          }
        }
      } else {
        // Clear userId if not authenticated
        if (req.session.userId) {
          delete req.session.userId;
        }
      }
    } catch (err) {
      authLogger.error({ err }, "Error syncing Auth0 to session");
    }
    next();
  };
}

/**
 * Middleware: checks if user is authenticated via Auth0.
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if ((req as any).oidc?.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

/**
 * Helper: resolves numeric userId from the Auth0 sub claim on the request.
 */
export async function getUserId(req: Request): Promise<number | undefined> {
  const sub = (req as any).oidc?.user?.sub;
  if (!sub) return undefined;
  const user = await storage.getUserByAuth0Sub(sub);
  return user?.id;
}
