import type { RequestHandler } from "express";

/**
 * Test stub for the `req.oidc` shape exposed by express-openid-connect.
 * Mirrors the runtime contract used by `server/auth/routes.ts:8-9`.
 */
export type OidcStub = {
  isAuthenticated: () => boolean;
  user?: { sub: string; [k: string]: unknown };
};

/**
 * Test-only middleware factory that injects a stubbed `req.oidc`.
 *
 * Usage:
 *   const app = express();
 *   app.use(mockOidcMiddleware({ isAuthenticated: () => true, user: { sub: 'auth0|1' } }));
 *   app.use('/api/auth', authRoutes);
 *
 * Why this pattern (RESEARCH §Pattern 1, §Anti-Patterns):
 *   - Mocks only the `req.oidc` shape consumed by route handlers — does NOT
 *     mock the `auth()` factory itself (brittle across versions).
 *   - The `(req as any).oidc` cast matches the production cast at
 *     `server/auth/routes.ts:8-9`, keeping runtime shape parity.
 */
export function mockOidcMiddleware(stub: OidcStub): RequestHandler {
  return (req, _res, next) => {
    // Matches production cast at server/auth/routes.ts attaching `oidc` to Express.Request.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).oidc = stub;
    next();
  };
}
