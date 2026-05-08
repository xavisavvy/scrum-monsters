---
phase: 43-auth-user-account-validation
plan: 01
subsystem: auth
tags: [auth, ux, frontend, zustand]
dependency_graph:
  requires: []
  provides:
    - useAuth.providersConfigured
    - useAuth.fetchProviders
    - UserMenu three-way render gate
  affects:
    - client/src/components/auth/UserMenu.tsx
    - client/src/lib/stores/useAuth.tsx
tech_stack:
  added: []
  patterns:
    - Sequenced Zustand fetch chain (fetchProviders -> /me) — mirrors existing checkAuth -> fetchProfile -> fetchStats
    - Fail-closed on auth-config probe (any non-OK / network error => providersConfigured: false)
    - Three-way render gate (loading | unconfigured | configured-anon | authed)
key_files:
  created: []
  modified:
    - client/src/lib/stores/useAuth.tsx
    - client/src/components/auth/UserMenu.tsx
decisions:
  - "Co-located providers fetch inside useAuth (no parallel useAuthProviders hook) per CONTEXT — single consumer, single fetch, single cache, matches existing chained-fetch pattern"
  - "Sequenced fetchProviders BEFORE /api/auth/me in checkAuth (no Promise.all) per RESEARCH Pitfall 4 — eliminates stale-closure race / render flicker"
  - "providersConfigured intentionally NOT included in persist partialize — session-scoped fetch result, not user state to persist"
  - "Fail-closed on /providers errors: any non-OK status or fetch rejection sets providersConfigured: false (never leaves it null)"
  - "UserMenu renders null (not a placeholder/skeleton) while providersConfigured===null — no Sign In flash"
metrics:
  duration: ~2.5 minutes
  tasks: 2
  files_modified: 2
  files_created: 0
  tests_passing: 690/690
  completed_date: 2026-05-08
---

# Phase 43 Plan 01: Graceful Unconfig UX Summary

**One-liner:** Hide the Sign In button when the server reports `auth0=false` by extending `useAuth` with a sequenced `providersConfigured` probe and gating `UserMenu` on it — eliminates the user-reported click-Sign-In-page-reloads-button-still-there loop.

## What Was Built

`useAuth` (Zustand store, `client/src/lib/stores/useAuth.tsx`) gained:

- `providersConfigured: boolean | null` field on `AuthState` (null = loading, true/false = server-reported configuration)
- `fetchProviders()` action that queries `GET /api/auth/providers`, sets `providersConfigured` from `data.auth0`, and **fails closed** (sets `false`, never leaves `null`) on any non-OK status, parse error, or network rejection
- `checkAuth()` now `await`s `fetchProviders()` **before** the existing `/api/auth/me` fetch — sequence, not parallel, per RESEARCH Pitfall 4 (no `Promise.all`)
- `persist` middleware `partialize` is unchanged (already returns `{}`); `providersConfigured` is correctly not persisted as a side effect

`UserMenu` (`client/src/components/auth/UserMenu.tsx`) replaced the unconditional `if (!user)` Sign In branch with a three-way gate:

- `!user && (isLoading || providersConfigured === null || providersConfigured === false)` -> `return null` (no flash, no broken button)
- `!user && providersConfigured === true && !isLoading` -> renders the existing Sign In `<Button>`
- `user` truthy -> renders the avatar dropdown unchanged (regardless of `providersConfigured`)

`App.tsx` was not touched — the existing `checkAuth()` call on mount automatically propagates the new `fetchProviders` because it is awaited inside `checkAuth`.

## Tasks

| Task | Name                                                          | Commit  | Files                                                                                       |
| ---- | ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| 1    | Extend useAuth with providersConfigured + fetchProviders      | 1ee9b8f | client/src/lib/stores/useAuth.tsx                                                           |
| 2    | Gate UserMenu Sign In on providersConfigured===true & !loading | c9fa535 | client/src/components/auth/UserMenu.tsx                                                     |

## Verification

- `npm run check` — clean (no new TypeScript errors) after both tasks
- `npm test` — 37 files / 690 tests pass after both commits (matches baseline; no regressions)
- All four `node -e` structural acceptance checks per task PASS:
  - `providersConfigured` referenced 5x in useAuth.tsx (interface decl, initial state, two set calls, destructure)
  - `fetchProviders` declared as `async`
  - `fetchProviders` invoked BEFORE `/api/auth/me` inside `checkAuth` (positions verified)
  - UserMenu has the three-way gate (`providersConfigured===null` and `providersConfigured===false` both checked) with `return null` and `isLoading` consulted
  - Sign In label still rendered exactly once in UserMenu (configured-anon path preserved)

## Deviations from Plan

None — plan executed exactly as written. No deviation rules triggered.

## Authentication Gates

None — no auth interactions during execution.

## Threat Surface Notes

No new surfaces introduced. The `/api/auth/providers` endpoint already existed and is unchanged; the client now consumes its existing public boolean. Per the plan's threat register:

- T-43-01 (tampering) — accept (no privilege escalation possible from a forged `auth0:true` response — worst case is the pre-fix loop)
- T-43-02 (info disclosure) — verified `providersConfigured` is NOT in `partialize` output (which returns `{}`)
- T-43-03 (DoS) — single fetch per `checkAuth` (which runs once on App mount), no polling

## Known Stubs

None. The two-task delta is a complete render-gate fix; no placeholder data, no "TODO" branches, no mock components.

## Behavioral test files

Per the plan's note, behavioral test files for `useAuth` and `UserMenu` (`useAuth.test.tsx`, `UserMenu.test.tsx`) are authored in Plan 43-02 Wave 2. Wave 1 (this plan) verifies via structural assertions only — those become end-to-end gates after 43-02 lands. This is the planned split, not a deviation.

## Cross-Plan Dependencies

- **AUTH-01** (the only requirement on this plan) is a multi-plan deliverable. 43-01 ships the unconfigured-graceful UX half (Sign In button hidden when `auth0=false`, fail-closed on `/providers` error, no flash). The full requirement (configured Auth0 round-trip integration tests + env hardening for partial-config fail-fast) lands with 43-02. AUTH-01 is therefore NOT marked complete by this summary; it remains pending until 43-02 ships.

## Self-Check: PASSED

- FOUND: client/src/lib/stores/useAuth.tsx (modified)
- FOUND: client/src/components/auth/UserMenu.tsx (modified)
- FOUND: commit 1ee9b8f (Task 1)
- FOUND: commit c9fa535 (Task 2)
