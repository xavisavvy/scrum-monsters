---
phase: 43-auth-user-account-validation
plan: 02
subsystem: auth
tags: [auth, testing, env-validation, supertest, vitest, zustand]
dependency_graph:
  requires:
    - 43-01 (useAuth.providersConfigured + UserMenu render gate)
  provides:
    - server/auth/__testHelpers/mockOidc.ts (reusable OIDC stub middleware)
    - supertest harness for /api/auth/* (first server HTTP test in repo)
    - regression coverage for AUTH-01 (server + component + store)
    - AUTH0_* all-or-nothing env refine (fail-fast on partial config)
  affects:
    - package.json (devDependencies)
    - server/config/env.ts
tech_stack:
  added:
    - "supertest@^7.2.2 (devDep) — first HTTP-route integration test harness"
    - "@types/supertest@^7.2.0 (devDep)"
  patterns:
    - "Test-only middleware factory injects (req as any).oidc — no vi.mock of express-openid-connect's auth() factory (RESEARCH §Anti-Patterns)"
    - "Per-test process.env snapshot/restore via afterEach (T-43-05 mitigation)"
    - "vi.mock('../storage.js') hoisted before route import to intercept getUserByAuth0Sub"
    - "Second chained zod .refine() for cross-field all-or-nothing AUTH0_* validation, mirroring the existing production-DB refine idiom"
    - "useAuth.setState reset in beforeEach (analog: useProgression.test.ts) for direct Zustand store unit tests"
    - "delete window.location + reassign object idiom to test logout's .href setter without triggering happy-dom navigation"
key_files:
  created:
    - server/auth/__testHelpers/mockOidc.ts
    - server/auth/routes.test.ts
    - client/src/components/auth/UserMenu.test.tsx
    - client/src/lib/stores/useAuth.test.tsx
  modified:
    - package.json (devDependencies: +supertest, +@types/supertest)
    - package-lock.json
    - server/config/env.ts (second .refine() for AUTH0_* all-or-nothing)
decisions:
  - "Login-redirect smoke is structural ONLY: assert configureAuth0 is exported as a function and that mounting its returned middleware on an Express app does not throw — no live redirect, no vi.mock of the factory (RESEARCH §Anti-Patterns: mocking the factory hides regressions)"
  - "Storage mocked at module boundary via vi.mock('../storage.js'); production storage paths unaffected (T-43-07 disposition: accept)"
  - "process.env mutations scoped per /providers test via afterEach snapshot/restore — does not leak to other suites (T-43-05 mitigation)"
  - "AUTH0_* all-or-nothing refine chained AFTER existing production-DB refine to keep each rule self-contained and readable (PATTERNS L146-156)"
  - "AUTH0 refine uses the established httpLogger.error + process.exit(1) idiom (NOT throw) — matches the production-DB refine's failure mode at env.ts L22-26"
  - "BASE_URL deliberately excluded from the all-or-nothing AUTH0_* set — used independently elsewhere; only the AUTH0_* quartet must move together"
metrics:
  duration: ~12 minutes
  tasks: 4
  files_created: 4
  files_modified: 3
  tests_added: 15  # 6 routes + 4 UserMenu + 5 useAuth
  tests_passing: 705/705
  baseline: 690/690
  completed_date: 2026-05-08
---

# Phase 43 Plan 02: Configured Auth Round-Trip Tests + Env Hardening Summary

**One-liner:** Add 15 regression tests across server (supertest), component (UserMenu render gate), and store (useAuth fetchProviders + logout) layers — plus a second `zod .refine()` in `env.ts` that fails fast on partial AUTH0_* config — completing AUTH-01.

## What Was Built

### Test infrastructure

- **`supertest@^7.2.2`** + `@types/supertest@^7.2.0` installed as devDependencies — the first HTTP-route integration test harness in the repo. Justified: prior server tests (`server/gameState.test.ts`, etc.) test domain managers directly, never Express routes.
- **`server/auth/__testHelpers/mockOidc.ts`** — a tiny reusable middleware factory exporting `mockOidcMiddleware(stub)` and `OidcStub`. Injects `(req as any).oidc = stub` so route handlers see the same shape they read in production at `server/auth/routes.ts:8-9`. Mirrors RESEARCH §Pattern 1 verbatim. Per RESEARCH §Anti-Patterns, this does NOT mock the `auth()` factory itself — that is brittle across versions; mocking the consumed shape is durable.

### Server route tests — `server/auth/routes.test.ts` (6 tests)

| Test name | Assertion |
|-----------|-----------|
| `me unauthenticated returns user:null` | `isAuthenticated()===false` → `{ user: null }`, storage NOT called |
| `me authenticated returns the user` | stub authed + `getUserByAuth0Sub` returns user → response matches schema (id/username/email/displayName/avatarUrl) |
| `me orphan sub returns user:null` | stub authed but `getUserByAuth0Sub` returns `undefined` → `{ user: null }` |
| `providers configured returns auth0:true` | env vars set → `{ auth0: true }` |
| `providers unconfigured returns auth0:false` | env vars deleted → `{ auth0: false }` |
| `login redirect handler is registered when AUTH0_* configured` | structural: `configureAuth0` is a function; mounting it does not throw with placeholder env |

`process.env` is snapshotted in module scope and restored in `afterEach` so the `/providers` env mutations cannot leak into other suites. Storage is mocked via `vi.mock("../storage.js", ...)` hoisted above the route import.

### Component tests — `client/src/components/auth/UserMenu.test.tsx` (4 tests)

Mocks `useAuth` via `vi.mock('@/lib/stores/useAuth', ...)` (analog: `LevelUpCelebration.test.tsx:7-12`). Each test calls `vi.mocked(useAuth).mockReturnValue({...} as any)` with a different state shape and asserts the render-gate output:

| Test name | State | Expectation |
|-----------|-------|-------------|
| `renders nothing while loading` | `{ user:null, isLoading:true, providersConfigured:null }` | `expect(container).toBeEmptyDOMElement()` |
| `renders nothing when unconfigured` | `{ user:null, isLoading:false, providersConfigured:false }` | empty |
| `renders Sign In when configured anon` | `{ user:null, isLoading:false, providersConfigured:true }` | `getByRole('button', { name: /sign in/i })` |
| `renders avatar when authed` | `{ user:{...}, isLoading:false, providersConfigured:true }` | `queryByRole('button', { name: /sign in/i })` is null |

### Store tests — `client/src/lib/stores/useAuth.test.tsx` (5 tests)

Tests the **real** Zustand store directly (no `vi.mock` of `useAuth`). Resets state via `useAuth.setState({...})` in `beforeEach` and spies on `global.fetch`:

| Test name | Setup | Expected `providersConfigured` |
|-----------|-------|-------------------------------|
| `providers boolean true on {auth0:true}` | fetch resolves `{auth0:true}` | `true` |
| `providers boolean false on {auth0:false}` | fetch resolves `{auth0:false}` | `false` |
| `fail closed on providers error (network)` | fetch rejects (network) | `false` |
| `fail closed on providers error (non-OK status)` | fetch resolves 500 | `false` |
| `logout redirects to /api/auth/logout` | `delete window.location` + reassign | `window.location.href === '/api/auth/logout'` |

The `delete window.location; (window as any).location = { href: '' }` reassignment matches PATTERNS.md L295 — happy-dom otherwise navigates on `.href` assignment, breaking the assertion.

### Env hardening — `server/config/env.ts`

A second `.refine()` is chained AFTER the existing production-DB refine (L21-27 became L21-43). The new refine collects the four AUTH0_* values, counts truthy entries, and if 0 < count < 4 logs `httpLogger.error('Auth0 partial configuration detected. Either set ALL of AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET — or NONE.')` and `process.exit(1)`. Behavior:

- All four unset → `setCount===0`, refine returns `true`, server boots anonymous-only (UNCHANGED).
- All four set → `setCount===4`, refine returns `true`, server boots Auth0-enabled (UNCHANGED).
- 1-3 set → fail fast with the clear message above (NEW; previously crashed cryptically inside `express-openid-connect`).

`BASE_URL` is intentionally NOT in the AUTH0_* quartet — used independently and may be set even without Auth0.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install supertest + add AUTH0_* all-or-nothing env refine | b1f9e85 | package.json, package-lock.json, server/config/env.ts |
| 2 | mockOidc helper + supertest auth-route integration tests | ffb6416 | server/auth/__testHelpers/mockOidc.ts, server/auth/routes.test.ts |
| 3 | UserMenu render-gate component tests | eb31dbe | client/src/components/auth/UserMenu.test.tsx |
| 4 | useAuth store unit tests (fetchProviders + logout) | 0ce4453 | client/src/lib/stores/useAuth.test.tsx |

## Verification

- `npm run check` — clean after Task 1 and after the test additions
- `npx vitest run server/auth/routes.test.ts` — 6 tests pass
- `npx vitest run client/src/components/auth/UserMenu.test.tsx` — 4 tests pass
- `npx vitest run client/src/lib/stores/useAuth.test.tsx` — 5 tests pass
- `npm test` (full suite) — **705 / 705 tests passing across 40 test files** (15 new on top of the 690 baseline; zero regressions in Phase 39/40/41/42 suites)
- `npx eslint` against the four files this plan creates/modifies — 0 errors, 1 warning (the documented `(req as any).oidc` cast convention shared with `server/auth/routes.ts:8-9`)
- All structural `node -e` acceptance checks pass:
  - supertest + @types/supertest are in `devDependencies`
  - `env.ts` has ≥2 `.refine()` blocks; the second references all four AUTH0_* var names and ends with `process.exit(1)`
  - `mockOidc.ts` exports `mockOidcMiddleware` + `OidcStub` and uses the `(req as any).oidc` cast
  - `routes.test.ts` imports `request from 'supertest'` and contains all six required test-name substrings
  - `UserMenu.test.tsx` calls `vi.mock('@/lib/stores/useAuth', ...)` and contains all four required test-name substrings
  - `useAuth.test.tsx` uses `useAuth.setState` reset + `vi.spyOn(global, 'fetch')` and contains all three required test-name substrings

## Deviations from Plan

None. Plan executed exactly as written. No deviation rules triggered. The `process.env.split` quirk in one of the planner-supplied verify scripts (`s.split('AUTH0')[1]`) gave a false-negative — addressed by re-running the same semantic check against `s.lastIndexOf('AUTH0')` (the new refine clearly contains `process.exit(1)`; the planner's split landed in the schema declaration block before the new refine). No code change.

## Authentication Gates

None — no auth interactions during execution. `/api/auth/login` smoke test runs entirely with placeholder env values; no real Auth0 tenant contacted.

## Threat Surface Notes

All threats from the plan's `<threat_model>` realized as written:

- **T-43-04 (Tampering — env validation bypass):** mitigated. The new `.refine()` rejects partial AUTH0_* config; existing per-var format validation (`.url()`, `.min(32)`) at L16-19 unchanged. Server fails fast with logged message — no malformed `auth()` factory call.
- **T-43-05 (Information Disclosure — test fixtures leak credentials):** mitigated. `mockOidc.ts` uses synthetic `auth0|123` / `auth0|orphan` subs; `routes.test.ts` snapshot/restores `process.env` per test. No real Auth0 secrets are committed or required for tests.
- **T-43-06 (Repudiation — logout test global mutation):** accept. `delete window.location` is scoped within try/finally; happy-dom test env is destroyed between vitest worker runs.
- **T-43-07 (EoP — mocked storage in /me test):** accept. `vi.mock("../storage.js", ...)` is scoped to `routes.test.ts` only; production storage unaffected.

No new surfaces introduced beyond the plan's threat register.

## Known Stubs

None. Every test asserts real behavior of either the production code path (env refine, useAuth store, UserMenu render gate) or the live route handler with mocked `req.oidc` and storage. No `// TODO` branches, no placeholder data. The single `TODO(stretch)` comment in `routes.test.ts` is a documented future enhancement (asserting `.status === 302` against a fake issuer once `express-openid-connect` exposes a test mode) and is explicitly carved out of this plan's scope per CONTEXT and PLAN.

## Cross-Plan Dependencies — AUTH-01 Closure

AUTH-01 was a multi-plan deliverable across Phase 43:

- **43-01** shipped the unconfigured-graceful UX half: `useAuth.providersConfigured`, sequenced `fetchProviders` → `/me`, fail-closed on `/providers` errors, three-way `UserMenu` render gate. (Commit history: 1ee9b8f, c9fa535)
- **43-02 (this plan)** shipped the configured-path regression coverage half: server route tests (`/me` unauth/authed/orphan, `/providers` configured/unconfigured, `/login` structural smoke), component render-gate tests, store unit tests (fetchProviders true/false/fail-closed × 2, logout redirect), AND the env hardening (partial AUTH0_* config now fails fast).

With both plans landed:

- ROADMAP success criterion #1 (configured-path round-trip has automated assertions): ✓
- ROADMAP success criterion #2 (useAuth.fetchProviders + UserMenu render-gate tested across all four states): ✓
- ROADMAP success criterion #3 (logout's redirect is asserted): ✓
- ROADMAP success criterion #5 (env validation surfaces a clear all-or-nothing error): ✓
- ROADMAP success criterion #6 (anonymous-play tests still green): ✓ (705/705 including all Phase 39/40/41/42 suites)

**AUTH-01 is now complete** and is checked off in REQUIREMENTS.md by this summary's accompanying state update.

## Deferred Issues (out of scope)

`npm run lint` reports 12 PRE-EXISTING errors and ~402 warnings, ALL in files unrelated to this plan (`client/src/components/game/ProjectileSystem.tsx`, `client/src/hooks/useOrientation.ts`, `client/src/lib/utils/sessionStorage.ts`, `server/vite.ts`, etc. — categories: empty-block, `MediaQueryListEvent` no-undef, `btoa`/`atob` no-undef, `queueMicrotask` no-undef). Tracked in `.planning/phases/43-auth-user-account-validation/deferred-items.md`. Per executor scope-boundary rule, NOT fixed here. `npx eslint` against ONLY the files this plan touches reports 0 errors.

## Self-Check: PASSED

- FOUND: server/auth/__testHelpers/mockOidc.ts (created)
- FOUND: server/auth/routes.test.ts (created)
- FOUND: client/src/components/auth/UserMenu.test.tsx (created)
- FOUND: client/src/lib/stores/useAuth.test.tsx (created)
- FOUND: server/config/env.ts (modified — second .refine() chained)
- FOUND: package.json (modified — supertest in devDependencies)
- FOUND: commit b1f9e85 (Task 1 — install supertest + AUTH0 env refine)
- FOUND: commit ffb6416 (Task 2 — mockOidc helper + routes.test.ts)
- FOUND: commit eb31dbe (Task 3 — UserMenu.test.tsx)
- FOUND: commit 0ce4453 (Task 4 — useAuth.test.tsx)
