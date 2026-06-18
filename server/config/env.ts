import { z } from "zod";
import { httpLogger } from '../logger.js';

// Insecure default used only for local development. Reused in the production
// guard below so the literal can't drift between default and check. (H-4)
const DEFAULT_SESSION_SECRET = "scrumquest-dev-secret-change-in-production";

// Environment variable schema
const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(1).default(DEFAULT_SESSION_SECRET),
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DB_POOL_MAX: z.coerce.number().min(1).max(100).default(10),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().default(60),
  DB_POOL_CONNECT_TIMEOUT: z.coerce.number().default(10),
  ALLOWED_ORIGINS: z.string().optional(),
  HOST: z.string().default("0.0.0.0"),
  // Auth0 (optional — enables authentication)
  AUTH0_ISSUER_BASE_URL: z.string().url().optional(),
  AUTH0_CLIENT_ID: z.string().optional(),
  AUTH0_CLIENT_SECRET: z.string().optional(),
  AUTH0_SECRET: z.string().min(32).optional(),
  BASE_URL: z.string().url().optional(),
}).refine((data) => {
  if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
    httpLogger.error('DATABASE_URL is required in production. Set it in .env and restart.');
    process.exit(1);
  }
  return true;
}).refine((data) => {
  // The default SESSION_SECRET is a publicly-committed constant. Using it in
  // production lets anyone forge session cookies and reconnect tokens (the same
  // secret is the HMAC fallback in SessionManager). Fail-fast like DATABASE_URL.
  // (Security: H-4)
  if (
    data.NODE_ENV === "production" &&
    (!data.SESSION_SECRET ||
      data.SESSION_SECRET === DEFAULT_SESSION_SECRET)
  ) {
    httpLogger.error('SESSION_SECRET must be set to a strong, unique value in production (the built-in default is not allowed). Set it in .env and restart.');
    process.exit(1);
  }
  return true;
}).refine((data) => {
  // AUTH0_* all-or-nothing: either all four are set, or none are.
  // Partial config crashes express-openid-connect with a cryptic error;
  // fail-fast here with a clear message instead. Per RESEARCH §Pitfall 2.
  const auth0Vars = [
    data.AUTH0_ISSUER_BASE_URL,
    data.AUTH0_CLIENT_ID,
    data.AUTH0_CLIENT_SECRET,
    data.AUTH0_SECRET,
  ];
  const setCount = auth0Vars.filter(Boolean).length;
  if (setCount > 0 && setCount < 4) {
    httpLogger.error(
      'Auth0 partial configuration detected. Either set ALL of AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET — or NONE.'
    );
    process.exit(1);
  }
  return true;
});

export type Env = z.infer<typeof envSchema>;

export let env: Env;

export function validateEnv(): Env {
  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.issues
        .map((err: z.ZodIssue) => `  - ${err.path.join(".")}: ${err.message}`)
        .join("\n");
      httpLogger.error({ errors: formatted }, 'Environment validation failed');
      process.exit(1);
    }
    throw error;
  }
}
