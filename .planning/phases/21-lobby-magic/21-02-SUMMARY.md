---
phase: 21-lobby-magic
plan: 02
subsystem: auth
tags: [csrf, csrf-sync, express, security, codeql, spa]

# Dependency graph
requires:
  - phase: 21-01
    provides: express-rate-limit rate limiting middleware, trust proxy configuration, express-session already configured
provides:
  - csrf-sync@4.2.1 installed with Synchronizer Token Pattern CSRF protection
  - GET /api/csrf-token endpoint serves session-bound tokens
  - csrfSynchronisedProtection applied to /api/auth/login, /api/auth/register, /api/auth/logout, /api/user
  - client/src/lib/csrfToken.ts with fetchCsrfToken/getCsrfToken/getCsrfHeaders utility
  - x-csrf-token header injected on all 4 mutation fetch calls in useAuth.tsx
  - CSRF token re-fetched after login/register/logout (handles session regeneration)
  - fetchCsrfToken() called on app mount in App.tsx
affects: [all future POST/PUT/DELETE API work, auth testing, E2E tests involving login/register]

# Tech tracking
tech-stack:
  added: [csrf-sync@^4.2.1]
  patterns: [Synchronizer Token Pattern via x-csrf-token header (SPA pattern), session-bound CSRF tokens via csrf-sync, re-fetch CSRF token after auth state changes that may regenerate session]

key-files:
  created:
    - server/middleware/csrf.ts
    - client/src/lib/csrfToken.ts
  modified:
    - server/routes.ts
    - client/src/lib/stores/useAuth.tsx
    - client/src/App.tsx

key-decisions:
  - "Read token from x-csrf-token header not form body — SPA clients use headers for all requests"
  - "OAuth routes (/api/auth/google, /api/auth/github) excluded from CSRF — they use OAuth state parameter for CSRF protection"
  - "CSRF token re-fetched after login, register, and logout — session may regenerate on auth state changes"
  - "WebSocket events excluded from CSRF — not HTTP, protected by CORS origin checking"
  - "getCsrfHeaders() returns empty object when no token available (graceful degradation during initial load)"

patterns-established:
  - "CSRF middleware: Create in server/middleware/, apply via app.use() before route mounting"
  - "Client mutation requests: always spread getCsrfHeaders() into headers object for all POST/PUT/DELETE"
  - "Session token rotation: call fetchCsrfToken() after any operation that regenerates the session"

# Metrics
duration: 8min
completed: 2026-02-18
---

# Phase 21 Plan 02: CSRF Protection Summary

**csrf-sync Synchronizer Token Pattern on all state-changing HTTP endpoints with client-side x-csrf-token header injection and session-aware token re-fetching**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-18T05:35:39Z
- **Completed:** 2026-02-18T05:44:02Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed csrf-sync@4.2.1 and created server/middleware/csrf.ts with session-bound token generation using x-csrf-token header extraction (SPA pattern)
- Added GET /api/csrf-token endpoint and applied csrfSynchronisedProtection to login, register, logout, and /api/user routes — OAuth routes excluded
- Created client/src/lib/csrfToken.ts with fetchCsrfToken/getCsrfToken/getCsrfHeaders; wired CSRF header into all 4 mutation fetch calls in useAuth.tsx with session re-fetch after auth changes
- Added fetchCsrfToken() call on app mount in App.tsx to ensure token is available before any mutation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install csrf-sync and create CSRF middleware** - `27e916e` (feat)
2. **Task 2: Wire CSRF middleware into routes and add client-side token handling** - `6b16ec9` (feat)

**Plan metadata:** _(pending)_ (docs: complete plan)

## Files Created/Modified
- `server/middleware/csrf.ts` - csrfSync configured with x-csrf-token header extraction, exports generateToken and csrfSynchronisedProtection
- `server/routes.ts` - Added CSRF token endpoint (GET /api/csrf-token), applied csrfSynchronisedProtection to 4 state-changing route groups
- `client/src/lib/csrfToken.ts` - Module-level token cache, fetchCsrfToken (async fetch), getCsrfToken (sync read), getCsrfHeaders (returns header object or empty)
- `client/src/lib/stores/useAuth.tsx` - Added getCsrfHeaders() spread to login/register/logout/updateProfile; fetchCsrfToken() called after login, register, logout
- `client/src/App.tsx` - fetchCsrfToken() called in mount useEffect alongside checkAuth()

## Decisions Made
- x-csrf-token header pattern chosen over cookie-based CSRF — SPAs use headers naturally, avoids cookie-parser dependency
- OAuth routes (/api/auth/google, /api/auth/github) excluded from CSRF protection — OAuth spec uses state parameter for CSRF, adding second CSRF layer would break OAuth flow
- Token re-fetched after login, register, and logout — passport session regeneration creates a new session ID, the old CSRF token would be invalid
- WebSocket events excluded — not HTTP requests, already protected by Socket.IO CORS origin checking on handshake
- getCsrfHeaders() returns empty object when token is null — graceful degradation means page can still render even if CSRF fetch fails, mutations will be blocked by server

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error in fetchCsrfToken return type**
- **Found during:** Task 2 verification (tsc --noEmit)
- **Issue:** `csrfToken` module-level variable typed as `string | null`; plan template assigned it directly and returned it. TypeScript correctly flagged `Type 'string | null' is not assignable to type 'string'` since the function declares `Promise<string>`
- **Fix:** Extracted fetched value into local `const token: string = data.csrfToken` before assigning to module variable and returning — this keeps the explicit `string` return type while still updating the cached value
- **Files modified:** client/src/lib/csrfToken.ts
- **Verification:** tsc --noEmit passes with no errors from our files; 575 tests pass
- **Committed in:** 6b16ec9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 type error / incorrect return type inference)
**Impact on plan:** Minor TypeScript correctness fix. No behavior change — function behavior is identical, type annotation is now accurate.

## Issues Encountered

None. Pre-existing `shared/schema.ts` TypeScript errors (Zod/drizzle version mismatch) remain but are unrelated to our changes and documented as pre-existing in Phase 21-01 summary.

## User Setup Required

None - no external service configuration required. All changes are code-only.

## Next Phase Readiness
- CSRF protection active on all state-changing HTTP endpoints — CodeQL CSRF alerts should resolve
- csrf-sync middleware available for import in any future route files
- Client CSRF utility available at `@/lib/csrfToken` for any future mutation fetch calls

---
*Phase: 21-lobby-magic*
*Completed: 2026-02-18*
