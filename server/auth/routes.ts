import { Router, Request, Response } from "express";
import { storage } from "../storage.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

// Minimal shape of express-openid-connect's req.oidc.
interface OidcContext {
  isAuthenticated(): boolean;
  user?: { sub?: string };
}

type ReqWithOidc = Request & { oidc?: OidcContext };

const router = Router();

// Rate limiting applied at router level so CodeQL detects it inline
// with each handler. shouldSkipApiRateLimit skips the mount-level
// apiLimiter on /auth/* to avoid double-counting the same bucket.
router.use(apiLimiter);

// Get current user — uses Auth0's req.oidc
router.get("/me", async (req: Request, res: Response) => {
  const oidc = (req as ReqWithOidc).oidc;
  if (oidc?.isAuthenticated() && oidc.user?.sub) {
    const sub = oidc.user.sub;
    const user = await storage.getUserByAuth0Sub(sub);
    if (user) {
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      });
    } else {
      res.json({ user: null });
    }
  } else {
    res.json({ user: null });
  }
});

// Check if Auth0 is configured
router.get("/providers", (_req: Request, res: Response) => {
  res.json({
    auth0: !!(process.env.AUTH0_CLIENT_ID && process.env.AUTH0_ISSUER_BASE_URL),
  });
});

export default router;
