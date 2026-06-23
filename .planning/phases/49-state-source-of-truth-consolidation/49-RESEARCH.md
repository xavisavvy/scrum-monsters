# Phase 49: State Source-of-Truth Consolidation — Research

**Researched:** 2026-06-22
**Domain:** Client Zustand store selectors + server domain-manager boss HP ownership + client team derivation helper
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAINT-04 | `withTeamsDerived(lobby)` recomputes `teams` from `players`, threaded through EVERY player-mutating `setLobby` — including the unmirrored `session:avatar_selected` and `session:host_changed` — closing the `team_changed` push-before-map bug; unit test + regression test | Fully mapped — all `setLobby` call sites enumerated below with team-update status; push-before-map bug root cause confirmed at `eventHandlers.ts:152-154` |
| MAINT-05 | `CombatManager` becomes single boss-HP truth via `applyBasicDamageToBoss`; `gameState.attackBoss` delegates to it; basic attacks trigger `checkPhaseTransition`; remove manual `eventBus.emit('combat:boss_damaged')` at `websocket.ts:1104` | Both HP pools confirmed; `CombatManager.playerAttackBoss` already calls `checkPhaseTransition` at L569; the canonical method to expose is `playerAttackBoss` (renamed or aliased as `applyBasicDamageToBoss`) |
| MAINT-06 | Hot battle components use field-scoped Zustand selectors (scalar primitives; `useShallow` for multi-field destructures); `PlayerCharacter` + `PlayerController` whole-store subscriptions fixed; `React.memo` can bail out; perf guardrail: single boss hit does not re-render whole battle tree | `PlayerCharacter.tsx:59` and `PlayerController.tsx:20` both use bare `useGameState()` — confirmed whole-store subscription; `useShallow` not yet used anywhere in the project (zero hits); `PlayerController` not wrapped in `React.memo` |

</phase_requirements>

---

## Summary

Phase 49 closes three correctness and performance gaps that stem from the same root cause: multiple data owners that diverge under concurrent writes.

**MAINT-04 (team staleness):** The `Lobby` type holds both `players: Player[]` and `teams: Record<TeamType, Player[]>`. The server derives `teams` correctly in `SessionManager.updateTeamAssignments()` and includes teams in the full lobby push. On the client, 10+ `setLobby` handlers spread-update the lobby without recomputing `teams`, and two specific handlers (`session:avatar_selected`, `session:host_changed`) skip the team mirror entirely. The `session:team_changed` handler has a push-before-map bug: it pushes the stale player object (old team still set) into `teams[newTeam]`. The fix is a `withTeamsDerived(lobby): Lobby` helper that recomputes `teams` from `players` every time — called as the last step inside every `setLobby` on the client.

**MAINT-05 (boss HP zombie state):** `gameState.attackBoss()` (`server/gameState.ts:1801`) drains `lobby.boss.currentHealth` directly and never calls `checkPhaseTransition`. `CombatManager.playerAttackBoss()` (`server/domains/CombatManager.ts:531`) drains a separate `combatState.boss.hp` pool and already calls `checkPhaseTransition` at L569. The fix is: rename/expose `playerAttackBoss` as `applyBasicDamageToBoss`, route `attackBoss` through it, and remove the manual `eventBus.emit('combat:boss_damaged')` at `websocket.ts:1104` (which would otherwise double-emit since `playerAttackBoss` already emits at CombatManager L555).

**MAINT-06 (render-tree re-renders):** Both `PlayerCharacter` and `PlayerController` call `useGameState()` with no selector — a whole-store subscription that re-renders on every `set()` call anywhere in the store. Every basic attack calls `setLobby`, which triggers a full boss-HP update in the store, re-rendering BOTH components even if their relevant state didn't change. `PlayerController` has no `React.memo` wrapper. The fix uses field-scoped selectors (scalar primitives extracted by selector function) and `useShallow` only where multiple fields are needed.

**Primary recommendation:** Implement in three independent waves (MAINT-04 client-only, MAINT-05 server-only, MAINT-06 client-only). No wave depends on another at the code level; they can be executed in parallel by different plan files.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Team derivation (`withTeamsDerived`) | Browser / Client | — | `teams` is a client-side derived projection; server sends it once in full-state push; client must keep it in sync on fine-grained updates |
| Boss HP single truth (`applyBasicDamageToBoss`) | API / Backend | — | CombatManager owns all combat state; gameState.attackBoss is a legacy shim in the unfinished migration; consolidate ownership in CombatManager |
| Phase transition check (`checkPhaseTransition`) | API / Backend | — | Boss phase 2/enrage logic is server-authoritative; must fire on every HP drain regardless of source |
| Field-scoped selectors (MAINT-06) | Browser / Client | — | Zustand subscription scoping is a React rendering concern; no server changes needed |

---

## Standard Stack

### Core (all pre-existing — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | ^5.0.13 [VERIFIED: package.json] | Client state management | Project's single client store framework |
| zustand/react/shallow | (bundled with zustand 5) [VERIFIED: node_modules/zustand/react/shallow.js confirmed] | Shallow equality for multi-field selectors | Official Zustand API; `useShallow` re-exports `shallow` equality check; only for multi-field destructures |
| Vitest | (pre-existing) [VERIFIED: 909/909 tests pass in Phase 48] | Test runner | Project standard |
| @testing-library/react | ^16.3.2 [VERIFIED: package.json] | Component render testing for MAINT-06 render-count test | Project standard; `render` + `act` pattern already used in `PlayerCharacter.test.tsx` |

### No New Packages

Zero `npm install` commands for this phase. All changes are TypeScript source edits.

---

## Package Legitimacy Audit

No packages installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram — Team Derivation (MAINT-04)

```
[server: SessionManager.updateTeamAssignments()]
   |  derives teams = filter(players) — server canonical
   v
[eventBus → ClientEventEmitter → socket.emit(session:team_changed, ...)]
   |  payload: { playerId, oldTeam, newTeam } — no team arrays sent
   v
[client: eventHandlers.ts session:team_changed handler]
   |  currently: push stale player → teams[newTeam] (push-before-map bug)
   |  target: withTeamsDerived({ ...lobby, players: [...updated...] })
   v
[useGameState.setLobby(lobby)]  -- single truth of client lobby state
   |  all reads from currentLobby.teams[X] are correct because
   |  withTeamsDerived re-derived from players[]
   v
[BattleScreen / Discussion.tsx / lobby roster consumers]
```

### System Architecture Diagram — Boss HP Single Truth (MAINT-05)

```
CURRENT (two pools, broken phase transitions):
  [attack_boss handler: websocket.ts:1083]
     |  calls gameState.attackBoss(playerId, damage)
     v
  [gameState.ts:1801 attackBoss — drains lobby.boss.currentHealth]
     |  NO checkPhaseTransition call
     |  returns { lobby, bossHealth }
     |
  [websocket.ts:1104 — manual eventBus.emit('combat:boss_damaged')]
     |  also triggers onBossDamagedBuff listener in wireDomains
     |  also triggers ClientEventEmitter → clients get combat:boss_damaged

  SEPARATELY:
  [CombatManager.playerAttackBoss — drains combatState.boss.hp]
     |  called only from ability/combo paths
     |  DOES call checkPhaseTransition at L569

TARGET (single truth):
  [attack_boss handler: websocket.ts:1083]
     |  reads socket.data.lobbyId (available from create_lobby at L436)
     v
  [gameState.attackBoss delegates to combatManager.applyBasicDamageToBoss(lobbyId, playerId)]
     v
  [CombatManager.applyBasicDamageToBoss (= renamed playerAttackBoss)]
     |  drains combatState.boss.hp
     |  calls checkPhaseTransition at L569
     |  emits combat:boss_damaged at L555  <-- single authoritative emit
     v
  [REMOVE websocket.ts:1104 manual emit — no longer needed]
     |
  [gameState.attackBoss still returns { lobby, bossHealth, ringAttack, healedBoss, modifier }]
     |  bossHealth now read from combatManager (single truth)
     |  lobby.boss.currentHealth updated as projection (read from CombatManager)
```

### System Architecture Diagram — Scoped Selectors (MAINT-06)

```
CURRENT:
  [PlayerCharacter — useGameState()]   <-- whole-store sub
  [PlayerController — useGameState()]  <-- whole-store sub
     |  ANY setLobby anywhere → both components re-render
     |  PlayerController has no React.memo → always re-renders

TARGET:
  [PlayerCharacter]
     | useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]?.hp)
     | useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]?.maxHp)
     | useGameState(useShallow(s => ({ attackAnimations: s.attackAnimations })))
     |  only re-renders when hp, maxHp, or attackAnimations changes

  [PlayerController — wrapped in React.memo]
     | useGameState(s => s.currentPlayer?.id)
     | useGameState(s => s.currentPlayer?.team)
     | useGameState(s => s.currentPlayer?.avatar)
     | useGameState(s => s.currentLobby?.id)
     | useGameState(s => s.currentLobby?.gamePhase)
     | useGameState(s => s.addAttackAnimation)  -- stable fn ref (Zustand guarantees)
     | useGameState(s => s.currentLobby?.playerPositions?.[playerId])
     |  only re-renders when one of those scalars changes
```

### Recommended Project Structure (files touched)

```
client/src/lib/socket/
├── eventHandlers.ts           # MAINT-04: thread withTeamsDerived through all setLobby calls
client/src/lib/
├── withTeamsDerived.ts        # MAINT-04: new helper file (pure function)
├── withTeamsDerived.test.ts   # MAINT-04: unit test
server/
├── gameState.ts               # MAINT-05: attackBoss delegates to combatManager
├── domains/
│   └── CombatManager.ts       # MAINT-05: add/expose applyBasicDamageToBoss method
├── websocket.ts               # MAINT-05: remove manual eventBus.emit at L1104
client/src/components/game/
├── PlayerCharacter.tsx        # MAINT-06: replace whole-store sub with scoped selectors
├── PlayerCharacter.test.tsx   # MAINT-06: add render-count regression test
├── PlayerController.tsx       # MAINT-06: replace whole-store sub; add React.memo
```

---

## MAINT-04: Team Derivation — Complete Code Map

### Where `teams` lives

- `shared/gameEvents.ts:62` — `Lobby` interface: `teams: Record<TeamType, Player[]>`
- `shared/gameEvents.ts:61` — `players: Player[]` (the authoritative source)
- Server derives teams: `SessionManager.ts:690-696` — `updateTeamAssignments()` filters players by `team` field
- Server derives teams before emitting `session:team_changed` at `SessionManager.ts:584`
- Server does NOT include full `teams` in `session:team_changed` payload (payload is `{ playerId, oldTeam, newTeam }`)

### All client `setLobby` sites — team mirror status

| Handler | File:Lines | Players updated? | Teams updated? | Bug? |
|---------|-----------|-----------------|----------------|------|
| `session:player_joined` | eventHandlers.ts:26-86 | YES (pushes new player) | PARTIAL — pushes player into `teams[team]` but player object has old team value (same push-before-map issue if avatar not yet picked) | LOW RISK |
| `session:player_left` | eventHandlers.ts:72-87 | YES (filters out player) | YES — filters all three teams | OK |
| `session:host_changed` | eventHandlers.ts:91-108 | YES (maps isHost flag) | **NO** — teams NOT updated | **BUG: staleness** |
| `session:phase_changed` | eventHandlers.ts:111-135 | NO | NO | Not a player mutation — OK |
| `session:team_changed` | eventHandlers.ts:138-166 | YES (maps team field) | **PUSH-BEFORE-MAP BUG** at L152-154 | **BUG: stale player object in teams[newTeam]** |
| `session:avatar_selected` | eventHandlers.ts:169-197 | YES (maps avatar/avatarClass/hasSelectedAvatar) | **NO** — teams NOT updated | **BUG: staleness** |
| `session:tickets_updated` | eventHandlers.ts:206-215 | NO | NO | Not a player mutation — OK |
| `session:player_ready_changed` | eventHandlers.ts:218-233 | YES (maps isReady) | **NO** — teams NOT updated | Low-risk: isReady not displayed from teams[*] |
| `session:lobby_renamed` | eventHandlers.ts:235-244 | NO | NO | Not a player mutation — OK |
| `session:settings_updated` | eventHandlers.ts:247-261 | NO | NO | Not a player mutation — OK |
| `session:game_reset` | eventHandlers.ts:264-272 | full replace | YES (full lobby replace) | OK — server provides complete lobby |
| `session:ticket_advanced` | eventHandlers.ts:275-303 | YES (maps hasSubmittedScore/currentScore) | **NO** — teams NOT updated | Low-risk: score reset not read from teams |
| `estimation:vote_cast` | eventHandlers.ts:310+ | YES (maps currentScore) | PARTIAL — L519-522 mirrors scores into teams | CHECK: uses spread-update, could carry stale team assignments |
| `estimation:scores_revealed` | eventHandlers.ts:333-366 | YES (maps currentScore) | YES (re-derives teams from players) | Correctly calls `.map()` on players then mirrors to teams |
| `combat:boss_damaged` | eventHandlers.ts:546-553 | NO | NO | Not a player mutation — OK |
| `combat:boss_healed` | eventHandlers.ts:563+ | NO | NO | Not a player mutation — OK |

**Critical bugs requiring fix:**
1. `session:host_changed` (L91-108): maps `isHost` on `players` but never updates `teams` → any consumer of `teams[*].find(p => p.isHost)` gets stale
2. `session:avatar_selected` (L169-197): maps `avatar/avatarClass/hasSelectedAvatar` on `players` but never updates `teams` → avatar display in any team-keyed render is stale
3. `session:team_changed` (L138-166): **push-before-map bug** at L152-154: `currentLobby.players.find(p => p.id === data.playerId)!` finds the player BEFORE the `players.map()` above has been applied to it — the found object still has `team: data.oldTeam`, so `teams[newTeam]` receives a player record claiming to be on the old team

### The push-before-map bug — root cause

```typescript
// eventHandlers.ts:145-157 (CURRENT — BUGGY)
const updatedLobby = {
  ...currentLobby,
  players: currentLobby.players.map(p =>          // ← creates NEW array with updated player
    p.id === data.playerId ? { ...p, team: data.newTeam as TeamType } : p
  ),
  teams: {
    ...currentLobby.teams,
    [data.newTeam]: [
      ...(currentLobby.teams[data.newTeam as TeamType] || []),
      currentLobby.players.find(p => p.id === data.playerId)!  // ← reads from OLD players[], still has oldTeam
    ].filter(p => p),
    [data.oldTeam]: currentLobby.teams[data.oldTeam as TeamType]?.filter(p => p.id !== data.playerId) || []
  }
};
// Result: teams[newTeam] contains a player with .team === oldTeam
//         players[] has the player with .team === newTeam
//         DIVERGENCE IS IMMEDIATE
```

### `withTeamsDerived` — target implementation

```typescript
// client/src/lib/withTeamsDerived.ts  (NEW FILE)
import { Lobby, TeamType } from '@shared/gameEvents';

const TEAM_TYPES: TeamType[] = ['developers', 'qa', 'spectators'];

/**
 * Returns a new Lobby with `teams` recomputed from `players`.
 * Thread through EVERY setLobby that mutates players to close
 * the team-staleness bugs (MAINT-04).
 */
export function withTeamsDerived(lobby: Lobby): Lobby {
  const teams = {} as Record<TeamType, typeof lobby.players>;
  for (const t of TEAM_TYPES) {
    teams[t] = lobby.players.filter(p => p.team === t);
  }
  return { ...lobby, teams };
}
```

**Unit test target (pure function — no mocks needed):**
```typescript
// client/src/lib/withTeamsDerived.test.ts (NEW FILE)
import { withTeamsDerived } from './withTeamsDerived';

it('recomputes teams from players on team change', () => {
  const lobby = makeLobby([
    { id: 'p1', team: 'developers' },
    { id: 'p2', team: 'qa' },
  ]);
  // Simulate a player switching teams in players[] without teams[] being updated
  const updated = withTeamsDerived({
    ...lobby,
    players: lobby.players.map(p => p.id === 'p1' ? { ...p, team: 'qa' } : p)
  });
  expect(updated.teams.qa.map(p => p.id)).toContain('p1');
  expect(updated.teams.developers.map(p => p.id)).not.toContain('p1');
});

it('closes the push-before-map bug: teams[newTeam] player has correct team field', () => {
  const lobby = makeLobby([{ id: 'p1', team: 'developers' }]);
  const result = withTeamsDerived({
    ...lobby,
    players: lobby.players.map(p => p.id === 'p1' ? { ...p, team: 'qa' } : p)
  });
  expect(result.teams.qa[0].team).toBe('qa');  // was 'developers' in bug
});
```

**Regression test — `session:team_changed` handler:**
```typescript
// In a new describe block in eventHandlers.test.ts or a new file
it('session:team_changed: teams[newTeam] player has newTeam, not oldTeam (MAINT-04 regression)', () => {
  // Set up lobby in store with p1 as developer
  useGameState.setState({ currentLobby: makeLobby([{ id: 'p1', team: 'developers' }]) });
  // Fire the handler event
  handlers.get('session:team_changed')!({ playerId: 'p1', oldTeam: 'developers', newTeam: 'qa', seq: 1, timestamp: Date.now() });
  const lobby = useGameState.getState().currentLobby!;
  // teams[qa] should contain p1 with .team === 'qa', not 'developers'
  const p1InQa = lobby.teams.qa.find(p => p.id === 'p1');
  expect(p1InQa).toBeDefined();
  expect(p1InQa!.team).toBe('qa');
});
```

### Threading strategy

The safest strategy is to wrap `useGameState.setLobby` itself:

```typescript
// In useGameState.tsx — change setLobby to always derive teams:
setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) }),
```

This is **a single-site change** that makes it impossible to call `setLobby` with stale teams. All handlers automatically benefit — no individual handler needs to be updated. However, it has one edge case: `session:game_reset` and `session:lobby_sync` pass full lobbies from the server (teams already correct). `withTeamsDerived` is idempotent in that case (recomputes the same result), so wrapping `setLobby` is safe for all callers.

**Alternative (explicit threading):** Call `withTeamsDerived(...)` inside each handler before calling `setLobby`. More lines changed, higher risk of missing one. The store-level approach is strictly safer.

---

## MAINT-05: Boss HP Single Truth — Complete Code Map

### Current two-pool divergence

| Pool | Location | Owner | Drains On | Triggers checkPhaseTransition? |
|------|----------|-------|-----------|-------------------------------|
| `lobby.boss.currentHealth` | `server/gameState.ts:1828` | `GameStateManager.attackBoss()` | basic attack | **NO** |
| `combatState.boss.hp` | `server/domains/CombatManager.ts:552` | `CombatManager.playerAttackBoss()` | ability/combo paths only | YES (L569) |

**Live bug:** A basic attack that zeroes `lobby.boss.currentHealth` sets `lobby.boss.defeated = true` (gameState.ts:1833-1835) and the game appears to end. But `CombatManager`'s `combatState.boss.hp` is never drained by basic attacks, so `checkPhaseTransition` is never called from basic attacks. At 67% HP crossed via basic attacks: no phase-2 transition. At 34% HP: no enrage. The boss can be in a "zombie" state where `currentHealth = 0, defeated = true` but `combatState.boss.hp` is still full — future ability paths then re-damage a "dead" boss.

### `gameState.attackBoss` full flow (server/gameState.ts:1801-1856)

```
1. getLobbyByPlayerId(playerId)
2. Guard: lobby exists, boss exists, gamePhase === 'battle'
3. Guard: boss not already defeated
4. player.team === 'spectators'? → heal boss (currentHealth += 1+modifier)
5. player.team === 'developers'|'qa'? → actualDamage = max(1, 15 - modifier); currentHealth -= actualDamage
6. if currentHealth <= 0 → boss.defeated = true
7. Ring attack check (random + low HP)
8. return { lobby, bossHealth: lobby.boss.currentHealth, ringAttack, healedBoss, modifier }
```

**After delegation to `CombatManager.applyBasicDamageToBoss`:**
- CombatManager owns the HP drain (step 5), the emit, and the phase transition
- `attackBoss` still handles: spectator-heals (emit `combat:boss_healed`), ring-attack creation, modifier calculation, lobby-phase guard
- `lobby.boss.currentHealth` becomes a **projection** read from CombatManager after the call

### `CombatManager.playerAttackBoss` (server/domains/CombatManager.ts:531-610)

```
1. combatStates.get(lobbyId) → combatState + boss
2. Guard: combatState exists, boss exists
3. Guard: player is 'fighting' (not downed)
4. Compute damage: baseDamage * battleModifier (class-aware, mastery-aware)
5. boss.hp = max(0, boss.hp - damage)
6. eventBus.emit('combat:boss_damaged', { lobbyId, playerId, damage, bossHealth: boss.hp })
7. bossAI.recordThreat + bossAI.checkPhaseTransition(boss.hp, boss.maxHp)
8. If transitioned: emit 'combat:boss_phase_transition' + 'combat:boss_enraged' (phase 2+)
9. If boss.hp <= 0: emit 'combat:boss_defeated'
10. return damage
```

**Key observation:** `playerAttackBoss` has its own damage formula (class-based, mastery-multiplied, battleModifier-scaled). `attackBoss` uses a simpler fixed formula (15 - modifier). After delegation, `attackBoss`'s damage parameter can be dropped (CombatManager computes it) — this is a behavior change that makes basic attacks consistent with ability damage scaling. The `_damage` parameter on `attackBoss` is already prefixed with `_` (intentional skip) per the review council note.

### Delegation interface — `applyBasicDamageToBoss`

The cleanest approach is to **expose** the existing `playerAttackBoss` under the name `applyBasicDamageToBoss` (either rename or add a public alias). The return value changes: currently `playerAttackBoss` returns `number` (damage dealt). `attackBoss` needs `bossHealth` (new HP) to populate the return struct and drive the ring-attack check. Options:

**Option A — rename `playerAttackBoss` → `applyBasicDamageToBoss`**
- Add return field: `{ damage: number; newHp: number }` instead of bare `number`
- `attackBoss` reads `newHp` from result for `bossHealth` field

**Option B — add alias / thin wrapper**
- `applyBasicDamageToBoss(lobbyId, playerId): number` calls `playerAttackBoss`
- `attackBoss` calls combatManager, reads `combatState.boss.hp` after for `bossHealth`

Option A is cleaner (one rename, richer return type). Option B avoids renaming an existing method that may have future callers.

**Recommended: Option A** — rename to `applyBasicDamageToBoss`, return `{ damage: number; newHp: number }`.

### The double-emit — who listens to `combat:boss_damaged`

The manual emit at `websocket.ts:1104` fires `combat:boss_damaged` on the eventBus. Listeners:
1. `ClientEventEmitter` (server/events/ClientEventEmitter.ts:218) — bridges to Socket.IO clients as `combat:boss_damaged` wire event
2. `wireDomains.onBossDamagedBuff` (server/domains/index.ts:523) — applies `damage_boost` bonus damage to boss

If the manual emit is NOT removed and `CombatManager.playerAttackBoss` still emits `combat:boss_damaged`, EVERY basic attack fires the event TWICE:
- Double XP award (if any listener awards XP on this event)
- Double `damage_boost` bonus damage application (`onBossDamagedBuff` fires twice)
- Double HP update sent to clients
- `ClassMasteryManager` (server/domains/ClassMasteryManager.ts:75) listens to `combat:boss_damaged` for class XP — would award XP twice per basic attack

**The manual emit at `websocket.ts:1104` MUST be removed when delegating.** The `CombatManager.playerAttackBoss` emit is the canonical one.

### Ring attack — needs special handling

`attackBoss` currently creates ring attacks at `gameState.ts:1837-1847`. This logic reads `lobby.boss.currentHealth` (the pool being replaced). After delegation, ring attack creation must read from `CombatManager` state OR remain in `attackBoss` using `result.newHp` from the delegated call.

**Recommendation:** Keep ring-attack logic in `attackBoss` using the `newHp` returned from `applyBasicDamageToBoss`. Ring attacks are a spectacle feature, not a correctness concern.

### Spectator heal — NOT delegated

`attackBoss` spectator path (gameState.ts:1819-1824) currently heals `lobby.boss.currentHealth`. After delegation, this must also go through CombatManager (or update both pools). The review council says: "STOP before battle methods" for the GameState decommission — this spectator path can remain in `attackBoss` for now but must update `combatState.boss.hp` too, or be delegated similarly. **Scope boundary: MAINT-05 only requires the basic-attack path (dev/qa teams); spectator-heal delegation is Phase 49+.**

### Phase-transition test via wireDomains/makeMockSocket seam

```typescript
// server/gameState.test.ts — new describe block using Phase 48 seams
import { GameStateManager } from './gameState';
import { wireDomains } from './domains/index';
import { ScopedEventBus } from './events/EventBus';
import { makeMockSocket } from './test/makeMockSocket';

it('basic attack triggers checkPhaseTransition when HP crosses 67% threshold (MAINT-05 regression)', () => {
  const eventBus = new ScopedEventBus();
  // Use GameStateManager seam from Phase 48
  const gs = new GameStateManager(undefined, { startWatchdogs: false });

  // Set up a lobby with a boss near 67% HP threshold
  // ... use gs.createLobby, wire combatManager ...

  // Emit attack_boss equivalent
  gs.attackBoss(playerId, damage);

  // Assert: combat:boss_phase_transition was emitted
  expect(phaseTransitionEmitted).toBe(true);
});
```

In practice, the delegation means `GameStateManager.attackBoss` must have a reference to `combatManager`. The current `gameState.ts` singleton imports `combatManager` from `domains/index`. A test must either use the production singleton (not ideal) or inject `combatManager` into `GameStateManager`. **Simpler approach:** Test `CombatManager.applyBasicDamageToBoss` directly for phase transitions (unit test), and test the `websocket.ts` attack_boss handler via `handleAttackBoss(socket, deps)` extracted function (if extracted in this phase, following the Phase 48 pattern).

---

## MAINT-06: Scoped Selectors — Complete Code Map

### Current subscription pattern

**`PlayerCharacter.tsx:59`:**
```typescript
const { currentLobby, attackAnimations } = useGameState();
```
This is a bare `useGameState()` call with no selector. Zustand v5 behavior: the component subscribes to the entire store and re-renders on ANY state change. `currentLobby` is a spread-replaced object on EVERY `setLobby()` call — strict equality always fails, so the `currentLobby` selector always fires. Every basic attack causes `setLobby` (boss HP update) → `PlayerCharacter` re-renders even if `playerCombatStates[playerId].hp` and `maxHp` didn't change.

**`PlayerController.tsx:20`:**
```typescript
const { currentPlayer, currentLobby, addAttackAnimation } = useGameState();
```
Same whole-store subscription. Additionally, `PlayerController` has **no `React.memo` wrapper** (confirmed at line 19: `export function PlayerController`), so parent re-renders always cascade.

### Fields actually needed

**`PlayerCharacter`** reads:
- `currentLobby.playerCombatStates?.[playerId]?.hp` (scalar) → health bar + flash trigger
- `currentLobby.playerCombatStates?.[playerId]?.maxHp` (scalar) → health percentage
- `attackAnimations` (array — needs length/identity check, not deep equality)

**`PlayerController`** reads:
- `currentPlayer.id` (scalar) — for position sync, targeting
- `currentPlayer.team` (scalar) — spectator vs dev/qa shoot direction
- `currentPlayer.avatar` (scalar) — projectile emoji
- `currentLobby.id` (scalar) — used in sync effect dep
- `currentLobby.gamePhase` (scalar) — not used directly in render but in effects
- `currentLobby.playerPositions?.[currentPlayer.id]` (object) — initial sync only
- `addAttackAnimation` (function) — Zustand actions are stable references (guaranteed by Zustand)

### Target selector pattern

**Zustand v5 canonical patterns (no `useShallow` needed for scalars):**

```typescript
// Scalar — re-renders ONLY when this scalar changes
const hp = useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]?.hp ?? 100);
const maxHp = useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]?.maxHp ?? 100);
```

**Multi-field — use `useShallow` to prevent object-identity re-renders:**

```typescript
import { useShallow } from 'zustand/react/shallow';

// Multi-field destructure — useShallow does shallow equality on the returned object
const { attackAnimations } = useGameState(
  useShallow(s => ({ attackAnimations: s.attackAnimations }))
);
```

**`useShallow` is available in zustand 5.0.13+** (confirmed: `node_modules/zustand/react/shallow.js` confirmed to export `useShallow`). Import path: `import { useShallow } from 'zustand/react/shallow'` [VERIFIED: node_modules/zustand/react/shallow.js].

### PlayerCharacter refactor

```typescript
// BEFORE:
const { currentLobby, attackAnimations } = useGameState();
const combatState = currentLobby && playerId ? currentLobby.playerCombatStates?.[playerId] : null;
const currentHp = combatState?.hp || 100;
const maxHp = combatState?.maxHp || 100;

// AFTER:
import { useShallow } from 'zustand/react/shallow';

const currentHp = useGameState(
  s => s.currentLobby?.playerCombatStates?.[playerId]?.hp ?? 100
);
const maxHp = useGameState(
  s => s.currentLobby?.playerCombatStates?.[playerId]?.maxHp ?? 100
);
const { attackAnimations } = useGameState(
  useShallow(s => ({ attackAnimations: s.attackAnimations }))
);
// Remove: const combatState = ...; const currentHp = ...; const maxHp = ...;
```

**Warning:** `PlayerCharacter` is already wrapped in `React.memo` at L40. After selector fix, `memo` can bail out on re-renders caused by other `setLobby` calls (e.g., boss HP changes for OTHER players). The selector ensures only HP changes for THIS player trigger re-renders.

### PlayerController refactor

```typescript
// BEFORE:
const { currentPlayer, currentLobby, addAttackAnimation } = useGameState();

// AFTER:
import { useShallow } from 'zustand/react/shallow';

// Scalars (separate selectors for maximum bail-out granularity):
const currentPlayerId = useGameState(s => s.currentPlayer?.id);
const currentPlayerTeam = useGameState(s => s.currentPlayer?.team);
const currentPlayerAvatar = useGameState(s => s.currentPlayer?.avatar);
const currentLobbyId = useGameState(s => s.currentLobby?.id);

// Multi-field object (useShallow):
const { addAttackAnimation } = useGameState(
  useShallow(s => ({ addAttackAnimation: s.addAttackAnimation }))
);

// PlayerPositions (needed only for initial sync — still safe to select):
const playerPositionFromServer = useGameState(
  useShallow(s => s.currentLobby?.playerPositions?.[currentPlayerId ?? ''])
);

// Wrap component:
export const PlayerController = React.memo(function PlayerController(...) { ... });
```

**Note on action selectors:** `addAttackAnimation` is a Zustand action — Zustand guarantees action functions are referentially stable between renders (they are defined in the `create` factory and not recreated). Selecting it via `useShallow` is defensive but fine. It could also be selected via a scalar selector `s => s.addAttackAnimation` and still be stable.

### Fresh-object-per-render traps to avoid

The perf guardian flagged: "Select scalar primitives, not object slices (`playerCombatStates` is spread anew on every `setLobby`, defeating strict-equality)."

Do NOT do:
```typescript
// BAD — creates a fresh object every render call, defeating strict-equality
const combatState = useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]);
// combatState is a new object reference every time setLobby fires, even if hp/maxHp unchanged
```

Do:
```typescript
// GOOD — scalars, strict-equality works
const hp = useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]?.hp ?? 100);
const maxHp = useGameState(s => s.currentLobby?.playerCombatStates?.[playerId]?.maxHp ?? 100);
```

### Render-count guardrail test

The acceptance criterion says "single boss hit must not re-render the whole battle tree." Test approach using `@testing-library/react` render spy:

```typescript
// PlayerCharacter.test.tsx — add to existing describe block:
it('does not re-render when an unrelated setLobby field changes (MAINT-06 perf guardrail)', () => {
  let renderCount = 0;

  // Wrap PlayerCharacter to count renders
  function TrackingWrapper(props: Parameters<typeof PlayerCharacter>[0]) {
    renderCount++;
    return <PlayerCharacter {...props} />;
  }

  const { rerender } = render(<TrackingWrapper {...baseProps} playerId="p1" />);
  const renderCountAfterMount = renderCount;

  // Trigger a setLobby that changes BOSS HP (unrelated to p1's combatState)
  act(() => {
    useGameState.setState(s => ({
      currentLobby: s.currentLobby ? {
        ...s.currentLobby,
        boss: { ...s.currentLobby.boss, currentHealth: 900 } // boss HP changed
      } : null,
    }));
  });

  // PlayerCharacter should NOT re-render (p1's hp/maxHp unchanged)
  expect(renderCount).toBe(renderCountAfterMount);

  // Now trigger a setLobby that changes p1's HP
  act(() => {
    useGameState.setState(s => ({
      currentLobby: s.currentLobby ? {
        ...s.currentLobby,
        playerCombatStates: { p1: { hp: 70, maxHp: 100 } }
      } : null,
    }));
  });

  // PlayerCharacter SHOULD re-render (p1's hp changed)
  expect(renderCount).toBe(renderCountAfterMount + 1);
});
```

**Note:** This test requires that `PlayerCharacter` uses scoped selectors (the MAINT-06 target). With the current whole-store subscription, the boss HP change would trigger a re-render and the test would fail (which is the point — it's a regression guard).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shallow equality for Zustand multi-field selectors | Custom comparator | `useShallow` from `zustand/react/shallow` | Official Zustand API; memoizes the selector output using shallow object comparison |
| Team derivation | Per-handler inline logic | `withTeamsDerived(lobby)` helper | Pure function; testable in isolation; single implementation ensures consistency |
| Phase transition logic | Duplicate in `attackBoss` | `CombatManager.applyBasicDamageToBoss` | Already implemented and tested in `playerAttackBoss`; duplication is the source of the bug |
| Render-count assertion | React DevTools profiler (manual) | `@testing-library/react` render spy counter | Automated; runs in CI; catches regressions without manual profiling |

**Key insight:** The team-staleness and boss-HP bugs both exist because the team was inconsistently maintaining invariants across multiple data owners. The fix in both cases is not more code — it's fewer owners.

---

## Runtime State Inventory

Not applicable. This is a pure code refactor. No stored data, live service config, OS-registered state, secrets, or build artifacts are renamed or mutated. `lobby.teams` is a runtime in-memory derived projection; no database fields are affected.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 49 has no external tool dependencies. All changes are TypeScript/TSX source edits within the existing project.

---

## Common Pitfalls

### Pitfall 1: `withTeamsDerived` NOT wrapped at `setLobby` — threading misses one handler
**What goes wrong:** If `withTeamsDerived` is threaded manually into each handler (rather than wrapping `setLobby` in the store), it is easy to miss one handler. Future handlers also won't get it automatically.
**Why it happens:** `setLobby` is called from ~14 distinct handler closures; each must explicitly call `withTeamsDerived(updatedLobby)`.
**How to avoid:** Wrap `setLobby` in `useGameState.tsx` instead: `setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) })`. One change, zero risk of missing a call site.
**Warning signs:** A handler that previously didn't update teams continues to show stale team data in the UI; `withTeamsDerived.test.ts` passes but regression test fails.

### Pitfall 2: Removing `combat:boss_damaged` manual emit without verifying CombatManager fires it
**What goes wrong:** If `CombatManager.applyBasicDamageToBoss` does NOT emit `combat:boss_damaged` (e.g., a code-path bug), removing the websocket.ts manual emit silently drops the client HP update signal.
**Why it happens:** Confidence that `playerAttackBoss` emits at L555 — but if the delegation path has a guard that returns early, the emit is skipped.
**How to avoid:** Add a regression test that asserts `combat:boss_damaged` is emitted when `applyBasicDamageToBoss` is called (via `wireDomains` seam). Verify `ClientEventEmitter.test.ts` still tests the `combat:boss_damaged` bridge.
**Warning signs:** After the change, boss HP bar on client never updates during basic attacks; `ClientEventEmitter.test.ts` bridge test would fail if the bridge registration were affected.

### Pitfall 3: Double-emit survives the refactor
**What goes wrong:** The manual `eventBus.emit('combat:boss_damaged')` at `websocket.ts:1104` is not removed, even though `applyBasicDamageToBoss` already emits it. Every basic attack fires `onBossDamagedBuff` twice (double damage-boost bonus), `ClassMasteryManager.handleBossDamaged` twice (double class XP), and clients receive `combat:boss_damaged` twice.
**Why it happens:** The developer adds the delegation but forgets to remove the old emit.
**How to avoid:** Include a test that counts `combat:boss_damaged` emissions per basic attack (exactly 1). The double-XP effect is testable via `ClassMasteryManager` tests.
**Warning signs:** Class XP awards double on basic attacks; damage-boost warriors deal double bonus damage; clients see two HP updates per click.

### Pitfall 4: `useShallow` imported from wrong path
**What goes wrong:** `import { useShallow } from 'zustand/shallow'` works for vanilla equality but is not the React-aware version. The React-specific hook with memoization is in `zustand/react/shallow`.
**Why it happens:** `zustand/shallow` re-exports both the vanilla `shallow` function AND `useShallow` (via `zustand/react/shallow`) — so the import works, but the version in `zustand/shallow` might be for vanilla stores.
**How to avoid:** Always import from `'zustand/react/shallow'` for React components.
**Warning signs:** No functional bug (both exports point to same function in zustand 5.x), but the import is non-canonical.

### Pitfall 5: `PlayerController` `React.memo` doesn't bail out due to inline object selectors
**What goes wrong:** After adding `React.memo`, if a prop passed to `PlayerController` is an object created inline by the parent, `memo` never bails out regardless of selectors.
**Why it happens:** `PlayerController`'s single prop is `onPlayerPositionsUpdate?: (positions: Record<string, { x, y }>) => void`. If this callback is defined inline in the parent, it's a new reference every render.
**How to avoid:** Callers of `PlayerController` should wrap `onPlayerPositionsUpdate` in `useCallback`. Document this in `PlayerController`'s prop interface comment.
**Warning signs:** React DevTools profiler shows `PlayerController` re-rendering on parent renders despite `React.memo`.

### Pitfall 6: `attackBoss` boss HP projection — spectator-heal path skipped
**What goes wrong:** After delegation, `lobby.boss.currentHealth` is only updated via the dev/qa path. The spectator-heal path still writes `lobby.boss.currentHealth` directly but doesn't update `combatState.boss.hp` — so after a spectator heal, the two pools diverge again.
**Why it happens:** MAINT-05 scope only covers the basic-attack delegation; spectator-heal delegation is deferred.
**How to avoid:** After the basic-attack delegation, add a comment in `attackBoss` marking the spectator-heal path as a known divergence — intentional deferral. Don't silently leave it.
**Warning signs:** After a spectator heal, `bossAI.checkPhaseTransition` sees different HP than `lobby.boss.currentHealth` — future ability attacks may fire phase transitions at wrong times.

### Pitfall 7: Render-count test brittle due to strict mode double-invocation
**What goes wrong:** React 18 StrictMode double-invokes render functions, inflating render counts in dev. The render-count test passes in CI (no StrictMode) but gives wrong counts in local dev.
**Why it happens:** `@testing-library/react` v16 wraps in `StrictMode` by default.
**How to avoid:** Configure the render wrapper without StrictMode for render-count tests, or use a production-mode Vitest config. The existing `PlayerCharacter.test.tsx` tests use `render` without issues — check if the project's `vitest.config.ts` or test setup disables StrictMode.
**Warning signs:** render count is double the expected value in local dev.

---

## Code Examples

### Example 1: `withTeamsDerived` usage (MAINT-04)

```typescript
// client/src/lib/stores/useGameState.tsx — single-site change [ASSUMED: simplest threading]
import { withTeamsDerived } from '../withTeamsDerived';

// Inside create():
setLobby: (lobby) => set({ currentLobby: withTeamsDerived(lobby) }),
```

### Example 2: CombatManager `applyBasicDamageToBoss` (MAINT-05)

```typescript
// server/domains/CombatManager.ts — rename + richer return
/**
 * Basic attack on boss (from attack_boss socket event via gameState.attackBoss delegate).
 * Single authoritative HP drain for basic attacks — replaces gameState.attackBoss HP write.
 * Emits combat:boss_damaged and calls checkPhaseTransition.
 * Previously named playerAttackBoss (MAINT-05).
 */
applyBasicDamageToBoss(lobbyId: string, playerId: string): { damage: number; newHp: number } {
  // ... existing playerAttackBoss body unchanged ...
  return { damage, newHp: boss.hp };  // extend return
}
```

### Example 3: `gameState.attackBoss` delegation (MAINT-05)

```typescript
// server/gameState.ts attackBoss — delegation path (dev/qa players only)
} else if (player.team === 'developers' || player.team === 'qa') {
  // Delegate to CombatManager — single boss-HP truth (MAINT-05)
  const { damage: actualDamage, newHp } = combatManager.applyBasicDamageToBoss(lobby.id, playerId);
  lobby.boss.currentHealth = newHp;  // projection only
  if (newHp <= 0) {
    lobby.boss.defeated = true;
  }
  // Ring attack still computed here using updated currentHealth:
  actualDamage;  // used in log below
}
// REMOVE the manual eventBus.emit('combat:boss_damaged') that follows
```

### Example 4: Scoped selector pattern (MAINT-06) [VERIFIED: zustand/react/shallow.js]

```typescript
// client/src/components/game/PlayerCharacter.tsx (after fix)
import { useShallow } from 'zustand/react/shallow';

// Inside PlayerCharacter component (has playerId prop):
const currentHp = useGameState(
  s => s.currentLobby?.playerCombatStates?.[playerId ?? '']?.hp ?? 100
);
const maxHp = useGameState(
  s => s.currentLobby?.playerCombatStates?.[playerId ?? '']?.maxHp ?? 100
);
const { attackAnimations } = useGameState(
  useShallow(s => ({ attackAnimations: s.attackAnimations }))
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `lobby_updated` full-state push | Fine-grained domain events (`session:*`, `combat:*`, `estimation:*`) | Phase 42-02b | Handlers now own their own team-mirror logic — divergence possible if any handler is incomplete |
| Module-scope monkey-patch of CombatManager | Constructor-injected `damageInterceptor` | Phase 48 (MAINT-02) | CombatManager damage path now testable in isolation |
| GameState singleton (not exportable) | `export class GameStateManager` | Phase 48 (MAINT-01) | Attack-boss delegation can be unit-tested via constructable instance |
| `wireDomains` module-scope listeners | `wireDomains(ctx): { dispose() }` factory | Phase 48 (MAINT-03) | Server handler tests can wire/unwire without listener leaks |

**Deprecated/outdated after Phase 49:**
- Per-handler manual team mirroring in `eventHandlers.ts` — replaced by `withTeamsDerived` at `setLobby`
- `lobby.boss.currentHealth` as writable HP pool — replaced by read-only projection from CombatManager
- Whole-store `useGameState()` in `PlayerCharacter` and `PlayerController` — replaced by scoped selectors

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (pre-existing; 909/909 tests pass as of Phase 48) |
| Config file | `vitest.config.ts` |
| Quick run (MAINT-04) | `npx vitest run client/src/lib/withTeamsDerived.test.ts client/src/lib/socket/eventHandlers.test.ts` |
| Quick run (MAINT-05) | `npx vitest run server/domains/CombatManager.test.ts server/gameState.test.ts` |
| Quick run (MAINT-06) | `npx vitest run client/src/components/game/PlayerCharacter.test.tsx` |
| Full suite | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAINT-04a | `withTeamsDerived` recomputes teams correctly | unit | `npx vitest run client/src/lib/withTeamsDerived.test.ts` | ❌ Wave 0 |
| MAINT-04b | `withTeamsDerived` closes push-before-map: teams[newTeam] player has correct `.team` | unit | same as above | ❌ Wave 0 |
| MAINT-04c | `session:team_changed` handler: teams[newTeam] player carries `newTeam` value | regression | `npx vitest run client/src/lib/socket/eventHandlers.test.ts` | ✅ (add to existing or create new describe block) |
| MAINT-04d | `session:avatar_selected` handler: teams reflect updated avatar | regression | same | ✅ (add to existing) |
| MAINT-04e | `session:host_changed` handler: teams reflect updated isHost | regression | same | ✅ (add to existing) |
| MAINT-05a | `CombatManager.applyBasicDamageToBoss` emits `combat:boss_damaged` exactly once per call | unit | `npx vitest run server/domains/CombatManager.test.ts` | ✅ (add describe block) |
| MAINT-05b | `CombatManager.applyBasicDamageToBoss` calls `checkPhaseTransition` | unit | same | ✅ (add describe block) |
| MAINT-05c | Basic attack via `gameState.attackBoss` triggers `combat:boss_phase_transition` when HP crosses 67% | regression | `npx vitest run server/gameState.test.ts` | ✅ (add describe block using Phase 48 seams) |
| MAINT-05d | No double `combat:boss_damaged` per basic attack (listener fires exactly once) | regression | `npx vitest run server/gameState.test.ts` | ✅ (add assertion) |
| MAINT-06a | `PlayerCharacter` does NOT re-render when boss HP changes (unrelated `setLobby`) | perf regression | `npx vitest run client/src/components/game/PlayerCharacter.test.tsx` | ✅ (add to existing test file) |
| MAINT-06b | `PlayerCharacter` DOES re-render when player's own hp changes | behavior | same | ✅ (already tested by existing damage-flash tests) |
| MAINT-06c | Full suite stays green | integration | `npm test` | ✅ |

### Sampling Rate

- **Per task commit:** `npm test` (runs in ~8-10 seconds; full suite)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (`npm test` — 909+ tests, 0 failures) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `client/src/lib/withTeamsDerived.ts` — new helper (MAINT-04a, 04b)
- [ ] `client/src/lib/withTeamsDerived.test.ts` — unit tests (MAINT-04a, 04b)
- [ ] `client/src/lib/socket/eventHandlers.test.ts` — new describe block for MAINT-04 regression tests (04c, 04d, 04e) — file may already exist; check
- [ ] Render-count test block in `client/src/components/game/PlayerCharacter.test.tsx` — MAINT-06a (add to existing file)

*(Existing `server/domains/CombatManager.test.ts` and `server/gameState.test.ts` are extended with new describe blocks — not new files.)*

---

## Security Domain

Phase 49 makes no changes to authentication, authorization, input validation, cryptography, or session management. The boss-HP delegation is an internal server domain change with no new network surface. Selector changes are client-rendering only.

ASVS assessment: Not applicable — no security-relevant code paths are modified.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `setLobby` in `useGameState.tsx` wrapping `withTeamsDerived` is safer than threading through all handlers manually | MAINT-04 Threading | Low — if `setLobby` wrapping causes unintended behavior (e.g., `session:game_reset` full-replace lobby needs teams from server, not re-derived), teams re-derivation is still correct (idempotent with the server-provided teams) |
| A2 | `CombatManager.playerAttackBoss` is renamed to `applyBasicDamageToBoss` (Option A) rather than a thin alias wrapper | MAINT-05 delegation | Low — Option B (thin wrapper) also works; planner chooses. If Option A breaks a caller, grep confirms `playerAttackBoss` has zero external callers in current codebase |
| A3 | The spectator-heal path in `attackBoss` is intentionally left as a deferral for Phase 49+ (not delegated in this phase) | MAINT-05 scope | Medium — if spectator heals are frequent, the two pools continue to diverge; comment must be added marking this as known-deferred |
| A4 | `PlayerController` export function at L19 is the primary component export; wrapping in `React.memo` does not break the existing API (it is not referenced by other components as a class or via ref) | MAINT-06 | Low — `PlayerController` currently has no `forwardRef`; `React.memo` wrapping is transparent to callers |
| A5 | Render-count test using a render-spy wrapper in `@testing-library/react` v16 gives deterministic counts without StrictMode issues (test environment likely does not enable StrictMode) | MAINT-06 test | Medium — if StrictMode is enabled, render counts will double; check `client/src/test/setup.ts` |

---

## Open Questions (RESOLVED)

> All questions have documented inline recommendations.

1. **Where should `withTeamsDerived` be called — in each handler or in `setLobby`?**
   - What we know: ~14 handlers call `setLobby`; 3 are known-buggy; `session:player_ready_changed` and `session:ticket_advanced` also update players but teams derived from those are not visible
   - What's unclear: Is wrapping `setLobby` safe for all callers?
   - **Recommendation:** Wrap `setLobby` in `useGameState.tsx` (single site). `withTeamsDerived` is idempotent; `session:game_reset` and `session:lobby_sync` pass server-provided teams which are correctly re-derived from the server's authoritative `players` array. Zero risk of incorrect derivation.

2. **Should `playerAttackBoss` be renamed `applyBasicDamageToBoss` (Option A) or given a thin alias (Option B)?**
   - What we know: `playerAttackBoss` has zero external callers in the current codebase (`grep 'playerAttackBoss' server/` finds only definition + test)
   - What's unclear: None — it is an internal method
   - **Recommendation:** Rename to `applyBasicDamageToBoss` (Option A, cleaner). Extend return type to `{ damage: number; newHp: number }` so `attackBoss` can update the projection.

3. **How to test MAINT-05 phase transition via Phase 48 seams?**
   - What we know: `GameStateManager` is now constructable; `CombatManager` is constructable; `wireDomains` wires them
   - What's unclear: `gameState.attackBoss` references the `combatManager` singleton imported from `domains/index`. Tests using `new GameStateManager(undefined, { startWatchdogs: false })` get the production combatManager singleton.
   - **Recommendation:** Test `CombatManager.applyBasicDamageToBoss` directly for phase-transition behavior (unit test with `new CombatManager({ eventBus })`). Test the `attack_boss` socket handler integration via a new `handleAttackBoss` extracted function (follow Phase 48 pattern) OR test via `vi.spyOn(combatManager, 'applyBasicDamageToBoss')` in `gameState.test.ts`. The direct CombatManager unit test is simpler and more correct.

4. **Is the spectator-heal `combat:boss_healed` at `websocket.ts:1095` safe to leave unchanged?**
   - What we know: The spectator-heal path writes `lobby.boss.currentHealth` but not `combatState.boss.hp`; the eventBus emit at L1095 is for `combat:boss_healed` (different from `combat:boss_damaged`)
   - What's unclear: None — spectator-heal is a separate event/path not in MAINT-05 scope
   - **Recommendation:** Leave the spectator-heal path unchanged. Add a `// TODO MAINT-05+: spectator-heal should also delegate to CombatManager` comment. It is not in scope and does not interact with the basic-attack double-emit fix.

5. **Does `React.memo` on `PlayerController` require `useCallback` on the parent's `onPlayerPositionsUpdate` prop?**
   - What we know: `onPlayerPositionsUpdate` is an optional callback; if defined inline by the parent, it changes reference every parent render, defeating `memo`
   - What's unclear: Where is `PlayerController` mounted? Need to check caller.
   - **Recommendation:** Add a `useCallback` requirement note in `PlayerController`'s prop interface JSDoc. The parent (`BattleScreen` or `BattlePhase`) should wrap the callback in `useCallback`. This is not blocking for MAINT-06 correctness but matters for the perf guardrail.

---

## Sources

### Primary (HIGH confidence)

- `client/src/lib/socket/eventHandlers.ts` — Read directly; all handler locations, team-update status, push-before-map bug at L152-154 [VERIFIED: codebase grep + Read]
- `client/src/lib/stores/useGameState.tsx` — Read directly; `setLobby` at L128, store shape, `currentLobby`/`attackAnimations` subscriptions [VERIFIED: Read]
- `client/src/components/game/PlayerCharacter.tsx` — Read directly; `useGameState()` whole-store sub at L59; `React.memo` wrapper at L40 [VERIFIED: Read]
- `client/src/components/game/PlayerController.tsx` — Read directly; `useGameState()` whole-store sub at L20; no `React.memo` wrapper at L19 [VERIFIED: Read]
- `server/gameState.ts` — Read directly; `attackBoss` at L1801-1856; no `checkPhaseTransition` call; `lobby.boss.currentHealth` drained [VERIFIED: Read]
- `server/domains/CombatManager.ts` — Read directly; `playerAttackBoss` at L531-610; `checkPhaseTransition` at L569; `eventBus.emit('combat:boss_damaged')` at L555 [VERIFIED: Read]
- `server/websocket.ts` — Read directly; `attack_boss` handler at L1083-1121; manual `eventBus.emit('combat:boss_damaged')` at L1104; `socket.data.lobbyId` set at L436 [VERIFIED: Read]
- `server/events/ClientEventEmitter.ts` — Read directly; `combat:boss_damaged` bridge at L218-224 [VERIFIED: Read]
- `server/domains/index.ts` — Read directly; `wireDomains` at L432; `onBossDamagedBuff` listener at L523; Phase 48 VERIFICATION confirms line numbers [VERIFIED: Read]
- `node_modules/zustand/react/shallow.js` — Read directly; confirms `useShallow` exported from `'zustand/react/shallow'` [VERIFIED: Read]
- `package.json` — Read directly; `zustand: ^5.0.13`, `@testing-library/react: ^16.3.2` [VERIFIED: npm view zustand → 5.0.14]
- `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md` — Read directly; Theme 1 (dual source-of-truth), rank 3/4/8 findings [VERIFIED: Read]
- `.planning/phases/48-testability-seams/48-VERIFICATION.md` — Read directly; Phase 48 seams confirmed at specific line numbers [VERIFIED: Read]
- `client/src/components/game/PlayerCharacter.test.tsx` — Read directly; existing test infrastructure with `useGameState.setState`, `render`, `act` [VERIFIED: Read]

### Secondary (MEDIUM confidence)

- `.planning/phases/48-testability-seams/48-03-SUMMARY.md` — Phase 48 decisions documenting extracted handlers and wireDomains factory [VERIFIED: Read]
- `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md` Theme 1 — adversarial council synthesis of dual HP pools, team staleness, push-before-map [VERIFIED: Read]
- `server/domains/SessionManager.ts:690-696` — `updateTeamAssignments` derives teams correctly on server [VERIFIED: Grep]

### Tertiary (LOW confidence)

None — all claims are backed by direct file reads with verified line numbers.

---

## Metadata

**Confidence breakdown:**
- MAINT-04 (team derivation): HIGH — push-before-map bug root cause confirmed by code read at exact lines; all handler sites enumerated
- MAINT-05 (boss HP): HIGH — both pools confirmed by code read; double-emit chain confirmed; `playerAttackBoss`/`checkPhaseTransition` relationship confirmed at L569
- MAINT-06 (selectors): HIGH — whole-store subscriptions confirmed; `useShallow` availability confirmed from node_modules; no existing usage to conflict with
- Regression test strategy: HIGH — Phase 48 seams (`makeMockSocket`, `wireDomains`, constructable `GameStateManager`) confirmed as available by Phase 48 VERIFICATION

**Research date:** 2026-06-22
**Valid until:** 2026-08-22 (stable TypeScript codebase; no fast-moving external dependencies)
