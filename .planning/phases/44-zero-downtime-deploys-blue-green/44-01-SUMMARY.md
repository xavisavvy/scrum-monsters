---
plan: 44-01
phase: 44
slug: zero-downtime-deploys-blue-green
status: complete
completed: 2026-05-09
requirements: [INFRA-01]
---

# Plan 44-01 Summary — Compose blue-green topology + Wave 0 discovery

## What shipped

| Commit  | Subject |
|---------|---------|
| `4a161fc` | feat(44-01): split app into blue-green profile-gated services + pin NPM |
| `669b952` | feat(44-01): add Wave 0 NPM discovery script for proxy host ID + strip list |
| `ea8caca` | feat(44-01): surface stale-session toast on reconnect_response failure |
| `6e23083` | ci(44): one-shot workflow to provision NPM admin creds to VPS .env |
| _(post-discovery)_ | feat(44-01): correct NPM pin to 2.14.0 (was 2.11.3) per Wave 0 capture |
| _(post-discovery)_ | docs(44): record service-account decision + discovery values in CONTEXT.md |
| _(post-discovery)_ | ci(44): rename provision workflow to provision-vps-secrets.yml (long-term name) |

## Wave 0 discovery — captured values

Run against live VPS NPM (`localhost:81`, version 2.14.0) using the dedicated `deploy-bot@scrummonsters.com` service account:

| Constant | Value | Use |
|----------|-------|-----|
| `NPM_PROXY_HOST_ID` | `1` | Hardcoded in Plan 44-03 deploy script |
| `NPM_PUT_STRIP_LIST` | `del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err)` | Default for `scripts/deploy/lib/npm-api.sh` (Plan 44-02) — confirmed sufficient against NPM 2.14.0 |
| `NPM_PINNED_VERSION` | `2.14.0` | `image:` tag in `docker-compose.prod.yml` |
| Current upstream | `scrummonsters-app-1:5000` (legacy single-color) | Becomes `app-blue:5000` / `app-green:5000` after Plan 44-03 swap logic ships |

Other proxy host on the box (`id=2 staging.prestonfarr.com → prestonfarr:3000`) is unrelated and not touched by this phase.

## Scope expansion absorbed

Two issues surfaced during Wave 0 that the original RESEARCH.md (community sources predating NPM 2FA support) didn't anticipate:

1. **NPM 2.14 added TOTP-based 2FA**, and the human admin had it enabled. `/api/tokens` returned `{requires_2fa: true, challenge_token: ...}` instead of an access token — incompatible with non-interactive CI. **Resolution:** created a dedicated NPM service account `deploy-bot@scrummonsters.com` (admin role, no 2FA). Human admin retains 2FA. See CONTEXT.md "NPM service account for deploy automation (resolved 2026-05-09)" for the full decision.
2. **The initial NPM image pin guess (`2.11.3`) was wrong** — the live instance was running `2.14.0`. The pin would have silently downgraded NPM on the next compose rebuild, breaking 2FA storage and re-triggering issue (1). Corrected to `2.14.0` post-discovery.

## Tests + checks

- `docker compose -f docker-compose.prod.yml config -q` → exit 0 (after pin correction)
- `shellcheck scripts/deploy/wave0-npm-discovery.sh` → exit 0 (run via `koalaman/shellcheck:stable` Docker image; shellcheck not installed locally on Windows host — Plan 44-02 adds it to CI)
- `npx vitest run client/src/lib/stores/useWebSocket.test.tsx` → 6/6 pass
- `npm test` → 711/711 pass (was 705 baseline, +6 from Task 3 toast tests)
- `npm run check` → exit 0
- Live discovery against NPM REST API (`/api/tokens`, `/api/nginx/proxy-hosts`, no-op PUT round-trip) → all 200, strip list confirmed sufficient

## Operator security log

- New NPM admin account `preston@prestonfarr.com` password was reset via direct bcrypt UPDATE in NPM's SQLite db (the previous value was inadvertently exposed to chat transcript via `od -c` on a `.env` tail dump — flagged immediately, rotated).
- New service account `deploy-bot@scrummonsters.com` provisioned with bcrypt-cost-13 hash, admin role, full `user_permission` row.
- Bot password generated on the VPS via `openssl rand`, transferred to GitHub Actions secret via `ssh ... cat /tmp/p | gh secret set ...` (stdin pipe — never echoed). Local `.env` and VPS `/tmp/bot-pwd` shredded after transfer.
- VPS `/opt/scrummonsters/.env` upserted by the (renamed) `provision-vps-secrets.yml` workflow; perms `chmod 600` enforced.

## Manual verification checkpoints owed

- **Live deploy smoke test** — runs in Plan 44-03 (no compose change in 44-01 alters the running deploy path; current `app` service still exists in the on-VPS branch state until 44-03 ships).
- **Stale-snapshot toast browser test** — runs in Plan 44-03 Checkpoint B (requires real browser + active lobby + cross-color reconnect; only meaningful once blue-green is actually wired).

## Next

Plan 44-02 (Wave 2, autonomous): build `scripts/deploy/lib/npm-api.sh` and `health-poll.sh`, with Bats coverage and CI shellcheck. The strip list and proxy host ID captured here are the inputs.
