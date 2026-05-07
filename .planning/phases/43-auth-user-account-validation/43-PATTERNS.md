# Phase 43: Auth & User Account Validation - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 7 (3 modified, 4 new)
**Analogs found:** 7 / 7

## File Classification

| File | New/Modified | Role | Data Flow | Plan | Closest Analog | Match Quality |
|------|--------------|------|-----------|------|----------------|---------------|
| `client/src/lib/stores/useAuth.tsx` | modified | store (Zustand) | request-response | 43-01 | `client/src/lib/stores/useAuth.tsx` (existing `checkAuth → fetchProfile → fetchStats` chain) | exact (self-extension) |
| `client/src/components/auth/UserMenu.tsx` | modified | component | render-decision | 43-01 | `client/src/components/auth/UserMenu.tsx` (existing render-gate at L43-54) | exact (self-extension) |
| `server/config/env.ts` | modified | config | startup-validation | 43-02 | `server/config/env.ts` existing `.refine()` at L21-27 | exact (extend existing zod refine) |
| `server/auth/__testHelpers/mockOidc.ts` | new | test utility | middleware-stub | 43-02 | (no analog — first server HTTP test helper in repo) | none — pattern from RESEARCH §Pattern 1 |
| `server/auth/routes.test.ts` | new | test (server integration) | request-response | 43-02 | `server/gameState.test.ts` (vitest + private-state fixture) | role-match (no prior supertest tests in repo) |
| `client/src/components/auth/UserMenu.test.tsx` | new | test (component) | render-assertions | 43-02 | `client/src/components/game/LevelUpCelebration.test.tsx:7-31` | exact (analog flagged in RESEARCH) |
| `client/src/lib/stores/useAuth.test.tsx` | new | test (store unit) | state-machine | 43-02 | `client/src/lib/stores/useProgression.test.ts` | exact |

---

## Pattern Assignments

### Plan 43-01: Graceful unconfig path

#### `client/src/lib/stores/useAuth.tsx` (Zustand store, request-response)

**Analog:** itself — extend existing chained-fetch pattern.

**Imports pattern** (existing, unchanged — L1-3):
```typescript
import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import { getCsrfHeaders } from '@/lib/csrfToken';
```

**Existing chained-fetch pattern to mirror** (L61-81 — `checkAuth`):
```typescript
checkAuth: async () => {
  set({ isLoading: true, error: null });
  try {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    const data = await response.json();
    if (data.user) {
      set({ user: data.user, isInitialized: true, isLoading: false });
      get().fetchProfile();
      get().fetchStats();
    } else {
      set({ user: null, profile: null, stats: null, isInitialized: true, isLoading: false });
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    set({ user: null, isInitialized: true, isLoading: false });
  }
},
```

**Existing fail-quiet fetch pattern to mirror** (L91-103 — `fetchProfile`):
```typescript
fetchProfile: async () => {
  try {
    const response = await fetch("/api/user/profile", { credentials: "include" });
    if (response.ok) {
      const data = await response.json();
      set({ profile: data.profile });
    }
  } catch (err) {
    console.error("Failed to fetch profile:", err);
  }
},
```

**Pattern to apply for `fetchProviders`:**
- Add `providersConfigured: boolean | null` to `AuthState` interface (init `null`).
- Add `fetchProviders` action mirroring `fetchProfile`'s try/catch shape, but on error set `providersConfigured: false` (fail-closed per CONTEXT decision, NOT silent like fetchProfile).
- Sequence inside `checkAuth`: call `await get().fetchProviders()` BEFORE the `/me` fetch (Pitfall 4 — avoid race; researcher recommends sequence over parallel).
- Initial state addition: `providersConfigured: null,` next to `user: null,` (L54).

#### `client/src/components/auth/UserMenu.tsx` (component, render-decision)

**Analog:** itself — extend existing `if (!user)` gate at L42-55.

**Existing render-gate pattern** (L42-55):
```typescript
// If not logged in, show sign in button
if (!user) {
  return (
    <Button variant="outline" size="sm" onClick={login} className="gap-2">
      <User className="h-4 w-4" />
      Sign In
    </Button>
  );
}
```

**Pattern to apply:**
- Destructure `providersConfigured` from `useAuth()` (L23 — add to existing destructure).
- Replace L42-55 with three-way gate (matches RESEARCH diagram L127-134):
  ```typescript
  if (!user) {
    if (isLoading || providersConfigured === null || providersConfigured === false) {
      return null; // render nothing while loading OR when unconfigured (fail-closed)
    }
    return (
      <Button variant="outline" size="sm" onClick={login} className="gap-2">
        <User className="h-4 w-4" />
        Sign In
      </Button>
    );
  }
  ```
- Authenticated path (L57-127) is UNCHANGED — `user` truthy renders avatar dropdown regardless of `providersConfigured` (per RESEARCH test map row "renders avatar when authed").

**No changes needed at call site:** `App.tsx:60-62` already calls `checkAuth()` on mount; extending `checkAuth` internally propagates automatically.

---

### Plan 43-02: Configured-path integration tests + env hardening

#### `server/config/env.ts` (config, startup-validation)

**Analog:** itself — existing `.refine()` at L21-27.

**Existing `.refine()` pattern to extend** (L21-27):
```typescript
}).refine((data) => {
  if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
    httpLogger.error('DATABASE_URL is required in production. Set it in .env and restart.');
    process.exit(1);
  }
  return true;
});
```

**Existing fail-fast error formatting** (L37-44 — copy idiom for clear messages):
```typescript
if (error instanceof z.ZodError) {
  const formatted = error.issues
    .map((err: z.ZodIssue) => `  - ${err.path.join(".")}: ${err.message}`)
    .join("\n");
  httpLogger.error({ errors: formatted }, 'Environment validation failed');
  process.exit(1);
}
```

**Pattern to apply (all-or-nothing AUTH0_* refinement):**
- Add a second `.refine()` (chainable) OR extend the existing one. Recommend a SECOND `.refine()` to keep the production-DB rule readable:
  ```typescript
  .refine((data) => {
    const auth0Vars = [data.AUTH0_ISSUER_BASE_URL, data.AUTH0_CLIENT_ID, data.AUTH0_CLIENT_SECRET, data.AUTH0_SECRET];
    const setCount = auth0Vars.filter(Boolean).length;
    if (setCount > 0 && setCount < 4) {
      httpLogger.error('Auth0 partial configuration detected. Either set ALL of AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET — or NONE.');
      process.exit(1);
    }
    return true;
  });
  ```
- Note: per-var format validation (`.url()`, `.min(32)`) is already present at L16-19; the refine adds the cross-field "all-or-nothing" rule per RESEARCH Pitfall 2.

#### `server/auth/__testHelpers/mockOidc.ts` (test utility, middleware-stub) — NEW

**Analog:** none in repo (first server HTTP test helper). Pattern source: RESEARCH.md §Pattern 1 (L186-198).

**Pattern to apply (verbatim from RESEARCH):**
```typescript
import type { RequestHandler } from "express";

export type OidcStub = { isAuthenticated: () => boolean; user?: { sub: string; [k: string]: unknown } };

export function mockOidcMiddleware(stub: OidcStub): RequestHandler {
  return (req, _res, next) => {
    (req as any).oidc = stub;
    next();
  };
}
```

The `(req as any).oidc` cast matches the same cast used in `server/auth/routes.ts:8-9` — keeps the runtime shape identical.

#### `server/auth/routes.test.ts` (test, server integration) — NEW

**Analog:** `server/gameState.test.ts` (vitest + fixture builder pattern).

**Test framework imports pattern** (from `server/gameState.test.ts:1-3`):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
```

**Pattern to apply (HTTP-test specific, from RESEARCH §Pattern 1 L201-221):**
```typescript
import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import authRoutes from "./routes";
import { mockOidcMiddleware, type OidcStub } from "./__testHelpers/mockOidc";

vi.mock("../storage.js", () => ({
  storage: {
    getUserByAuth0Sub: vi.fn(),
  },
}));
import { storage } from "../storage.js";

function makeApp(stub: OidcStub) {
  const app = express();
  app.use(express.json());
  app.use(mockOidcMiddleware(stub));
  app.use("/api/auth", authRoutes);
  return app;
}
```

**Test cases to implement (from RESEARCH §Validation Architecture L431-444):**
- `me unauthenticated` — `isAuthenticated: () => false` → expect `{ user: null }`
- `me authenticated` — stub authenticated + mock `storage.getUserByAuth0Sub` returns user → expect `{ user: { id, username, ... } }`
- `me orphan sub` — authenticated but `getUserByAuth0Sub` returns null → expect `{ user: null }`
- `providers configured` — set `process.env.AUTH0_CLIENT_ID/AUTH0_ISSUER_BASE_URL` in `beforeEach`, restore in `afterEach` → expect `{ auth0: true }`
- `providers unconfigured` — clear those env vars → expect `{ auth0: false }`
- `login redirect` — separate suite that mounts the real `configureAuth0()` middleware against a fake issuer URL; assert 302 status only (don't follow redirect)

**Env-var save/restore idiom** (mirror `server/gameState.test.ts` test-isolation discipline):
```typescript
beforeEach(() => {
  vi.mocked(storage.getUserByAuth0Sub).mockReset();
});
```

#### `client/src/components/auth/UserMenu.test.tsx` (test, component) — NEW

**Analog:** `client/src/components/game/LevelUpCelebration.test.tsx:1-31` (exact pattern flagged in RESEARCH).

**Imports + mock pattern** (copy verbatim from analog L1-13):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserMenu } from './UserMenu';
import { useAuth } from '@/lib/stores/useAuth';

vi.mock('@/lib/stores/useAuth', () => ({
  useAuth: vi.fn(),
}));
```

**Per-test setup pattern** (mirrors LevelUpCelebration L26-32):
```typescript
beforeEach(() => {
  vi.mocked(useAuth).mockReset();
});
```

**Pattern to apply (test cases from RESEARCH §Pattern 2 L237-260):**
- "renders nothing while loading" — `{ user: null, isLoading: true, providersConfigured: null }` → `expect(container).toBeEmptyDOMElement()`
- "renders nothing when unconfigured" — `{ user: null, isLoading: false, providersConfigured: false }` → empty
- "renders Sign In when configured anon" — `{ user: null, isLoading: false, providersConfigured: true }` → `getByRole("button", { name: /sign in/i })`
- "renders avatar when authed" — `{ user: { id: 1, username: "u", displayName: "U", avatarUrl: null, email: null }, providersConfigured: true }` → assert avatar fallback initials present

**Mock return shape note:** Cast with `as any` like the analog (L31, L51) — `useAuth` exposes a wide interface and tests only need a subset.

#### `client/src/lib/stores/useAuth.test.tsx` (test, store unit) — NEW

**Analog:** `client/src/lib/stores/useProgression.test.ts:1-50` (direct store-state assertion pattern).

**Test framework + state-reset pattern** (copy from analog L1-7):
```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAuth } from './useAuth';

beforeEach(() => {
  // Reset Zustand state between tests
  useAuth.setState({ user: null, providersConfigured: null, isLoading: false, isInitialized: false, error: null, profile: null, stats: null });
});
```

**`fetch` mocking pattern (new — no exact analog; standard vitest):**
```typescript
const fetchSpy = vi.spyOn(global, 'fetch');
afterEach(() => fetchSpy.mockRestore());

it('fetchProviders sets providersConfigured=true on {auth0:true}', async () => {
  fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ auth0: true }), { status: 200 }));
  await useAuth.getState().fetchProviders();
  expect(useAuth.getState().providersConfigured).toBe(true);
});

it('fetchProviders fails closed on network error', async () => {
  fetchSpy.mockRejectedValueOnce(new Error('network down'));
  await useAuth.getState().fetchProviders();
  expect(useAuth.getState().providersConfigured).toBe(false);
});
```

**Test cases (from RESEARCH §Validation Architecture):**
- `providers boolean` — true and false based on response
- `fail closed on providers error` — fetch rejects → `providersConfigured === false`
- `logout redirects` — assert `logout()` sets `window.location.href = "/api/auth/logout"`. Use `delete (window as any).location; (window as any).location = { href: "" };` reassignment idiom.

---

## Shared Patterns

### Vitest test framework imports
**Source:** `client/src/components/game/LevelUpCelebration.test.tsx:1`, `server/gameState.test.ts:1`
**Apply to:** All new test files
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

### Zustand store mocking (component tests)
**Source:** `client/src/components/game/LevelUpCelebration.test.tsx:7-12, 26-32`
**Apply to:** `UserMenu.test.tsx`
```typescript
vi.mock('@/lib/stores/useAuth', () => ({ useAuth: vi.fn() }));
// in test:
vi.mocked(useAuth).mockReturnValue({ /* partial state */ } as any);
```

### Fail-closed error handling (auth surface)
**Source:** CONTEXT.md decisions + RESEARCH Pitfall 1
**Apply to:** `useAuth.fetchProviders`, `UserMenu` render gate
- On any error or ambiguous state (null, false, loading), render NOTHING / set `providersConfigured: false`. Never default to "auth available."

### `(req as any).oidc` cast convention
**Source:** `server/auth/routes.ts:8-9`
**Apply to:** `mockOidc.ts`, `routes.test.ts`
- The codebase intentionally uses `(req as any).oidc` rather than augmenting Express types globally. Keep that cast in tests for shape parity.

### Env-time fail-fast with `process.exit(1)` + `httpLogger.error`
**Source:** `server/config/env.ts:22-26, 41-44`
**Apply to:** New AUTH0_* all-or-nothing refinement
- Match the existing logger + exit pattern; don't throw — the existing convention is `httpLogger.error(...)` then `process.exit(1)`.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `server/auth/__testHelpers/mockOidc.ts` | test middleware factory | First HTTP-level test helper in repo; pattern sourced from RESEARCH §Pattern 1 (de facto Express-test convention) |
| `server/auth/routes.test.ts` (supertest harness) | server HTTP integration test | Repo has no prior `supertest` usage; `server/gameState.test.ts` provides the vitest scaffolding analog but not the HTTP-request idiom |

Planner should treat the RESEARCH.md code excerpts as authoritative for these two files (both excerpts are short and self-contained).

---

## Metadata

**Analog search scope:**
- `server/**/*.test.ts` (20 files) — for server test conventions
- `client/src/**/*.test.{ts,tsx}` (18 files) — for component + store test conventions
- `server/auth/**` and `client/src/lib/stores/useAuth.tsx` — for surface to extend

**Files scanned:** ~10 read directly; ~38 enumerated via Glob.

**Pattern extraction date:** 2026-05-07

---

## PATTERN MAPPING COMPLETE

**Phase:** 43 - auth-user-account-validation
**Files classified:** 7
**Analogs found:** 7 / 7

### Coverage
- Files with exact analog: 5 (useAuth, UserMenu, env.ts, UserMenu.test.tsx, useAuth.test.tsx)
- Files with role-match analog: 0
- Files with no analog (RESEARCH-sourced): 2 (mockOidc.ts, routes.test.ts supertest harness)

### Key Patterns Identified
- All component tests use `vi.mock('@/lib/stores/...')` + `vi.mocked(...).mockReturnValue({...} as any)` — `LevelUpCelebration.test.tsx` is the canonical analog
- Server tests use vitest direct imports + private-state fixture builders (`gameState.test.ts`); no prior HTTP-route tests — `supertest` install is justified
- `useAuth` already chains fetches (`checkAuth → fetchProfile → fetchStats`) — extend with `fetchProviders` matching the same try/catch + `set({...})` shape (but fail-closed, not silent)
- `env.ts` already uses `.refine()` + `httpLogger.error` + `process.exit(1)` — extend with a second refine for AUTH0_* all-or-nothing
- `(req as any).oidc` cast convention persists into test helpers — no global type augmentation in this phase

### File Created
`.planning/phases/43-auth-user-account-validation/43-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
