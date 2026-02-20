---
phase: 30-logging-cleanup
plan: 01
subsystem: logging
tags: [logging, pino, structured-logging, observability]
dependency_graph:
  requires: [server/logger.ts]
  provides: [structured-server-logs]
  affects: [all-server-modules]
tech_stack:
  added: []
  patterns: [structured-logging, object-first-api]
key_files:
  created: []
  modified:
    - server/websocket.ts
    - server/gameState.ts
    - server/index.ts
    - server/redis.ts
    - server/socketHandlers.ts
    - server/storage.ts
    - server/vite.ts
    - server/db/health.ts
    - server/config/env.ts
    - server/auth/passport.ts
    - server/auth/routes.ts
    - server/auth/profileRoutes.ts
    - server/domains/SessionManager.ts
    - server/domains/ClassMasteryManager.ts
    - server/domains/ProgressionManager.ts
    - server/domains/StatsTracker.ts
decisions:
  - Migrated all 228 operational console statements (229 total, 1 in JSDoc)
  - Used appropriate logger types (httpLogger, socketLogger, gameLogger, dbLogger, authLogger)
  - Stripped emoji prefixes from log messages for structured format
  - Applied appropriate log levels based on message severity
  - Replaced console.error.bind(console) with dbLogger.error.bind(dbLogger) in session store
  - Consolidated multi-line error output in db/health.ts to single structured call
metrics:
  duration_seconds: 1001
  completed_at: "2026-02-20"
---

# Phase 30 Plan 01: Server Console Migration Summary

**One-liner:** Migrated all 228 server console.log/warn/error statements to Pino structured logging using appropriate logger instances.

## What Was Built

Completed migration of all server-side console statements to Pino structured logging infrastructure. All server files now use the existing logger instances (httpLogger, socketLogger, gameLogger, dbLogger, authLogger) with structured object-first API format.

### Files Migrated (17 total)

**Task 1 - High-traffic files (183 statements):**
- `server/websocket.ts` (119) → socketLogger/gameLogger/authLogger
- `server/gameState.ts` (31) → gameLogger
- `server/index.ts` (17) → httpLogger/dbLogger
- `server/redis.ts` (16) → dbLogger

**Task 2 - Remaining files (45 statements):**
- `server/socketHandlers.ts` (2) → socketLogger
- `server/storage.ts` (2) → dbLogger
- `server/vite.ts` (1) → httpLogger
- `server/db/health.ts` (12) → dbLogger
- `server/config/env.ts` (2) → httpLogger
- `server/auth/passport.ts` (4) → authLogger
- `server/auth/routes.ts` (6) → authLogger
- `server/auth/profileRoutes.ts` (6) → authLogger
- `server/domains/SessionManager.ts` (4) → gameLogger
- `server/domains/ClassMasteryManager.ts` (2) → dbLogger
- `server/domains/ProgressionManager.ts` (2) → dbLogger
- `server/domains/StatsTracker.ts` (2) → dbLogger

### Migration Patterns Applied

**1. Structured Object-First API:**
```typescript
// Before
console.log(`Player ${playerId} connected from ${ip}`);

// After
socketLogger.info({ playerId, ip }, 'Player connected');
```

**2. Error Serialization:**
```typescript
// Before
console.error('Database error:', error);

// After
dbLogger.error({ err: error }, 'Database error');
```

**3. Consolidated Multi-Line Logs:**
```typescript
// Before (db/health.ts lines 19-27)
console.error("Database health check failed:");
console.error(`  Connection: ${maskedUrl}`);
console.error(`  Error: ${errorMsg}`);
// ...9 lines total

// After
dbLogger.error({
  connection: maskedUrl,
  err: error,
  possibleCauses: ['Database server not running', 'Invalid credentials', 'Network connectivity', 'Firewall']
}, 'Database health check failed');
```

**4. Appropriate Log Levels:**
- `debug` - Verbose diagnostic messages (token validation, heartbeats, movement)
- `info` - Operational events (connections, phase transitions, lobby actions)
- `warn` - Concerning but non-fatal (missing config, reconnection failures)
- `error` - Failures requiring investigation (database errors, auth failures)
- `fatal` - Unrecoverable errors (uncaught exceptions, unhandled rejections)

**5. Special Cases:**
- Simplified `server/vite.ts` log() helper to wrap httpLogger.info
- Replaced `errorLog: console.error.bind(console)` with `errorLog: dbLogger.error.bind(dbLogger)` in connect-pg-simple config
- Stripped emoji prefixes (🔌, ✅, ❌, etc.) from messages for structured format

## Deviations from Plan

None - plan executed exactly as written.

All 228 operational console statements migrated. The 229th console.log is in a JSDoc comment (server/events/EventBus.ts line 16) - code example in documentation, not operational code. ESLint ignores comments as expected.

## Verification Results

**Console Statement Check:**
```bash
grep -rc "console\." server/ --include="*.ts" | grep -v ":0$" | grep -v "test\."
# Output: server/events/EventBus.ts:1 (JSDoc comment only)
```

**TypeScript Compilation:**
```bash
npm run check
# Output: Success - no errors
```

**Key Imports Verified:**
All migrated files have appropriate logger imports:
- websocket.ts: socketLogger, gameLogger, authLogger
- gameState.ts: gameLogger
- index.ts: httpLogger, dbLogger
- redis.ts: dbLogger
- auth files: authLogger
- domains files: gameLogger/dbLogger

## Success Criteria Met

- ✅ All 228 operational console.log/warn/error statements migrated
- ✅ Appropriate Pino loggers used (httpLogger, socketLogger, gameLogger, dbLogger, authLogger)
- ✅ Structured object-first API throughout
- ✅ Appropriate log levels applied
- ✅ Server compiles with TypeScript (npm run check)
- ✅ Ready for ESLint no-console upgrade to error level (Phase 30 Plan 02)

## Commits

1. **feat(30-01): migrate high-traffic server files to Pino loggers** - 2fa8a65
   - Migrated websocket.ts, gameState.ts, index.ts, redis.ts (183 statements)

2. **feat(30-01): migrate remaining server files to Pino loggers** - 4c79eb8
   - Migrated 12 remaining files (45 statements)

## Impact

**LOG-01 Requirement Satisfied:** All server code now uses Pino structured logging. Logs are:
- JSON format in production (parseable by Prometheus/Loki)
- Pretty-printed in development (human-readable with pino-pretty)
- Structured with contextual data (no more string interpolation)
- Appropriately leveled for filtering

**Next Step:** Phase 30 Plan 02 can now upgrade ESLint `no-console` rule from `warn` to `error` without breaking the build.

## Self-Check: PASSED

**Files Created:** None (migration only)

**Files Modified:** All 17 files verified to exist and compile:
- ✅ server/websocket.ts
- ✅ server/gameState.ts
- ✅ server/index.ts
- ✅ server/redis.ts
- ✅ server/socketHandlers.ts
- ✅ server/storage.ts
- ✅ server/vite.ts
- ✅ server/db/health.ts
- ✅ server/config/env.ts
- ✅ server/auth/passport.ts
- ✅ server/auth/routes.ts
- ✅ server/auth/profileRoutes.ts
- ✅ server/domains/SessionManager.ts
- ✅ server/domains/ClassMasteryManager.ts
- ✅ server/domains/ProgressionManager.ts
- ✅ server/domains/StatsTracker.ts

**Commits Verified:**
- ✅ 2fa8a65 - Task 1 commit exists
- ✅ 4c79eb8 - Task 2 commit exists

**TypeScript Compilation:** ✅ Passed (npm run check)
