---
phase: 48-testability-seams
verified: 2026-06-22T19:50:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 48: Testability Seams — Verification Report

**Phase Goal:** Core server logic (GameState, domain wiring, socket handlers) is reachable by unit tests with byte-identical production behavior — the safety net every later refactor depends on.
**Verified:** 2026-06-22T19:50:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                 | Status     | Evidence                                                                                                                                                               |
|----|-------------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | `GameStateManager` exported; constructable with `{ startWatchdogs?: boolean }`; `handleVotingTimeout` public; tests use no `as any` on class; no leaked timers | VERIFIED | `export class GameStateManager` at L39; constructor `opts?: { startWatchdogs?: boolean }` at L59; `if (startWatchdogs)` guards both `setInterval` calls at L62/69; `public handleVotingTimeout` at L1438; singleton unchanged at L2114; 3 new seam tests pass (confirmed 909/909 green) |
| 2  | Module-scope monkey-patch of `combatManager.applyDamageToPlayer` replaced by first-class `damageInterceptor`; all 7 internal call sites route through it | VERIFIED | `grep originalApplyDamage` → no matches; `grep 'combatManager.applyDamageToPlayer ='` → no matches; `damageInterceptor` field declared at CombatManager.ts L201; default pass-through at L209-210; 7 internal `this.applyDamageToPlayer(` call sites at lines 814, 1038, 1044, 1157, 1165, 1195, 1199 all funnel through `this.damageInterceptor(...)` at L1269; shield interceptor wired at production construction in index.ts L133-155 |
| 3  | `wireDomains(deps): { dispose() }` factory; 9 named listeners; dispose removes all 9; `makeMockSocket` enables handler tests for `create_lobby`, disconnect/host-transfer, `reconnect_with_token` | VERIFIED | `export function wireDomains` at index.ts L432; 9 `bus.on()` registrations at L443/449/455/461/470/482/509/523/588; `dispose()` removes all 9 via `bus.off()` at L592-600; module-bottom call at L609; `makeMockSocket.ts` at server/test/; 10 handler tests in `websocket.handlers.test.ts` all pass |
| 4  | No runtime behavior change; full suite still green                                                    | VERIFIED   | `npm test` → 909/909 tests pass; tsc clean per SUMMARY (VALIDATION.md sign-off); singleton instantiation, module-bottom wiring call, and handler delegation all byte-identical (see detail below) |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `server/gameState.ts` | `export class GameStateManager` with `opts?: { startWatchdogs?: boolean }` ctor; `public handleVotingTimeout` | VERIFIED | L39, L59-72, L1438 confirmed |
| `server/gameState.test.ts` | `describe('GameStateManager — MAINT-01 testability seam', ...)` block; no `as any` on class; `new GameStateManager(undefined, { startWatchdogs: false })` | VERIFIED | L164-222 confirmed; zero `as any` on `gs` (one on player fixture literal — acceptable) |
| `server/domains/CombatManager.ts` | `damageInterceptor` DI dep; `applyDamageToPlayer` delegates to it; `applyDamageToPlayerRaw` marked do-not-call-directly | VERIFIED | L48-53 (interface), L201 (field), L209-210 (default), L1268-1270 (delegation), L1275-1276 (raw doc) |
| `server/domains/index.ts` | `export function wireDomains`; 9 named listener consts; `dispose()` removes all 9; module-bottom production call | VERIFIED | L432 (export), L443-588 (9 listeners), L591-601 (dispose), L609 (production call) |
| `server/test/makeMockSocket.ts` | `makeMockSocket()` returning `{ socket, handlers, emitted, joinedRooms }` with `data`, `on`, `off`, `emit`, `join` | VERIFIED | File confirmed; all 5 socket surface points present |
| `server/websocket.handlers.ts` | `handleCreateLobby`, `handleReconnectWithToken`, `handleDisconnect` exported; `HandlerDeps` interface | VERIFIED | All 3 handlers exported; `HandlerDeps` at L33; byte-identical bodies confirmed |
| `server/websocket.ts` | Delegates to all 3 extracted handlers; `activeConnections` is mutable `{value}` ref | VERIFIED | L38 import; L425 (create_lobby), L1662 (reconnect_with_token), L1834 (disconnect) delegations; L192 mutable ref |
| `server/domains/index.test.ts` | 3 tests: listener registration counts, dispose removes all, fresh buses don't accumulate | VERIFIED | Tests confirmed and pass live |
| `server/websocket.handlers.test.ts` | 10 tests covering create_lobby, disconnect/host-transfer, reconnect_with_token | VERIFIED | 10/10 pass confirmed via live run |
| `server/domains/CombatManager.test.ts` | MAINT-02 seam tests: default pass-through, partial absorption, full absorption | VERIFIED | L2044-2105 confirmed; 3 tests covering all interceptor branches |

---

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `server/gameState.ts:L2114` | `export const gameState = new GameStateManager()` | No-arg call → `startWatchdogs` defaults `true` → both watchdogs start | WIRED | Singleton byte-identical; confirmed no arguments passed |
| `server/domains/CombatManager.ts:L1268-1270` | `applyDamageToPlayerRaw` | `this.damageInterceptor(lobbyId, playerId, damage, (l,p,d) => this.applyDamageToPlayerRaw(l,p,d))` | WIRED | All 7 internal call sites go through `applyDamageToPlayer` which delegates to interceptor |
| `server/domains/index.ts:L133-155` | `CombatManager` damageInterceptor | `damageInterceptor: (lobbyId, playerId, damage, applyFn) => { reduceShield... applyFn... }` | WIRED | Shield logic at production construction site; `reduceShield` called before `applyFn` |
| `server/domains/index.ts:L609` | Module-bottom wiring | `wireDomains({ eventBus, abilityManager, comboManager, itemManager, combatManager, statsTracker, sessionManager })` | WIRED | Production call present; return value discarded (same runtime behavior as prior inline registrations) |
| `server/websocket.ts:L425` | `handleCreateLobby` | `on('create_lobby', (data) => { handleCreateLobby(socket, data, handlerDeps); })` | WIRED | Thin delegation inside existing rate-limit wrapper |
| `server/websocket.ts:L1662` | `handleReconnectWithToken` | `on('reconnect_with_token', (data) => { handleReconnectWithToken(socket, data, handlerDeps); })` | WIRED | Confirmed |
| `server/websocket.ts:L1834` | `handleDisconnect` | `socket.on('disconnect', (reason) => { handleDisconnect(socket, reason, handlerDeps); })` | WIRED | Confirmed |

---

## MAINT-02 Call-Site Count (Concrete)

7 internal `this.applyDamageToPlayer(` call sites in CombatManager.ts (all routing through the interceptor):

| Line | Context |
|------|---------|
| 814  | Minion attack — random target from fighting players |
| 1038 | Multi-target boss attack (loop over targetPlayerIds) |
| 1044 | Single-target boss attack |
| 1157 | AoE attack (loop over players) |
| 1165 | AoE attack (single remaining target) |
| 1195 | Direct targeted attack |
| 1199 | Fallback targeted attack |

The method definition at L1268 is NOT counted (it IS the interceptor gateway). The raw delegate at L1279 is `applyDamageToPlayerRaw` — correctly marked private and doc-blocked from direct use.

---

## MAINT-03 Listener Count (Concrete)

| # | Event | Named Const | Handler |
|---|-------|-------------|---------|
| 1 | `combat:battle_initialized` | `onBattleInitAbility` | abilityManager.resetCooldowns |
| 2 | `session:lobby_destroyed` | `onLobbyDestroyedAbility` | abilityManager.cleanupLobby |
| 3 | `combat:battle_initialized` | `onBattleInitCombo` | comboManager.resetCombos |
| 4 | `session:lobby_destroyed` | `onLobbyDestroyedCombo` | comboManager.cleanupLobby |
| 5 | `session:lobby_destroyed` | `onLobbyDestroyedItems` | itemManager + buffs/debuffs + statsTracker cleanup |
| 6 | `estimation:discussion_ended` | `onDiscussionEndedItems` | award items to all non-spectator players |
| 7 | `item:effect_applied` | `onItemEffectApplied` | heal/buff/shield item branches |
| 8 | `combat:boss_damaged` | `onBossDamagedBuff` | damage_boost bonus damage |
| 9 | `ability:effect_applied` | `onAbilityEffectApplied` | damage/heal/buff/shield/debuff/taunt ability branches |

The `dispose()` removes each via `bus.off(event, namedConst)` — confirmed by `index.test.ts` asserting all listener counts return to 0 after dispose. Distinct named consts for the three `session:lobby_destroyed` listeners prevent the arrow-function reference mismatch pitfall.

---

## Byte-Identical Behavior Assessment

The central refactor promise ("byte-identical production behavior") is assessed across all three seams:

**MAINT-01 (GameStateManager):** The singleton at L2114 is `export const gameState = new GameStateManager()` — zero arguments passed, so `opts` is `undefined`, `startWatchdogs` defaults `true`, and both `setInterval` watchdog calls execute unconditionally. Three keyword changes only: `export`, `opts?` param, `public`. No logic edits. BYTE-IDENTICAL.

**MAINT-02 (damageInterceptor):** The default interceptor (no `damageInterceptor` in deps) is a direct pass-through: `(lobbyId, playerId, damage, applyFn) => { applyFn(lobbyId, playerId, damage); }` — identical to calling `applyDamageToPlayerRaw` directly. The production wiring in `index.ts` supplies the shield interceptor, which is NEW behavior (shield absorption that was previously behind the monkey-patch). This is the intended change — the monkey-patch is removed and the same shield logic is wired at construction. The monkey-patch previously mutated `combatManager.applyDamageToPlayer` at module load; the new path wires it as a constructor dep. Semantically equivalent; no logic changed. BYTE-IDENTICAL for production.

**MAINT-03 (wireDomains + handler extraction):** The module-bottom `wireDomains(...)` call replaces 9 inline `eventBus.on(...)` statements with the identical 9 registrations inside the factory. The factory closes over the same module-private helpers (activeBuffs, reduceShield, etc.) it always had access to. The handler bodies in `websocket.handlers.ts` are confirmed byte-identical — the only structural change is that `activeConnections` moved from `let number` to `const { value: number }` mutable ref so the extracted function can decrement it. All 6 usages in `websocket.ts` updated from bare `activeConnections` to `activeConnections.value`. This is a mechanical transform with no semantic change. BYTE-IDENTICAL.

---

## MaxListenersExceededWarning Assessment

**Finding:** The `(node:...) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 estimation:vote_cast listeners added to [ScopedEventBus]` warning is still emitted during `npm test`.

**Root cause:** The `ScopedEventBus` (which extends `EventEmitter`) has a default max-listener ceiling of 10. The module-level singleton `eventBus` in `server/domains/index.ts` accumulates `estimation:vote_cast` listeners from 4 domain managers constructed at module load: `CombatManager` (L213), `ClassMasteryManager` (L74), `StatsTracker` (L84), `ProgressionManager` (L187). When `AbilityEffectHandler.test.ts` imports the live singleton from `./index`, those 4 listeners are already registered on the singleton bus, plus additional ones from test setup, crossing the threshold.

**Scope against Phase 48 success criteria:** This warning is NOT a failure of any of the 4 roadmap success criteria:
- MAINT-01 is about GameStateManager — unrelated.
- MAINT-02 is about the damageInterceptor — unrelated.
- MAINT-03 is about wireDomains and the handler seam — the new `index.test.ts` correctly uses fresh `new ScopedEventBus()` per test and never triggers the warning. The warning comes from `AbilityEffectHandler.test.ts` (a Phase 47 test file) importing the production singleton.
- Success criterion 4 ("no runtime behavior change; full suite still green") is met — 909/909 tests pass; the warning is a pre-existing condition that Phase 48 explicitly documented and did not worsen.

**Classification:** KNOWN ISSUE (pre-existing; not a Phase 48 regression). Phase 48 RESEARCH.md noted the warning and the VALIDATION.md sign-off explicitly records "No NEW MaxListenersExceededWarning." The fresh-bus-per-test pattern introduced by Phase 48 (`index.test.ts`, `CombatManager.test.ts MAINT-02 block`) prevents the warning from the new tests.

**Recommended follow-up (not a blocker):** Add `eventBus.setMaxListeners(20)` in the module-level ScopedEventBus construction in `server/domains/index.ts`, or convert `AbilityEffectHandler.test.ts` to use isolated buses instead of the production singleton. Either would suppress the cosmetic warning without changing behavior. This is Phase 49+ scope.

---

## Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| None found | — | — | No TBD/FIXME/XXX markers in modified files; no stubs; no empty implementations |

Scanned: `server/gameState.ts`, `server/domains/CombatManager.ts`, `server/domains/index.ts`, `server/test/makeMockSocket.ts`, `server/websocket.handlers.ts`, `server/gameState.test.ts`, `server/domains/index.test.ts`, `server/websocket.handlers.test.ts`.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| MAINT-01: timer-safe construction | `npx vitest run server/gameState.test.ts` (MAINT-01 describe) | 3/3 pass | PASS |
| MAINT-02: interceptor routes damage | `npx vitest run server/domains/CombatManager.test.ts` (MAINT-02 describe) | 3/3 pass | PASS |
| MAINT-02: shield end-to-end | `AbilityEffectHandler.test.ts` shield branch tests | 2/2 pass (shield_absorbed emitted) | PASS |
| MAINT-03: dispose removes listeners | `npx vitest run server/domains/index.test.ts` | 3/3 pass; listener counts return to 0 | PASS |
| MAINT-03: handler unit tests | `npx vitest run server/websocket.handlers.test.ts` | 10/10 pass | PASS |
| Full suite | `npm test` | 909/909 pass | PASS |

---

## Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|---|---|---|---|---|
| MAINT-01 | 48-01 | Constructable GameStateManager + public handleVotingTimeout | SATISFIED | Verified in code and live test run |
| MAINT-02 | 48-02 | First-class damageInterceptor, 7 call sites, no monkey-patch | SATISFIED | No monkey-patch found; 7 call sites confirmed; interceptor in prod construction |
| MAINT-03 | 48-03 | wireDomains factory + makeMockSocket + extracted handler tests | SATISFIED | Factory at index.ts L432; makeMockSocket at server/test/; 10 handler tests pass |

---

## Human Verification Required

None. All phase behaviors have automated verification by design.

---

## Gaps Summary

No gaps. All 4 roadmap success criteria are verified against live code. The `MaxListenersExceededWarning` is a pre-existing cosmetic warning that predates Phase 48 and is not a regression.

---

_Verified: 2026-06-22T19:50:00Z_
_Verifier: Claude (gsd-verifier)_
