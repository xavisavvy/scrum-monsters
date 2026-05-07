---
phase: 42
slug: v5-0-pre-ship-fixes-polish
date: 2026-05-07
source: 42-RESEARCH.md (Validation Architecture section, lines 629-674)
---

# Phase 42 Validation Architecture

This document is the canonical validation map for Phase 42 (v5.0 Pre-Ship Fixes & Polish). Content extracted from `42-RESEARCH.md` `## Validation Architecture` section. If RESEARCH.md drifts from this file, RESEARCH.md is authoritative for facts; this file is authoritative for the test-coverage contract.

Cross-reference: see `42-RESEARCH.md` lines 629-674 for the source-of-truth rendering, and the per-plan PLAN.md `<verify>` blocks for the canonical executable check commands.

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`^1.x`) + happy-dom for client; node for server |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run path/to/file.test.ts` |
| Full suite command | `npm test` |

## Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FIX-04 | Server: AoE attack decrements every fighting player's hp | unit | `npx vitest run server/domains/CombatManager.test.ts -t "applyDamage"` | existing tests at L881-944 cover applyDamage; ADD AoE coverage if missing |
| FIX-04 | Server: single-target boss attack reduces target hp via performBossAttack telegraph path | integration | `npx vitest run server/domains/CombatManager.test.ts -t "startBossAttackLoop"` | existing at L423-870 |
| FIX-04 | Client: PlayerCharacter triggers damage flash on hp decrement | unit | `npx vitest run client/src/components/game/PlayerCharacter.test.tsx` | Wave 0 -- new test file (42-01 Task 2) |
| FIX-04 | Client: FloatingDamageManager renders popup on `combat:player_damaged` | unit | `npx vitest run client/src/components/game/FloatingDamageManager.test.tsx` | Wave 0 -- new component + test (42-01 Task 1) |
| FIX-05 | Server: consensus countdown does NOT start when `estimationSettings.autoAdvance=false` | unit | `npx vitest run server/gameState.test.ts -t "checkDiscussionConsensus"` | Wave 0 -- new (42-02a Task 1) |
| FIX-05 | Server: voting timeout still fires regardless of autoAdvance setting | unit | `npx vitest run server/gameState.test.ts -t "handleVotingTimeout"` | Wave 0 -- new (42-02a Task 1) |
| FIX-05 | Schema: `EstimationSettingsSchema` accepts and defaults `autoAdvance` | unit | `npx vitest run shared/socket-schemas.test.ts` | Wave 0 -- verify file exists; if not, covered indirectly by lobbySettingsStorage.test.ts (42-02a Task 0) |
| FIX-05 | Client: LobbySettingsStorage persists/loads `autoAdvance` | unit | `npx vitest run client/src/lib/utils/lobbySettingsStorage.test.ts` | Wave 0 -- new (42-02a Task 0) |
| FIX-05 | autoAdvance survives Phase 41 reconnect-token round-trip | integration | `npx vitest run server/websocket.autoAdvance.reconnect.test.ts` | Wave 0 -- new (42-02a Task 2) |
| FIX-05 | Lobby_updated handler removed -- no `console.warn` in dev | manual | Run dev server, play full game flow, watch console | manual-only |
| FIX-05 | All 26 emit sites migrated -- 0 live emit sites | static-check | `npx tsc --noEmit` + the canonical `node -e` count scripts in 42-02b `<verify>` blocks | scripted |
| BAL-01 | XPCurve: `getLevelThreshold(2)` = 100 with new exponent | unit | `npx vitest run server/domains/ProgressionManager.test.ts -t "XPCurve"` | existing curve tests; UPDATE expected values |
| BAL-01 | XPCurve: `calculateLevel(2000)` returns level matching new curve | unit | same file | existing |
| BAL-01 | awardXP boss_damage applies new rate (1 not 2) | unit | `npx vitest run server/domains/ProgressionManager.test.ts -t "boss_damage"` | existing at L175 |
| Cross-cutting | Phase 41 reconnect: `estimationSettings.autoAdvance` round-trips | integration | `npx vitest run server/websocket.autoAdvance.reconnect.test.ts` | Wave 0 -- new (42-02a Task 2; promotes "verify exists" to a created file) |
| Cross-cutting | Phase 40 tutorial: walkthroughs still pass | integration | `npm run test:e2e -- --grep tutorial` | manual or e2e |

## Sampling Rate

- **Per task commit:** `npx vitest run` against the touched test file(s).
- **Per wave merge:** `npm test` (full Vitest suite).
- **Phase gate:** Full suite green + manual smoke (boss damage visible, auto-advance toggle round-trips, XP feels right) before `/gsd-verify-work`.

## Wave 0 File List

The following test/source files MUST be created or extended in Wave 0 / earliest task of each plan:

- [ ] `client/src/components/game/PlayerCharacter.test.tsx` -- FIX-04 client damage flash trigger (42-01 Task 2)
- [ ] `client/src/components/game/FloatingDamageManager.test.tsx` -- FIX-04 floating damage popup (42-01 Task 1)
- [ ] `client/src/components/game/FloatingDamageManager.tsx` -- new component (42-01 Task 1)
- [ ] `client/src/components/game/FloatingDamage.tsx` -- new leaf component (42-01 Task 1)
- [ ] `client/src/lib/utils/lobbySettingsStorage.test.ts` -- FIX-05 autoAdvance persist/default/validate (42-02a Task 0)
- [ ] `server/gameState.test.ts` -- verify exists; if not, add minimal `checkDiscussionConsensus` + `handleVotingTimeout` tests for FIX-05 (42-02a Task 1)
- [ ] `server/websocket.autoAdvance.reconnect.test.ts` -- FIX-05 reconnect round-trip regression (42-02a Task 2)

*(Updates to existing tests, not gaps: ProgressionManager.test.ts curve threshold expectations, CombatManager.test.ts AoE hp-decrement assertion if missing.)*

## Coverage Summary

| Requirement | Plan owning the test creation | Wave |
|-------------|-------------------------------|------|
| FIX-04 | 42-01 (Tasks 1, 2) | 1 |
| FIX-05 (toggle half) | 42-02a (Tasks 0, 1, 2) | 1 |
| FIX-05 (event retirement half) | 42-02b (Task 3 final `npm test`) | 2 |
| BAL-01 | 42-03 (curve expectations updated in existing test file) | 1 |

All three requirement IDs (FIX-04, FIX-05, BAL-01) have at least one automated test commitment.
