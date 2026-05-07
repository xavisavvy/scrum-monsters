# Phase 43: Validation Architecture

**Extracted from:** `43-RESEARCH.md` §Validation Architecture
**Date:** 2026-05-07

## Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.17 |
| Config file | `vitest.config.ts` (env: happy-dom; setup: `client/src/test/setup.ts`) |
| Quick run command | `npx vitest run server/auth/routes.test.ts client/src/components/auth/UserMenu.test.tsx` |
| Full suite command | `npm test` |

## Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | Owning Plan |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | `/api/auth/me` returns `{user:null}` when `req.oidc.isAuthenticated()===false` | server integration | `npx vitest run server/auth/routes.test.ts -t "me unauthenticated"` | 43-02 |
| AUTH-01 | `/api/auth/me` returns `{user:{...}}` when stubbed authenticated + storage hit | server integration | `npx vitest run server/auth/routes.test.ts -t "me authenticated"` | 43-02 |
| AUTH-01 | `/api/auth/me` returns `{user:null}` when authenticated but DB has no row (orphan sub) | server integration | `npx vitest run server/auth/routes.test.ts -t "me orphan sub"` | 43-02 |
| AUTH-01 | `/api/auth/providers` returns `{auth0:true}` when env vars set | server integration | `npx vitest run server/auth/routes.test.ts -t "providers configured"` | 43-02 |
| AUTH-01 | `/api/auth/providers` returns `{auth0:false}` when env vars unset | server integration | `npx vitest run server/auth/routes.test.ts -t "providers unconfigured"` | 43-02 |
| AUTH-01 | `/api/auth/login` returns 302 when AUTH0_* set (smoke against fake issuer) | server integration | `npx vitest run server/auth/routes.test.ts -t "login redirect"` | 43-02 |
| AUTH-01 | UserMenu renders nothing when `providersConfigured===null` (loading) | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders nothing while loading"` | 43-02 |
| AUTH-01 | UserMenu renders nothing when `providersConfigured===false` | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders nothing when unconfigured"` | 43-02 |
| AUTH-01 | UserMenu renders Sign In when `providersConfigured===true && user===null` | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders Sign In when configured anon"` | 43-02 |
| AUTH-01 | UserMenu renders avatar dropdown when `user` populated | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders avatar when authed"` | 43-02 |
| AUTH-01 | useAuth.fetchProviders sets `providersConfigured=false` on fetch error (fail-closed) | client unit | `npx vitest run client/src/lib/stores/useAuth.test.tsx -t "fail closed on providers error"` | 43-02 |
| AUTH-01 | useAuth.fetchProviders sets `providersConfigured=true/false` based on response | client unit | `npx vitest run client/src/lib/stores/useAuth.test.tsx -t "providers boolean"` | 43-02 |
| AUTH-01 | `logout()` redirects to `/api/auth/logout` | client unit | `npx vitest run client/src/lib/stores/useAuth.test.tsx -t "logout redirects"` | 43-02 |
| AUTH-01 | env validation rejects partial Auth0 config (all-or-nothing) | server unit | `npx vitest run server/config/env.test.ts -t "auth0 partial"` (or smoke via process spawn) | 43-02 |

## Sampling Rate
- **Per task commit:** Run only the affected test file (`vitest run <file>`).
- **Per wave merge:** `npx vitest run server/auth/ client/src/components/auth/ client/src/lib/stores/useAuth.test.tsx`.
- **Phase gate:** Full `npm test` green before `/gsd-verify-work`.

## Wave 0 Gaps (created in Plan 43-02)
- [ ] `server/auth/routes.test.ts` — AUTH-01 server cases
- [ ] `server/auth/__testHelpers/mockOidc.ts` — shared `req.oidc` stub middleware
- [ ] `client/src/components/auth/UserMenu.test.tsx` — AUTH-01 client render cases
- [ ] `client/src/lib/stores/useAuth.test.tsx` — fetchProviders + logout state
- [ ] Install `supertest` + `@types/supertest`
