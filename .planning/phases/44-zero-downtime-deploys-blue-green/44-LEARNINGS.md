---
phase: 44
phase_name: "zero-downtime-deploys-blue-green"
project: "ScrumQuest"
generated: "2026-05-09"
counts:
  decisions: 7
  lessons: 5
  patterns: 7
  surprises: 4
missing_artifacts: []
---

# Phase 44 Learnings: zero-downtime-deploys-blue-green

## Decisions

### Accept active-game interruption rather than externalize lobby state
HTTP gets zero-downtime via NPM upstream swap; in-flight WS connections see "lobby evaporated" (because both colors keep `SessionManager.lobbies` as in-process Maps), bounce to `/play` with a stale-snapshot toast. Externalizing state to Redis/Postgres stays Deferred.

**Rationale:** Researcher confirmed via direct file:line read of `server/domains/SessionManager.ts:71-74,652-655,766` that Phase 41 reconnect cannot reconstruct lobby state across colors. Externalization is a multi-phase lift; the toast UX is acceptable for current scale.
**Source:** 44-CONTEXT.md, 44-RESEARCH.md

### Dedicated NPM service account for deploy automation
Created `deploy-bot@scrummonsters.com` (admin role, no 2FA) as the only account used by the deploy script. Human admin `preston@prestonfarr.com` retains 2FA.

**Rationale:** NPM 2.14 added TOTP-based 2FA. The human admin had it enabled, which made `/api/tokens` return `{requires_2fa, challenge_token}` instead of a JWT — incompatible with non-interactive CI. Disabling 2FA on the human admin would weaken their interactive security; a dedicated bot account preserves both.
**Source:** 44-01-SUMMARY.md, 44-CONTEXT.md "NPM service account for deploy automation (resolved 2026-05-09)"

### Pin NPM image to specific tag (not `:latest`)
`docker-compose.prod.yml` pins `jc21/nginx-proxy-manager:2.14.0`.

**Rationale:** Once the deploy script depends on the NPM REST API contract, an upstream NPM update could silently change field shapes or auth flow and break deploys. Pin captured against the live VPS via Wave 0 operator discovery.
**Source:** 44-CONTEXT.md, 44-01-SUMMARY.md

### Use `docker compose stop <service-name>`, never `--profile X stop`
The deploy script uses service-name argument to stop a single color.

**Rationale:** Compose v2 footgun — `docker compose --profile X stop` ALSO stops services with no profile (postgres, NPM, prometheus...), taking the whole stack down. Verified during research.
**Source:** 44-RESEARCH.md (Pitfall 3)

### NPM API mutation requires GET-modify-PUT, not partial PATCH
`npm-api.sh` reads the full proxy-host record, strips read-only fields via jq, sends the modified full body as PUT.

**Rationale:** Sending a partial body has been observed to erase `custom_locations` / SSL config (NPM community discussion #3265). The conservative strip list `del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err)` was confirmed sufficient against NPM 2.14.0 via Wave 0 no-op PUT round-trip.
**Source:** 44-RESEARCH.md (Pattern 1), 44-01-SUMMARY.md

### Run drizzle migration BEFORE NPM swap, not after
Sequence: pull → start inactive → healthcheck → migrate → swap NPM → stop old.

**Rationale:** Failed migration aborts deploy before any user-visible state change. Old color continues serving with no interruption. Avoids the worst case of a successful swap to a container that then crashes on startup migration.
**Source:** 44-CONTEXT.md (Claude's Discretion section), 44-03-SUMMARY.md

### Health and version endpoints exempt from `apiLimiter`
`server/middleware/rateLimiter.ts` skips `/health`, `/health/livez`, `/health/readyz`, `/ws-health`, `/version`. Mutating endpoints keep the 200/15min protection.

**Rationale:** Discovered during UAT that the deploy smoke methodology was unusable — sustained 1 req/s would exceed the 200/15min bucket shared with mutating endpoints. blackbox-exporter, Route 53 health checks, and the deploy workflow's own smoke job all need to hit `/api/health` constantly.
**Source:** 44-UAT.md Issue #1, commit `e660885`

---

## Lessons

### Community-sourced API contracts can lag behind major-version changes
The NPM REST API research drew from community discussion #3265 (NPM ≤ 2.11). NPM 2.14 silently added TOTP-based 2FA, which changes the `/api/tokens` response shape. The bug only surfaced during Wave 0 discovery against the live instance.

**Context:** `RESEARCH.md` confidence on NPM mechanics was rated MEDIUM with an explicit note that the strip list was empirical. The 2FA issue was not anticipated at all. For phases that integrate with third-party services, **always run an empirical probe against the live target before locking in plan details**, and downgrade confidence on any API contract not officially documented.
**Source:** 44-RESEARCH.md (Confidence Assessment), 44-CONTEXT.md "NPM service account for deploy automation (resolved 2026-05-09)"

### Default-version guesses are usually wrong; capture against the running instance
Plan 44-01 initially pinned `jc21/nginx-proxy-manager:2.11.3` based on a reasonable-looking default. Live VPS was actually running `2.14.0`. The pin would have silently downgraded NPM on the next compose rebuild.

**Context:** Always verify version pins against the runtime via `docker inspect` / API version probe, not against external docs or guesses. Wave 0 caught this; without it the regression would have shipped.
**Source:** 44-01-SUMMARY.md "Scope expansion absorbed"

### In-process Maps are a hard ceiling on horizontal deployment topology
`SessionManager` keeps `lobbies` / `disconnectedPlayers` / `reconnectTokens` as in-process `Map`s. Any topology that runs >1 process simultaneously (blue+green, replicas, multi-region) will produce "lobby_not_found" on cross-process reconnect. This is a structural property, not a bug.

**Context:** Future phases that scale to multi-process (Redis-backed sessions, multi-replica per color, multi-region) must externalize this state first. The `accept-interruption` decision in this phase is a tactical choice; the strategic move is state externalization.
**Source:** 44-RESEARCH.md (Reconnection failure mode), 44-CONTEXT.md

### Test methodology can produce false-positive failures
The Procedure A smoke loop ran 4 req/s × 7 minutes against `/api/health`, blew through the apiLimiter, returned 528 × 429s, and looked like a deploy failure. The real signal (zero 502s during NPM swap) was buried under rate-limit noise.

**Context:** When designing verification methodology, audit the methodology against existing rate limits / quotas / circuit breakers. If the test load can trip a defensive mechanism, the test reveals nothing about the system under test.
**Source:** 44-03-SUMMARY.md, 44-UAT.md Issue #1

### Cherry-pick + isolated branches are required when local main has unpushed commits that would break CI
Local main carried Phase 44 implementation commits (compose changes that removed the `app` service) that would have broken `deploy-lightsail.yml`'s `up -d --no-deps app` if pushed standalone. Solution: stash Phase 44 commits on a `phase-44-wip` branch, reset main to `origin/main`, cherry-pick only docs + workflow commit, push, then cherry-pick the implementation commits back.

**Context:** Any time a workflow-on-default-branch trigger needs to run a workflow file before the rest of the work is mergeable, isolate via cherry-pick. Don't be tempted to push everything.
**Source:** Phase 44 execution session (uncaptured in plan artifacts; preserved here)

---

## Patterns

### Wave 0: operator-driven discovery for opaque external services
Before plans that depend on external API behavior can ship safely, the orchestrator runs a one-shot discovery script (`wave0-npm-discovery.sh`) against the live target to capture: stable IDs, empirical field-strip lists, and version digests. The plans use these values as hardcoded constants.

**When to use:** Any phase that integrates with a third-party service whose API contract isn't officially documented or whose version may differ from research assumptions. Especially valuable when the service has a SQLite/file-based admin DB (NPM, Authelia, Caddy admin API) that lets you sanity-check assumptions cheaply.
**Source:** 44-RESEARCH.md (Validation Architecture), `scripts/deploy/wave0-npm-discovery.sh`

### Provision-via-workflow for VPS secret rotation
`provision-vps-secrets.yml` (workflow_dispatch trigger) reads selected GH repo secrets and idempotently upserts them into `/opt/scrummonsters/.env` over SSH. Re-runnable; no SSH or paste-into-chat needed for rotations.

**When to use:** Whenever a secret must reach both GitHub Actions (for CI) and the runtime VPS (.env), and the runtime path is via SSH. Saves a round-trip per rotation and avoids exposing values in terminal history or chat.
**Source:** `.github/workflows/provision-vps-secrets.yml`

### Bcrypt-via-bundled-container for password reset on services without a CLI
NPM doesn't ship a password-reset CLI. Pattern: generate password locally, copy into the service's bind-mounted volume, run a `node -e` one-liner inside the container that imports the service's bundled `bcrypt`, write hash back, UPDATE the SQLite db, restart container, verify via API auth.

**When to use:** Any service with bcrypt-based auth, a SQLite/file admin DB, no documented CLI for password reset, and a container that bundles bcrypt anyway. Avoids reinventing the cost factor or hash format.
**Source:** Phase 44 execution (NPM admin password reset + service account creation)

### Stdin-pipe to `gh secret set` for chat-safe credential transfer
`ssh ... 'cat /tmp/p' | gh secret set NAME --repo OWNER/REPO`. The credential value flows through a process pipe between SSH and gh; the orchestrator never observes it via captured stdout.

**When to use:** Transferring credentials between systems when an LLM agent is in the loop. Cleaner than paste-into-chat, doesn't require gh installed on both ends.
**Source:** Phase 44 execution session

### Service-account-with-no-2FA for deploy automation; human admin keeps 2FA
Don't disable 2FA on a privileged human account to satisfy CI. Create a separate service account, scope it to what automation needs, no 2FA on that account specifically. Trust boundary stays at the network layer (admin port localhost-only, .env chmod 600).

**When to use:** Any service whose admin auth gained 2FA after deploy automation was designed against it. Also a generally cleaner long-term pattern than sharing creds.
**Source:** 44-CONTEXT.md "NPM service account for deploy automation (resolved 2026-05-09)"

### Bats + shellcheck CI gate for bash deploy scripts
`.github/workflows/ci.yml` `deploy-scripts` job runs `shellcheck -x` + `bats` on every PR. Tests use PATH-shimmed `docker`/`curl` and function-overridden lib helpers for hermetic isolation.

**When to use:** Any non-trivial bash that ships to production. The cost of CI gating is ~5 seconds; the cost of a bash regression discovered in prod is much higher (this is essentially the same lesson the deploy-lightsail flow taught us in Phase 36 disaster recovery).
**Source:** 44-02-SUMMARY.md, `scripts/deploy/test/test-*.bats`

### Conservative-default-then-verify for unknown API field strip lists
Start with the most-cited published strip list (`del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err)`). Wave 0 sends a no-op PUT round-trip with that strip; if it returns 200, lock it in; if it returns a 4xx, the script prints common additional fields to try (`.enabled`, `.access_list`, `.certificate`, etc.) until 200.

**When to use:** Any GET-modify-PUT integration where the read-only field list isn't documented. Cheaper than reading source code; precise to the running version.
**Source:** `scripts/deploy/wave0-npm-discovery.sh`, 44-RESEARCH.md (Pattern 1)

---

## Surprises

### NPM 2.14 silently added TOTP-based 2FA without breaking the auth response shape
The endpoint still returns HTTP 200 — but the body shape is `{requires_2fa: true, challenge_token: "..."}` instead of `{token, expires}`. Naive code that reads `.token` gets `null` and reports a length-4 string ("null"). Downstream code fails opaquely.

**Impact:** Cost ~30 minutes of debugging during execution. Resolved by creating a dedicated service account. Permanently changed how the phase authenticates.
**Source:** 44-01-SUMMARY.md "Scope expansion absorbed"

### Compose v2 rejects `depends_on` against profile-gated services not in the active profile
Plan 44-01 originally proposed `prometheus.depends_on: [app-blue, app-green]`. Compose validation: `service "prometheus" depends on undefined service "app-green": invalid compose project`.

**Impact:** Forced a small plan deviation (drop the dep, add a comment). Worth knowing for future profile-gated topologies — `depends_on` and `profiles` interact in non-obvious ways.
**Source:** 44-01-SUMMARY.md "Deviations" section, commit `4a161fc`

### `apiLimiter` at 200/15min was unexpectedly tight for `/api/health`
Even moderate sustained polling (1 req/s × 4 min) trips it. Combined with blackbox-exporter + Route 53 + browser checks all sharing the same IP-based bucket, real users from a NAT pool could plausibly hit 429s during normal operation — not just during deploy verification.

**Impact:** Surfaced as UAT Issue #1, fixed inline. Likely a latent issue that was never noticed because nobody had reason to poll `/api/health` from a single IP at sustained rate before this phase.
**Source:** 44-UAT.md Issue #1

### Bootstrap-from-legacy succeeded on first try with no operator pre-cutover
The deploy script auto-detected missing `.active-color`, defaulted INACTIVE=green, started `app-green`, swapped NPM from `scrummonsters-app-1` (legacy) to `app-green`, and removed the legacy container. Total elapsed: 1m58s. Zero 502s observed.

**Impact:** Saved a manual cutover step that would have required SSH coordination + a fragile NPM admin UI click. The "Approach A" decision in the executor brief turned out to be exactly right; smoothness is hard to predict in advance.
**Source:** 44-03-SUMMARY.md, 44-VERIFICATION.md
