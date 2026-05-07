# Phase 43: Auth & User Account Validation - Research

**Researched:** 2026-05-07
**Domain:** Auth0 SPA integration (`express-openid-connect` + Zustand `useAuth` + Radix `UserMenu`)
**Confidence:** HIGH

## Summary

Phase 43 has two halves:

1. **Graceful unconfigured UX:** When `AUTH0_*` env vars are unset, the server skips registering Auth0 routes (`server/index.ts:85-91`), but `UserMenu` (client/src/components/auth/UserMenu.tsx:43-54) unconditionally renders a Sign In button. Clicking it navigates to `/api/auth/login` which doesn't exist, falls through to the Vite/static SPA fallback (`server/vite.ts` catch-all serves index.html), the page reloads, `useAuth` re-fetches `/api/auth/me` (which returns `{user:null}` because `req.oidc` is undefined), `user` stays null, and the Sign In button reappears. This matches the user-reported "loop" exactly. `[VERIFIED: code read]`

2. **Configured round-trip tests:** The auth happy path has never had automated coverage. Add a server integration test that mocks `req.oidc` (no real OIDC server) plus a client component test that mocks `useAuth` state and asserts `UserMenu` rendering matches authenticated/anonymous/unconfigured cases.

**Primary recommendation:** Co-locate the providers fetch inside `useAuth` (extend store with `providersConfigured: boolean | null`, call alongside `checkAuth()` from `App.tsx`), gate the Sign In button on `providersConfigured === true && !isLoading`, write server tests with vitest + supertest mocking `req.oidc` via injected middleware, write component tests with `@testing-library/react` (already installed) mocking the `useAuth` Zustand store the same way `LevelUpCelebration.test.tsx:7-12` does.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Sign-in via Auth0 completes end-to-end (no redirect loop), authenticated session is recognized client-side via `/api/auth/me`, sign-out works, account-tied surfaces (profile, stats) render when authenticated, anonymous play preserved, missing Auth0 env vars surface a clear error (not a silent loop) | Two halves below: §Pitfall-1 (loop reproduction + fix), §Validation Architecture (test map) |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Sign In button when Auth0 unconfigured:** HIDE entirely. Query `GET /api/auth/providers` (already exists at `server/auth/routes.ts:30-34`); if `auth0===false`, button does NOT render. UI looks identical to a deployment without auth.
- **Loading-state behavior:** While providers query is in flight, render NOTHING in the slot (no placeholder Sign In flash).
- **Caching:** Provider config does not change at runtime — fetch once at app boot or on `useAuth` mount; cache for the session.
- **Error fallback for `/providers`:** Fail closed (hide button), don't show a possibly-broken one.
- **Configured round-trip — server test:** With AUTH0_* set, `/api/auth/login` returns 302 to issuer; `/api/auth/me` returns `{user:null}` unauth, `{user:{...}}` authed.
- **Configured round-trip — client test:** `useAuth` consumes `/api/auth/me`, populates `user`; `UserMenu` renders avatar dropdown when authenticated, Sign In when anon-but-configured, nothing when unconfigured.
- **Sign-out:** Clicking dropdown Sign Out clears session; subsequent `/api/auth/me` returns `{user:null}`.
- **Mocking:** Mock `req.oidc` directly (test-fixture pattern). Do NOT spin up a real OIDC server.
- **Tenant provisioning is OUT OF SCOPE.** User has credentials. Phase 43 ships pure code.
- **No new account-tied surfaces.** UserMenu remains the only consumer of `useAuth`.
- **Anonymous play preserved.** No `authRequired:true` introduced anywhere.

### Claude's Discretion

- Whether providers query lives inside `useAuth.tsx` (extend with `providersConfigured`) or in a separate `useAuthProviders` hook. **Recommendation:** extend `useAuth` itself (single consumer, single fetch, single cache; matches existing pattern of `checkAuth → fetchProfile → fetchStats` chain).
- Test framework / mocking approach for Auth0 middleware. **Recommendation:** vitest + supertest with a custom test-only middleware that stubs `req.oidc`; do not mock the `auth()` factory.
- Whether `useAuth` exposes explicit `isAuthEnabled` for future consumers. **Recommendation:** add the field (zero cost), gate UserMenu internally only — minimum churn now, future-proof.
- Test placement. **Recommendation:** `server/auth/routes.test.ts` + `client/src/components/auth/UserMenu.test.tsx`.

### Deferred Ideas (OUT OF SCOPE)

- Multi-provider support (Google, GitHub, etc.)
- Account-linking flows
- Auth-required mode
- Profile editing UI
- Per-user XP / stats persistence beyond current stats dialog
- Auto-provisioning Auth0 tenant
- Runtime configurator UI for Auth0 vars (anti-pattern)
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Auth0 OIDC handshake (login/callback/logout) | API / Backend | — | `express-openid-connect` mounts as Express middleware; cookies are server-set |
| Session state (`req.session.userId`) | API / Backend | — | `express-session` + `syncAuth0ToSession` middleware (server/auth/auth0.ts:91-113) |
| Provider-config exposure (`/api/auth/providers`) | API / Backend | — | Reads `process.env`; client cannot read this safely |
| `user` state cache + UI gating | Browser / Client | — | Zustand `useAuth` store + UserMenu render-time decisions |
| Conditional Sign In rendering | Browser / Client | API (provides flag) | Client decides what to render given the flag |
| Test mocking surface | API / Backend | — | Mock `req.oidc` server-side; client tests mock `useAuth` store |

## Standard Stack

### Core (already installed — verified `package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express-openid-connect` | ^2.19.4 | Auth0 OIDC middleware | Auth0's official Express SDK |
| `express-session` | (transitive via routes) | Session storage | Required by openid-connect for stateful sessions |
| `@tanstack/react-query` | ^5.90.20 | Server-state caching | Already wired (`client/src/lib/queryClient.ts`); but **not used by `useAuth`** — useAuth is plain Zustand |
| `zustand` | (in use) | Client state store | `useAuth` is Zustand `create` + `persist` middleware |
| `vitest` | ^4.0.17 | Test runner | Project standard |
| `@testing-library/react` | ^16.3.2 | React component tests | Project standard |
| `@testing-library/dom` | ^10.4.1 | DOM matchers | Project standard |
| `happy-dom` | ^20.5.3 | Test DOM env | vitest config (`vitest.config.ts:15`) |
| `@testing-library/jest-dom` | (in setup) | DOM matchers | `client/src/test/setup.ts:1` |

`[VERIFIED: package.json grep + vitest.config.ts read]`

### Supporting — NOT installed; recommendation
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `supertest` | ~7.x | HTTP integration tests against an Express `app` | Server-side `/api/auth/*` tests |

**`supertest` is NOT currently in `package.json`.** Existing server tests (e.g., `server/integration/gameFlow.test.ts`) test domain managers directly, not HTTP routes. Phase 43 is the first phase to need HTTP-level testing of Express routes — adding supertest is justified.

`[VERIFIED: package.json grep returned no match for "supertest"]`

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| supertest | `node:http` raw + fetch | More boilerplate; supertest is the de-facto Express-test standard |
| extend `useAuth` | `useAuthProviders` separate hook | Two stores to coordinate; current `useAuth` already chains fetches (checkAuth → fetchProfile → fetchStats) so extending matches pattern |
| React Query for providers | Plain fetch in Zustand action | Repo's `useAuth` is plain fetch+set; React Query is used by `queryClient` but `useAuth` doesn't use it. Stay consistent. |

**Installation:**
```bash
npm install --save-dev supertest @types/supertest
```

**Version verification:** Run `npm view supertest version` and `npm view @types/supertest version` during the implementation Wave 0; pin to the verified versions. `[ASSUMED: latest is 7.x]`

## Architecture Patterns

### System Architecture Diagram

```
                                 ┌────────────────────────────────────────┐
                                 │ Browser                                │
                                 │                                        │
   App mount ──> useAuth.checkAuth() ──┐                                  │
                                 │     ▼                                  │
                                 │  fetch /api/auth/me ──┐                │
                                 │     ▼                 │                │
                                 │  fetch /api/auth/providers (NEW)       │
                                 │     ▼                                  │
                                 │  set { user, providersConfigured }     │
                                 │     ▼                                  │
                                 │  UserMenu render decision:             │
                                 │   ┌──────────────────────────────┐     │
                                 │   │ user           → AvatarMenu  │     │
                                 │   │ providersConfigured===false  │     │
                                 │   │   OR isLoading→ render null  │     │
                                 │   │ providersConfigured===true   │     │
                                 │   │   && !user    → Sign In Btn  │     │
                                 │   └──────────────────────────────┘     │
                                 └─────┬──────────────────────────────────┘
                                       │ click Sign In
                                       ▼ window.location.href = /api/auth/login
                ┌─────────────────────────────────────────────────────────────┐
                │ Express server                                              │
                │                                                             │
                │  if AUTH0_* set:                                            │
                │     app.use(configureAuth0())  ──┐                          │
                │     app.use(syncAuth0ToSession())│ registers                │
                │                                  │ /api/auth/login          │
                │                                  │ /api/auth/callback       │
                │                                  │ /api/auth/logout         │
                │  app.use("/api/auth", authRoutes) ── /me, /providers        │
                │                                                             │
                │  /api/auth/login ─302─> AUTH0_ISSUER_BASE_URL/authorize     │
                │  Auth0 ─302─> /api/auth/callback?code=...                   │
                │     ─> afterCallback: upsert user in DB                     │
                │     ─> session cookie set                                   │
                │     ─302─> "/" (back to SPA)                                │
                │                                                             │
                │  if AUTH0_* NOT set:                                        │
                │     /api/auth/login is 404 ─> Vite catch-all serves         │
                │     index.html (200) ─> SPA reloads ─> still anon ─> LOOP   │
                └─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (delta only)
```
server/auth/
├── auth0.ts          # configureAuth0, syncAuth0ToSession, isAuthenticated, getUserId  (UNCHANGED)
├── routes.ts         # /me, /providers  (UNCHANGED in shape; behavior verified by tests)
├── routes.test.ts    # NEW — supertest integration tests
└── __testHelpers/
    └── mockOidc.ts   # NEW — middleware factory: app.use((req,_res,next)=>{ req.oidc = stub; next() })

client/src/lib/stores/
├── useAuth.tsx       # EXTENDED — adds providersConfigured + fetchProviders action
└── useAuth.test.tsx  # NEW (recommended) — tests provider/me state machine

client/src/components/auth/
├── UserMenu.tsx      # MODIFIED — gate Sign In on providersConfigured===true && !isLoading
└── UserMenu.test.tsx # NEW
```

### Pattern 1: Mock `req.oidc` via test-only middleware

**What:** Inject a middleware before route handlers that sets `req.oidc` to the desired stub. Don't mock the `auth()` factory itself; that's brittle.

**When to use:** Server tests for `/api/auth/me` and any code that reads `req.oidc`.

**Example:**
```typescript
// server/auth/__testHelpers/mockOidc.ts
import type { RequestHandler } from "express";

export type OidcStub = { isAuthenticated: () => boolean; user?: any };

export function mockOidcMiddleware(stub: OidcStub): RequestHandler {
  return (req, _res, next) => {
    (req as any).oidc = stub;
    next();
  };
}
```

```typescript
// server/auth/routes.test.ts
import express from "express";
import request from "supertest";
import authRoutes from "./routes";
import { mockOidcMiddleware } from "./__testHelpers/mockOidc";

function makeApp(stub: OidcStub) {
  const app = express();
  app.use(express.json());
  app.use(mockOidcMiddleware(stub));
  app.use("/api/auth", authRoutes);
  return app;
}

it("/api/auth/me returns user when authenticated", async () => {
  // Stub storage.getUserByAuth0Sub via vi.mock("../storage", ...)
  const app = makeApp({ isAuthenticated: () => true, user: { sub: "auth0|123" } });
  const res = await request(app).get("/api/auth/me");
  expect(res.body.user).toMatchObject({ id: 1 });
});
```

`[VERIFIED: pattern matches existing approach in client/src/components/game/LevelUpCelebration.test.tsx:7-12 — vi.mock the dependency, don't mock the framework]`

### Pattern 2: Component test with mocked Zustand store

**Source analog:** `client/src/components/game/LevelUpCelebration.test.tsx:7-31`

```typescript
// client/src/components/auth/UserMenu.test.tsx
import { render, screen } from "@testing-library/react";
import { UserMenu } from "./UserMenu";
import { useAuth } from "@/lib/stores/useAuth";

vi.mock("@/lib/stores/useAuth", () => ({ useAuth: vi.fn() }));

it("renders nothing when providers not loaded yet", () => {
  vi.mocked(useAuth).mockReturnValue({
    user: null, isLoading: true, providersConfigured: null, login: vi.fn(), logout: vi.fn(),
  } as any);
  const { container } = render(<UserMenu />);
  expect(container).toBeEmptyDOMElement();
});

it("renders nothing when Auth0 unconfigured", () => {
  vi.mocked(useAuth).mockReturnValue({
    user: null, isLoading: false, providersConfigured: false, login: vi.fn(), logout: vi.fn(),
  } as any);
  const { container } = render(<UserMenu />);
  expect(container).toBeEmptyDOMElement();
});

it("renders Sign In when configured + anonymous", () => {
  vi.mocked(useAuth).mockReturnValue({
    user: null, isLoading: false, providersConfigured: true, login: vi.fn(), logout: vi.fn(),
  } as any);
  render(<UserMenu />);
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});
```

### Pattern 3: Providers fetch inside `useAuth`

```typescript
// useAuth.tsx — additions
interface AuthState {
  // ... existing
  providersConfigured: boolean | null; // null = not yet fetched
  fetchProviders: () => Promise<void>;
}

fetchProviders: async () => {
  try {
    const res = await fetch("/api/auth/providers", { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    set({ providersConfigured: !!data.auth0 });
  } catch (err) {
    // Fail closed per CONTEXT decision
    console.error("Failed to fetch auth providers:", err);
    set({ providersConfigured: false });
  }
},

checkAuth: async () => {
  set({ isLoading: true, error: null });
  // Run in parallel — independent fetches
  await Promise.all([get().fetchProviders(), /* existing /me logic */]);
  // ...
},
```

Call site is unchanged: `App.tsx:62` already calls `checkAuth()` on mount. `[VERIFIED: client/src/App.tsx:60-62]`

### Anti-Patterns to Avoid

- **Mocking `auth()` from `express-openid-connect`:** Brittle — the factory's return shape can change between versions. Stub `req.oidc` directly instead.
- **Spinning up a real OIDC dev server in tests:** Adds 1-2s per test, requires network, flaky in CI. Avoid.
- **Polling `/api/auth/providers` on every render:** It's a once-per-session value. Fetch once on mount.
- **Showing a placeholder "Sign In" while loading:** CONTEXT decision — render NOTHING. Avoids a layout flash that confuses users in unconfigured deployments.
- **`useAuthProviders` as a separate hook:** Two race-prone fetches with their own loading states. Co-locate inside `useAuth`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC handshake | Custom redirect/callback | `express-openid-connect` (already in use) | PKCE, state, nonce, replay protection — all handled |
| Session cookies | Custom cookie code | `express-session` (in use) | Secure flag, httpOnly, sameSite, signed cookies all baked in |
| HTTP test harness | Hand-rolled `node:http` requests | `supertest` | Async/await ergonomics, status assertions, cookie handling |
| Component render assertions | Manual DOM walking | `@testing-library/react` (already installed) | Already the project standard |

**Key insight:** Both halves of Phase 43 are wiring/testing tasks against existing libraries. There is zero new auth logic to write — the fix is removing the unconditional render and adding `providersConfigured` gating.

## Common Pitfalls

### Pitfall 1: The redirect loop (the user-reported bug)

**What goes wrong:** Click Sign In → POST/GET /api/auth/login → no Express route registered (because `AUTH0_*` env vars are unset, so `server/index.ts:85-91` skipped `configureAuth0()`) → request falls through to Vite/static catch-all → catch-all serves `index.html` with 200 → browser thinks navigation succeeded → SPA boots → `useAuth.checkAuth()` runs → `/api/auth/me` returns `{user:null}` → button stays → user clicks again → loop.

**Why it happens:** `UserMenu.tsx:43-54` renders Sign In whenever `!user`, with no awareness of whether login is even possible.

**How to avoid:** Gate the Sign In on `providersConfigured === true` (true only when the server confirms Auth0 is configured). Per CONTEXT, also gate on `!isLoading` to avoid the placeholder flash.

**Warning signs in logs:** Check `httpLogger` output — at startup you'd see `'Auth0 not configured — running without authentication'` (server/index.ts:90). At runtime you'd see `GET /api/auth/login 200 in <Xms>` (the SPA fallback returning 200 instead of an expected 302), but in the response body the SPA HTML — that's the smoking gun.

**Verification step for the plan:** Add a network-tap assertion: with no `AUTH0_*` set, `GET /api/auth/login` returns 200 with HTML content-type (proves it hit the SPA fallback, not the auth middleware).

`[VERIFIED: code read of server/index.ts:84-91, server/auth/auth0.ts:18-31 (auth() registers /api/auth/login), and the routes-after-Auth0 ordering in server/index.ts]`

### Pitfall 2: Malformed env vars vs. absent env vars

**What goes wrong:** `express-openid-connect`'s `auth()` factory will throw at module-load time if `AUTH0_SECRET` is < 32 chars or `AUTH0_ISSUER_BASE_URL` isn't a valid URL. Today the conditional in `server/index.ts:85` only checks "are they set" — not "are they valid." A user could set `AUTH0_SECRET="x"` and crash the server at startup with a cryptic error. `env.ts:14-20` validates with zod (`.min(32)`, `.url()`) but all are `.optional()`, so the schema doesn't reject malformed-when-set values.

**Why it happens:** The zod schema treats each var independently as optional; it doesn't enforce "if any AUTH0_* is set, all must be set and valid."

**How to avoid:** Add a zod `.refine()` that, when ANY `AUTH0_*` is set, requires the full set with valid formats. Test both code paths: (a) all unset → graceful skip; (b) partial/malformed → fail-fast with a clear message.

**Warning signs:** Server crashes on startup with `Error: secret is required` or similar from `express-openid-connect`.

`[CITED: express-openid-connect README — secret minimum length and required-keys; verify in plan via npm view]`

### Pitfall 3: Cookie / session secret mismatch

**What goes wrong:** `express-session` uses `SESSION_SECRET` (env.ts:7) for `scrumquest.sid`. `express-openid-connect` uses `AUTH0_SECRET` (auth0.ts:25) for its OWN cookie (`appSession` by default). They're separate cookies signed with separate secrets. If a planner accidentally aligns them ("just use one secret") it will silently keep working in dev but break upgrades.

**How to avoid:** Keep them separate — `SESSION_SECRET` and `AUTH0_SECRET` are independent. Document this in `.env.example` (already documents both, no change needed).

`[VERIFIED: server/index.ts:45-77 vs server/auth/auth0.ts:25 — two distinct cookies]`

### Pitfall 4: Stale-closure / race in `useAuth`

**What goes wrong:** If `fetchProviders()` and `checkAuth()` race, a slow `/me` could overwrite an `isLoading: false` set by `fetchProviders`. The render could flicker.

**How to avoid:** Either (a) sequence them (fetchProviders → checkAuth) in the action, or (b) use independent boolean flags (`providersLoading`, `userLoading`) and gate UserMenu on both being false. Recommend (a) — simpler, matches the existing chained-fetch pattern in `checkAuth → fetchProfile → fetchStats`.

### Pitfall 5: Radix DropdownMenu focus trap leak

**What goes wrong:** The avatar `DropdownMenuTrigger` (UserMenu.tsx:60-67) holds focus when open. If the auth state flips from authed → anon (e.g., session expiry) WHILE the dropdown is open, the trigger unmounts and Radix's focus restoration may try to return focus to a now-removed node.

**How to avoid:** When transitioning user → null, ensure the dropdown is closed first OR rely on Radix's built-in cleanup (it does handle this in modern versions). Verification: write a test that mocks user going from `{...}` to `null` and asserts no console errors.

**This is LOW priority** since the only way for `user` to flip to null mid-render is sign-out (which already redirects via `window.location.href`, unmounting the whole app). Document as a known edge case, don't block on it.

`[ASSUMED: Radix focus restoration is robust in current version; verify if test fails]`

## Runtime State Inventory

This is **not** a rename/refactor phase. Skipping — no stored data, OS-registered state, or installed artifacts that embed strings being changed. Code-and-tests only.

## Code Examples

Already shown above in **Architecture Patterns**. All pulled from project conventions (`client/src/components/game/LevelUpCelebration.test.tsx`, `client/src/lib/stores/useAuth.tsx`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `passport-auth0` + manual session glue | `express-openid-connect` (Auth0's official SDK) | 2020+ | Fewer LOC, PKCE/nonce/state baked in — already adopted in this repo |
| `enzyme` for React component tests | `@testing-library/react` | 2020+ | Already adopted; `enzyme` is unmaintained |

**Deprecated/outdated:** None applicable in this scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Latest `supertest` is 7.x | Standard Stack | Low — `npm view` resolves at install time |
| A2 | Radix `DropdownMenu` handles focus restoration when trigger unmounts | Pitfall 5 | Low — only triggers on session-flip-during-dropdown-open, an extreme edge case |
| A3 | `express-openid-connect`'s `auth()` factory throws on malformed-when-set env vars (vs. silently noop) | Pitfall 2 | Medium — if it doesn't throw, the test for "fail-fast on partial config" needs different assertion. Verify in Wave 0 with a smoke-call. |

## Open Questions

1. **Should env validation reject "partial Auth0 config"?**
   - What we know: `env.ts:14-20` marks all 5 vars optional; `server/index.ts:85` uses inline boolean. The CONTEXT.md mentions "missing Auth0 env vars surface a clear error (not a silent loop)" but the locked decisions focus on the unconfig-graceful UX, not env validation hardening.
   - What's unclear: Does AUTH-01's success criterion #5 (ROADMAP.md:195) mean validation must reject partial configs, or just document them?
   - Recommendation: Add an env-time refinement (zod `.refine()`) that enforces "all-or-nothing" — flag this for the plan-checker.

2. **Should `useAuth` expose `isAuthEnabled` to other consumers?**
   - What we know: UserMenu is the sole consumer today.
   - What's unclear: Will future phases want to know auth-enabled state?
   - Recommendation: Add `providersConfigured` to the public state shape (zero cost). Don't add a wrapper hook.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node + npm | Build/test | ✓ | (project standard) | — |
| vitest | Test runner | ✓ | ^4.0.17 | — |
| `@testing-library/react` | Component tests | ✓ | ^16.3.2 | — |
| `express-openid-connect` | Auth0 middleware | ✓ | ^2.19.4 | — |
| `supertest` | HTTP integration tests | ✗ | — | Hand-rolled fetch against local server (worse) — install supertest |
| Real Auth0 tenant | E2E manual smoke | ✗ (user has credentials but provisioning is OUT OF SCOPE) | — | All automated tests use `req.oidc` mocking; manual smoke happens after user fills `.env` |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:** `supertest` — install at Wave 0 (`npm install --save-dev supertest @types/supertest`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.17 |
| Config file | `vitest.config.ts` (env: happy-dom; setup: `client/src/test/setup.ts`) |
| Quick run command | `npx vitest run server/auth/routes.test.ts client/src/components/auth/UserMenu.test.tsx -x` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | `/api/auth/me` returns `{user:null}` when `req.oidc.isAuthenticated()===false` | server integration | `npx vitest run server/auth/routes.test.ts -t "me unauthenticated"` | ❌ Wave 0 |
| AUTH-01 | `/api/auth/me` returns `{user:{...}}` when `req.oidc` stubbed authenticated + `storage.getUserByAuth0Sub` returns user | server integration | `npx vitest run server/auth/routes.test.ts -t "me authenticated"` | ❌ Wave 0 |
| AUTH-01 | `/api/auth/me` returns `{user:null}` when authenticated but no DB user (orphan sub) | server integration | `npx vitest run server/auth/routes.test.ts -t "me orphan sub"` | ❌ Wave 0 |
| AUTH-01 | `/api/auth/providers` returns `{auth0:true}` when env vars set | server integration | `npx vitest run server/auth/routes.test.ts -t "providers configured"` | ❌ Wave 0 |
| AUTH-01 | `/api/auth/providers` returns `{auth0:false}` when env vars unset | server integration | `npx vitest run server/auth/routes.test.ts -t "providers unconfigured"` | ❌ Wave 0 |
| AUTH-01 | `/api/auth/login` returns 302 when AUTH0_* set (smoke — uses real `auth()` middleware against fake issuer URL, asserts redirect status only, not target validity) | server integration | `npx vitest run server/auth/routes.test.ts -t "login redirect"` | ❌ Wave 0 |
| AUTH-01 | UserMenu renders nothing when `providersConfigured===null` (loading) | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders nothing while loading"` | ❌ Wave 0 |
| AUTH-01 | UserMenu renders nothing when `providersConfigured===false` | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders nothing when unconfigured"` | ❌ Wave 0 |
| AUTH-01 | UserMenu renders Sign In when `providersConfigured===true && user===null` | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders Sign In when configured anon"` | ❌ Wave 0 |
| AUTH-01 | UserMenu renders avatar dropdown when `user` populated (regardless of `providersConfigured`) | client component | `npx vitest run client/src/components/auth/UserMenu.test.tsx -t "renders avatar when authed"` | ❌ Wave 0 |
| AUTH-01 | useAuth.fetchProviders sets `providersConfigured=false` on fetch error (fail-closed) | client unit | `npx vitest run client/src/lib/stores/useAuth.test.tsx -t "fail closed on providers error"` | ❌ Wave 0 |
| AUTH-01 | useAuth.fetchProviders sets `providersConfigured=true/false` based on response | client unit | `npx vitest run client/src/lib/stores/useAuth.test.tsx -t "providers boolean"` | ❌ Wave 0 |
| AUTH-01 | Sign-out clears local state (manual + smoke — `logout` action redirects to `/api/auth/logout`) | manual + assertion that `logout()` calls `window.location.href = "/api/auth/logout"` | `npx vitest run client/src/lib/stores/useAuth.test.tsx -t "logout redirects"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Run only the affected test file (`vitest run <file>`).
- **Per wave merge:** `npx vitest run server/auth/ client/src/components/auth/ client/src/lib/stores/useAuth.test.tsx`.
- **Phase gate:** Full `npm test` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `server/auth/routes.test.ts` — covers AUTH-01 server cases
- [ ] `server/auth/__testHelpers/mockOidc.ts` — shared `req.oidc` stub middleware
- [ ] `client/src/components/auth/UserMenu.test.tsx` — covers AUTH-01 client render cases
- [ ] `client/src/lib/stores/useAuth.test.tsx` — covers fetchProviders + logout state
- [ ] Install `supertest` + `@types/supertest` (`npm install --save-dev supertest @types/supertest`)

## Sources

### Primary (HIGH confidence)
- Project source files (cited inline by file:line)
- `vitest.config.ts:13-22` — test environment config
- `package.json` — dep versions (verified via `grep`)
- `client/src/components/game/LevelUpCelebration.test.tsx:7-31` — analog mock pattern

### Secondary (MEDIUM confidence)
- `express-openid-connect` library behavior (referenced README; pin via `npm view` in Wave 0)

### Tertiary (LOW confidence)
- Radix DropdownMenu focus restoration semantics in current version (Pitfall 5) — flagged as low-impact

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against `package.json`
- Architecture: HIGH — diagnosis derived from direct code read of all referenced files
- Pitfalls: HIGH for #1, #3, #4; MEDIUM for #2 (express-openid-connect strict-validation behavior); LOW for #5

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (stable surface; reduce to 14 days if `express-openid-connect` major version bumps)

## RESEARCH COMPLETE

**Phase:** 43 - auth-user-account-validation
**Confidence:** HIGH

### Key Findings
- Loop diagnosis confirmed by code read: `UserMenu.tsx:43-54` unconditional Sign In + `server/index.ts:85-91` conditional auth-route registration + Vite/static catch-all serving index.html for unknown routes = the loop. No reproduction tooling needed; the source code proves it.
- React Query is installed (`@tanstack/react-query@^5.90.20`) but `useAuth` does NOT use it — uses plain `fetch` + Zustand `set`. Stay consistent: extend `useAuth` with `providersConfigured` rather than introducing React Query for one fetch.
- `supertest` is NOT installed — adding it is justified (no prior server-route HTTP tests in repo). All other test deps already present.
- Mock `req.oidc` via injected middleware (not by mocking `auth()` factory). Pattern matches `LevelUpCelebration.test.tsx` (mock the dependency, not the framework).
- Auth/reconnect are fully independent: zero references to "reconnect" in any auth source file (verified via grep). No coupling risk with Phase 41.
- Latent bug surfaced: `env.ts:14-20` marks all `AUTH0_*` vars optional with no all-or-nothing refinement — partial config could crash at startup. Recommend planner adds zod `.refine()` for fail-fast validation.

### File Created
`.planning/phases/43-auth-user-account-validation/43-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All versions verified from `package.json` |
| Architecture | HIGH | Direct code read of every referenced file |
| Pitfalls | HIGH | Loop reproduced via code-flow analysis; pitfalls 2/5 flagged with explicit assumption tags |
| Test patterns | HIGH | Analog test files identified and cited |

### Open Questions
1. Should env validation enforce "all-or-nothing" Auth0 config (zod `.refine()`)? Recommend YES per AUTH-01 success criterion #5.
2. Should `useAuth` expose `isAuthEnabled` for future consumers? Recommend YES (zero cost).

### Ready for Planning
Research complete. Planner can now create PLAN.md files (recommended split: 43-01 unconfig-graceful UX + env hardening; 43-02 configured round-trip tests).
