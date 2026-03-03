---
phase: 33-production-hardening
plan: "01"
subsystem: infra
tags: [docker, docker-compose, socket.io, graceful-shutdown, ghcr, postgres-backup, s3, rollback]

# Dependency graph
requires:
  - phase: 32-infrastructure-foundation
    provides: VPS provisioned, docker-compose.prod.yml base, deploy.sh, runbook.md foundation
  - phase: 32-infrastructure-foundation
    provides: Auth0 migration (removed OAUTH_CALLBACK_BASE_URL dependency)

provides:
  - io.close() called in graceful shutdown before server.close() to drain WebSocket connections
  - stop_grace_period: 45s on app service giving 15s buffer beyond 30s force-exit timeout
  - GHCR image pull instead of local build (APP_IMAGE_TAG variable controls which tag)
  - postgres-backup-s3:17 sidecar running daily pg_dump at 2am UTC uploaded to S3
  - SHA tags with sha- prefix for readable rollback (e.g., sha-abc1234)
  - Rollback procedure documented and executable in under 5 minutes
  - BASE_URL replaces orphaned OAUTH_CALLBACK_BASE_URL everywhere

affects:
  - 33-02 (infrastructure provisioning - Plan 02 provisions S3 bucket and GHCR auth this plan references)
  - 36 (disaster recovery - Part 6.4 in runbook points there for full restore procedure)

# Tech tracking
tech-stack:
  added:
    - eeshugerman/postgres-backup-s3:17 (Docker sidecar image for automated S3 backups)
  patterns:
    - GHCR image pull deploy pattern (build in CI, pull in deploy - no on-VPS builds)
    - APP_IMAGE_TAG env var for rollback (sha-XXXXXX tag pinning)
    - stop_grace_period + force-exit timeout pairing (45s Docker / 30s Node.js)

key-files:
  created:
    - .planning/phases/33-production-hardening/33-01-SUMMARY.md
  modified:
    - server/index.ts (io.close() in graceful shutdown)
    - docker-compose.prod.yml (stop_grace_period, GHCR image, BASE_URL, postgres-backup sidecar)
    - deploy.sh (pull instead of build)
    - .github/workflows/docker.yml (sha- prefix on SHA tags)
    - runbook.md (Parts 5-7: rollback, backups, GHCR auth; .env template updates)

key-decisions:
  - "io.close() must be called explicitly before server.close() — server.close() does NOT close WebSocket connections (Socket.IO maintainer confirmed)"
  - "stop_grace_period: 45s = 30s force-exit timeout + 15s buffer — prevents race between Node.js clean exit and Docker SIGKILL"
  - "APP_IMAGE_TAG defaults to latest but can be pinned to sha-XXXXXX for rollback without code changes"
  - "postgres-backup-s3:17 tag matches postgres:17-alpine — version alignment required for pg_dump compatibility"
  - "sha- prefix on SHA tags prevents potential tag conflicts with branch names and improves readability"
  - "OAUTH_CALLBACK_BASE_URL replaced with BASE_URL — the old var was orphaned after Auth0 migration in Phase 32"

patterns-established:
  - "GHCR deploy pattern: build on GitHub Actions, pull on VPS — never build on memory-constrained production VPS"
  - "Rollback as env var: APP_IMAGE_TAG=sha-XXXXXX overrides image without touching docker-compose.prod.yml"

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 33 Plan 01: Production Docker Stack Hardening Summary

**Graceful WebSocket drain via io.close(), VPS image pull from GHCR with sha-tagged rollback, and daily postgres-backup-s3 sidecar uploading to S3**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-03T02:44:08Z
- **Completed:** 2026-03-03T02:49:35Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Fixed Socket.IO graceful shutdown: io.close() now called explicitly after server_shutdown notification, draining all WebSocket connections before server.close() stops HTTP
- Hardened docker-compose.prod.yml: stop_grace_period: 45s, GHCR image pull with APP_IMAGE_TAG rollback variable, BASE_URL replacing dead OAUTH_CALLBACK_BASE_URL, postgres-backup-s3 sidecar
- Enabled instant rollback: docker.yml now tags images as sha-XXXXXXX, deploy.sh pulls from GHCR, runbook documents the 2-command rollback procedure with Parts 5-7

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix graceful shutdown and harden docker-compose.prod.yml** - `9201125` (feat)
2. **Task 2: Switch to GHCR image pull, add backup sidecar, update deploy script and runbook** - `6debd22` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `server/index.ts` - Added io.close() call inside graceful shutdown after 2s notification wait
- `docker-compose.prod.yml` - stop_grace_period: 45s, GHCR image with APP_IMAGE_TAG, BASE_URL, postgres-backup-s3 sidecar
- `deploy.sh` - Changed step 2/4 from docker compose build to docker compose pull app
- `.github/workflows/docker.yml` - Changed SHA tag prefix from empty string to sha-
- `runbook.md` - Quick Reference rollback/backup rows, .env template updated, Parts 5-7 added, Part 3 Step 2 updated

## Decisions Made

- **io.close() required explicitly:** server.close() only stops new HTTP connections, does NOT close existing WebSocket connections. Socket.IO 4.x io.close() callback API used to await completion before proceeding with shutdown.
- **45s stop_grace_period:** Chosen as 30s (Node.js force-exit) + 15s buffer. Without this, Docker would SIGKILL after default 10s, before the 30s force-exit fires, defeating the graceful shutdown entirely.
- **GHCR pull over local build:** The 1GB VPS cannot reliably build TypeScript/Vite (600-800MB peak). CI/CD builds once, VPS pulls the artifact. APP_IMAGE_TAG=latest is the default; any sha-XXXXXX tag can override for rollback.
- **postgres-backup-s3:17 image version:** Matched to postgres:17-alpine to ensure pg_dump client compatibility with the server.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- First commit attempt for Task 2 rejected by commitlint hook: one bullet point exceeded 100 characters. Shortened message lines and recommitted successfully.

## User Setup Required

None - no external service configuration required in this plan. Plan 02 handles provisioning the S3 bucket, GHCR auth on VPS, and UptimeRobot monitoring.

## Next Phase Readiness

- Code and configuration changes are complete and committed
- Plan 02 (infrastructure provisioning) can now proceed: VPS needs GHCR login, S3 bucket creation, and UptimeRobot setup
- The postgres-backup sidecar will fail to start until BACKUP_S3_* env vars are set in VPS .env
- Rollback procedure is documented and can be exercised immediately after first GHCR push

## Self-Check: PASSED

All files confirmed present. All commits verified in git history.

| Check | Result |
|-------|--------|
| server/index.ts | FOUND |
| docker-compose.prod.yml | FOUND |
| deploy.sh | FOUND |
| .github/workflows/docker.yml | FOUND |
| runbook.md | FOUND |
| 33-01-SUMMARY.md | FOUND |
| commit 9201125 | FOUND |
| commit 6debd22 | FOUND |

---
*Phase: 33-production-hardening*
*Completed: 2026-03-02*
