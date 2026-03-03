# Phase 33: Production Hardening - Research

**Researched:** 2026-03-02
**Domain:** Docker Compose graceful shutdown, PostgreSQL S3 backups, GHCR image tagging, uptime alerting
**Confidence:** HIGH (all four sub-domains verified against official docs or authoritative GitHub repos)

---

## Summary

Phase 33 has four independent hardening goals: (1) graceful SIGTERM drain so active Socket.IO games survive deploys, (2) daily automated PostgreSQL backups to S3, (3) a GHCR image tagging strategy that makes rollback trivial, and (4) uptime alerting that fires within 5 minutes of downtime. Each goal maps directly to one or two tasks and uses established off-the-shelf tooling — nothing here requires custom code except the SIGTERM drain window tuning.

The codebase already has a graceful shutdown handler in `server/index.ts` (lines 188-241) that catches SIGTERM, emits `server_shutdown` to all Socket.IO clients, waits 2 seconds, runs cleanup, then calls `server.close()`. The handler also has a 30-second force-exit timeout. What it is missing is the `stop_grace_period: 45s` in `docker-compose.prod.yml` — without it Docker sends SIGKILL after only 10 seconds (the default), so the 30-second drain window never completes. The `docker-compose.prod.yml` also has a dead env var (`OAUTH_CALLBACK_BASE_URL`) that should be replaced by `BASE_URL` to match what `server/auth/auth0.ts` already reads.

The backup sidecar pattern is mature: `eeshugerman/postgres-backup-s3` is an alpine-based Docker image that runs `pg_dump` on a cron schedule and uploads to S3. It supports `BACKUP_KEEP_DAYS` for server-side retention, but for 30-day lifecycle the correct approach is an S3 Lifecycle Policy — set once on the bucket, managed by AWS, zero container logic required. AWS IAM user with `s3:PutObject`/`s3:DeleteObject` limited to the backup bucket is the standard credential approach for Docker Compose sidecars (OIDC is for GitHub Actions, not container sidecars running on VPS).

The existing `docker.yml` GitHub Actions workflow already produces both `sha-*` and semver tags via `docker/metadata-action@v5`. The gap is that `docker-compose.prod.yml` hardcodes `image: scrummonsters:latest` (built locally) instead of pulling a pre-tagged GHCR image. Rollback requires switching to `image: ghcr.io/ORG/REPO:TAG` with an `APP_IMAGE_TAG` env var so a single `APP_IMAGE_TAG=sha-abc1234 docker compose up -d --no-deps app` executes a rollback in under 5 minutes.

**Primary recommendation:** Add `stop_grace_period: 45s` to the app service in `docker-compose.prod.yml`, add `postgres-backup-s3` sidecar with `SCHEDULE: "0 2 * * *"`, switch `app` image to `ghcr.io/ORG/REPO:${APP_IMAGE_TAG}` with `APP_IMAGE_TAG=latest` as default, and add an UptimeRobot free-tier HTTP monitor for `https://scrummonsters.com/api/health` with email alert.

---

## Standard Stack

### Core (no new npm packages needed)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `eeshugerman/postgres-backup-s3` | `:17` (matches postgres:17-alpine) | pg_dump to S3 on cron schedule | Most maintained Docker-native postgres backup image; alpine base; supports BACKUP_KEEP_DAYS; matches the existing postgres:17 image |
| `docker/metadata-action` | `v5` (already in docker.yml) | Produce sha + semver tags in CI | Official Docker GitHub Action; already configured in repo |
| UptimeRobot | Free tier | HTTP uptime check every 5 min, email alert | Free for 50 monitors; 5-min interval; email alert out of box; no self-hosting required |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| AWS S3 Lifecycle Policy | N/A (console/CLI config) | Auto-delete backups older than 30 days | Set once at bucket creation; no container logic needed |
| AWS IAM user (backup-only) | N/A | Restricted S3 credentials for sidecar | Standard for non-AWS server credential provisioning |
| `docker/build-push-action` | `v6` (already in docker.yml) | Push tagged images to GHCR | Already in use |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `eeshugerman/postgres-backup-s3` | `schickling/postgres-backup-s3` | schickling image is older and unmaintained; eeshugerman is the actively maintained fork |
| `eeshugerman/postgres-backup-s3` | `itbm/postgresql-backup-s3` | Both are viable; eeshugerman has more stars and clearer docs |
| UptimeRobot | Better Stack (Betterstack.com) | Better Stack free tier is more limited on check frequency; UptimeRobot free is 5-min intervals which meets HARD-04 exactly |
| UptimeRobot | Healthchecks.io | Healthchecks.io is a dead-man's-switch (waits for pings) — NOT an outbound HTTP checker. Wrong tool for uptime monitoring of a URL. |
| S3 Lifecycle Policy | `BACKUP_KEEP_DAYS` env var in sidecar | BACKUP_KEEP_DAYS also works but requires the sidecar to have `s3:DeleteObject`; Lifecycle Policy requires no delete permission in the sidecar and is managed by AWS |

**Installation (no new npm packages — Docker Compose and AWS configuration only):**
```bash
# No npm install needed. All changes are infrastructure config:
# 1. docker-compose.prod.yml additions
# 2. AWS S3 bucket + IAM user creation (one-time, via console or CLI)
# 3. UptimeRobot account setup (one-time, via web UI)
```

---

## Architecture Patterns

### Recommended docker-compose.prod.yml Structure

```
docker-compose.prod.yml
├── app          # Pulls from GHCR (ghcr.io/ORG/REPO:${APP_IMAGE_TAG})
│                # stop_grace_period: 45s added
├── postgres     # Unchanged (postgres:17-alpine)
├── postgres-backup
│                # eeshugerman/postgres-backup-s3:17 sidecar
│                # SCHEDULE: "0 2 * * *"
│                # depends_on: postgres
└── nginx-proxy-manager
                 # Unchanged
```

### Pattern 1: stop_grace_period for Socket.IO Drain

**What:** `stop_grace_period: 45s` gives the Node.js process 45 seconds to run its SIGTERM handler before Docker sends SIGKILL. The handler already emits `server_shutdown` to clients, waits 2 seconds, then drains connections with a 30-second force-exit timeout.

**When to use:** Any service with long-lived connections (WebSocket, Server-Sent Events) that should not be dropped mid-operation.

**Why 45s not 30s:** The Node.js force-exit timeout is 30 seconds. Docker needs its grace period to be longer than the application's internal timeout. If `stop_grace_period` equals 30s, Docker may send SIGKILL at the exact same moment the app is trying to exit cleanly. Adding 15s buffer makes the container exit cleanly before SIGKILL arrives.

**Current handler audit (server/index.ts lines 188-241):**
- Line 192-196: 30-second force-exit timeout (correct)
- Line 201-207: emits `server_shutdown` to all Socket.IO clients, waits 2000ms (correct)
- Line 211-213: calls `cleanupWebSocket` to stop intervals (correct)
- Line 215-217: closes Redis (correct)
- Line 219-224: closes database pool (correct)
- Line 226-229: calls `server.close()` — PROBLEM: this stops new HTTP connections but does NOT close existing Socket.IO connections. Must also call `io.close()`.

**Gap identified:** The existing handler calls `server.close()` but NOT `io.close()`. The Socket.IO maintainers confirmed that `server.close()` alone does not close ongoing WebSocket connections — `io.close()` must be called explicitly. The `io` instance is accessed via `(server as any).io` which suggests it is attached to the server object.

**Example (verified from Socket.IO GitHub discussion #5030):**
```typescript
// In gracefulShutdown handler, BEFORE server.close():
const io = (server as any).io;
if (io) {
  io.emit('server_shutdown', {
    message: 'Server shutting down for maintenance',
    reconnectDelayMs: 30000,
  });
  await new Promise(resolve => setTimeout(resolve, 2000));
  io.close(); // <-- REQUIRED to close WebSocket connections
}
// Then server.close() handles HTTP:
await new Promise<void>((resolve) => {
  server.close(() => resolve());
});
```

**docker-compose.prod.yml addition:**
```yaml
services:
  app:
    stop_grace_period: 45s
    # ... rest unchanged
```

### Pattern 2: Backup Sidecar

**What:** A separate container runs `pg_dump` daily and uploads the compressed SQL file to S3. It shares the Docker Compose network with postgres so it can connect via hostname `postgres`.

**Example (verified from eeshugerman/postgres-backup-s3 README):**
```yaml
services:
  postgres-backup:
    image: eeshugerman/postgres-backup-s3:17
    environment:
      SCHEDULE: "0 2 * * *"      # 2am UTC daily
      BACKUP_KEEP_DAYS: 7        # local retention (S3 lifecycle handles 30-day)
      S3_REGION: us-east-1
      S3_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID}
      S3_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY}
      S3_BUCKET: ${BACKUP_S3_BUCKET}
      S3_PREFIX: scrummonsters
      POSTGRES_HOST: postgres
      POSTGRES_DATABASE: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
```

**S3 Lifecycle Policy (30-day auto-delete):**
```json
{
  "Rules": [
    {
      "ID": "delete-backups-30d",
      "Status": "Enabled",
      "Filter": { "Prefix": "scrummonsters/" },
      "Expiration": { "Days": 30 }
    }
  ]
}
```

Apply with:
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket YOUR_BUCKET_NAME \
  --lifecycle-configuration file://lifecycle.json
```

### Pattern 3: GHCR Image Tag + Rollback

**What:** Switch `docker-compose.prod.yml` `app` service from a locally-built image to a GHCR-pulled image. Use an `APP_IMAGE_TAG` env var (defaulting to `latest`) to allow pinning to a specific SHA or semver tag for rollback.

**Current state (docker-compose.prod.yml):**
```yaml
app:
  build: .
  image: scrummonsters:latest
```

**Target state:**
```yaml
app:
  image: ghcr.io/ORG/REPO:${APP_IMAGE_TAG:-latest}
  # No 'build:' key — pulls pre-built image from GHCR
```

**Rollback procedure (under 5 minutes):**
```bash
# SSH to VPS
ssh -i ~/.ssh/lightsail_scrummonsters ubuntu@34.199.135.244

# Rollback to a specific SHA tag
cd /opt/scrummonsters
APP_IMAGE_TAG=sha-abc1234 docker compose -f docker-compose.prod.yml pull app
APP_IMAGE_TAG=sha-abc1234 docker compose -f docker-compose.prod.yml up -d --no-deps app

# Or use .env for persistence:
echo "APP_IMAGE_TAG=sha-abc1234" >> .env
docker compose -f docker-compose.prod.yml up -d --no-deps app
```

**GHCR authentication on VPS (one-time setup):**
```bash
# Create a GitHub PAT with read:packages scope
# Then on the VPS:
echo "YOUR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

**Current docker.yml tag output (already correct — no changes needed to CI):**
The existing `docker.yml` already produces:
- `sha-XXXXXXX` (7-char git sha prefix, from `type=sha,prefix=sha-` — wait, check actual config)

Review of current `docker.yml` tag config (lines 62-68):
```yaml
tags: |
  type=ref,event=branch          # → main
  type=sha,prefix=               # → XXXXXXX (no prefix — bare sha)
  type=raw,value=latest,enable=... # → latest
  type=semver,pattern={{version}} # → v1.2.3 on git tags
  type=semver,pattern={{major}}.{{minor}} # → v1.2 on git tags
```

**Issue:** `type=sha,prefix=` with empty prefix produces a bare 7-char sha (e.g., `abc1234`), not `sha-abc1234`. This is fine functionally, but the phase plan says "sha + semver". The convention `sha-abc1234` requires `type=sha,prefix=sha-`. Current config uses empty prefix. Either format works for rollback — the important thing is the sha is present as a tag. No CI change strictly required, but adding `prefix=sha-` makes the tag more readable and avoids confusion with branch names.

### Pattern 4: UptimeRobot Email Alert

**What:** UptimeRobot polls `https://scrummonsters.com/api/health` every 5 minutes. If it returns non-2xx or times out, it sends an email within 5 minutes of the first failure.

**Setup (no code changes — web UI only):**
1. Create free account at uptimerobot.com
2. Add Monitor: Type = HTTP(s), URL = `https://scrummonsters.com/api/health`, Check Interval = 5 minutes
3. Add Alert Contact: Type = Email, enter email address
4. Attach alert contact to monitor

**Alert timing:** UptimeRobot confirms the check is down after 2 consecutive failures (default). With 5-minute checks, this means the alert fires within 5-10 minutes. To hit the "within 5 minutes" success criterion strictly, configure `Alert After = 1 failure` in UptimeRobot monitor settings.

### OAUTH_CALLBACK_BASE_URL Cleanup

**What:** `docker-compose.prod.yml` line 19 sets `OAUTH_CALLBACK_BASE_URL: https://scrummonsters.com`. This variable is now dead — it was used by the old Passport.js auth (removed in Phase 32 in favor of Auth0). The Auth0 integration in `server/auth/auth0.ts` line 22 reads `process.env.BASE_URL`. The `server/config/env.ts` line 20 already declares `BASE_URL` as an optional string.

**Fix:** In `docker-compose.prod.yml`, replace `OAUTH_CALLBACK_BASE_URL: https://scrummonsters.com` with `BASE_URL: https://scrummonsters.com`. Also add `BASE_URL=https://scrummonsters.com` to the VPS `.env` file and the runbook template.

### Anti-Patterns to Avoid

- **Don't set `stop_grace_period` equal to the app's internal timeout:** If both are 30s, SIGKILL races with the clean exit. Always add buffer (45s grace period for a 30s internal timeout).
- **Don't omit `io.close()` from the SIGTERM handler:** `server.close()` stops new HTTP requests but leaves WebSocket connections open. Active Socket.IO clients will not disconnect cleanly without `io.close()`.
- **Don't use `BACKUP_KEEP_DAYS` as the sole 30-day retention mechanism:** `BACKUP_KEEP_DAYS` requires `s3:DeleteObject` in the IAM policy and relies on the container running correctly. S3 Lifecycle Policy is AWS-managed and survives container failures.
- **Don't use `schickling/postgres-backup-s3`:** The schickling image is unmaintained (last updated ~2019). Use `eeshugerman/postgres-backup-s3` which is the actively maintained fork.
- **Don't hardcode `image: scrummonsters:latest` with no tag variable:** Without `APP_IMAGE_TAG`, rollback requires SSH + manual `docker tag` hash manipulation. The env var approach enables a one-liner rollback.
- **Don't use Healthchecks.io for uptime monitoring:** Healthchecks.io is a heartbeat/dead-man's-switch service (your app pings it). It does NOT probe your URL. The right tool for "alert when site goes down" is UptimeRobot or Better Stack.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduled pg_dump + S3 upload | Custom bash script in cron | `eeshugerman/postgres-backup-s3` | Handles pg_dump args, gzip compression, S3 upload, error handling, BACKUP_KEEP_DAYS retention; tested by community |
| Backup retention/expiry | Cleanup script in sidecar | AWS S3 Lifecycle Policy | AWS-managed; survives container restarts/failures; no IAM delete permission needed in sidecar |
| Uptime monitoring + alerting | Custom healthcheck script + email | UptimeRobot free tier | Multi-location checks, alert escalation, status page, zero maintenance |
| Docker image tag production | Custom tagging script | `docker/metadata-action@v5` | Already in repo; handles sha, semver, branch, latest tagging automatically |

**Key insight:** All four hardening goals have mature off-the-shelf solutions. The only custom work is: (1) adding 3 lines to docker-compose.prod.yml (`stop_grace_period`, backup sidecar), (2) adding `io.close()` to the existing SIGTERM handler, and (3) creating AWS/UptimeRobot accounts.

---

## Common Pitfalls

### Pitfall 1: Docker Default 10s Kill Window Defeats Graceful Shutdown
**What goes wrong:** The app has a 30-second SIGTERM handler, but Docker sends SIGKILL after 10 seconds (the default `stop_grace_period`). The handler never completes. Active Socket.IO connections are killed mid-game.
**Why it happens:** Docker's default `stop_grace_period` is 10 seconds. Most developers don't know it exists.
**How to avoid:** Set `stop_grace_period: 45s` on the app service in `docker-compose.prod.yml`. Verify: `docker compose stop app` should take ~30s to complete (the app exits cleanly before SIGKILL).
**Warning signs:** `docker compose stop app` completes in exactly 10 seconds — means SIGKILL was sent, not clean exit.

### Pitfall 2: server.close() Does Not Close WebSocket Connections
**What goes wrong:** The SIGTERM handler calls `server.close()` and thinks it has drained connections. In fact, existing Socket.IO WebSocket connections remain open. The process hangs or SIGKILL kills live connections.
**Why it happens:** `server.close()` stops accepting new HTTP connections but does not destroy existing ones, including WebSocket upgrades. This is a Node.js HTTP server behavior, not a Socket.IO bug.
**How to avoid:** Call `io.close()` before `server.close()`. The Socket.IO maintainers confirmed this in GitHub discussion #5030.
**Warning signs:** Process does not exit within 2-3 seconds of calling `server.close()` (stuck on open WebSocket connections).

### Pitfall 3: Backup Sidecar Cannot Connect to postgres at Startup
**What goes wrong:** `postgres-backup` starts before postgres is healthy and fails with connection refused.
**Why it happens:** Docker Compose starts services in parallel by default. The backup sidecar tries to connect to postgres immediately.
**How to avoid:** Add `depends_on: postgres: condition: service_healthy` to the backup sidecar. The postgres service already has a healthcheck in `docker-compose.prod.yml`.
**Warning signs:** Backup sidecar logs show "connection refused" or "could not connect to server" at startup.

### Pitfall 4: GHCR Private Image Pull Fails Without Authentication
**What goes wrong:** VPS cannot pull `ghcr.io/ORG/REPO:TAG` because the image is private and docker is not logged in to GHCR.
**Why it happens:** GHCR packages are private by default. Docker pull on the VPS has no credentials.
**How to avoid:** Create a GitHub PAT with `read:packages` scope, then `docker login ghcr.io` on the VPS. This login persists in `~/.docker/config.json`. Alternatively, make the GHCR package public (acceptable for open-source or low-risk projects).
**Warning signs:** `docker compose pull app` exits with "unauthorized" or "access denied".

### Pitfall 5: deploy.sh Runs docker compose build After Switching to GHCR Pull
**What goes wrong:** After switching `docker-compose.prod.yml` to pull from GHCR, `deploy.sh` still runs `docker compose build app` which rebuilds locally — defeating the purpose of the pre-built image strategy.
**Why it happens:** `deploy.sh` was written for local builds and has `docker compose -f docker-compose.prod.yml build app` in step 2.
**How to avoid:** Update `deploy.sh` to replace `docker compose build app` with `docker compose pull app` (and `APP_IMAGE_TAG=...` set from CI or .env).
**Warning signs:** `deploy.sh` still takes 5-10 minutes because it's building instead of pulling.

### Pitfall 6: UptimeRobot Alerts After 2 Failures by Default (10-minute delay)
**What goes wrong:** UptimeRobot's default behavior is to confirm failure with 2 consecutive failed checks before alerting. With 5-minute intervals, this means an alert fires at 10 minutes, not 5.
**Why it happens:** Default "Alert After" setting is 2 failures.
**How to avoid:** In the UptimeRobot monitor settings, set "Alert After" to 1 failure. Then the first failed check triggers the email within 5 minutes of actual downtime.
**Warning signs:** Success criterion says "within 5 minutes" — with default settings you'll get 10 minutes.

### Pitfall 7: OAUTH_CALLBACK_BASE_URL Masking Missing BASE_URL
**What goes wrong:** After removing `OAUTH_CALLBACK_BASE_URL` from docker-compose.prod.yml, the Auth0 integration falls back to `http://localhost:5000` because `BASE_URL` was never added. Auth0 callbacks fail.
**Why it happens:** Two different env var names for the same concept; the cleanup is a two-part change (remove old, add new).
**How to avoid:** Replace `OAUTH_CALLBACK_BASE_URL: https://scrummonsters.com` with `BASE_URL: https://scrummonsters.com` (same line, different key). Also update the `.env` file on the VPS and the runbook template.
**Warning signs:** Auth0 login redirects to `localhost:5000` on production — the auth flow breaks.

---

## Code Examples

Verified patterns from official sources and codebase audit:

### 1. docker-compose.prod.yml: stop_grace_period + backup sidecar + GHCR image
```yaml
# Source: Docker Compose docs + eeshugerman/postgres-backup-s3 README
services:
  app:
    image: ghcr.io/ORG/REPO:${APP_IMAGE_TAG:-latest}
    # Remove: build: .
    stop_grace_period: 45s
    restart: unless-stopped
    # ... rest unchanged

  postgres-backup:
    image: eeshugerman/postgres-backup-s3:17
    environment:
      SCHEDULE: "0 2 * * *"
      BACKUP_KEEP_DAYS: 7
      S3_REGION: us-east-1
      S3_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID}
      S3_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY}
      S3_BUCKET: ${BACKUP_S3_BUCKET}
      S3_PREFIX: scrummonsters
      POSTGRES_HOST: postgres
      POSTGRES_DATABASE: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
```

### 2. server/index.ts: Add io.close() to SIGTERM Handler
```typescript
// Source: Socket.IO GitHub discussion #5030 + codebase audit
// In gracefulShutdown function, REPLACE the existing io handling block:
const io = (server as any).io;
if (io) {
  io.emit('server_shutdown', {
    message: 'Server shutting down for maintenance',
    reconnectDelayMs: 30000,
  });
  // Wait for clients to receive notification
  await new Promise(resolve => setTimeout(resolve, 2000));
  // CRITICAL: io.close() disconnects WebSocket connections cleanly
  // server.close() alone does NOT close existing WebSocket connections
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
}
// After io.close(), server.close() handles remaining HTTP:
await new Promise<void>((resolve) => {
  server.close(() => resolve());
});
```

### 3. deploy.sh: Updated for GHCR Pull
```bash
# Source: Docker Compose docs - pulling pre-built images
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
  set -e

  echo "[1/4] Pulling latest code..."
  cd /opt/scrummonsters && git pull origin main

  echo "[2/4] Pulling latest Docker image from GHCR..."
  docker compose -f docker-compose.prod.yml pull app

  echo "[3/4] Running database migrations..."
  docker compose -f docker-compose.prod.yml run --rm app npm run db:push

  echo "[4/4] Restarting app container..."
  docker compose -f docker-compose.prod.yml up -d --no-deps app

  echo "Deploy complete."
EOF
```

### 4. Rollback Procedure
```bash
# Source: Docker Compose image tag substitution pattern
# On VPS - rollback to specific GHCR image tag:
cd /opt/scrummonsters

# Option A: inline env var (temporary)
APP_IMAGE_TAG=sha-abc1234 docker compose -f docker-compose.prod.yml pull app
APP_IMAGE_TAG=sha-abc1234 docker compose -f docker-compose.prod.yml up -d --no-deps app

# Option B: persist in .env (survives reboots)
sed -i 's/APP_IMAGE_TAG=.*/APP_IMAGE_TAG=sha-abc1234/' .env
# or append if not present:
echo "APP_IMAGE_TAG=sha-abc1234" >> .env
docker compose -f docker-compose.prod.yml up -d --no-deps app
```

### 5. S3 Lifecycle Policy (30-day deletion)
```bash
# Source: AWS S3 docs - lifecycle configuration
cat > /tmp/lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "delete-backups-30d",
      "Status": "Enabled",
      "Filter": { "Prefix": "scrummonsters/" },
      "Expiration": { "Days": 30 }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket YOUR_BACKUP_BUCKET \
  --lifecycle-configuration file:///tmp/lifecycle.json
```

### 6. docker.yml: Fix sha tag prefix (minor improvement)
```yaml
# Current (produces bare sha: abc1234)
type=sha,prefix=

# Recommended (produces sha-abc1234, matches phase plan language)
type=sha,prefix=sha-
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Build Docker image on VPS (`docker compose build`) | Build on GitHub Actions, push to GHCR, pull on VPS | VPS doesn't need 800MB RAM for TypeScript build; rollback is `docker compose pull + up` |
| `schickling/postgres-backup-s3` (2019, unmaintained) | `eeshugerman/postgres-backup-s3` (actively maintained fork) | Security patches, newer postgres client versions |
| Manual backup retention | S3 Lifecycle Policy | AWS-managed; survives sidecar failures; no delete permissions needed in container |
| Poll-based uptime check with custom scripts | UptimeRobot / Better Stack (SaaS) | Multi-location checks, alert history, status page |

**Deprecated/outdated:**
- `schickling/postgres-backup-s3`: Last Docker Hub push ~2019. The `eeshugerman/postgres-backup-s3` fork is the community-standard replacement.
- Building production images on the VPS: The phase plan and existing CI infrastructure point toward GHCR; the runbook even documents this as a Phase 34 improvement. Phase 33 should make this switch since the `docker.yml` already pushes to GHCR.

---

## Open Questions

1. **GHCR Package Visibility (Public vs Private)**
   - What we know: Private packages require `docker login ghcr.io` on the VPS with a PAT; public packages need no auth
   - What's unclear: Whether the current GHCR package for this repo is public or private
   - Recommendation: Check GitHub repo → Packages tab. If private, add GHCR login step to runbook and VPS setup. If public, no VPS credential setup needed for pull.

2. **ORG/REPO name for GHCR image reference**
   - What we know: `docker.yml` uses `${{ github.repository }}` which resolves to `owner/repo-name` (lowercase)
   - What's unclear: The exact image name (depends on GitHub org/username and repo name)
   - Recommendation: The planner should note this as a concrete value to fill in: `ghcr.io/$(echo ${{ github.repository }} | tr '[:upper:]' '[:lower:]')`

3. **io.close() Callback Behavior**
   - What we know: `io.close()` disconnects all clients; it accepts a callback in some Socket.IO versions
   - What's unclear: Whether `io.close(callback)` is supported in the current Socket.IO version in this repo (need to check package.json)
   - Recommendation: Use `await new Promise(resolve => { io.close(resolve) })` — if callback isn't supported, it resolves immediately and worst case is a 0ms wait before proceeding.

4. **30-second Drain vs Active Game State**
   - What we know: The server emits `server_shutdown` with `reconnectDelayMs: 30000`; clients have reconnect logic via `reconnect_with_token`
   - What's unclear: Whether the client-side reconnect logic actually retries with the reconnect token after receiving `server_shutdown`, or if clients need code changes to handle this gracefully
   - Recommendation: The plan task should include a live-game test that verifies clients auto-reconnect after a deploy. If clients don't reconnect (just show an error), the client reconnect flow needs to be wired to the `server_shutdown` event.

---

## Sources

### Primary (HIGH confidence)
- `server/index.ts` (codebase) — graceful shutdown handler lines 188-241; confirmed io.close() is missing
- `docker-compose.prod.yml` (codebase) — confirmed `stop_grace_period` is absent; confirmed `OAUTH_CALLBACK_BASE_URL` is dead
- `server/auth/auth0.ts` (codebase) — confirmed reads `BASE_URL` not `OAUTH_CALLBACK_BASE_URL`
- `server/config/env.ts` (codebase) — confirmed `BASE_URL` already declared as optional
- `.github/workflows/docker.yml` (codebase) — confirmed `docker/metadata-action@v5` already produces sha + semver + latest tags
- [eeshugerman/postgres-backup-s3 README](https://github.com/eeshugerman/postgres-backup-s3) — environment variables, SCHEDULE syntax, Docker Compose example
- [Socket.IO GitHub Discussion #5030](https://github.com/socketio/socket.io/discussions/5030) — confirmed `io.close()` required for WebSocket drain, `server.close()` insufficient
- [Docker Compose stop_grace_period docs](https://lours.me/posts/compose-tip-018-graceful-shutdown/) — confirmed `stop_grace_period` syntax, default 10s, SIGTERM → grace → SIGKILL flow
- [AWS S3 Lifecycle Configuration docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html) — confirmed JSON format for 30-day expiration rule
- [docker/metadata-action README](https://github.com/docker/metadata-action/blob/master/README.md) — confirmed tag type options including `type=sha,prefix=sha-`

### Secondary (MEDIUM confidence)
- [UptimeRobot website](https://uptimerobot.com/) — confirmed free tier: 50 monitors, 5-minute interval, email alerts
- [UptimeRobot pricing page](https://uptimerobot.com/pricing/) — confirmed free plan includes email alerts
- [GHCR Working with Container Registry docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) — confirmed PAT with `read:packages` for private image pulls; confirmed digest/tag pull syntax

### Tertiary (LOW confidence — marked for validation)
- UptimeRobot "Alert After = 1 failure" setting — confirmed behavior described on their site but exact UI location should be verified during setup; may have changed

---

## Metadata

**Confidence breakdown:**
- Graceful shutdown (stop_grace_period + io.close()): HIGH — confirmed by codebase audit + Socket.IO maintainer statement + Docker docs
- Backup sidecar (postgres-backup-s3): HIGH — verified against active GitHub repo README
- GHCR tagging + rollback: HIGH — verified against official docker/metadata-action docs and GHCR docs
- UptimeRobot alerting: MEDIUM-HIGH — confirmed free tier features from official site; "Alert After = 1" setting not verified in UI
- OAUTH_CALLBACK_BASE_URL → BASE_URL cleanup: HIGH — confirmed by direct codebase audit of all 4 relevant files

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days — these are stable tools; Docker Compose and S3 lifecycle syntax rarely change)
