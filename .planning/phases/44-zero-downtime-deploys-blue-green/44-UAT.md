---
status: testing
phase: 44-zero-downtime-deploys-blue-green
source: [44-01-SUMMARY.md, 44-02-SUMMARY.md, 44-03-SUMMARY.md]
started: 2026-05-09T04:00:00Z
updated: 2026-05-09T04:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test (live bootstrap deploy)
expected: |
  After pushing the Phase 44 commits to main, the new blue-green deploy
  workflow runs end-to-end. Server boots without errors, drizzle migrations
  complete, and https://scrummonsters.com/api/health returns 200 with
  database healthy. The .active-color file is created (defaulting to "green"
  on first run since legacy single-color was active before).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test (live bootstrap deploy)

Expected: New deploy workflow runs end-to-end. App boots, migrations run, /api/health returns 200, .active-color created.

Status: pending — already exercised by 2026-05-09 03:51 deploy; awaiting operator confirmation that the result matches.

Evidence captured automatically (via SSH spot-check at 03:55:45Z):
- `.active-color = green` (file created, perms ok)
- `app-green` container Up 2m, healthy
- NPM `forward_host: app-green:5000`, enabled
- `https://scrummonsters.com/api/health → 200` with database healthy, 93ms
- Legacy `scrummonsters-app-1` cleanly stopped + removed

### 2. Zero 502 During Deploy

Expected: When you trigger a deploy (push to main → docker.yml → deploy-lightsail.yml), users hitting https://scrummonsters.com/api/health continuously get only 2xx responses — never a 502 Bad Gateway. Previously, every deploy produced a ~15-30s window of 502s.

Status: pending — bootstrap deploy showed 0/809 502 responses (528 were rate-limited 429s — methodology artifact). Looking for operator confirmation that the no-502 result is acceptable evidence, or whether you want a clean Procedure A re-run with `sleep 1` instead of `sleep 0.2`.

### 3. Stale Lobby Bounce-to-/play UX (live cross-color reconnect)

Expected: With an active lobby open in your browser, when a deploy happens and NPM swaps to a fresh-color container with empty in-memory state, the WS reconnect handler receives `lobby_not_found` and:
- Shows the sonner toast "Lobby session ended" (id `reconnect-stale`)
- Routes to `/play`
- No duplicate self / no white screen / no infinite spinner

Status: pending — covered by 6 vitest unit specs (`useWebSocket.test.tsx`); live in-browser observation deferred to next deploy with an active session.

### 4. Color Alternation Across Deploys

Expected: Each deploy alternates `.active-color` between blue and green. After a successful deploy ending in `green`, the next deploy targets `blue` (and vice versa). NPM upstream tracks each flip.

Status: partial — bootstrap deploy ended on `green`. Need a second deploy to verify the green → blue flip.

### 5. Auto-Rollback on Healthcheck Failure

Expected: If a deploy starts a new color that never becomes healthy within 60s, the deploy script:
- Does NOT swap NPM
- Stops the failed new color
- Exits non-zero
- Old color continues serving traffic with no interruption

Status: pending — covered by Bats `test-deploy-bluegreen.bats` (6/6); live destructive test deferred to a separate session (requires a deliberately broken image push).

### 6. Manual Rollback Path Works

Expected: If a deploy succeeds but the new color shows post-swap regressions, an operator can run `scripts/deploy/rollback-bluegreen.sh` over SSH to swap NPM back and restore the previous color. `docs/runbooks/deploy-rollback.md` documents the steps.

Status: pending — covered by Bats; live exercise deferred.

### 7. NPM Service Account Provisioning

Expected: The dedicated NPM service account `deploy-bot@scrummonsters.com` (admin role, no 2FA) is the only account used by the deploy script. The human admin `preston@prestonfarr.com` retains 2FA and is unaffected. Rotating either password requires re-running `provision-vps-secrets.yml` from the Actions tab.

Status: live — service account provisioned 2026-05-09 03:04Z; deploy authenticated successfully against it; .env upserted by provision workflow.

## Issues Found

### Issue #1 — `/api/health` rate-limited at 200 req/15min/IP, breaks deploy smoke + external monitoring

**Severity:** medium (does not break deploys, but breaks the verification methodology and ongoing health monitoring)

**Symptom:** User hits `https://scrummonsters.com/api/health` in browser during/after deploy, sees `Too many requests, please try again later.` (429). Smoke-test methodology in `docs/runbooks/deploy-rollback.md` is unusable — sustained 1 req/s would exceed the 200/15min bucket.

**Root cause:** `server/routes.ts:39` mounts `apiLimiter` (200 req per 15 min per IP, defined in `server/middleware/rateLimiter.ts`) on all `/api/*` paths. Health routes (`/api/health`, `/api/health/livez`, `/api/health/readyz`, `/api/ws-health`) are registered AFTER the limiter mount and therefore go through it. External services (blackbox-exporter on the same VPS, Route 53 health checks, the deploy workflow's own smoke job, operator browser checks) all share the same IP-based bucket.

**Discovered:** 2026-05-09 during Phase 44 UAT (bootstrap deploy + Procedure A re-run conversation).

**Suggested fix:** Add a `skip` predicate to `apiLimiter` that exempts health and version paths:
```ts
skip: (req: Request) => process.env.NODE_ENV === 'test'
  || req.path === '/health'
  || req.path === '/health/livez'
  || req.path === '/health/readyz'
  || req.path === '/ws-health'
  || req.path === '/version',
```
(`req.path` inside the `/api`-mounted middleware is relative — i.e., `/health`, not `/api/health`.)

Alternative: register health routes BEFORE `app.use('/api', apiLimiter)` in `server/routes.ts`. Equivalent effect; slightly more invasive.

**Status:** **fixed in Phase 44.** Operator chose inline fix during UAT. Implementation: `server/middleware/rateLimiter.ts` adds `RATE_LIMIT_EXEMPT_PATHS` set + `shouldSkipApiRateLimit` helper; apiLimiter's `skip` predicate now exempts `/health`, `/health/livez`, `/health/readyz`, `/ws-health`, `/version`. Test coverage: `server/middleware/rateLimiter.test.ts` (7 specs, all green). Full suite: 718/718. Awaiting deploy + browser re-verification.

## Test Plan

| # | Name | Status |
|---|------|--------|
| 1 | Cold Start Smoke Test | pending op-confirm |
| 2 | Zero 502 During Deploy | pending op-confirm |
| 3 | Stale Lobby Bounce-to-/play UX | pending live |
| 4 | Color Alternation | pending second deploy |
| 5 | Auto-Rollback on Healthcheck Fail | pending destructive test |
| 6 | Manual Rollback Path | pending live |
| 7 | NPM Service Account Provisioning | live ✅ |
