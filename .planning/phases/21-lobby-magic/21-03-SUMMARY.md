---
phase: 21-lobby-magic
plan: 03
subsystem: security
tags: [crypto, randomBytes, CodeQL, id-generation, security-hardening]

# Dependency graph
requires:
  - phase: 21-lobby-magic
    provides: Security hardening context and CodeQL alert analysis
provides:
  - Cryptographically secure lobby code generation (randomBytes + alphanumeric charset)
  - Cryptographically secure player/host/boss/projectile ID generation
  - Cryptographically secure TOKEN_SECRET fallback
  - Cryptographically secure logger request ID fallback
affects: [21-lobby-magic, CodeQL alerts, security audits]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - generateSecureLobbyCode() using randomBytes(6) + charset mapping for lobby codes
    - generateSecureId() using randomBytes(8).toString('hex').substring(0,13) for IDs
    - Security-sensitive IDs use crypto.randomBytes; gameplay randomness uses Math.random

key-files:
  created: []
  modified:
    - server/gameState.ts
    - server/domains/SessionManager.ts
    - server/websocket.ts
    - server/logger.ts

key-decisions:
  - "Use crypto.randomBytes for all security-sensitive IDs; preserve Math.random for gameplay"
  - "generateSecureLobbyCode uses alphanumeric charset (ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789) for human-readable codes"
  - "generateSecureId produces 13-char hex string via randomBytes(8).toString('hex').substring(0,13)"

patterns-established:
  - "Security boundary: IDs/tokens/secrets use crypto.randomBytes; gameplay values use Math.random"

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 21 Plan 03: Crypto Randomness Hardening Summary

**Replaced all security-sensitive Math.random() with crypto.randomBytes() across gameState, SessionManager, websocket, and logger — closing CodeQL insecure randomness alerts without touching gameplay mechanics**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T05:17:57Z
- **Completed:** 2026-02-18T05:21:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- All lobby codes now use cryptographically secure generation (randomBytes + alphanumeric charset mapping)
- All player/host/boss/projectile IDs use crypto.randomBytes (13-char hex)
- TOKEN_SECRET fallback uses randomBytes(16).toString('hex') instead of Math.random()
- Logger request ID fallback uses randomBytes(8).toString('hex') instead of Math.random()
- All 575 existing tests continue to pass — output type compatibility maintained

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Math.random() in gameState.ts** - `004b210` (fix)
2. **Task 2: Replace Math.random() in SessionManager, websocket, logger** - `4d249b5` (fix)

**Plan metadata:** (included in state update commit)

## Files Created/Modified

- `server/gameState.ts` - Added randomBytes import, generateSecureLobbyCode(), generateSecureId() helpers; replaced 6 security-sensitive usages
- `server/domains/SessionManager.ts` - Added generateSecureLobbyCode(), generateSecureId() helpers; replaced 3 security-sensitive usages (lobby ID, host ID, player ID)
- `server/websocket.ts` - Added randomBytes import; replaced projectile ID generation
- `server/logger.ts` - Added randomBytes import; replaced Math.random() fallback in request ID generation

## Decisions Made

- Used `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789` charset for lobby codes to preserve human-readable format while ensuring cryptographic security
- IDs use `randomBytes(8).toString('hex').substring(0, 13)` — 13-char hex string, same format as the old Math.random() output, so no downstream breaking changes
- Gameplay randomness (player positions, boss selection, ring attack chance/radius, boss AI decisions, damage variance) intentionally kept as Math.random() — these are not security-sensitive

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- First commit attempt failed commitlint header-max-length (105 chars > 100 limit). Shortened header on retry — resolved immediately.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CodeQL insecure randomness alerts for gameState.ts, SessionManager.ts, websocket.ts, logger.ts should now be closed
- CombatManager.ts and BossAI.ts Math.random() usages are all gameplay and intentionally left as-is
- Ready for next Phase 21 plan (plan 04: GitHub Actions workflow permissions)

---
## Self-Check: PASSED

- FOUND: .planning/phases/21-lobby-magic/21-03-SUMMARY.md
- FOUND: server/gameState.ts (randomBytes import, generateSecureLobbyCode, generateSecureId)
- FOUND: server/domains/SessionManager.ts (randomBytes helpers, secure ID generation)
- FOUND: server/websocket.ts (randomBytes import, secure projectile ID)
- FOUND: server/logger.ts (randomBytes import, secure request ID fallback)
- FOUND: commit 004b210 (Task 1)
- FOUND: commit 4d249b5 (Task 2)

*Phase: 21-lobby-magic*
*Completed: 2026-02-18*
