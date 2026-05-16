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
 * Health and version endpoints exempt from apiLimiter.
 * These are hit constantly by external monitoring (blackbox-exporter,
 * Route 53 health checks), the deploy workflow's smoke-test job, and
 * operators verifying service state during/after deploys. Sharing the
 * 200/15min apiLimiter bucket with mutating endpoints would either
 * starve real callers or, if the limit were raised, dilute its
 * protection on the endpoints it actually exists to protect.
 *
 * Paths are relative to the /api mount point in server/routes.ts.
 * (Phase 44 UAT Issue #1, 2026-05-09.)
 */
export const RATE_LIMIT_EXEMPT_PATHS = new Set([
  '/health',
  '/health/livez',
  '/health/readyz',
  '/ws-health',
  '/version',
]);

/**
 * Path prefixes whose routers apply their own rate limiter
 * (apiLimiter or profileLimiter) at the router level so CodeQL can
 * see rate-limiting inline with the handlers. The mount-level
 * apiLimiter on /api skips these to avoid double-counting against
 * the same shared bucket.
 */
const ROUTER_OWNED_PREFIXES = ['/auth/', '/user/'];

export function shouldSkipApiRateLimit(req: Pick<Request, 'path'>): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (RATE_LIMIT_EXEMPT_PATHS.has(req.path)) return true;
  return ROUTER_OWNED_PREFIXES.some((prefix) => req.path.startsWith(prefix));
}

/**
 * apiLimiter - General rate limiting catch-all for all /api routes.
 * Limit: 200 requests per 15 minutes per IP.
 * Exempts health/version paths (see RATE_LIMIT_EXEMPT_PATHS).
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req: Request) => shouldSkipApiRateLimit(req),
});

/**
 * htmlLimiter - Liberal rate limit for the SPA HTML shell and static
 * asset serving (server/vite.ts). Page navigations and asset fetches
 * are bursty (one HTML + many JS/CSS/image requests per page load),
 * so the budget is intentionally large — this exists to satisfy
 * `js/missing-rate-limiting` and shed pathological scrapers, not to
 * police normal traffic.
 */
export const htmlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 2000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (_req: Request) => process.env.NODE_ENV === 'test',
});

/**
 * Absolute paths (full request path, not /api-relative) that the
 * globalAuthLimiter must NOT rate-limit. These are the same probe
 * endpoints documented in RATE_LIMIT_EXEMPT_PATHS but as full URLs,
 * because the global limiter sits ABOVE the /api router and sees
 * the unmounted path.
 */
const GLOBAL_EXEMPT_ABSOLUTE_PATHS = new Set([
  '/api/health',
  '/api/health/livez',
  '/api/health/readyz',
  '/api/ws-health',
  '/api/version',
  '/metrics',
]);

/**
 * globalAuthLimiter - App-level rate limit that gates the Auth0
 * middleware chain (configureAuth0 + syncAuth0ToSession). Without
 * this an unauthenticated attacker could hammer the app and force
 * syncAuth0ToSession's per-request DB lookup (server/auth/auth0.ts).
 *
 * Limit is intentionally generous (2000 req / 15 min / IP) — this is
 * a DoS-shedding limit, not an anti-abuse one. The Auth0 callback
 * routes are additionally protected by authLimiter at the auth router.
 *
 * Probe endpoints (livez/readyz/health/version/metrics) are exempt
 * so a flapping container can still report status under load.
 * (Phase 44 UAT Issue #1 — earlier rate-limit additions broke probe
 * timeouts; this version explicitly avoids that.)
 */
export const globalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 2000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req: Request) => {
    if (process.env.NODE_ENV === 'test') return true;
    return GLOBAL_EXEMPT_ABSOLUTE_PATHS.has(req.path);
  },
});
