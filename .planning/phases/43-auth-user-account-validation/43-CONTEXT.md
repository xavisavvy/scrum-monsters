# Phase 43: Auth & User Account Validation - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning
**Source:** /gsd-discuss-phase

<domain>
## Phase Boundary

Two halves, both delivering AUTH-01:

1. **Make the missing-config path graceful.** Today, when Auth0 env vars are unset, the server skips registering `/api/auth/login` (server/index.ts:85-91), but the client's `UserMenu` always renders a Sign In button anyway. Click → browser navigates to a 404'd `/api/auth/login` route → SPA fallback serves index.html → page reloads → still anonymous → button still showing → user clicks again → loops. The user has confirmed this is happening locally (no AUTH0_* vars set in their .env). Fix: the Sign In button must consult `GET /api/auth/providers` and hide entirely when `auth0=false`. No loop, no broken button.

2. **Verify the configured Auth0 round-trip end-to-end.** Even when env vars ARE set, this phase has never had a regression test for the full sign-in flow. Add tests/checks covering: `/api/auth/login` redirect → callback round-trip → `/api/auth/me` returns the user → `useAuth().user` populated client-side → Sign In button hidden when authenticated → sign-out clears session and returns to anonymous state.

Out of scope: provisioning an Auth0 tenant; filling production secrets; changing the auth provider; account-tied features beyond what's already wired (profile/stats UI lives in `UserMenu` and depends on `useAuth().user` — verify it renders correctly when authenticated, no new account-tied surfaces added). Anonymous play continues to work — no auth requirement is introduced anywhere new.

</domain>

<decisions>
## Implementation Decisions

### Sign In button behavior when Auth0 is not configured

- **Hide the button entirely.** `UserMenu` queries `GET /api/auth/providers` (already exists at `server/auth/routes.ts:30-34`); if `auth0 === false`, the Sign In button does NOT render. UI looks identical to a deployment without the auth feature.
- Loading-state behavior: while the providers query is in flight, do NOT render a placeholder "Sign In" button (don't flash). Render nothing in that slot until the response resolves; keeps the unconfigured path indistinguishable from "auth not loaded yet."
- Caching: provider config doesn't change at runtime — the providers fetch should happen once at app boot (or on `useAuth` mount) and be cached for the session.
- Error fallback: if `/providers` itself errors, fail closed — hide the button rather than show a potentially-broken one.

### Configured Auth0 round-trip — what gets tested

- **Server-side integration test:** with AUTH0_* env vars set, the auth routes register correctly. `/api/auth/login` returns a 302 redirect to the configured Auth0 issuer. `/api/auth/me` returns `{ user: null }` when unauthenticated and `{ user: {...} }` when an authenticated session cookie is present.
- **Client-side integration:** `useAuth` hook consumes `/api/auth/me`, populates `user` correctly, and `UserMenu` renders the avatar dropdown (not the Sign In button) when authenticated.
- **Sign-out:** clicking the Sign Out item in the dropdown returns the client to anonymous state; the next `/api/auth/me` call returns `{ user: null }`.
- **Mocking the Auth0 round-trip in tests:** mock the express-openid-connect middleware's `req.oidc` (test fixture pattern). Do NOT mock real Auth0 endpoints — use a fixture that simulates a successful callback and resulting `req.oidc.isAuthenticated()/user`.

### Scope of "verify configured path"

- **The user has credentials already; provisioning is OUT OF SCOPE.** Phase 43 ships pure code: graceful unconfig path + tests for the configured path. The user fills `.env` themselves.
- `.env.example` already documents the required vars (verified during scout). No changes to `.env.example` unless a missing var is discovered.

### Account-tied surfaces

- Today only `UserMenu` (avatar + dropdown with displayName/email + stats dialog + sign-out) consumes `user`/`stats`. Verify it renders correctly when authenticated and gracefully when anonymous (renders nothing or the Sign In button per above).
- No new account-tied surfaces are added in this phase. If the configured-path verification reveals a bug in the existing stats dialog, fix it inline; if not, no change.

### Anonymous play preservation

- The Phase 43 work must NOT introduce an authentication requirement anywhere. Anonymous play remains the default. Auth is purely an optional account-binding for stats/identity continuity — verify this invariant holds before AND after the changes.

### Claude's Discretion

- Whether the providers query lives in `useAuth.tsx` itself (extending it with a `providersConfigured` field) or in a tiny new `useAuthProviders` hook — match existing project patterns.
- The exact test framework / mocking approach for the Auth0 middleware (vitest with custom `req.oidc` fixture, or a small test helper) — researcher recommends and planner confirms.
- Whether `useAuth` should expose an explicit `isAuthEnabled` field for any future consumer beyond `UserMenu`, or just gate `UserMenu` internally — minimum-churn choice; lean toward the latter unless researcher finds other consumers.
- Test placement: server integration test (`server/auth/routes.test.ts`?) and client component test (`UserMenu.test.tsx`?) — match existing test patterns in the repo.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth implementation surfaces
- `server/index.ts:85-91` — Auth0 conditional initialization gate
- `server/auth/auth0.ts` — `configureAuth0()` middleware factory + `afterCallback` user provisioning
- `server/auth/routes.ts:1-34` — `/api/auth/me` and `/api/auth/providers` route handlers (the providers route is the key existing API for the unconfigured-graceful path)
- `server/config/env.ts:14-20` — Auth0 env var validation (all marked `.optional()`)
- `client/src/lib/stores/useAuth.tsx` — `useAuth` hook (login/logout helpers + `/api/auth/me` consumer)
- `client/src/components/auth/UserMenu.tsx` — only consumer of `useAuth` today (avatar dropdown + Sign In button)
- `.env.example` — Auth0 var documentation for self-hosters
- `client/src/App.tsx:6` — `UserMenu` import / mount point

### Project context
- `.planning/REQUIREMENTS.md` — AUTH-01 definition
- `.planning/ROADMAP.md` (Phase 43 entry) — success criteria
- `.planning/phases/41-reconnection-state-bugfix/` — Phase 41 reconnection work; verify auth changes don't interact with the reconnect token / lobby snapshot machinery (auth state is independent of lobby state)

### Adjacent invariants (do not break)
- Anonymous play (no `authRequired: true` anywhere)
- Phase 39/40/41/42 tests must continue to pass
- Existing `/api/auth/me` and `/api/auth/providers` contracts (UserMenu consumes them; don't change response shape without updating the consumer)

</canonical_refs>

<specifics>
## Specific Ideas

- The `GET /api/auth/providers` endpoint already exists and returns `{auth0: boolean}` — the unconfigured-graceful work is largely a client-side UX wiring task, not a backend change.
- `express-openid-connect` (the lib in use) provides `req.oidc.isAuthenticated()` and `req.oidc.user`. Tests for the configured path should mock these on the request object rather than spinning up a real OIDC server.
- User reported the issue as a "loop" — confirmed the cause is most likely missing env vars in their local `.env`. Researcher should still verify by reproducing in a controlled local instance before committing to the diagnosis.
- `useAuth` already gracefully returns `user: null` when `/api/auth/me` returns null — so authenticated/anonymous rendering is already correct. The bug is solely on the Sign In button being shown when login is impossible.

</specifics>

<deferred>
## Deferred Ideas

- Multi-provider support (Google, GitHub, etc.) — Auth0 is the single provider for now
- Account-linking flows (link an anonymous play session to a fresh account on first sign-in) — not needed today; users sign in then play
- Auth-required mode (some deployments may want to require sign-in) — explicit non-goal; anonymous play is the locked default
- Profile editing UI (change displayName, avatar) — Auth0-managed today via the issuer's hosted profile page; not needed in-app
- Per-user XP / stats persistence beyond the current stats dialog — separate scope
- Auto-provisioning the Auth0 tenant from a setup script — out of scope; user manages tenant themselves
- Showing a configurator UI for self-hosters to fill Auth0 vars at runtime — anti-pattern (secrets in env, not in DB)

</deferred>

---

*Phase: 43-auth-user-account-validation*
*Context gathered: 2026-05-07 via /gsd-discuss-phase*
