---
phase: 36-disaster-recovery
plan: "01"
subsystem: infra
tags: [postgres, s3, backup, restore, disaster-recovery]

requires:
  - phase: 33-production-hardening
    provides: S3 backup sidecar with daily pg_dump
provides:
  - Automated restore-from-s3.sh script for database disaster recovery
  - Verified end-to-end restore path (S3 download → gunzip|psql → verify → restart)
affects: [36-03-incident-runbook]

tech-stack:
  added: []
  patterns: [gunzip|psql for plain-text SQL restore]

key-files:
  created:
    - docker/postgres-backup/restore-from-s3.sh
  modified: []

key-decisions:
  - "gunzip|psql (not pg_restore) — backup format is plain-text SQL, no -Fc flag in backup.sh"
  - "Script sources /opt/scrummonsters/.env for credentials — no hardcoded secrets"
  - "Drop/create DB connects to postgres db, not target db — avoids active connection errors"

patterns-established:
  - "DR scripts in docker/postgres-backup/ directory alongside backup.sh"

duration: ~5min
completed: 2026-03-10
---

# Plan 36-01: S3 Restore Script Summary

**Automated database restore script with verified end-to-end S3-to-PostgreSQL restore path using gunzip|psql**

## Performance

- **Tasks:** 2 (1 auto, 1 checkpoint)
- **Files modified:** 1

## Accomplishments
- Created restore-from-s3.sh handling full lifecycle: S3 download, stop app, drop/create DB, gunzip|psql restore, verify integrity, restart app
- Executed end-to-end restore test on VPS — 7 tables restored, 0 users (expected), health check HTTP 200
- Proved DR-01: database backups can be restored and data is queryable

## Task Commits

1. **Task 1: Create restore-from-s3.sh script** - `ceb3b79` (feat)
2. **Task 2: Execute end-to-end restore test on VPS** - Human-verified checkpoint (approved)

## Files Created/Modified
- `docker/postgres-backup/restore-from-s3.sh` - Automated S3 backup restore with 6-step lifecycle

## Decisions Made
- Used `gunzip|psql` matching the plain-text SQL dump format from backup.sh (not pg_restore)
- Script sources credentials from `/opt/scrummonsters/.env` — no secrets in script
- Connects to `postgres` db for DROP/CREATE to avoid "database in use" errors

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Restore script ready for reference in 36-03 incident runbook
- DR-01 requirement satisfied

---
*Phase: 36-disaster-recovery*
*Completed: 2026-03-10*
