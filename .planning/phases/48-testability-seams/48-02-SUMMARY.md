---
phase: 48-testability-seams
plan: 02
subsystem: server/domains
tags: [refactor, testability, dependency-injection, combat, shield]
dependency_graph:
  requires: [48-01]
  provides: [damageInterceptor-seam]
  affects: [server/domains/CombatManager.ts, server/domains/index.ts, server/domains/CombatManager.test.ts]
tech_stack:
  added: []
  patterns: [constructor-injectable-dep, pass-through-default, interceptor-chain]
key_files:
  created: []
  modified:
    - server/domains/CombatManager.ts
    - server/domains/index.ts
    - server/domains/CombatManager.test.ts
decisions:
  - damageInterceptor stored as private readonly field with pass-through lambda default via ?? operator
  - applyDamageToPlayerRaw is private — call sites must never bypass interceptor directly
  - Production wiring uses closure over reduceShield/getShieldAbsorption (module-private helpers) — no extraction needed
metrics:
  duration: "~8 minutes"
  completed: "2026-06-22"
  tasks: 2
  files: 3
---

# Phase 48 Plan 02: MAINT-02 damageInterceptor Seam Summary

**One-liner:** Replace module-scope `combatManager.applyDamageToPlayer` monkey-patch with a first-class `damageInterceptor` constructor dep; shield logic moved to production construction site; previously untestable path now covered by 3 injected-interceptor tests.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add damageInterceptor dep; rename body to applyDamageToPlayerRaw | c701c93 | CombatManager.ts, CombatManager.test.ts |
| 2 | Wire shield interceptor at production construction, delete monkey-patch | 38927b9 | index.ts |

## What Was Built

**CombatManager.ts changes:**

1. `CombatManagerDeps` interface gains an optional `damageInterceptor?:` field with a 4-arg signature `(lobbyId, playerId, damage, applyFn) => void`.
2. `private readonly damageInterceptor` field stored in constructor; default is a pure pass-through lambda assigned via `??`.
3. Existing `applyDamageToPlayer` body renamed to `private applyDamageToPlayerRaw` — body byte-identical.
4. New public `applyDamageToPlayer` delegates: `this.damageInterceptor(lobbyId, playerId, damage, (l, p, d) => this.applyDamageToPlayerRaw(l, p, d))`.
5. All 7 internal call sites (`L814, L1038, L1044, L1157, L1165, L1195, L1199`) remain as `this.applyDamageToPlayer(...)` and automatically route through the interceptor.

**index.ts changes:**

- `combatManager` construction receives `damageInterceptor:` closure containing the exact shield-absorption logic (`reduceShield` + `combat:shield_absorbed` + `applyFn`) previously in the monkey-patch.
- 26-line monkey-patch block (`const originalApplyDamage = ...` through the reassignment) fully removed.

**CombatManager.test.ts additions:**

New `describe('CombatManager — damageInterceptor seam (MAINT-02)')` block with 3 tests using fresh `new ScopedEventBus()` per test:
1. Default no-interceptor: full damage applied, no `combat:shield_absorbed` emitted.
2. Partial interceptor: player takes `damage - 5` when `applyFn` called with reduced amount.
3. Full interceptor: player takes zero damage when `applyFn` is never called.

## Verification Results

- `npx vitest run server/domains/CombatManager.test.ts` — 131/131 pass (including 3 new interceptor tests)
- `npx vitest run server/domains/AbilityEffectHandler.test.ts` — 10/10 pass (shield regression guard green)
- `npm test` — **896/896 tests pass** (3 more than the 893 after 48-01; new interceptor tests added)
- `npm run check` — 0 TypeScript errors
- `npm run lint` — 0 ESLint problems
- `grep originalApplyDamage server/domains/index.ts` — no matches
- `grep "combatManager.applyDamageToPlayer =" server/domains/index.ts` — no matches
- `grep "applyDamageToPlayerRaw" server/domains/CombatManager.ts` — only declaration + public wrapper lambda (no call sites)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `damageInterceptor` optional with `??` pass-through default | Follows existing `CombatManagerDeps` optional dep pattern; tests that don't inject an interceptor get unmodified behavior |
| `applyDamageToPlayerRaw` kept private | Prevents accidental bypass of shield logic from any future call site; only the public wrapper is the entry point |
| Shield logic stays in `domains/index.ts` as a closure | `reduceShield`, `getShieldAbsorption`, `activeBuffs` are module-private — no extraction needed; avoids exposing internal state |
| Pass-through default is inline lambda (not named function) | Keeps constructor compact; the lambda is only 1 line |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript error in test — arrow function returning number where void expected**
- **Found during:** Task 1 tsc verification
- **Issue:** `bus.on('combat:shield_absorbed', () => emitted.push('shield_absorbed'))` — `Array.push()` returns `number`, but the event handler type expected `void | Promise<void>`
- **Fix:** Wrapped push in a block body: `() => { emitted.push('shield_absorbed'); }`
- **Files modified:** server/domains/CombatManager.test.ts
- **Commit:** c701c93 (included in same commit)

None other — plan executed as written.

## TDD Gate Compliance

| Gate | Status |
|------|--------|
| RED: failing tests written first | Confirmed — 2 tests failed before implementation |
| GREEN: implementation makes all tests pass | Confirmed — 131/131 after implementation |
| REFACTOR: no structural cleanup needed | Skipped (code is clean as written) |

Note: The pre-commit hook runs `npm test` (full suite), which means the RED commit cannot be made separately — the hook rejects failing tests. RED and GREEN were combined into a single commit per task as the hook enforced it. The RED state was manually verified via `npx vitest run` before implementing.

## Known Stubs

None — all new code is wired to production data paths.

## Threat Flags

None — no new external network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- [x] `server/domains/CombatManager.ts` — modified, contains `damageInterceptor`
- [x] `server/domains/index.ts` — modified, contains `damageInterceptor:` at construction, no `originalApplyDamage`
- [x] `server/domains/CombatManager.test.ts` — modified, contains `damageInterceptor` describe block with 3 tests
- [x] Commit c701c93 exists (feat: Task 1)
- [x] Commit 38927b9 exists (feat: Task 2)
- [x] 896 tests pass, tsc clean, lint clean
