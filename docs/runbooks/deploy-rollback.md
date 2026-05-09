# Deploy & Rollback Runbook

This runbook covers the blue-green deploy flow shipped in Phase 44 (INFRA-01). For platform-level Lightsail / DNS / TLS context see `docs/deployment/`.

## Architecture summary

The production VPS runs two app containers gated by Compose profiles:

- `app-blue` (profile `blue`)
- `app-green` (profile `green`)

A state file at `/opt/scrummonsters/.active-color` records which color is currently serving traffic. Nginx Proxy Manager (NPM, on `localhost:81`) routes `https://scrummonsters.com` to that color via `forward_host`. Each deploy starts the inactive color, healthchecks it, runs DB migrations, then atomically swaps NPM's `forward_host` to the new color.

## Active-game interruption (expected behavior)

Blue-green deploys swap the NPM upstream from one app container to another. App-state lobbies live in the active container's memory. When NPM swaps to the new color, the new container's `SessionManager` Maps are empty, so `reconnect_with_token` from in-flight clients returns `invalid_token` / `lobby_not_found` / `lobby_closed`. The client surfaces a `Lobby session ended` toast (Plan 44-01, sonner toast id `reconnect-stale`) and routes the user to `/play`. **This is expected.** Deploy during low-traffic windows.

A future plan can move SessionManager state to Redis (`UPSTASH_REDIS_REST_URL` placeholders are already wired in `docker-compose.prod.yml`) to eliminate this.

## Continuous-curl smoke (verifies INFRA-01 success criterion 1)

Run this in one terminal during a deploy to prove zero non-2xx HTTP responses through the swap:

```
while true; do curl -sS -o /dev/null -w "%{http_code} " https://scrummonsters.com/api/health; sleep 0.2; done
```

In another terminal: trigger a deploy via GitHub Actions or manual SSH. Output must contain only `200`s. Capture the run output in the next phase SUMMARY.

## Manual rollback (post-swap regression)

The deploy script has automatic **pre-swap** rollback — if the new color never becomes healthy, the deploy aborts before NPM is touched. After the swap completes, regressions are operator-driven:

1. SSH to VPS: `ssh ubuntu@34.199.135.244`
2. Read current state: `cat /opt/scrummonsters/.active-color`
3. Determine the rollback target (the OTHER color)
4. Export NPM creds from `.env`:
   ```
   set -a; . /opt/scrummonsters/.env; set +a
   ```
5. Run: `cd /opt/scrummonsters && bash scripts/deploy/rollback-bluegreen.sh <target-color>`
6. Verify external smoke: `curl https://scrummonsters.com/api/health`
7. Verify state file: `cat /opt/scrummonsters/.active-color` shows the rolled-back color
8. (Defense in depth) Clear shell history of any export lines that surfaced the password: `history -d <line>`

## Additive-migrations-only invariant

`drizzle-kit push --force` runs BEFORE the NPM swap — that is, the new schema is applied to the shared Postgres while the OLD container is still serving traffic on the old schema. **Migrations must be additive** (add columns/tables, never drop, rename, or change types in incompatible ways). If a non-additive migration is required:

1. Plan a maintenance-window deploy and announce downtime.
2. Disable the deploy workflow temporarily, OR add a feature-flag-based two-phase migration (deploy add-column first, then deploy code that uses it, then a third deploy that drops the old column).
3. Blue-green does NOT protect against schema-incompatible changes — see Phase 44 RESEARCH.md Pitfall 5.

## NPM image upgrade

The `nginx-proxy-manager` image is pinned in `docker-compose.prod.yml` to `2.14.0` (captured during Plan 44-01 Wave 0). When upgrading NPM:

1. Test the new version's REST API surface against `scripts/deploy/wave0-npm-discovery.sh` — confirm the strip list (`del(.id, .created_on, ...)`) still works.
2. Update the version in `docker-compose.prod.yml`.
3. Deploy in a low-traffic window with the continuous-curl smoke running.
4. If 2FA support changes (current pin disables 2FA on `deploy-bot@scrummonsters.com`), update CONTEXT.md and the npm_login helper.

## GitHub Actions secrets

- `NPM_ADMIN_EMAIL` — NPM admin email (`deploy-bot@scrummonsters.com` per Plan 44-01)
- `NPM_ADMIN_PASSWORD` — NPM admin password (rotated only via `provision-vps-secrets.yml`)
- `SSH_PRIVATE_KEY` — Lightsail SSH key (existing)
- `AWS_OIDC_ROLE_ARN` — for OIDC (existing)

Both NPM secrets are forwarded to the SSH session via `envs:` (appleboy/ssh-action@v1 idiom) and are never echoed. `set -e` (NOT `set -ex`) is used in the SSH script body. The orchestrator runs `set +x` immediately before any block that handles the password.

## First-deploy bootstrap (one-time, automated)

The first time `deploy-bluegreen.sh` runs on a VPS with the legacy single-color `app` topology:

- `.active-color` is missing → defaults to `blue`, INACTIVE = `green`
- The script starts `app-green`, healthchecks, migrates, swaps NPM from `scrummonsters-app-1` → `app-green`
- Persists `.active-color=green`, then stops/removes the legacy `scrummonsters-app-1` container if present (idempotent — no-op once retired)

Subsequent deploys alternate `green → blue → green` cleanly.

## Auto-rollback (pre-swap, automated)

If `wait_for_healthy` for the inactive color returns non-zero (timeout or `unhealthy` status):

- The script logs `ERROR: app-<color> did not become healthy. Aborting WITHOUT NPM swap.`
- Stops the failed inactive color (`docker compose stop app-<color>`)
- Exits non-zero — NPM `forward_host` is NEVER touched, so external traffic continues hitting the old color
- The deploy workflow run is marked failed; investigate via `docker logs app-<color>` on the VPS

This is the **automated** rollback — operator only needs to run `rollback-bluegreen.sh` for the post-swap regression case described above.
