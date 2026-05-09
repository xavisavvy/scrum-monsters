# Phase 44: Zero-Downtime Deploys (Blue-Green) - Research

**Researched:** 2026-05-08
**Domain:** Container orchestration / reverse-proxy traffic switching / deploy automation
**Confidence:** HIGH on mechanics, HIGH on the critical reconnection-failure verification, MEDIUM on NPM API partial-update behavior (must be empirically confirmed during Wave 0)

## Summary

The phase substitutes the single `app` service with `app-blue` / `app-green` services in `docker-compose.prod.yml`, drops the host port binding, and orchestrates an NPM REST API upstream swap from the deploy workflow. CONTEXT.md has locked the topology, the NPM-REST-API approach, the `.active-color` state file, and the auto-rollback behavior. The remaining unknowns this research resolves are: (1) the **highest-risk** in-memory lobby-state question, (2) NPM API mechanics, (3) Compose `profiles` semantics, (4) container DNS for healthcheck polling, (5) drizzle-kit concurrency.

**The reconnection question is now answered, definitively:** `SessionManager` keeps `lobbies`, `disconnectedPlayers`, and `reconnectTokens` as in-process `Map`s [VERIFIED: server/domains/SessionManager.ts:71,73,74]. The new color starts with all three empty. `attemptPlayerReconnect` short-circuits at line 766 with `lobby_closed` when `this.lobbies.get(token.lobbyId)` returns undefined [VERIFIED: server/domains/SessionManager.ts:765-769], and `validateReconnectToken` short-circuits earlier still with `null` -> `invalid_token` because the token is not in the new color's `reconnectTokens` Map [VERIFIED: SessionManager.ts:652-655]. **Phase 41 reconnection cannot reconstruct lobby state across containers.** This must be acknowledged as accepted UX (per CONTEXT.md option (a)) before planning proceeds, because it changes the success-criteria interpretation for criterion 2.

**Primary recommendation:** Plan three plans — (1) compose topology + `.active-color` file + initial NPM proxy host capture; (2) NPM API helper script (token, GET-modify-PUT proxy host) + deploy-script orchestration with auto-rollback; (3) rollback runbook + smoke tests + documentation of the known WS-disconnect-during-deploy behavior. Confirm the active-game-interruption UX with the user as a Wave-0 sub-decision before plan 2 ships.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reverse-proxy upstream selection | NPM (jc21/nginx-proxy-manager) | — | NPM owns the public-facing TLS termination; its proxy_host record is the source of truth for which container receives traffic |
| Health gate before swap | Deploy script (GitHub Actions / SSH) | App `/api/health` endpoint | The script runs on the VPS via SSH and polls the new color's container; the app exposes the readiness signal |
| Active-color persistence | Filesystem on VPS (`/opt/scrummonsters/.active-color`) | NPM proxy host record (authoritative fallback) | Local file is fast; NPM is canonical when the file is missing/stale |
| Rollback decision | Deploy script | Operator (manual rollback runbook) | Script handles automatic pre-swap rollback; post-swap regressions are operator-driven (CONTEXT.md decision) |
| In-memory lobby state | App container memory (in-process `Map`s) | — | NOT shared across colors; this is the known limitation |
| Reconnection state | App container memory (`SessionManager` Maps) | — | Same limitation; Phase 41 machinery is intra-container only |
| Database migrations | `drizzle-kit push --force` from one-shot container | postgres service | One run before swap, single transaction, single writer |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Two named services `app-blue` and `app-green` in `docker-compose.prod.yml`, same image, same env, same healthcheck, same postgres dependency.
- Drop `ports: 5000:5000` from both colors; reach via Docker network only.
- Each color sits behind a Compose `profiles` entry (`blue` / `green`) so neither starts on a default `up`.
- The `app` service name is REMOVED.
- NPM REST API upstream swap: `POST /api/tokens` -> Bearer token -> `PUT /api/nginx/proxy-hosts/{id}`. Do NOT edit NPM's nginx config files directly.
- NPM admin credentials provisioned as GitHub Actions secrets `NPM_ADMIN_EMAIL` and `NPM_ADMIN_PASSWORD`. Proxy host ID either hardcoded in the deploy script or `NPM_PROXY_HOST_ID` secret.
- Trust Phase 41 reconnection machinery for in-flight WS connections; do NOT add sticky-session-during-overlap or multi-color drain.
- Auto-rollback on healthcheck failure: do not swap NPM, stop failed new color, exit non-zero. No automatic post-swap re-swap — operator decision.
- Active-color tracking via `/opt/scrummonsters/.active-color` containing `blue` or `green`. Default to `blue` on first run after this phase ships.
- DB migration runs BEFORE swap (recommendation in Claude's discretion, retain).
- Existing `stop_grace_period: 45s` retained.

### Claude's Discretion

- Exact container_name format (use Compose default: `scrummonsters-app-blue-1` style — but assign `container_name:` explicitly for predictable Docker DNS, see Pitfall 6 below).
- DB migration before vs after swap — recommend BEFORE (retains current behavior, fail-fast on bad schema).
- Rollback path: documented bash script invoked over SSH, NOT a separate workflow.
- Stuck-deploy cleanup at script start: `docker compose stop` whatever's not in `.active-color` before reading state.
- Smoke tests post-swap: keep existing `/api/health` + `/api/ws-health`.

### Deferred Ideas (OUT OF SCOPE)

- Externalizing in-memory lobby state to Redis/Postgres so both colors share state.
- Multi-replica per color.
- Replacing NPM with Caddy/Traefik.
- Canary deploys (% traffic).
- Automated post-swap rollback on metrics.
- Pre-deploy DB backup as a separate step.
- Cross-color schema-compatible migrations.
- Multi-host deploys.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Deploys do not produce a 502 Bad Gateway window. New container runs alongside old, becomes healthy, NPM swaps upstream, then the old container stops. Continuous request stream during deploy sees zero non-2xx; in-flight WS sessions either survive or reconnect via Phase 41 machinery. | Compose blue-green topology (CONTEXT.md), NPM REST API swap (Sources A/B/C), Phase 41 reconnect path verified at SessionManager.ts:753-810. **Note**: criterion 2 ("WS sessions either survive the swap or reconnect gracefully") needs a UX-clarification sub-decision because in-game lobbies CANNOT survive a cross-color swap (in-memory state) — see Pitfall 1 / Open Question 1. |

## Standard Stack

This phase is mostly orchestration scripting; no new runtime dependencies. The "stack" is the existing tools.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Docker Compose v2 | v5.0.1 (target VPS likely similar) | Service definitions and `profiles` | Already in use; CONTEXT.md locks Compose [VERIFIED: docker compose version on dev box] |
| jc21/nginx-proxy-manager | `latest` (current image) | Reverse proxy + REST API for upstream swap | Already deployed; pinned by CONTEXT.md [VERIFIED: docker-compose.prod.yml:72] |
| curl + jq | system packages on Ubuntu Lightsail | API client for NPM token + PUT inside the SSH script | Standard Ubuntu tooling; jq parses NPM JSON responses [ASSUMED: present on Lightsail; confirm in Wave 0] |
| drizzle-kit | 0.31.10 | Schema migration; runs once per deploy via `docker compose run --rm` | Already in use [VERIFIED: `npm view drizzle-kit version` -> 0.31.10] |
| GitHub Actions `appleboy/ssh-action@v1` | v1 | Existing SSH transport | Already in use [VERIFIED: .github/workflows/deploy-lightsail.yml:50] |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `docker compose ps --format json` | Detect running services for stuck-deploy cleanup | At script start, before reading `.active-color` |
| `docker inspect --format '{{.State.Health.Status}}' <container>` | Poll healthcheck without round-tripping HTTP | Optional alternative to `curl http://app-blue:5000/api/health` from inside another container |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| NPM REST API | Direct edits to NPM-generated nginx conf in `npm_data` volume | Couples to NPM internals, breaks on NPM upgrade — explicitly forbidden by CONTEXT.md |
| `docker compose --profile X up -d Y` | `docker compose up -d Y` (no profile flag) | If `Y` has a profile, plain `up` won't start it; CONTEXT.md explicitly wants profiles to prevent accidental dual-color start |
| Curl-from-host healthcheck | Curl-from-NPM-container or from one of the existing service containers | The host can reach `localhost:81` for NPM, but cannot resolve `app-blue` (Docker bridge network DNS works inside the network only — see Pitfall 6) |

**Version verification:** drizzle-kit 0.31.10 confirmed via `npm view drizzle-kit version` [VERIFIED 2026-05-08]. NPM image is `jc21/nginx-proxy-manager:latest` (unpinned tag — known historical risk but out of this phase's scope).

## Architecture Patterns

### System Architecture Diagram

```
                          Internet (HTTPS)
                                 |
                                 v
                  +--------------------------------+
                  |  nginx-proxy-manager (NPM)     |
                  |  - public 80/443               |
                  |  - admin :81 (loopback only)   |
                  |  - proxy_host record:          |
                  |      forward_host = app-{X}    |
                  |      where {X} = active color  |
                  +--------------------------------+
                                 |
                            (Docker bridge net)
                                 |
              +------------------+------------------+
              |                                     |
              v                                     v
     +----------------+                   +----------------+
     |  app-blue:5000 |                   | app-green:5000 |
     |  (profile=blue)|                   |(profile=green) |
     |                |                   |                |
     |  in-mem state: |                   |  in-mem state: |
     |  lobbies Map   |                   |  lobbies Map   |  <-- NOT SHARED
     |  reconnect Map |                   |  reconnect Map |      across colors
     +----------------+                   +----------------+
              \                                     /
               \                                   /
                \                                 /
                 v                               v
                  +----------------------------+
                  |  postgres (shared)         |
                  |  postgres-backup           |
                  +----------------------------+

Deploy flow (active=blue, deploying green):
   1. Read /opt/scrummonsters/.active-color  -> "blue"
   2. INACTIVE = "green"
   3. docker image prune -af
   4. docker compose pull (pulls for both colors; same image)
   5. docker compose --profile green up -d app-green
   6. Poll http://app-green:5000/api/health from inside compose net (60s budget)
      | unhealthy -> docker compose stop app-green; exit 1 (NO swap)
   7. docker compose run --rm app-green npx drizzle-kit push --force
   8. POST http://localhost:81/api/tokens   -> Bearer JWT
   9. GET  http://localhost:81/api/nginx/proxy-hosts/{ID} -> full record
  10. PUT  http://localhost:81/api/nginx/proxy-hosts/{ID} with full record,
         forward_host = "app-green"
  11. Smoke: curl https://scrummonsters.com/api/health   -> expect 200
  12. echo "green" > /opt/scrummonsters/.active-color
  13. docker compose stop app-blue
  14. docker image prune -af
```

### Recommended Project Structure

```
docker-compose.prod.yml                    # app-blue + app-green services with profiles
.github/workflows/deploy-lightsail.yml     # extended with blue-green orchestration
scripts/deploy/
├── npm-swap.sh                            # NPM API helper: login + GET + PUT proxy host
├── poll-health.sh                         # Healthcheck-from-network poll w/ timeout
├── deploy-bluegreen.sh                    # Main deploy orchestrator (called from SSH script)
└── rollback-bluegreen.sh                  # Manual rollback runbook script
docs/runbooks/
└── deploy-rollback.md                     # Operator-facing rollback procedure
```

Putting the bash logic in `scripts/deploy/*.sh` (versioned in git, present inside the repo on the VPS via the existing checkout pattern — wait, the workflow does NOT check out; it SSHes and runs inline). **Discretion item for planner:** either (a) ship the scripts to the VPS via `scp` step, (b) `git pull` on the VPS first then run them, or (c) keep the orchestrator inline in YAML. The current workflow uses (c). Recommend continuing (c) but breaking into a multi-step inline script with named blocks; copying scripts to the VPS introduces a state-drift problem (which version of the script is on the VPS at any moment?). Keep complexity in the YAML.

### Pattern 1: NPM upstream swap via GET-then-PUT

**What:** NPM's proxy-host PUT endpoint is undocumented in any official OpenAPI but consensus from community sources is that it accepts the full object back (it's a partial replacement of the resource, but missing fields default to `null`/empty in NPM's frontend behavior, which can erase headers / SSL config / advanced config). To safely change one field, **always GET first, modify in-place, PUT the full body back**.

**When to use:** Every upstream swap.

**Example:**
```bash
# Source: https://github.com/NginxProxyManager/nginx-proxy-manager/discussions/3265
# (community-verified pattern; no official OpenAPI is reliable per the discussion)
TOKEN=$(curl -s -X POST http://localhost:81/api/tokens \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$NPM_ADMIN_EMAIL\",\"secret\":\"$NPM_ADMIN_PASSWORD\"}" \
  | jq -r '.token')

# GET full record
RECORD=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:81/api/nginx/proxy-hosts/$NPM_PROXY_HOST_ID)

# Modify forward_host in the full body, strip server-managed fields
PAYLOAD=$(echo "$RECORD" | jq --arg host "app-$NEW_COLOR" '
  .forward_host = $host
  | del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err, .enabled, .access_list, .certificate, .owner, .use_default_location)
')
# (Field-strip list is empirical — NPM's PUT chokes on read-only fields. Confirm in Wave 0.)

# PUT
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  http://localhost:81/api/nginx/proxy-hosts/$NPM_PROXY_HOST_ID
```

[CITED: github.com/NginxProxyManager/nginx-proxy-manager/discussions/3265]

### Pattern 2: Container-name DNS for cross-container healthcheck

**What:** The deploy script needs to poll `http://app-green:5000/api/health` while `app-green` is starting. The host running the SSH script (the Lightsail VPS itself) is NOT on the Docker bridge network, so `app-green` does not resolve from there — only from another container or via a published host port (which CONTEXT.md explicitly drops). Workarounds:

- **(a)** Use `docker inspect` for healthcheck status: `docker inspect --format '{{.State.Health.Status}}' app-green` — does not require host-side DNS, polls Docker's view of the container's own healthcheck.
- **(b)** Run the curl inside the Docker network: `docker run --rm --network scrummonsters_default curlimages/curl:latest http://app-green:5000/api/health` — heavier but exactly mirrors the in-network probe.
- **(c)** Have NPM do the probe from within its container (NPM has `wget` available): `docker exec nginx-proxy-manager wget -q --spider http://app-green:5000/api/health`.

**Recommendation:** (a) for the polling loop (light, fast), with a final (b)-style probe before swap as a sanity check. The `start_period: 30s` healthcheck means `docker inspect` reports `starting` for the first 30s, then `healthy` or `unhealthy`.

**Example:**
```bash
# Source: docs.docker.com/engine/reference/commandline/inspect/
DEADLINE=$(( $(date +%s) + 60 ))
while [ $(date +%s) -lt $DEADLINE ]; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' app-$INACTIVE 2>/dev/null || echo "missing")
  if [ "$STATUS" = "healthy" ]; then break; fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo "ERROR: app-$INACTIVE healthcheck failed"
    docker compose --profile $INACTIVE stop
    exit 1
  fi
  sleep 2
done
```

### Pattern 3: Compose profiles with explicit container_name

```yaml
# docker-compose.prod.yml (excerpt)
services:
  app-blue:
    image: ghcr.io/xavisavvy/scrum-monsters:${APP_IMAGE_TAG:-latest}
    container_name: app-blue            # <-- pin so DNS lookups in NPM forward_host resolve cleanly
    profiles: ["blue"]
    stop_grace_period: 45s
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      SESSION_SECRET: ${SESSION_SECRET}
      PORT: "5000"
      ALLOWED_ORIGINS: https://scrummonsters.com
      BASE_URL: https://scrummonsters.com
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  app-green:
    # identical to app-blue with container_name: app-green and profiles: ["green"]
```

[CITED: docs.docker.com/compose/how-tos/profiles/]

### Anti-Patterns to Avoid

- **Editing NPM's nginx conf files directly.** Couples to NPM internals; NPM regenerates configs and will overwrite. Forbidden by CONTEXT.md.
- **PUT to NPM with a partial body.** Erases fields that aren't sent (per discussion #3265 community report). Always GET-modify-PUT.
- **Running `docker compose stop --profile blue`.** `stop` plus `--profile X` ALSO stops services with NO profile (postgres, NPM, prometheus, grafana, etc.). [VERIFIED: docs.docker.com/reference/compose-file/profiles/ — services without profiles are "always enabled"]. Use `docker compose stop app-blue` (service-name argument) instead.
- **Trusting the `.active-color` file as authoritative.** It can drift if a deploy crashes mid-flight. The NPM proxy-host record is canonical; the file is a cache.
- **Skipping the post-swap external smoke test.** Internal `app-green:5000/api/health` was already passing; the smoke test must hit `https://scrummonsters.com/api/health` to prove NPM actually re-routed.
- **Swapping NPM before drizzle-kit migration succeeds.** A failed migration leaves the new color running with old schema while NPM has already swapped. Migrate first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NPM upstream swap | Custom nginx config-template + reload | NPM REST API (`PUT /api/nginx/proxy-hosts/{id}`) | NPM owns the config files; templating defeats NPM's UI/state |
| Healthcheck polling | Sleep + curl loop with no timeout | `docker inspect Health.Status` (Docker's healthcheck is already running) | Already implemented by Docker; the compose healthcheck definition is the source of truth |
| Active-color persistence | Database table or env var override | Plain text file at `/opt/scrummonsters/.active-color` | Two states, single host, single deployer — file is sufficient |
| Auto-rollback decision | State machine across multiple workflow runs | Inline shell `if; then exit 1; fi` in the deploy script | Pre-swap rollback is a single decision point; no machine needed |
| Docker network DNS | Adding `extra_hosts` to NPM | Docker bridge auto-DNS via `container_name:` | Container names auto-resolve on the same compose network |
| JWT decoding for NPM | Custom Bash JWT parser | `jq -r '.token'` on the response body (NPM returns the token directly) | NPM gives the token in the response root |

**Key insight:** This phase is glue, not new code. Every standard tool (Docker healthchecks, NPM API, file-based state, Compose profiles) already does what's needed; the work is wiring them together carefully and handling the rollback path.

## Runtime State Inventory

This is a deploy-orchestration phase, not a rename. The relevant inventory is "state that survives the swap" vs "state that is lost":

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (Postgres) | postgres volume `postgres_data` is shared by both colors. Schema migrations apply globally. Auth0 sessions / user records persist. | None — works correctly across the swap. |
| In-memory state on app | `SessionManager.lobbies` Map, `SessionManager.disconnectedPlayers` Map, `SessionManager.reconnectTokens` Map [VERIFIED: server/domains/SessionManager.ts:71-74]; `progressionManager` per-lobby state; `classMasteryManager` per-lobby state; `gameState.ts` legacy combat state Maps. | **All lost on swap** — this is the active-game-interruption documented in Pitfall 1. |
| OS-registered state | `.active-color` file at `/opt/scrummonsters/.active-color` (new — created by this phase). Existing systemd? None on Lightsail today. | New file: chmod 644, owned by `ubuntu`. |
| Secrets/env vars | `NPM_ADMIN_EMAIL`, `NPM_ADMIN_PASSWORD`, optionally `NPM_PROXY_HOST_ID` — new GitHub Actions secrets. Existing `SSH_PRIVATE_KEY`, `AWS_OIDC_ROLE_ARN` unchanged. | Provision the new secrets before the workflow runs. |
| Build artifacts | Docker image `ghcr.io/xavisavvy/scrum-monsters:latest` tagged once per build — both colors pull the same image. No new artifacts. | None. |

**Cross-color state sharing — explicitly verified:**
- ✅ Postgres data: shared (one container, one volume)
- ✅ NPM data: shared (one container)
- ✅ Prometheus / Grafana: shared (one container each)
- ✅ Postgres-backup: shared
- ❌ App in-memory: **NOT shared** (this is the documented limitation)
- ❌ Reconnect tokens: **NOT shared** (consequence of in-memory)

## Common Pitfalls

### Pitfall 1: Reconnect-token rejection on the new color (THE BIG ONE)

**What goes wrong:** A user has an active lobby `ABCD` on `app-blue`. Deploy starts; `app-green` comes up healthy; NPM swaps to `app-green`; `app-blue` stops. The user's WS disconnects (TCP close). The client's Phase 41 reconnect logic fires: `socket.emit('reconnect_with_token', {reconnectToken: <hmac signed for lobby ABCD>})`. NPM routes this to `app-green`. On `app-green`:

1. `validateReconnectToken(tokenString)` calls `this.reconnectTokens.get(tokenString)` [VERIFIED: SessionManager.ts:652].
2. The new color's `reconnectTokens` Map is empty (no `set()` ever happened on `app-green` for this token).
3. Returns `null`.
4. `attemptPlayerReconnect` returns `{result: 'invalid_token', message: 'Invalid or expired reconnection token'}` [VERIFIED: SessionManager.ts:758-762].
5. Even if the token map were populated (e.g., if HMAC validation alone passed), step 5 of `attemptPlayerReconnect` does `this.lobbies.get(token.lobbyId)` [VERIFIED: SessionManager.ts:766], also empty -> `lobby_closed`.
6. Client receives `reconnect_response` with `result: 'invalid_token'`, falls through to MenuPage with cleared snapshot/token.

**Why it happens:** `SessionManager` is single-process. Tokens are HMAC-signed but the `reconnectTokens` Map is also a strict membership check (server-side revocation list semantics). HMAC validity alone is not sufficient — tokens must be present in the in-process Map.

**How to avoid:** Two paths:
- **(a)** Accept active-game interruption as documented UX (CONTEXT.md option a). Plan adds a brief explainer to the post-disconnect MenuPage toast: "We just deployed; please re-create your lobby."
- **(b)** Defer to a future phase that externalizes the lobby state to Redis/Postgres (CONTEXT.md option b, Deferred Idea).

**Recommendation:** Path (a) for Phase 44. Active games during a deploy are a rare event at current scale, and externalizing state is a much larger phase. **But this needs explicit user confirmation as a sub-decision before Plan 44-02 ships,** because INFRA-01 success criterion 2 is ambiguous as written.

**Warning signs:** During verification, in-flight WS clients should see *one* `reconnect_response: invalid_token` followed by graceful return to MenuPage — not a tight reconnect loop. Watch for the loop in dev tools.

**Possible mitigation that doesn't externalize state:** Have the new color, on receipt of an `invalid_token` reconnect, return a richer response like `{result: 'lobby_evaporated', message: 'Lobby state was reset by deploy', userFriendly: true}` so the client UX can be specific. Out of scope for the topology phase but a small, optional polish.

### Pitfall 2: NPM PUT erases fields when sent partial

**What goes wrong:** Sending `PUT /api/nginx/proxy-hosts/{id}` with `{forward_host: "app-green"}` only — NPM's frontend has been observed to clear `custom_locations`, advanced config, SSL settings, header rules. Discussion #3265 community consensus is that the safe pattern is GET-modify-PUT with the full body.

**Why it happens:** NPM's API does not enforce `application/merge-patch+json` semantics; missing fields are interpreted as null/cleared.

**How to avoid:** Always GET the full record, modify only `forward_host` in-place via `jq`, PUT the full body. **Strip server-managed read-only fields before PUT** (`id`, `created_on`, `modified_on`, `owner_user_id`, `meta.nginx_online`, `meta.nginx_err`). The exact list of fields-to-strip should be confirmed in Wave 0 by attempting a no-op PUT (GET, then immediately PUT back unchanged).

**Warning signs:** After swap, check NPM admin UI for missing custom config; check that HTTPS still terminates correctly (cert assignment isn't lost).

### Pitfall 3: `docker compose --profile X stop` stops more than profile X

**What goes wrong:** Using `docker compose --profile blue stop` to stop the old blue color also stops every service with no profile attached — postgres, NPM, prometheus, grafana, etc. — taking the whole stack down.

**Why it happens:** Compose profiles work by including services WITH the profile PLUS services without any profile. The `--profile` flag is additive (include), not exclusive.

**How to avoid:** Use `docker compose stop <service-name>` directly: `docker compose stop app-blue`. Or `docker compose rm -f -s app-blue` if you want to remove the container too.

[VERIFIED: docs.docker.com/reference/compose-file/profiles/ — "Services without a profiles attribute will always be enabled"]

### Pitfall 4: Healthcheck "healthy" doesn't mean "ready for production traffic"

**What goes wrong:** Docker's healthcheck reports `healthy` after one successful `/api/health` probe past `start_period`. But the app may not be fully warm — JIT, postgres connection pool, websocket initialization. Swapping NPM the instant healthcheck flips green can route the first real users to a still-warming process.

**Why it happens:** `/api/health` is shallow (does the process respond?), not deep (is everything wired up?).

**How to avoid:** Two-step gate: (a) wait for `docker inspect` to report `healthy`, (b) require N consecutive successful probes from inside the network (e.g., 3x `wget -q --spider` over 6 seconds) before swap. Cheap defense.

**Warning signs:** First handful of requests post-swap return 5xx or hang; in-flight WS reconnects fail.

### Pitfall 5: Drizzle-kit `push --force` running while old color is still serving traffic

**What goes wrong:** A migration drops/renames a column; old color is still receiving traffic when migration applies; old color's queries break.

**Why it happens:** Migrations are forward-only; CONTEXT.md explicitly defers schema-compat-across-colors. The current deploy already does this — single-container deploys have the same risk during the 15-30s gap, but with blue-green the old color is *actively serving* during the migration.

**How to avoid:** For non-additive migrations, accept that old color will see broken queries for the duration of (migrate + healthcheck + swap). Keep migrations additive (add columns/tables, never drop) until the v5.x roadmap explicitly takes on schema-compat. Document this as a deploy-time invariant in `docs/runbooks/deploy-rollback.md`.

**Warning signs:** Spike in 5xx on old color while new color is healthchecking. If this becomes painful, swap migration to AFTER swap (CONTEXT.md notes this is the alternative; trade is a failed migration leaves no rollback target without the old schema).

### Pitfall 6: Docker DNS resolution requires shared network membership

**What goes wrong:** NPM tries to reach `forward_host: app-green` but resolves nothing because NPM is on `scrummonsters_default` while `app-green` somehow ends up on a different network (e.g., due to compose's auto-network behavior or an explicit `networks:` declaration on one but not the other).

**Why it happens:** Compose creates a default network from the project name, and ALL services in the same compose file join it unless they declare `networks:` overrides. The current `docker-compose.prod.yml` declares no `networks:` blocks at all [VERIFIED: docker-compose.prod.yml — no `networks:` line in any service or top-level], so all services share the default network. New `app-blue` / `app-green` must NOT add `networks:` either.

**How to avoid:** Don't add `networks:` to any service. Confirm in Wave 0 with `docker network inspect scrummonsters_default` showing all containers attached. Also, set `container_name:` explicitly on `app-blue` / `app-green` so Docker DNS resolves the simple name `app-blue` (otherwise the auto-name is `scrummonsters-app-blue-1` and NPM's `forward_host` would have to use that).

**Warning signs:** NPM's `502 Bad Gateway` after swap with no obvious cause; `docker exec nginx-proxy-manager wget --spider http://app-green:5000/api/health` fails with DNS error.

### Pitfall 7: The "stuck inactive color from previous failed deploy" problem

**What goes wrong:** A previous deploy crashed after starting `app-green` but before swap. The `.active-color` file still says `blue`. The next deploy reads `blue`, computes `INACTIVE=green`, and tries `docker compose --profile green up -d app-green` — but `app-green` is already running.

**Why it happens:** No transactional cleanup on failure.

**How to avoid:** At script start, before reading `.active-color`, force-stop any color that isn't in the file: `docker compose stop app-green app-blue; docker compose --profile $(cat .active-color) up -d app-$(cat .active-color)`. This is defensive — if the active color was already running, `up -d` is a no-op.

CONTEXT.md acknowledges this: "How to handle a stuck failed deploy where a previous run left the supposedly-inactive color still running (clean it up at the start of every deploy by docker compose stop on whatever's not in .active-color)."

### Pitfall 8: NPM `latest` tag drift

**What goes wrong:** The `jc21/nginx-proxy-manager:latest` image is unpinned. A future NPM upgrade could change the API surface; the deploy script silently breaks.

**How to avoid:** Pin NPM to a specific version (e.g., `jc21/nginx-proxy-manager:2.11.3`) as part of this phase. Out of CONTEXT.md scope but the moment we rely on the API, pinning becomes mandatory. **Recommend the planner add a small task to pin NPM image as part of Plan 44-01 or 44-02.**

## Code Examples

Verified patterns:

### NPM token + GET-modify-PUT (full flow)
```bash
# Source: github.com/NginxProxyManager/nginx-proxy-manager/discussions/3265
NPM_BASE="http://localhost:81"
TOKEN=$(curl -fsS -X POST "$NPM_BASE/api/tokens" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$NPM_ADMIN_EMAIL\",\"secret\":\"$NPM_ADMIN_PASSWORD\"}" \
  | jq -r '.token')
[ -z "$TOKEN" ] || [ "$TOKEN" = "null" ] && { echo "NPM auth failed"; exit 1; }

RECORD=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "$NPM_BASE/api/nginx/proxy-hosts/$NPM_PROXY_HOST_ID")

PAYLOAD=$(echo "$RECORD" | jq --arg h "app-$INACTIVE" '
  .forward_host = $h
  | del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err)
')

curl -fsS -X PUT "$NPM_BASE/api/nginx/proxy-hosts/$NPM_PROXY_HOST_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

### Health-poll loop using `docker inspect`
```bash
# Source: docs.docker.com/engine/reference/commandline/inspect/
DEADLINE=$(( $(date +%s) + 60 ))
while [ $(date +%s) -lt $DEADLINE ]; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "app-$INACTIVE" 2>/dev/null || echo "missing")
  case "$STATUS" in
    healthy)   echo "app-$INACTIVE healthy"; break ;;
    unhealthy) echo "ERROR app-$INACTIVE unhealthy"; docker compose stop "app-$INACTIVE"; exit 1 ;;
  esac
  sleep 2
done
[ "$STATUS" = "healthy" ] || { echo "ERROR app-$INACTIVE health timeout"; docker compose stop "app-$INACTIVE"; exit 1; }
```

### Continuous-request smoke for verification
```bash
# Run in a separate terminal during a deploy. The output must contain ONLY 200s.
# Source: success-criteria 1 of INFRA-01 / CONTEXT.md specifics
while true; do
  curl -sS -o /dev/null -w "%{http_code} " https://scrummonsters.com/api/health
  sleep 0.2
done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `docker compose up -d --no-deps app` and accept downtime | Blue-green named services + REST-API upstream swap | This phase | Eliminates 502 window for HTTP traffic; WS sessions still see brief disconnect |
| NPM proxy-host edits via admin UI | NPM REST API | This phase | Automated, scriptable, reproducible |
| In-memory app state | (still in-memory; deferred) | — | Active-game disruption on deploy remains |

**Deprecated/outdated:** None for this phase — we're adding capability, not retiring patterns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NPM PUT requires GET-modify-PUT with stripped read-only fields | Pattern 1, Pitfall 2 | If true, our deploy could erase NPM custom config (cert, headers). Mitigation: GET-modify-PUT pattern; verify with no-op PUT in Wave 0. [ASSUMED based on community discussion #3265, not verified against running NPM instance] |
| A2 | `jq` is available on the Lightsail Ubuntu VPS | Standard Stack | If absent, the deploy script fails. Trivial fix: `apt-get install -y jq` in script init or one-time provisioning. [ASSUMED — confirm in Wave 0 via `ssh ubuntu@... command -v jq`] |
| A3 | NPM proxy host ID is stable across NPM container restarts | CONTEXT.md / Pattern 1 | If NPM regenerates IDs (it shouldn't — they're DB primary keys), the hardcoded ID breaks. Mitigation: query by `domain_names` containing `scrummonsters.com` to discover ID rather than hardcode. [ASSUMED stable; NPM uses sqlite/mysql `id` column, very likely stable] |
| A4 | `app-blue`'s container_name resolves to itself in the bridge network without a custom DNS configuration | Pitfall 6 | If wrong, NPM cannot route. Mitigation: explicit `container_name:` directive plus single-network confirmed via `docker network inspect`. [ASSUMED based on documented Compose behavior; confirm in Wave 0] |
| A5 | NPM's nginx config regeneration after PUT is fast (sub-second) and atomic — no transient 502 during config reload | Pitfall 4 | If the regeneration takes seconds or causes brief 502, the success criterion 1 (zero non-2xx) is not achievable purely via API swap. Mitigation: continuous-request smoke during Wave 0 swap test will surface this. [ASSUMED based on nginx graceful reload + NPM's documented behavior] |
| A6 | Drizzle-kit push from one container while old color is still serving doesn't cause data corruption (because postgres serializes DDL) | Pitfall 5 | Postgres handles DDL with locks; rare DDL conflicts are possible but not corrupting. Mitigation: keep migrations additive. [ASSUMED — Postgres is well-understood here] |
| A7 | The Lightsail VPS host can route `http://localhost:81` to NPM's admin port | Pattern 1 | NPM publishes `81:81` on the host [VERIFIED: docker-compose.prod.yml:77]. So this is verified-not-assumed. (Removed — see VERIFIED below.) |

(A7 is actually VERIFIED: `nginx-proxy-manager` exposes `81:81` per docker-compose.prod.yml line 77. Keep in mind CONTEXT.md notes that port 81 should eventually be removed from the Lightsail firewall — but localhost-only access from the deploy script over SSH is unaffected by firewall rules.)

## Open Questions

1. **Active-game interruption on deploy — accept or defer to externalized state?**
   - What we know: Phase 41 reconnect cannot reconstruct lobby state across colors (verified above with file:line).
   - What's unclear: Is the user OK with active games being interrupted by every deploy (option a, current scale, no other phase needed)? Or does this phase need to escalate scope to Redis-backed lobbies (option b)?
   - Recommendation: Option (a) — accept the limitation, document it in `docs/runbooks/deploy-rollback.md`, deploy during low-traffic windows. **Confirm with user before Plan 44-02 ships.**

2. **NPM PUT empirical field-strip list.**
   - What we know: PUT requires close-to-full body; some fields are read-only.
   - What's unclear: The exact set of read-only fields that cause NPM to 400 if included.
   - Recommendation: Wave 0 task: GET the current proxy_host record, attempt a no-op PUT (round-trip the GET response), iterate strip list until PUT returns 200. Capture the result as a constant in the deploy script.

3. **NPM image pin — bundle into this phase or separate?**
   - What we know: `latest` is risky once we depend on the API.
   - Recommendation: Add a small task to Plan 44-01 to pin NPM to its current `latest` digest after capturing it (`docker inspect jc21/nginx-proxy-manager:latest --format '{{.Id}}'`).

4. **Drizzle-kit migration before vs after swap — confirm BEFORE.**
   - What we know: CONTEXT.md says "Recommend BEFORE." Old color sees broken queries during the migration window if migration is non-additive.
   - Recommendation: Before swap (preserves rollback semantics — failed migration aborts before swap, old color still healthy with old schema). Document the additive-migration-only invariant.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | All deploy steps | ✓ on VPS (existing deploys work) | (Lightsail Ubuntu — assumed >= 24.x) | — |
| Docker Compose v2 | All deploy steps | ✓ (existing deploys use `docker compose -f`) | v2.x | — |
| curl | NPM API + smoke tests | ✓ (Ubuntu base) | — | — |
| jq | NPM API JSON parsing | ✓ likely; **confirm in Wave 0** | — | `apt-get install -y jq` first run |
| ssh / appleboy/ssh-action@v1 | Workflow transport | ✓ (existing workflow uses it) | v1 | — |
| GitHub Actions secrets `NPM_ADMIN_EMAIL`, `NPM_ADMIN_PASSWORD` | NPM auth | ✗ — to be provisioned | — | Cannot run deploy without; provision before Plan 44-02 ships |
| `NPM_PROXY_HOST_ID` (secret OR script constant) | NPM PUT target | ✗ — to be captured at phase setup | — | Discoverable via `GET /api/nginx/proxy-hosts` query by domain_name |

**Missing dependencies with no fallback:**
- `NPM_ADMIN_EMAIL` / `NPM_ADMIN_PASSWORD` GitHub secrets — must be provisioned by an operator. Document the procedure in `docs/runbooks/deploy-rollback.md`.

**Missing dependencies with fallback:**
- `jq` (apt-get install if missing).
- `NPM_PROXY_HOST_ID` (discover via API query if not preconfigured).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (existing) + Playwright (existing); shell-script unit testing via Bats or plain test scripts |
| Config file | `vitest.config.ts`, `playwright.config.ts` [VERIFIED: both exist at repo root] |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npm test` |
| Phase-specific test runner | Manual continuous-request smoke; YAML lint; shellcheck on bash; manual deploy dry-run on staging |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 (1) | Continuous request stream during deploy returns only 2xx | manual / smoke | `while true; do curl -sS -o /dev/null -w "%{http_code} " https://scrummonsters.com/api/health; sleep 0.2; done` (run during Wave 0 staging deploy) | ❌ — runbook step, no automation |
| INFRA-01 (2) | In-flight WS sessions either survive or reconnect cleanly | manual / Playwright | New Playwright spec: open lobby, trigger deploy, assert MenuPage with stale-state toast (if option a) OR lobby preserved (if option b) | ❌ Wave 0: `e2e/deploy-resilience.spec.ts` |
| INFRA-01 (3) | Failed new color triggers auto-rollback; NPM stays on old | unit (bash script) | Bats test of `deploy-bluegreen.sh` with stubbed `docker inspect` returning `unhealthy`; assert exit code 1 and no NPM PUT call | ❌ Wave 0: `scripts/deploy/test/test-rollback.bats` |
| INFRA-01 (4) | NPM credentials are CI secrets, never logged | review | Grep workflow for `NPM_ADMIN_PASSWORD` literal; ensure all uses go through `${{ secrets.NPM_ADMIN_PASSWORD }}`; confirm `set +x` around any block that handles the secret | ❌ Wave 0: manual workflow review |
| INFRA-01 (5) | `.active-color` persists and is read on next deploy | integration (manual on staging) | Two consecutive deploys, second deploy logs read-`.active-color`; visual check that file alternates `blue`/`green` | ❌ runbook step |
| INFRA-01 (6) | Compose changes preserve single-host architecture (no Swarm/K8s) | review | YAML inspection — confirm no `deploy.replicas`, no `mode: global`, no Swarm-only fields | ❌ Wave 0: planner verifies during plan-check |
| INFRA-01 (7) | Phase 39-43 invariants survive repeated deploys | regression | `npm test` (existing 705/705) must pass; manual runthrough of one P41 reconnect repro post-deploy | ✅ existing |

### Sampling Rate
- **Per task commit:** `npm run check && npm run lint` (TypeScript + ESLint clean).
- **Per wave merge:** `npm test` (full Vitest suite — should remain at 705/705 baseline).
- **Phase gate:** All of above + a successful Wave-0 staging deploy with continuous-request smoke showing zero non-2xx.

### Wave 0 Gaps
- [ ] `scripts/deploy/test/test-rollback.bats` — Bats unit tests for the bash deploy orchestrator (covers INFRA-01 (3))
- [ ] `e2e/deploy-resilience.spec.ts` — Playwright spec asserting graceful WS reconnect to MenuPage (covers INFRA-01 (2) under option (a))
- [ ] `docs/runbooks/deploy-rollback.md` — operator-facing runbook documenting rollback steps + manual smoke procedure
- [ ] Capture `NPM_PROXY_HOST_ID` once via `GET /api/nginx/proxy-hosts` against running NPM (Wave 0 setup task)
- [ ] Provision `NPM_ADMIN_EMAIL` / `NPM_ADMIN_PASSWORD` GitHub Actions secrets (Wave 0 setup task)
- [ ] Empirical NPM no-op PUT to determine read-only-field strip list (Wave 0 setup task)
- [ ] Confirm `jq` on Lightsail VPS (Wave 0 setup task)

## Project Constraints (from CLAUDE.md)

- **TypeScript-only across client/server/shared.** This phase is mostly YAML + Bash + workflow changes; no TypeScript code expected. Any TypeScript touched (e.g., a tiny health-endpoint enhancement) follows existing conventions.
- **Conventional Commits enforced by commitlint/husky.** All commits in this phase use `feat(infra):`, `fix(infra):`, `chore(infra):` scope. Phase-tagged docs use `docs(44):`.
- **Tests: Vitest with happy-dom for client, plain Vitest for server, alongside source with `.test.ts` suffix.** No new TS test files expected for this phase; Bats for shell-script tests.
- **Path aliases `@` and `@shared`.** Not relevant to this phase.
- **Existing CI workflows: `.github/workflows/{ci,e2e,docker,deploy-lightsail}.yml`.** This phase modifies `deploy-lightsail.yml` and may add a new `deploy-rollback.yml` or (per CONTEXT.md, more likely) a runbook script invoked manually over SSH.

## Sources

### Primary (HIGH confidence)
- `server/domains/SessionManager.ts:71-810` (file:line VERIFIED) — In-memory state Maps; `attemptPlayerReconnect` failure modes
- `server/websocket.ts:1558-1647` (file:line VERIFIED) — `reconnect_with_token` handler entry point
- `docker-compose.prod.yml:1-165` (VERIFIED) — current single `app` service; NPM service definition; absent `networks:` blocks
- `.github/workflows/deploy-lightsail.yml:49-124` (VERIFIED) — current deploy SSH script; the surface to extend
- `.planning/phases/41-reconnection-state-bugfix/41-02-SUMMARY.md` (VERIFIED) — Phase 41 reconnect machinery scope and limitations
- [Docker Compose profiles documentation](https://docs.docker.com/compose/how-tos/profiles/) — `--profile` semantics
- [Docker Compose profiles spec](https://docs.docker.com/reference/compose-file/profiles/) — services without profiles always enabled

### Secondary (MEDIUM confidence)
- [NPM REST API community discussion #3265](https://github.com/NginxProxyManager/nginx-proxy-manager/discussions/3265) — token + proxy-host PUT pattern (the only widely-cited authoritative source; NPM has no maintained OpenAPI)
- [eighteen73/nginx-proxy-manager-api PHP library](https://github.com/eighteen73/nginx-proxy-manager-api) — community-maintained client suggests update accepts same fields as create
- [NPM general API documentation discussion #3527](https://github.com/NginxProxyManager/nginx-proxy-manager/discussions/3527) — confirms swagger doc is incomplete; backend schemas are the truth
- [Drizzle-kit push docs](https://orm.drizzle.team/docs/drizzle-kit-push) — push semantics, not idempotent for column drops, single-writer assumed

### Tertiary (LOW confidence)
- WebSearch consensus on Compose `--profile X stop` behavior — multiple sources agree but I'd recommend Wave 0 confirmation by running `docker compose --profile blue stop --dry-run` (or actually doing it on a non-critical service) before relying on the assertion
- Field-strip list for NPM PUT — empirical, must be derived in Wave 0 against the live NPM instance

## Metadata

**Confidence breakdown:**
- Topology and Compose mechanics: HIGH — well-documented Docker behavior, confirmed against repo
- Reconnection failure mode: HIGH — verified via direct file:line reading of SessionManager.ts and websocket.ts
- NPM API mechanics: MEDIUM — community-verified but no official OpenAPI; field-strip list is empirical and must be validated in Wave 0
- Pitfalls: HIGH — derived from documented Docker behavior + verified code reading
- Validation Architecture: HIGH — reuses existing Vitest/Playwright stack, only adds Bats for bash tests

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (30 days — NPM API behavior is stable; the only fast-moving piece is image tags, which we should pin during this phase)

---

*Phase: 44-zero-downtime-deploys-blue-green*
*Research completed: 2026-05-08 via /gsd-research-phase*
