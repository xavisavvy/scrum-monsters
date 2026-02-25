import { z } from "zod";
import { httpLogger } from '../logger.js';

// Environment variable schema
const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(1).default("scrumquest-dev-secret-change-in-production"),
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DB_POOL_MAX: z.coerce.number().min(1).max(100).default(10),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().default(60),
  DB_POOL_CONNECT_TIMEOUT: z.coerce.number().default(10),
  ALLOWED_ORIGINS: z.string().optional(),
  HOST: z.string().default("0.0.0.0"),
}).refine((data) => {
  if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
    httpLogger.error('DATABASE_URL is required in production. Set it in .env and restart.');
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
