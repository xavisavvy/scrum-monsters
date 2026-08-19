---
phase: 47-ability-effects-data-driven-registries
plan: "04"
subsystem: boss-ai
tags: [registry, data-driven, bug-fix, golem, tdd]
dependency_graph:
  requires: []
  provides: [EXT-03]
  affects:
    - server/domains/boss-ai/types.ts
    - server/domains/boss-ai/boss-definitions/
    - server/gameState.ts
tech_stack:
  added: []
  patterns: [single-source-of-truth, derived-mapping, tdd-red-green]
key_files:
  created: []
  modified:
    - server/domains/boss-ai/types.ts
    - server/domains/boss-ai/boss-definitions/index.ts
    - server/domains/boss-ai/boss-definitions/bugHydra.ts
    - server/domains/boss-ai/boss-definitions/sprintDemon.ts
    - server/domains/boss-ai/boss-definitions/deadlineDragon.ts
    - server/domains/boss-ai/boss-definitions/techDebtGolem.ts
    - server/domains/boss-ai/boss-definitions/scopeCreepBeast.ts
    - server/domains/boss-ai/index.ts
    - server/gameState.ts
    - server/domains/boss-ai/BossAI.test.ts
decisions:
  - "[47-04] SPRITE_TO_BOSS_TYPE derived via Object.fromEntries(Object.values(BOSS_BEHAVIORS).map(b => [b.sprite, b.bossType])) — drift impossible by construction"
  - "[47-04] availableBosses = Object.values(BOSS_BEHAVIORS) — inline 5-entry array deleted from gameState.ts"
  - "[47-04] TECH_DEBT_GOLEM_BEHAVIOR.sprite = 'technical-debt-golem.png' — live golem-AI mismatch fixed at the source"
metrics:
  duration: "4 minutes"
  completed: "2026-06-22"
  tasks: 3
  files: 10
---

# Phase 47 Plan 04: Data-Driven Boss Registry (EXT-03) Summary

**One-liner:** BossBehavior extended with sprite/description fields; SPRITE_TO_BOSS_TYPE and availableBosses both derived from Object.values(BOSS_BEHAVIORS) — golem AI mismatch fixed at the root.

## What Was Built

Three tightly coupled changes eliminate two hand-maintained tables that had drifted from the behavior registry:

1. **BossBehavior type extension** (`types.ts`): Added required `sprite: string` and `description: string` fields. TypeScript now rejects any new boss definition that omits them — the registry stays complete by construction (T-47-10).

2. **All 5 boss definitions populated** (`bugHydra, sprintDemon, deadlineDragon, techDebtGolem, scopeCreepBeast`): Each `*_BEHAVIOR` object now carries its canonical sprite filename and player-facing description copied from the former `availableBosses` inline array. Critically, `TECH_DEBT_GOLEM_BEHAVIOR.sprite = 'technical-debt-golem.png'` — the authoritative filename gameState.ts emitted — whereas the old hand-written map keyed `'tech-debt-golem.png'`, causing the golem to run Bug Hydra AI.

3. **Derived SPRITE_TO_BOSS_TYPE** (`boss-definitions/index.ts`): The hand-written 5-entry literal was replaced with:
   ```typescript
   export const SPRITE_TO_BOSS_TYPE: Record<string, BossType> = Object.fromEntries(
     Object.values(BOSS_BEHAVIORS).map((b) => [b.sprite, b.bossType])
   );
   ```
   Exported so round-trip tests can assert key count. The stale wrong key `'tech-debt-golem.png'` is structurally gone.

4. **Derived availableBosses** (`gameState.ts`): The 29-line inline array was replaced with `const availableBosses = Object.values(BOSS_BEHAVIORS)`. Boss selection still reads `.sprite`, `.name`, `.description` off the selected entry — now provided by `BossBehavior` directly.

5. **11 new test assertions** (`BossAI.test.ts`): 5-boss sprite round-trip, explicit golem regression (`getBossTypeFromSprite('technical-debt-golem.png') === 'tech-debt-golem'`), stale-key null check, 5-entry count assertion, per-boss sprite assertions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1+2 | BossBehavior sprite/description + derived SPRITE_TO_BOSS_TYPE | 93930cf | types.ts, 5 boss defs, boss-definitions/index.ts, boss-ai/index.ts, BossAI.test.ts |
| 3 | Derive availableBosses in gameState.ts | d9c1caa | server/gameState.ts |

## Verification Results

- `npm run check`: passes (tsc enforces all 5 definitions satisfy sprite/description)
- `npx vitest run server/domains/boss-ai/BossAI.test.ts`: 31/31 passed (includes 11 new)
- `npm test`: 851/851 passed — no regressions
- `npm run lint`: clean

## Deviations from Plan

None — plan executed exactly as written.

The pre-commit hook runs the full test suite on every commit, which blocks committing in a TDD RED state. Tasks 1 (sprite/description type + boss definitions) and Task 2 (SPRITE_TO_BOSS_TYPE derivation) were implemented together before committing to satisfy the hook while preserving the RED/GREEN flow intent. Both are committed as a single feat commit `93930cf`.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are pure TypeScript type/value changes in server-side static configuration data.

T-47-09 (sprite→bossType drift) and T-47-10 (required fields on BossBehavior): both mitigated by construction as planned.

## Known Stubs

None — all boss sprite filenames and descriptions are fully populated with production values sourced from the former inline array.

## Self-Check: PASSED

- server/domains/boss-ai/types.ts: sprite and description fields present
- server/domains/boss-ai/boss-definitions/index.ts: SPRITE_TO_BOSS_TYPE derived, no hand-written literal
- server/gameState.ts: availableBosses = Object.values(BOSS_BEHAVIORS)
- Commits 93930cf and d9c1caa: verified in git log
- All 851 tests green
