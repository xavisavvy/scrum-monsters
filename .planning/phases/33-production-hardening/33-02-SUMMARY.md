---
phase: 33-production-hardening
plan: "02"
subsystem: infra
tags: [aws, s3, iam, ghcr, route53, cloudwatch, sns, docker, postgres-backup, uptime-monitoring]

# Dependency graph
requires:
  - phase: 33-production-hardening
    provides: "Plan 01 code changes: graceful shutdown, GHCR image, backup sidecar, deploy.sh pull, rollback runbook"
  - phase: 32-infrastructure-foundation
    provides: "VPS provisioned, docker-compose.prod.yml, deploy.sh, Lightsail instance 34.199.135.244"

provides:
  - S3 bucket scrummonsters-backups with 30-day lifecycle policy for automated backup retention
  - IAM user scrummonsters-backup with restricted S3 access (PutObject, GetObject, ListBucket)
  - GHCR authentication on VPS enabling image pull deploys
  - Route 53 health check + CloudWatch alarm + SNS email alerting for downtime detection
  - Custom pg17 backup sidecar (postgres:17-alpine + aws-cli) replacing eeshugerman/postgres-backup-s3
  - All four Phase 33 success criteria verified end-to-end on live production
  - VPS .env updated: BASE_URL replaces OAUTH_CALLBACK_BASE_URL, APP_IMAGE_TAG=latest, BACKUP_S3_* credentials

affects:
  - 34 (CI/CD pipeline - GHCR auth and image pull pattern now live)
  - 36 (disaster recovery - S3 backups and restore procedure now operational)

# Tech tracking
tech-stack:
  added:
    - aws-cli (inside custom postgres-backup sidecar for S3 uploads)
    - Route 53 health checks (replaces planned UptimeRobot)
    - CloudWatch alarms (scrummonsters-prod-down alarm)
    - SNS email notifications (downtime alerts)
  patterns:
    - Custom backup sidecar build from postgres:17-alpine + aws-cli (version-matched pg_dump)
    - Route 53 + CloudWatch + SNS for AWS-native uptime alerting (30s interval vs 5-min free tier)
    - IAM least-privilege for backup user (PutObject/GetObject/ListBucket on single bucket only)

key-files:
  created:
    - docker/postgres-backup/Dockerfile (custom pg17 backup sidecar)
    - docker/postgres-backup/backup.sh (pg_dump -> gzip -> S3 upload script)
    - .planning/phases/33-production-hardening/33-02-SUMMARY.md
  modified:
    - docker-compose.prod.yml (switched from eeshugerman image to custom build context)

key-decisions:
  - "Route 53 + CloudWatch + SNS instead of UptimeRobot -- stays in AWS ecosystem, 30s check interval vs 5-min free tier, email via SNS"
  - "Custom pg17 backup sidecar instead of eeshugerman/postgres-backup-s3 -- eeshugerman only publishes up to :16, pg_dump v16 refuses to dump Postgres 17 server"
  - "IAM user has GetObject + ListBucket in addition to PutObject -- enables restore verification and backup listing from VPS"

patterns-established:
  - "Custom Docker sidecar for version-matched tooling: when upstream images lack needed version tags, build from base + install tools"
  - "AWS-native monitoring: Route 53 health check -> CloudWatch alarm -> SNS email, no third-party dependency"

# Metrics
duration: 12h (wall-clock, includes manual provisioning and deployment wait time)
completed: 2026-03-03
---

# Phase 33 Plan 02: Infrastructure Provisioning and Production Verification Summary

**S3 backup bucket with 30-day lifecycle, custom pg17 backup sidecar, GHCR image pull deploys, and Route 53 uptime alerting -- all four hardening criteria verified live**

## Performance

- **Duration:** ~12h wall-clock (includes manual infrastructure provisioning, CI pipeline wait, and VPS deployment)
- **Started:** 2026-03-03T02:52:44Z
- **Completed:** 2026-03-03T14:50:29Z
- **Tasks:** 2 (1 human-action checkpoint, 1 human-verify checkpoint)
- **Files modified:** 3 (via fix commits during provisioning)

## Accomplishments

- Provisioned S3 bucket `scrummonsters-backups` in us-east-1 with 30-day lifecycle policy on `scrummonsters/` prefix, all public access blocked
- Created IAM user `scrummonsters-backup` with least-privilege inline policy (PutObject, GetObject, ListBucket restricted to single bucket)
- Configured VPS `.env` with `BASE_URL=https://scrummonsters.com` (replacing orphaned `OAUTH_CALLBACK_BASE_URL`), `APP_IMAGE_TAG=latest`, and `BACKUP_S3_*` credentials
- Authenticated GHCR on VPS via PAT with `read:packages` scope, enabling `docker compose pull app` deploys
- Set up Route 53 health check (HTTPS, 30s interval, FailureThreshold=1) with CloudWatch alarm `scrummonsters-prod-down` and SNS email to preston@prestonfarr.com
- Built custom pg17 backup sidecar (`docker/postgres-backup/`) after discovering eeshugerman/postgres-backup-s3 lacks a pg17 tag
- Verified all four Phase 33 success criteria end-to-end on live production:
  - HARD-01: Graceful shutdown completed in 2.566s (clean exit, not 10s SIGKILL)
  - HARD-02: Manual backup uploaded `scrummonsters_2026-03-03T14:42:15.sql.gz` (3.5 KB) to S3
  - HARD-03: App running from `ghcr.io/xavisavvy/scrum-monsters:latest` with APP_IMAGE_TAG mechanism wired
  - HARD-04: Route 53 health check reporting "Success: HTTP 200" from multiple regions, CloudWatch alarm in OK state

## Task Commits

This plan had no code tasks -- both tasks were checkpoints (human-action and human-verify). The following fix commits were made during provisioning to resolve the backup sidecar incompatibility:

1. **Fix: postgres-backup-s3:16 fallback** - `5d33ae4` (fix)
2. **Fix: custom pg17 backup sidecar** - `83fed96` (fix)

These commits modified `docker-compose.prod.yml`, and created `docker/postgres-backup/Dockerfile` and `docker/postgres-backup/backup.sh`.

## Files Created/Modified

- `docker/postgres-backup/Dockerfile` - Custom sidecar: postgres:17-alpine + aws-cli for version-matched pg_dump
- `docker/postgres-backup/backup.sh` - Backup script: pg_dump -> gzip -> aws s3 cp with timestamp filename
- `docker-compose.prod.yml` - Switched postgres-backup from `eeshugerman/postgres-backup-s3:16` to custom `build: ./docker/postgres-backup`

## Decisions Made

- **Route 53 + CloudWatch + SNS instead of UptimeRobot:** Stays entirely within AWS ecosystem, provides 30-second check intervals (vs UptimeRobot's 5-minute free tier), email alerting via SNS with confirmed subscription. Functionally superior to the planned approach.
- **Custom pg17 backup sidecar:** `eeshugerman/postgres-backup-s3` only publishes up to tag `:16`. pg_dump v16 refuses to dump a Postgres 17 server with error "server version mismatch". Built custom sidecar from `postgres:17-alpine` + `aws-cli` to ensure version-matched pg_dump.
- **IAM policy includes GetObject + ListBucket:** Plan specified PutObject-only, but GetObject is needed for restore verification and ListBucket for backup listing. Both restricted to the single backup bucket.

## Deviations from Plan

### Planned Tool Substitutions

**1. Route 53 + CloudWatch + SNS instead of UptimeRobot (Step E)**
- **Reason:** User chose to stay within AWS ecosystem rather than introducing a third-party monitoring service
- **Impact:** Better monitoring (30s vs 5min intervals), no additional account/vendor, email alerting equivalent
- **Outcome:** HARD-04 criterion met with superior implementation

**2. Custom pg17 backup sidecar instead of eeshugerman/postgres-backup-s3 (discovered during deployment)**
- **Found during:** Task 1 provisioning / Task 2 deployment
- **Issue:** `eeshugerman/postgres-backup-s3` does not publish a `:17` tag. The `:16` tag's pg_dump refuses to dump a Postgres 17 server.
- **Fix:** Created `docker/postgres-backup/Dockerfile` based on `postgres:17-alpine` with `aws-cli` installed, and `docker/postgres-backup/backup.sh` for the pg_dump -> gzip -> S3 upload pipeline. Updated `docker-compose.prod.yml` to use `build: ./docker/postgres-backup` instead of the upstream image.
- **Commits:** `5d33ae4` (initial :16 attempt), `83fed96` (custom sidecar)
- **Impact:** Version-matched pg_dump, full control over backup tooling

---

**Total deviations:** 2 tool substitutions (both improvements over planned approach)
**Impact on plan:** No scope creep. Both substitutions deliver equivalent or better functionality than planned.

## Issues Encountered

- **eeshugerman/postgres-backup-s3 lacks pg17 tag:** First attempted `:16` tag (commit `5d33ae4`), but pg_dump v16 refused to dump Postgres 17 server. Resolved by building custom sidecar from `postgres:17-alpine` (commit `83fed96`).
- **CI pipeline timing:** Docker workflow needed to complete after Plan 01 commits were pushed before GHCR image pull would work on VPS. This was anticipated in the plan's verification instructions.

## User Setup Required

This plan WAS the user setup -- all infrastructure was provisioned manually:
- AWS S3 bucket with lifecycle policy
- AWS IAM user with access keys
- VPS .env configuration
- GHCR authentication on VPS
- Route 53 health check + CloudWatch alarm + SNS alerting

No further manual configuration needed.

## Next Phase Readiness

- All Phase 33 success criteria verified on live production
- Graceful shutdown drains WebSocket connections cleanly (2.566s exit time)
- Daily automated backups to S3 at 2am UTC with 30-day retention
- GHCR-based deploys with APP_IMAGE_TAG rollback mechanism operational
- Uptime alerting active with 30-second health check intervals
- Phase 33 is complete -- ready for Phase 34

## Self-Check: PASSED

All files confirmed present. All commits verified in git history.

| Check | Result |
|-------|--------|
| docker/postgres-backup/Dockerfile | FOUND |
| docker/postgres-backup/backup.sh | FOUND |
| docker-compose.prod.yml | FOUND |
| 33-02-SUMMARY.md | FOUND |
| commit 5d33ae4 | FOUND |
| commit 83fed96 | FOUND |
| commit 9201125 (Plan 01) | FOUND |
| commit 6debd22 (Plan 01) | FOUND |
| commit bf1365a (Plan 01) | FOUND |

---
*Phase: 33-production-hardening*
*Completed: 2026-03-03*
