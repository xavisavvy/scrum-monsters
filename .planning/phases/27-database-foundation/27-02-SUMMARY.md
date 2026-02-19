---
phase: 27-database-foundation
plan: 02
subsystem: database/lifecycle
tags: [database, health-check, session-persistence, graceful-shutdown, startup-lifecycle]
dependency_graph:
  requires: [27-01, connect-pg-simple, postgres.js]
  provides: [db-health-check, session-pruning, startup-validation, graceful-db-shutdown]
  affects: [server-startup, server-shutdown, session-management]
tech_stack:
  added: [database-health-monitoring, session-pruning]
  patterns: [fail-fast-startup, graceful-shutdown, session-lifecycle]
key_files:
  created:
    - server/db/health.ts
  modified:
    - server/index.ts
decisions:
  - decision: "Use instanceof PgStorage check in health module instead of process.env.DATABASE_URL"
    rationale: "More reliable type checking, avoids duplicate env var parsing, leverages storage abstraction"
    alternative: "Could check process.env.DATABASE_URL directly but would bypass the storage abstraction layer"
  - decision: "Exit with code 1 on database health check failure"
    rationale: "Fail-fast pattern prevents limping along with broken database, container orchestrators will restart"
    alternative: "Could log warning and continue but would lead to runtime errors and poor user experience"
  - decision: "15-minute session pruning interval"
    rationale: "Balances database load with timely cleanup, reasonable for session table maintenance"
    alternative: "Could use 60 min (less overhead) or 5 min (more aggressive) but 15 min is industry standard"
metrics:
  duration_seconds: 116
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 2
  completed_at: "2026-02-19T22:52:13Z"
---

# Phase 27 Plan 02: Session Persistence & Lifecycle Hooks Summary

**One-liner:** Database health checks on startup, PostgreSQL session store with 15-minute pruning and 7-day TTL, graceful database connection shutdown.

## Objective

Wire environment validation, database health checks, session persistence, and graceful shutdown into the server startup/shutdown lifecycle to complete Phase 27's database foundation requirements.

## Tasks Completed

### Task 1: Create database health check module
**Commit:** 777e72b
**Files:** server/db/health.ts

Created `checkDatabaseHealth()` function that:
- Verifies PostgreSQL connectivity with `SELECT 1` health query
- Uses `storage instanceof PgStorage` to detect PostgreSQL mode
- Masks credentials in error output (replaces password with ****)
- Exits with code 1 on failure (fail-fast pattern)
- Skips silently when using MemStorage (valid for local dev)
- Provides actionable error messages (database not running, invalid credentials, network issues, firewall)

Leverages `storage.getSql()` from Plan 01 to access raw postgres.js client for health checks.

### Task 2: Wire validation, health check, session pruning, and graceful DB shutdown into server lifecycle
**Commit:** ebf83d5
**Files:** server/index.ts

Integrated all Phase 27 components into server startup/shutdown:

**Startup sequence:**
1. `validateEnv()` — fail fast on bad config (before any imports use env vars)
2. Express app setup + session middleware
3. Passport initialization
4. Redis initialization (optional)
5. `checkDatabaseHealth()` — fail fast on unreachable DB
6. `registerRoutes()` — mount all route handlers
7. `server.listen()` — start accepting traffic

**Session store enhancements:**
- Added `pruneSessionInterval: 900` (15 minutes in seconds)
- Added `ttl: 7 * 24 * 60 * 60` (7 days in seconds, matches cookie maxAge)
- Added `errorLog: console.error.bind(console)` for debugging session errors
- Updated console message to reflect pruning/TTL configuration

**Configuration improvements:**
- Replaced hardcoded `SESSION_SECRET` fallback with `env.SESSION_SECRET` from validated config
- Replaced manual port parsing with `env.PORT` (preserves Replit override)

**Graceful shutdown:**
- Added database connection cleanup via `storage.close()` before server.close()
- Detects PgStorage via `instanceof` check
- Logs connection closing progress
- Ensures proper cleanup order: WebSocket intervals → Redis → Database → HTTP server

## Verification Results

- TypeScript check: PASSED (npx tsc --noEmit)
- Build: PASSED (npm run build)
- Imports verified: validateEnv, checkDatabaseHealth, storage, PgStorage
- Startup order confirmed: validateEnv → session setup → Redis → health check → routes → listen
- Session store configured with pruneSessionInterval (900s) and ttl (7 days)
- Graceful shutdown includes storage.close() with instanceof check
- Health check uses getSql() from Plan 01

## Deviations from Plan

None - plan executed exactly as written.

## Integration Points

**Completes Phase 27 (Database Foundation):**
- DB-01 (Data Persistence): PostgreSQL XP/estimation storage survives restarts
- DB-02 (Connection Pooling): Configured in Plan 01, integrated in Plan 02 lifecycle
- DB-03 (Session Persistence): connect-pg-simple with pruning ensures sessions survive restarts
- DB-04 (Environment Validation): validateEnv() fails fast on startup with Zod validation
- DB-05 (Health Checks): checkDatabaseHealth() verifies connectivity before accepting traffic

**Upstream dependencies:**
- Relies on validateEnv() and Env type from Plan 01
- Uses PgStorage.getSql() and close() from Plan 01
- Uses connect-pg-simple for PostgreSQL session persistence

**Downstream usage:**
- Server startup lifecycle is now: validate → setup → verify → serve
- Graceful shutdown properly closes all resources (WebSocket → Redis → Database → HTTP)
- Session pruning runs automatically every 15 minutes (no manual cleanup needed)

## Technical Notes

**Startup lifecycle order matters:**
- validateEnv() must run before any code reads process.env (placed at top of file)
- checkDatabaseHealth() must run after Redis but before routes (ensures DB ready before traffic)
- server.listen() must run last (only accept traffic when fully initialized)

**Graceful shutdown order:**
- WebSocket intervals first (stop sending new messages)
- Redis next (close cache connections)
- Database after Redis (close PostgreSQL pool)
- HTTP server last (stop accepting new requests)

**Session pruning:**
- Runs in background every 15 minutes
- Deletes expired sessions from database
- Prevents session table bloat
- TTL matches cookie maxAge (7 days)

**Health check fail-fast:**
- Prevents server from starting with broken database
- Kubernetes/Docker will restart container
- Better than runtime failures during request handling

## Phase 27 Success Criteria Verification

All 5 success criteria from ROADMAP.md Phase 27 are now satisfied:

- **SC1 (XP persistence)**: PgStorage + PostgreSQL = data survives restarts ✓
- **SC2 (Session persistence)**: connect-pg-simple with pruning = sessions survive restarts ✓
- **SC3 (Connection pool)**: postgres.js pool with configurable max/idle/connect timeouts ✓
- **SC4 (Fail-fast validation)**: validateEnv() + checkDatabaseHealth() at startup ✓
- **SC5 (Estimation history)**: PgStorage estimation_history table = survives restarts ✓

## Self-Check: PASSED

**Files created:**
- server/db/health.ts: FOUND

**Files modified:**
- server/index.ts: FOUND (validateEnv import line 8, checkDatabaseHealth import line 9, validateEnv() call line 13, checkDatabaseHealth() call line 108, pruneSessionInterval line 34, storage.close() line 167)

**Commits verified:**
- 777e72b: FOUND (feat(27-02): add database health check module)
- ebf83d5: FOUND (feat(27-02): wire validation, health check, session pruning, and graceful DB shutdown into server lifecycle)

**Key integrations verified:**
- validateEnv() called before app setup: FOUND
- checkDatabaseHealth() called after Redis init: FOUND
- Session store has pruneSessionInterval and ttl: FOUND
- Graceful shutdown includes storage.close(): FOUND
- Port uses env.PORT: FOUND (line 139: const port = isReplit ? 5000 : env.PORT)
