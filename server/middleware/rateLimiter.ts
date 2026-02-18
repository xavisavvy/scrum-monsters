import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * authLimiter - Strict rate limiting for authentication endpoints.
 * Protects login and register routes against brute-force attacks.
 * Limit: 10 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  skip: (_req: Request) => process.env.NODE_ENV === 'test',
});

/**
 * profileLimiter - Moderate rate limiting for profile mutation endpoints.
 * Limit: 50 requests per 15 minutes per IP.
 */
export const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (_req: Request) => process.env.NODE_ENV === 'test',
});

/**
 * apiLimiter - General rate limiting catch-all for all /api routes.
 * Limit: 200 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (_req: Request) => process.env.NODE_ENV === 'test',
});
