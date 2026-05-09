# Phase 44: Zero-Downtime Blue-Green Deploys - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Source:** /gsd-discuss-phase

<domain>
## Phase Boundary

Eliminate the ~15-30 second 502 Bad Gateway window users currently see during every deploy. The single-replica `app` container in `docker-compose.prod.yml` is stopped and replaced by `docker compose up -d --no-deps app`, leaving nginx-proxy-manager (NPM) with no upstream while the new container starts and passes its 30s `start_period` healthcheck.

This phase introduces blue-green topology: two named app services (`app-blue` and `app-green`) defined in compose. The deploy script identifies the inactive color, pulls the new image, starts that color, waits for its healthcheck, swaps NPM's upstream from old to new via the NPM REST API, then stops the old color. Auto-rollback if the new color fails healthcheck — old color never loses traffic.

Out of scope: replacing NPM with another reverse proxy; multi-region deploys; running multiple replicas of the same color; database migration coordination beyond the existing single-`drizzle-kit push` step.

</domain>

<decisions>
## Implementation Decisions

### Blue-green topology

- **Two named services in `docker-compose.prod.yml`: `app-blue` and `app-green`.** Both pull the same image (`ghcr.io/xavisavvy/scrum-monsters:latest`). Both share env, postgres dependency, healthcheck definition.
- **Drop the host port binding** (`5000:5000`). Both colors are reached only via Docker network on port 5000. NPM connects via Docker network (it already does via `app:5000`; we'll have it target `app-blue:5000` or `app-green:5000` by container name).
- Each color uses Compose `profiles` so they're not started by accident — only the deploy script starts the inactive color.
- The `app` service name is REMOVED. Anything that referenced `app` (NPM upstream, scripts, smoke tests) needs to know about the active color.

### NPM upstream swap mechanism

- **Use NPM REST API.** Authenticate via `POST http://localhost:81/api/tokens` with `{identity, secret}` to get a Bearer token, then `PUT /api/nginx/proxy-hosts/{id}` to update `forward_host` from `app-blue` to `app-green` (or vice versa).
- **Provision admin credentials as GitHub Actions secrets**: `NPM_ADMIN_EMAIL`, `NPM_ADMIN_PASSWORD`. The deploy script reads them, calls the API, never logs them.
- The proxy host ID is stable; capture it once during phase setup and either hardcode it in the deploy script or store it as an additional secret (`NPM_PROXY_HOST_ID`).
- DO NOT edit NPM's nginx config file directly — couples to NPM internals, breaks on upgrades.

### WebSocket session handling during swap

- **Trust Phase 41 reconnection machinery.** When the old color stops, in-flight WS connections drop. Clients see `connection_lost`, auto-reconnect via the existing `reconnect_with_token` flow. Lobby state is server-authoritative; reconnect tokens preserve identity; Phase 41-02 fixed the duplicate-self / lost-host symptoms.
- This is "almost zero-downtime": HTTP requests see no 502 (the goal), but live socket connections see a brief disconnect-and-reconnect (~3-5 seconds typical).
- **Do not** attempt sticky-session-during-overlap or multi-color drain. Both add NPM config complexity that isn't justified at current scale.
- **Caveat that must be verified during planning**: in-memory lobby state lives on whichever container is currently active. Before swapping NPM, the new color has NO lobbies. After swap, reconnecting clients hit the new color, find their lobby gone, and end up on `/play`. This is the same failure mode Phase 41 is designed to handle, BUT requires that lobby state be reconstructed from the reconnect token. Researcher must confirm the reconnect-token flow can re-create a lobby (or at least restore the reconnecting player into the existing lobby) when the new color has empty in-memory state.
  - If reconnection cannot reconstruct: this phase needs a deferred sub-decision: either (a) accept that deploys interrupt active games (post a "we deployed, please re-create your lobby" UX), or (b) escalate scope to externalize lobby state to Redis/Postgres so both colors share state.
  - This is the single highest-risk open question in this phase.
  - **RESOLVED 2026-05-08 after research:** Researcher confirmed Phase 41 reconnect CANNOT reconstruct lobby state across colors (`SessionManager` keeps `lobbies` / `disconnectedPlayers` / `reconnectTokens` as in-process Maps; `validateReconnectToken` returns null when the new color's Map is empty; `attemptPlayerReconnect` short-circuits at `lobby_closed`). User decision: **accept active-game interruption** (option a). HTTP gets zero-downtime; in-flight WS connections see "lobby evaporated", bounce to `/play` with a stale-snapshot toast, and operator runbook documents this as expected behavior. Externalizing state stays Deferred. Plans must include: (1) operator runbook note, (2) toast/UX copy verification when reconnect lands on a new color with no matching lobby.

### NPM image pin (resolved 2026-05-08)

- **Pin nginx-proxy-manager to a specific image tag in Plan 44-01.** Researcher flagged that `latest` is unpinned; once the deploy script depends on the NPM REST API contract, an upstream NPM update could silently break deploys. Pin to the version currently running on the VPS (capture during Plan 44-01 setup).

### Auto-rollback on healthcheck failure

- **If the new color's healthcheck fails within a configurable timeout (e.g., 60s):**
  - Do NOT swap NPM
  - Stop the failed new color
  - Deploy script exits non-zero
  - Old color continues serving with no interruption
- Failure conditions worth distinguishing in logs: container exited, healthcheck never went healthy, healthcheck went healthy then failed during the wait window.
- **No automatic re-swap after a successful swap fails later.** If the new color goes unhealthy AFTER swap (rare but possible), surface the alert and let an operator decide. The deploy script's responsibility ends at the swap-and-confirm.

### Active-color tracking

- **State file at `/opt/scrummonsters/.active-color`** containing literally `blue` or `green`.
- Deploy script reads this on start to determine which color is currently live, deploys to the OTHER, swaps NPM, writes the new value, then stops the old color.
- NPM's actual proxy-host record is the source of truth, but the file is a fast local cache that doesn't need an API call to read.
- If the file is missing (first deploy after this phase ships), the script defaults to `blue` and queries NPM to confirm.
- Rollback path: a `rollback` flag/script that flips the file + re-swaps NPM upstream back to the previously-active color, then stops the failing one.

### docker-compose.prod.yml changes summary

- Replace single `app` service with `app-blue` and `app-green`, both with Compose profile `blue` / `green` respectively.
- Both use the same env, healthcheck, postgres dependency, restart policy.
- Drop `ports: 5000:5000` from both — only Docker-network exposure.
- Existing `stop_grace_period: 45s` stays; gives in-flight HTTP requests time to finish.

### deploy-lightsail.yml script changes summary

The current script:
```
prune images → pull → migrate → up app → sleep 15 → curl health
```

Becomes (~roughly):
```
prune images
read .active-color → INACTIVE = the other one
pull new image
docker compose --profile {INACTIVE} up -d {INACTIVE-service}  # start new color
poll http://{INACTIVE-container}:5000/api/health for up to 60s
if unhealthy: stop {INACTIVE-service}; exit 1  # auto-rollback
docker compose run --rm {INACTIVE-service} npx drizzle-kit push --force  # migrate
NPM API: get token → PUT proxy host forward_host = {INACTIVE-container}
verify external smoke (curl scrummonsters.com/api/health)
write .active-color = INACTIVE
docker compose --profile {old-active-color} stop  # stop old color
prune images again to free space
```

### Claude's Discretion

- Exact container_name format (e.g. `app-blue` vs `scrummonsters-app-blue`) — match Compose's default naming.
- Whether to do the database migration BEFORE or AFTER swap. Recommend BEFORE (current behavior) so a failed migration aborts before any user-visible state change.
- Whether the rollback path is its own GitHub Actions workflow or a documented runbook step. Lean toward a documented bash script the operator runs via SSH; full workflow is overkill.
- How to handle a "stuck" failed deploy where a previous run left the supposedly-inactive color still running (clean it up at the start of every deploy by `docker compose stop` on whatever's not in `.active-color`).
- Any additional smoke tests after swap (probably keep the existing `/api/health` + `/api/ws-health` from the smoke-test job).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing infrastructure
- `docker-compose.prod.yml` (lines 5-31 today) — current single `app` service definition; the change surface
- `.github/workflows/deploy-lightsail.yml` (lines 49-68 staging, 87-106 prod) — current SSH deploy script; the place blue-green orchestration lands. Both jobs target the same VPS; the workflow's "staging vs production" distinction is by GitHub environment protection (OIDC role) not by host
- `Dockerfile` — image `app` builds from
- NPM admin UI at `https://scrummonsters.com:81` (or via SSH tunnel to `localhost:81`) — operator interface; record the proxy host ID once
- `~/.claude/infrastructure.md` — VPS SSH credentials (lightsail key)

### Reconnection machinery this phase relies on
- `client/src/lib/stores/useWebSocket.tsx` — reconnect logic (Phase 41-01)
- `server/websocket.ts:1558-1647` — server-side `reconnect_with_token` handler (Phase 41-02)
- `.planning/phases/41-reconnection-state-bugfix/41-RESEARCH.md` — reconnect-token preservation, snapshot/token consistency
- `.planning/phases/41-reconnection-state-bugfix/41-02-SUMMARY.md` — what Phase 41 actually fixed

### Current deploy lessons learned this session
- `4804e83` — added `docker image prune -af` before pull (3.38GB reclaimed). Keep this step.
- `e6b25f3` — single-hop `/join/CODE` redirect (relies on app being up at swap time)
- The 502 incident report (this phase's motivation) — user reported HTTP 502 during the `b6a0266` deploy at 17:53, container was down ~15-30s

### Project context
- `.planning/REQUIREMENTS.md` — INFRA-01 definition
- `.planning/ROADMAP.md` Phase 44 entry — success criteria
- Phase 39/40/41/42/43 invariants must continue to pass under repeated deploys

</canonical_refs>

<specifics>
## Specific Ideas

- The NPM proxy host ID can be discovered once at phase-implementation time via authenticated `GET /api/nginx/proxy-hosts`; cache the ID in the deploy script as a constant, NOT in env (it's not secret).
- During planning, the researcher should look up NPM's exact API contract for proxy-host PATCH/PUT — different versions may require sending the FULL object back rather than a delta.
- The `.active-color` file should also be readable from outside the deploy context (e.g., a one-line health-info command for operators); store it at `/opt/scrummonsters/.active-color` (chmod 644).
- When verifying "no 502 during deploy" success criterion, the test is: in one terminal run `while true; do curl -sS -o /dev/null -w "%{http_code} " https://scrummonsters.com/api/health; sleep 0.2; done`, in another run a deploy. Output must contain only `200`.
- The Phase 41 reconnect-token flow currently rebuilds the player INTO an existing lobby. If the new color has NO lobby (because the old color held it in memory and stopped), the reconnect will fail with `lobby_not_found`. Researcher must verify this and decide whether the existing token flow handles cross-container "lobby evaporated" gracefully (likely returns the user to MenuPage with a stale-snapshot toast — acceptable degradation if rare, but it means active games WILL be interrupted by deploys until lobby state is externalized).
- Multiple consecutive deploys: each deploy alternates blue → green → blue → green, so even-numbered deploys end on `green` and odd on `blue`. Track via the file.

</specifics>

<deferred>
## Deferred Ideas

- Externalizing in-memory lobby state to Redis/Postgres so both colors share state (true zero-disruption mid-game). Big lift; revisit if active-game-interruption-on-deploy becomes a real complaint.
- Multi-replica per color (e.g., two app-green containers behind NPM round-robin) for horizontal scale. Independent of blue-green; defer.
- Replacing nginx-proxy-manager with Caddy/Traefik for native API-first config. Out of scope; would obviate parts of this phase but is a much larger infra rewrite.
- Canary deploys (5% traffic to new color, observe, ramp). Premature for current scale; defer indefinitely.
- Automated rollback after post-swap monitoring detects elevated 5xx rate. Requires metrics integration (Prometheus alert → workflow). Defer to a follow-up phase.
- Pre-deploy database backup as a separate step. Currently relies on `postgres-backup` container running continuously; not in scope here.
- Migration coordination across colors (e.g., blue runs old schema, green runs new — needs schema-compat for one cycle). Out of scope; assume migrations remain forward-only and tolerated by both colors during the swap window.
- Coordinating multi-tenant deploys across multiple VPS hosts. Single-host today; defer until growth justifies it.

</deferred>

---

*Phase: 44-zero-downtime-deploys-blue-green*
*Context gathered: 2026-05-08 via /gsd-discuss-phase*
