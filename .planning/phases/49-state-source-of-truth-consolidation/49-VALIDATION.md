---
phase: 49
slug: state-source-of-truth-consolidation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (happy-dom) |
| **Config file** | `vitest.config.ts` (setup: `client/src/test/setup.ts`) |
| **Quick run command** | `npx vitest run <targeted file>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (full suite, 909 tests at phase start) |

---

## Sampling Rate

- **After every task commit:** Run the targeted `npx vitest run` for the file touched
- **After every plan wave:** Run `npm test` (full suite) + `npm run check` (tsc) + `npm run lint`
- **Before `/gsd:verify-work`:** Full suite green + tsc clean + lint clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

> This phase fixes two correctness bugs (team staleness, boss-HP divergence/double-emit) and one
> render-perf criterion. Each requirement carries a REGRESSION test that fails on the old behavior
> and passes on the new. The planner fills exact task IDs; rows below seed the structure.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-xx | 01 | 1 | MAINT-04 | — | teams always derived from players after any player mutation (avatar_selected, host_changed, team_changed) | unit + regression | `npx vitest run client/src/lib/socket/eventHandlers.test.ts` | ✅/❌ W0 | ⬜ pending |
| 49-02-xx | 02 | 1 | MAINT-05 | — | single boss-HP source via applyBasicDamageToBoss; basic attacks trigger checkPhaseTransition; no double-emit of combat:boss_damaged | unit + regression | `npx vitest run server/domains/CombatManager.test.ts` | ✅/❌ W0 | ⬜ pending |
| 49-03-xx | 03 | 1 | MAINT-06 | — | field-scoped selectors; single boss hit does not re-render the whole battle tree; no fresh-object-per-render selector | render-count | `npx vitest run client/src/components/game/PlayerCharacter.test.tsx` | ✅/❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/src/lib/socket/eventHandlers.test.ts` — regression test for the team_changed push-before-map bug + avatar_selected/host_changed team derivation (MAINT-04); a `withTeamsDerived` unit test
- [ ] `server/domains/CombatManager.test.ts` — basic-attack-triggers-checkPhaseTransition test via `new CombatManager({ eventBus })` (MAINT-05); single-emit assertion (combat:boss_damaged fires exactly once per basic attack)
- [ ] Render-count guardrail — a render-spy wrapper around `PlayerCharacter`/`PlayerController` asserting a boss-HP change does not re-render unrelated subtrees (MAINT-06)

*Existing Vitest + @testing-library/react infrastructure covers framework needs — no install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | All three requirements are unit/render-count testable (Phase 48 seams enable the server tests) | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
