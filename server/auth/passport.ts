import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import bcrypt from "bcryptjs";
import { storage } from "../storage.js";
import type { User } from "@shared/schema";

// Extend Express.User to include our User type
declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      email: string | null;
      displayName: string | null;
      avatarUrl: string | null;
    }
  }
}

export function configurePassport() {
  // Serialize user to session
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        done(null, {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        });
      } else {
        done(null, false);
      }
    } catch (err) {
      done(err, false);
    }
  });

  // Local Strategy (username/password)
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          // Try email first, then username
          let user = await storage.getUserByEmail(email);
          if (!user) {
            user = await storage.getUserByUsername(email);
          }

          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          if (!user.password) {
            return done(null, false, {
              message: "This account uses social login. Please sign in with Google or GitHub.",
            });
          }

          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch) {
            return done(null, false, { message: "Invalid email or password" });
          }

          return done(null, {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = getCallbackURL("google");
    console.log(`🔐 Google OAuth configured with callback: ${callbackURL}`);

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
          scope: ["profile", "email"],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const user = await storage.findOrCreateOAuthUser("google", {
              id: profile.id,
              email: profile.emails?.[0]?.value,
              displayName: profile.displayName,
              avatarUrl: profile.photos?.[0]?.value,
            });

            return done(null, {
              id: user.id,
              username: user.username,
              email: user.email,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            });
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );
  } else {
    console.log("⚠️  Google OAuth not configured (missing GOOGLE_CLIENT_ID/SECRET)");
  }

  // GitHub OAuth Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    const callbackURL = getCallbackURL("github");
    console.log(`🔐 GitHub OAuth configured with callback: ${callbackURL}`);

    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL,
          scope: ["user:email"],
        },
        async (
          accessToken: string,
          refreshToken: string,
          profile: any,
          done: (error: Error | null, user?: Express.User) => void
        ) => {
          try {
            // GitHub may have multiple emails
            const primaryEmail = profile.emails?.find((e: any) => e.primary)?.value ||
              profile.emails?.[0]?.value;

            const user = await storage.findOrCreateOAuthUser("github", {
              id: profile.id,
              email: primaryEmail,
              displayName: profile.displayName || profile.username,
              avatarUrl: profile.photos?.[0]?.value,
            });

            return done(null, {
              id: user.id,
              username: user.username,
              email: user.email,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            });
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );
  } else {
    console.log("⚠️  GitHub OAuth not configured (missing GITHUB_CLIENT_ID/SECRET)");
  }

  return passport;
}

// Helper to determine callback URL based on environment
function getCallbackURL(provider: string): string {
  const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === "1";
  const isReplitPreview = process.env.REPLIT_DEV_DOMAIN && !isReplitDeployment;

  let baseUrl: string;
  if (isReplitDeployment) {
    baseUrl = "https://scrummonsters.com";
  } else if (isReplitPreview) {
    baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  } else {
    baseUrl = "http://localhost:5000";
  }

  return `${baseUrl}/api/auth/${provider}/callback`;
}

export default passport;
