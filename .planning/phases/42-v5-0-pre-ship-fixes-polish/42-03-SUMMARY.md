---
phase: 42-v5-0-pre-ship-fixes-polish
plan: 03
subsystem: progression
tags: [balance, progression, xp, tuning, BAL-01]
requires:
  - shared/progressionTypes.ts (existing XP_RATES export)
  - server/domains/ProgressionManager.ts (existing XPCurve + DEFAULT_CURVE_CONFIG)
provides:
  - "XP_RATES.boss_damage = 1 (was 2)"
  - "DEFAULT_CURVE_CONFIG.exponent = 1.8 (was 1.5)"
  - "XP_RATE_VALUES duplicate mirrors shared (boss_damage = 1)"
affects:
  - server/domains/ProgressionManager.test.ts (curve + rate expectations)
  - LevelUpCelebration / TierUpToast firing frequency (reduced — verified non-spammy)
tech-stack:
  added: []
  patterns:
    - "Table-driven Vitest curve assertions (ProgressionManager.test.ts:15-110)"
key-files:
  created: []
  modified:
    - shared/progressionTypes.ts
    - server/domains/ProgressionManager.ts
    - server/domains/ProgressionManager.test.ts
decisions:
  - "Two-knob tune (rate + exponent) rather than one — avoids early-game still-trivial problem"
  - "Did NOT refactor the XP_RATE_VALUES duplicate (researcher noted as optional cleanup); kept minimal ship-safe diff"
  - "Combined Task 0 (RED) + Task 1 (GREEN) into a single commit because the husky pre-commit hook gates on the full Vitest suite — a RED-only commit would be blocked"
metrics:
  duration: ~15 minutes
  completed: 2026-05-07
---

# Phase 42 Plan 03: XP Pacing Tuning Summary

Tuned XP pacing per BAL-01 by lowering `XP_RATES.boss_damage` from 2 to 1 and raising `DEFAULT_CURVE_CONFIG.exponent` from 1.5 to 1.8 — together making level 10 a multi-session goal instead of a single-session walkover.

## Background

Pre-ship signal: progression trivialized. A single 50-damage boss attack awarded 100 XP — enough to clear the entire L1→L2 threshold in one swing. A 30-min session reached level 6-7, and players reported reaching level cap or near it within one session. Phase 42 CONTEXT directed: "tune to make leveling feel earned."

Researcher recommended a two-knob change (RESEARCH.md lines 455-470). Curve-only would leave early levels trivial; per-action-only would leave late levels cheap on the gentle 1.5 curve. Both together produce smooth, multi-session pacing.

## Changes

### Table 1 — Per-action XP rates (BEFORE / AFTER)

| Source       | BEFORE     | AFTER       | Change    |
|--------------|------------|-------------|-----------|
| vote         | 10 fixed   | 10 fixed    | unchanged |
| boss_damage  | 2 × dmg    | 1 × dmg     | halved    |
| consensus    | 50 fixed   | 50 fixed    | unchanged |
| revival      | 30 fixed   | 30 fixed    | unchanged |

### Table 2 — Per-level XP thresholds and cumulative (BEFORE exp=1.5 / AFTER exp=1.8)

Threshold = `Math.floor(100 * (L-1)^exponent)`. Cumulative = sum of thresholds from L2 through L.

| Level | Threshold BEFORE (exp=1.5) | Threshold AFTER (exp=1.8) | Cumulative BEFORE | Cumulative AFTER |
|-------|----------------------------|---------------------------|--------------------|-------------------|
| 2     | 100                        | 100                       | 100                | 100               |
| 3     | 282                        | 348                       | 382                | 448               |
| 4     | 519                        | 722                       | 901                | 1170              |
| 5     | 800                        | 1212                      | 1701               | 2382              |
| 6     | 1118                       | 1811                      | 2819               | 4193              |
| 7     | 1469                       | 2515                      | 4288               | 6708              |
| 8     | 1852                       | 3320                      | 6140               | 10028             |
| 9     | 2262                       | 4222                      | 8402               | 14250             |
| 10    | 2700                       | 5219                      | 11102              | 19469             |

### Table 3 — Projected per-session pacing

Average 30-min session (5 tickets, average team activity) per RESEARCH.md lines 429-447:

| Metric                            | BEFORE  | AFTER  |
|-----------------------------------|---------|--------|
| Avg XP per 30-min session         | ~3300   | ~1860  |
| Level reached after 1 session     | 6-7     | 4-5    |
| Sessions to reach Level 10        | ~3      | ~13    |
| Single-attack 50-dmg XP           | 100 XP (full L1→L2) | 50 XP (half a level) |

Math: 1860 XP cumulative falls between cumulative-L4 (1170) and cumulative-L5 (2382), placing the 30-min average player squarely in level 4 with progress toward 5. To reach L10 (cumulative 19469 XP), 19469 / 1860 ≈ 10.5 average sessions; with variance and missed sessions, ~13 is the practical expectation. Both targets line up with RESEARCH.md lines 463-465.

## Verification of side effects

- **Full Vitest suite green:** all 680 tests pass post-change (run via `npm test`).
- **`LevelUpCelebration.test.tsx` (5 tests):** unchanged, all green — celebration logic diffs `oldLevel`/`newLevel` within a single `awardXP` call (ProgressionManager.ts:277-287), not across sessions, so retroactive recalibration on existing-player reconnect is safe (RESEARCH.md Pitfall 4).
- **TierUpToast:** unaffected — fires on tier (5-level) transitions; reduced frequency is fine, no spam risk.
- **`tsc --noEmit`:** clean.
- **Stored `totalXP` recalibrates correctly:** a player with stored XP=2000 was level 5 under the old curve; under the new curve they are level 4. This is correct re-balancing behavior, not a bug. Verified safe in RESEARCH.md Pitfall 4.

## Files touched

| File | Lines | Change |
|------|-------|--------|
| shared/progressionTypes.ts | 18 | XP_RATES.boss_damage: 2 → 1 |
| server/domains/ProgressionManager.ts | 45 | DEFAULT_CURVE_CONFIG.exponent: 1.5 → 1.8 |
| server/domains/ProgressionManager.ts | 55 | XP_RATE_VALUES.boss_damage: 2 → 1 (mirrors shared) |
| server/domains/ProgressionManager.test.ts | 19, 35, 53, 58, 78, 100, 107, 178, 198, 215, 245, 250, 292 | Curve + rate expectations updated for exp=1.8 / rate=1 |

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 0 + 1 (combined) | 0c1419f | feat | Tune XP pacing — boss_damage 2→1 + curve exponent 1.5→1.8 |

## Deviations from Plan

### [Rule 3 — Blocking] Combined RED + GREEN into a single commit

- **Found during:** Task 0 commit attempt
- **Issue:** The husky pre-commit hook runs the full Vitest suite. A pure-RED commit (test changes only, source still on old values) would have 3 failing assertions, blocking the commit. The plan called for separate `test(42-03)` then `feat(42-03)` commits.
- **Fix:** Combined Task 0 (test expectations) and Task 1 (source value changes) into one `feat(42-03)` commit. Both changes are small, atomic, and obviously coupled — splitting them only to satisfy commit shape adds no review value at this scope.
- **Files modified:** shared/progressionTypes.ts, server/domains/ProgressionManager.ts, server/domains/ProgressionManager.test.ts
- **Commit:** 0c1419f
- **TDD discipline preserved:** I authored the test changes first, ran them, and observed the expected 3-failure RED state (3 failing tests against the rate=2 source) before writing the source change. The combined commit does not weaken the test gate — the test file is in the same diff.

### [Rule 2 — Add missing functionality] Self-check additions

None required — the plan's existing assertions and verifications were sufficient.

## Self-Check Verification

Acceptance criteria from PLAN.md:

- `grep -E "boss_damage:\s*1\b" shared/progressionTypes.ts` — present (verified line 18)
- `grep -E "exponent:\s*1\.8" server/domains/ProgressionManager.ts` — present (verified line 45)
- `grep -E "boss_damage:\s*1\b" server/domains/ProgressionManager.ts` — present (verified line 55)
- `grep -c "exponent: 1.8" server/domains/ProgressionManager.test.ts` — 1 (verified line 19)
- `npx vitest run server/domains/ProgressionManager.test.ts` — 37/37 passing
- `npx tsc --noEmit` — clean
- `npm test` — 680/680 passing
- SUMMARY contains "BEFORE" — multiple, "boss_damage" — multiple, "exp=1.8" — Table 2 header

## Self-Check: PASSED

- shared/progressionTypes.ts:18 — boss_damage: 1 — FOUND
- server/domains/ProgressionManager.ts:45 — exponent: 1.8 — FOUND
- server/domains/ProgressionManager.ts:55 — boss_damage: 1 — FOUND
- server/domains/ProgressionManager.test.ts:19 — exponent: 1.8 — FOUND
- Commit 0c1419f — FOUND in `git log`
- All 680 tests passing
- LevelUpCelebration.test.tsx (5 tests) unaffected
