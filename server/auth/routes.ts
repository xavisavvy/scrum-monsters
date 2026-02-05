import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { storage } from "../storage.js";

const router = Router();

// Middleware to check if user is authenticated
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

// Get current user
router.get("/me", (req: Request, res: Response) => {
  if (req.isAuthenticated() && req.user) {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl,
      },
    });
  } else {
    res.json({ user: null });
  }
});

// Register with email/password
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, username, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Check if user already exists
    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const existingUsername = await storage.getUserByUsername(username || email.split("@")[0]);
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await storage.createUser({
      username: username || email.split("@")[0],
      email,
      password: hashedPassword,
      displayName: displayName || username || email.split("@")[0],
    });

    // Create default profile and stats
    await storage.createUserProfile({ userId: user.id });
    await storage.createUserStats({ userId: user.id });

    // Log the user in
    req.login(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return res.status(500).json({ error: "Registration successful but login failed" });
        }
        res.status(201).json({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
        });
      }
    );
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login with email/password
router.post("/login", (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string }) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Login failed" });
    }

    if (!user) {
      return res.status(401).json({ error: info?.message || "Invalid credentials" });
    }

    req.login(user, (loginErr) => {
      if (loginErr) {
        console.error("Session login error:", loginErr);
        return res.status(500).json({ error: "Login failed" });
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
    });
  })(req, res, next);
});

// Logout
router.post("/logout", (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error("Session destroy error:", sessionErr);
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/?auth=error&provider=google" }),
  (req: Request, res: Response) => {
    // Successful authentication, redirect to app
    res.redirect("/?auth=success&provider=google");
  }
);

// GitHub OAuth routes
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/?auth=error&provider=github" }),
  (req: Request, res: Response) => {
    // Successful authentication, redirect to app
    res.redirect("/?auth=success&provider=github");
  }
);

// Check if OAuth providers are available
router.get("/providers", (req: Request, res: Response) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    local: true,
  });
});

export default router;
