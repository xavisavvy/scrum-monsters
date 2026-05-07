# Phase 42: v5.0 Pre-Ship Fixes & Polish — Research

**Researched:** 2026-05-07
**Domain:** Real-time multiplayer combat damage, WebSocket event taxonomy, lobby settings persistence, XP progression curves
**Confidence:** HIGH (all findings verified by direct code reads with file:line citations)

## Summary

Three independent defects audited in detail with concrete fixes identified.

**FIX-04 (boss damage):** Damage IS applied server-side correctly — verified end-to-end (CombatManager.applyDamageToPlayer at line 1281, emits `combat:player_damaged`, ClientEventEmitter forwards to socket, eventHandlers.ts:351 updates `currentLobby.playerCombatStates[playerId].hp`). The bug is **purely client-side feedback absence**: PlayerHUD.tsx renders NO HP bar at all, and PlayerCharacter.tsx (line 65-66) reads HP only as a HealthBar overlay above the avatar — but the existing `isDamaged` flash trigger (line 89-104) listens to `attackAnimations` (boss attacks via `attack_player`/projectile system), NOT to `combat:player_damaged`. Boss melee/AoE damage decrements HP silently. Fix: hook `combat:player_damaged` into the existing damage flash + add a floating damage popup via `FloatingXPManager`-style pattern.

**FIX-05 (lobby_updated retire + auto-advance):** CONTEXT lists "two known emit sites" but the audit reveals **18 live emit sites** in `server/websocket.ts` and `server/gameState.ts` (CONTEXT was wrong — researcher must escalate this). Most can be replaced by `session:phase_changed`, `session:team_changed`, or new typed events; some (settings, ticket management, host transfer fallback) need new events. Auto-advance toggle restoration is straightforward — extend the existing `EstimationSettings` schema and gate the consensus countdown trigger at `gameState.ts:1534-1556`.

**BAL-01 (XP pacing):** XP system is **fully data-driven from a single source of truth**: `shared/progressionTypes.ts` (`XP_RATES` + `DEFAULT_CURVE_CONFIG` in ProgressionManager.ts:43-46). Knob recommendation: tune the **curve exponent** (currently 1.5, recommend 1.8-2.0) AND **cut boss_damage rate** (currently 2 XP/dmg point — single boss attack of 50dmg = 100 XP = a full level 1→2). Both knobs together hit the "level cap unreachable in single 30-min session" target.

**Primary recommendation:** Three independent plans, parallelizable. Plan 42-01 is mostly client UI work. Plan 42-02 has scope expansion risk (18 emit sites, not 2) — planner must scope migration tightly. Plan 42-03 is two number tweaks + a curve table.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Boss HP damage (42-01 / FIX-04)**
- Scope of failure: unconfirmed at CONTEXT-time — researcher diagnoses (DONE: client feedback absent, server damage path intact).
- Damage feedback IS in scope. Plan must verify or add at least one feedback channel (HP bar reaction / floating damage / screen flash).
- Verification gate: repro test that hits a player (single-target AND AoE) and asserts BOTH `player.hp` decreased server-side AND a feedback signal fired client-side.

**Auto-advance (42-02 / FIX-05) — restore path**
- Restore as a Lobby UI setting, NOT remove. Host-only toggle.
- Default OFF. Hosts opt in.
- Persisted alongside other lobby settings.
- Server respects toggle on consensus only (consensus countdown). 3-min voting-timeout fallback stays put regardless of toggle state.
- Where the toggle lives in the UI: Claude's discretion (planner picks against existing Lobby Settings patterns).

**`lobby_updated` event retirement (42-02 / FIX-05) — full retire path**
- Fully retire the event. Server stops emitting everywhere; client handler at `GamePage.tsx:188-199` removed.
- Each emit site migrated to a fine-grained event from existing `shared/gameEvents.ts` taxonomy.
- No half-migration. Escalate during research if non-trivial.
- Client must drop the handler in the same plan/commit set as the last server-side emit removal.

**XP pacing (42-03 / BAL-01)**
- Direction: too fast — tune to feel earned.
- Knob selection: researcher's call after inventory.
- Plan SUMMARY MUST include before/after curve documentation.
- Target feel: researcher recommends, planner adopts.

**Cross-cutting**
- No regressions to Phase 40 tutorial work or Phase 41 reconnection work. Phase 39 z-index ladder (SpotlightMask 100, HintBubble 101, HelpMenu 200) and battle focus guard remain untouched.
- All three plans independent — can execute in parallel.

### Claude's Discretion
- Exact location of the auto-advance toggle in the Lobby UI.
- Names of the fine-grained replacement events for each `lobby_updated` emit site.
- Specific XP curve numbers and per-action awards.
- Whether damage feedback is a new component or verifying existing `FloatingXP`/`MagicEffect`/HP-bar machinery.
- Test approach for each plan.

### Deferred Ideas (OUT OF SCOPE)
- Per-team auto-advance overrides
- Auto-advance as a user-account preference (depends on Phase 43 auth)
- XP curve visualization debug panel
- Animated damage popup variants per attack type
- Configurable per-action XP awards in dev menu
- Migrating the 3-minute voting-timeout fallback to be configurable

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-04 | Boss attacks (single-target + AoE) correctly apply damage to player HP | Verified server damage path (CombatManager.ts:1281) is intact. Bug is missing client feedback hook. Wire `combat:player_damaged` to PlayerCharacter damage-flash + add FloatingXPManager-style damage popup. |
| FIX-05 | Auto-advance reconciled (restored as Lobby UI control) AND `lobby_updated` event fully retired | Auto-advance gate insertion: `gameState.ts:1534-1556` (consensus countdown trigger). Persistence pattern: extend `EstimationSettings` (schema in `shared/socket-schemas.ts:209+`, persistence in `client/src/lib/utils/lobbySettingsStorage.ts`). Migration table: 18 emit sites mapped to fine-grained replacements (see Section: lobby_updated audit). |
| BAL-01 | XP pacing tuned | Single source of truth identified: `shared/progressionTypes.ts` XP_RATES + ProgressionManager.ts:43-46 DEFAULT_CURVE_CONFIG. Two-knob recommendation: exponent 1.5→1.8 and boss_damage rate 2→1. |

## Project Constraints (from CLAUDE.md)

- **Testing framework:** Vitest with happy-dom; tests colocated as `*.test.ts(x)` next to source.
- **Path aliases:** `@` → `client/src`, `@shared` → `shared`.
- **Conventional Commits** enforced by commitlint/husky.
- **Real-time sync contract:** WebSocket events defined in `shared/gameEvents.ts` under `ClientToServerEvents` / `ServerToClientEvents`. Adding events requires interface + handler + emit/listen wiring in client components.
- **State sync philosophy** (CLAUDE.md line 78): "Server emits `lobby_updated` event whenever game state changes. All state mutations in `gameState.ts` should broadcast to clients." → **THIS DOCUMENTATION IS STALE** — Phase 42-02 retires the event. Update CLAUDE.md as part of 42-02.
- E2E via Playwright. Server tests live alongside source (`server/**/*.test.ts`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Boss damage calculation | API/Backend (CombatManager) | — | Authoritative game state owner; level-scaling math + threat targeting belong server-side |
| HP write to player state | API/Backend (CombatManager.applyDamageToPlayer) | — | Single mutator; client must never write HP directly |
| Damage visual feedback | Browser/Client (PlayerCharacter, FloatingXPManager) | — | Pure UI reaction to `combat:player_damaged` server event |
| Auto-advance gate decision | API/Backend (gameState.checkDiscussionConsensus) | — | Server is authority on phase transitions |
| Auto-advance toggle UI | Browser/Client (Lobby.tsx settings panel) | — | Host config surface; emits `update_estimation_settings` to server |
| Lobby settings persistence (across browsers) | API/Backend (gameState.ts) | Browser/Client (LobbySettingsStorage for next-lobby defaults) | Server is authoritative within a lobby; client stores host preferences for future lobbies |
| XP curve math | API/Backend (ProgressionManager.XPCurve) | Browser/Client (mirror in `useProgression`?) | Server is authority; client can mirror for UI predictions |
| XP rates | Shared (`shared/progressionTypes.ts`) | — | Single source of truth — both tiers reference |
| `lobby_updated` retirement | API/Backend (websocket.ts emit removal) + Browser/Client (handler removal) | — | Coordinated change — both must land same commit set |

## Standard Stack

This phase touches existing systems exclusively — no new libraries.

### Core (already in use, no install needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| socket.io / socket.io-client | (existing) | WebSocket transport | Already wired across project |
| zustand | (existing) | Client state stores | useGameState, useEventSync, useProgression |
| framer-motion | (existing) | Damage flash / floating number animations | Used in FloatingXP, MagicEffect |
| zod | (existing) | Schema validation for settings | Pattern at `shared/socket-schemas.ts:209+` |
| vitest + happy-dom | (existing) | Test framework | All existing tests use this |

**No `npm install` required.** All work is wiring + value-tuning + event renames.

## Architecture Patterns

### System Architecture Diagram (FIX-04 damage flow)

```
┌─────────────────┐       ┌──────────────────────────────────────┐
│ CombatManager   │       │ Tick: performBossAttack()            │
│ startBossAttack │──────▶│  L984: select action via BossAI      │
│ Loop()          │       │  L1051: setTimeout(telegraphDur)     │
└─────────────────┘       │  L1052-1054: for each targetId       │
                          │    applyDamageToPlayer()             │
                          └────────────────┬─────────────────────┘
                                           │
                          ┌────────────────▼──────────────────────┐
                          │ applyDamageToPlayer (L1281)           │
                          │   playerState.hp -= damage  (L1296)   │
                          │   eventBus.emit(                       │
                          │     'combat:player_damaged',           │
                          │     { lobbyId, playerId, damage,       │
                          │       playerHealth })  (L1299)         │
                          └────────────────┬──────────────────────┘
                                           │
                          ┌────────────────▼──────────────────────┐
                          │ ClientEventEmitter (L237-244)          │
                          │   on 'combat:player_damaged' → emit    │
                          │   socket payload: { playerId, damage,  │
                          │     newHp: playerHealth, source }      │
                          └────────────────┬──────────────────────┘
                                           │ socket.io
                          ┌────────────────▼──────────────────────┐
                          │ client eventHandlers.ts:351-371        │
                          │   updates currentLobby.                │
                          │   playerCombatStates[playerId].hp      │
                          │   ✓ STATE UPDATES CORRECTLY            │
                          └────────────────┬──────────────────────┘
                                           │
                          ┌────────────────▼──────────────────────┐
                          │ ❌ NO COMPONENT LISTENS FOR FEEDBACK  │
                          │ • PlayerHUD.tsx renders NO HP bar     │
                          │ • PlayerCharacter HealthBar updates   │
                          │   silently (no flash on this event)   │
                          │ • PlayerCharacter damage-flash hook   │
                          │   (L89-104) listens to attackAnimations│
                          │   NOT combat:player_damaged           │
                          │ • No floating damage popup exists     │
                          └───────────────────────────────────────┘
```

**The bug:** Damage IS applied. Damage IS broadcast. Client store IS updated. But the user has no perceptual signal — the HealthBar shrinks silently and there's no shake/flash/popup. UX-wise this looks identical to "damage didn't apply."

### Pattern 1: Damage feedback wiring (FIX-04)

**What:** Hook the existing `combat:player_damaged` socket event into a damage-flash + floating-damage popup, reusing `FloatingXPManager` infrastructure.

**Where to add:**
- **Damage flash:** Wire into `PlayerCharacter.tsx:88-104` — extend the existing `isDamaged` trigger to also fire on `combat:player_damaged` for the matching playerId. Currently it only fires on `attackAnimations` (boss melee swing animations).
- **Floating damage popup:** Mirror `FloatingXPManager` pattern. Source position uses player's screen-space coords, color RED instead of XP green. New component `FloatingDamageManager.tsx` consuming a new store slice in `useGameState` (or extend `useProgression`'s `pendingXPGains` pattern with `pendingDamageEvents`).

**Example (verified pattern from FloatingXPManager.tsx:23-85):**
```typescript
// Source: client/src/components/game/FloatingXPManager.tsx
// Pattern: consume pendingDamageEvents from store, render FloatingDamage components,
// remove on completion via processedRef + clearPendingDamage()
```

### Pattern 2: Auto-advance settings extension (42-02)

**What:** Add `autoAdvance: boolean` (default false) to `EstimationSettings`, gate the consensus countdown on it.

**Persistence (3 layers):**
1. **In-lobby authoritative:** `lobby.estimationSettings.autoAdvance` (server-side, set via existing `update_estimation_settings` event)
2. **Cross-lobby host preference:** `LobbySettingsStorage.updateEstimationSettings()` (client localStorage, already wired at `Lobby.tsx:1638-1648`)
3. **Schema validation:** Add to `EstimationSettingsSchema` at `shared/socket-schemas.ts` (search for existing schema and extend)

**Gate insertion point** (`server/gameState.ts:1534-1556`):
```typescript
// Line 1534: if (teamsAgree && lobby.boss && lobby.currentTicket) {
//   Line 1536:   if (!lobby.consensusCountdown?.isActive) {
//
// CHANGE: gate the entire countdown block on autoAdvance setting:
if (teamsAgree && lobby.boss && lobby.currentTicket && lobby.estimationSettings?.autoAdvance) {
  if (!lobby.consensusCountdown?.isActive) {
    // existing countdown logic — unchanged
  }
}
// When autoAdvance is OFF, host must use existing 'advancePhaseNow' button.
// 3-min voting timeout (gameState.ts:1336-1340) is UNTOUCHED.
```

**Toggle UI insertion point** (`Lobby.tsx`):
- Pattern to copy: `Lobby.tsx:1889-1893` (estimation scaleType select onChange calls `updateEstimationSettings`).
- Add a checkbox/toggle in the same estimation settings section (around line 1880-1930). Visible only when `currentPlayer.isHost && currentLobby.gamePhase === 'lobby'` (matches existing guards).

### Pattern 3: XP curve tuning (42-03)

**What:** Modify two values to tune pacing. Single source of truth means a single small commit.

**Files to touch:**
- `shared/progressionTypes.ts:16-21` — XP_RATES (per-action awards)
- `server/domains/ProgressionManager.ts:43-46` — DEFAULT_CURVE_CONFIG (curve exponent)
- `server/domains/ProgressionManager.ts:52-57` — XP_RATE_VALUES (must mirror shared/ — currently duplicated; consider importing from shared)

**Note on duplication:** The XP rates are declared in BOTH `shared/progressionTypes.ts` AND copied as a private const at `ProgressionManager.ts:52-57`. The plan should eliminate this duplication or at minimum ensure both move together.

### Anti-Patterns to Avoid

- **Anti-pattern: Adding a new server-side `lobby_updated` emit "just for safety" while migrating others.** This contradicts CONTEXT (no half-migration). Every emit removed needs a fine-grained replacement, not another `lobby_updated` call.
- **Anti-pattern: Changing both `XP_RATES` AND `DEFAULT_CURVE_CONFIG` AND adding new XP sources in one commit.** Per BAL-01, only tune existing knobs; new sources are out of scope.
- **Anti-pattern: Tying damage feedback to `attackAnimations` (current PlayerCharacter approach).** `attackAnimations` is populated only by certain boss attack flows (ring attack, projectile system). Boss melee/AoE damage events use `combat:player_damaged` directly via ClientEventEmitter. Fix MUST hook the canonical damage event.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Floating damage popup | New animation system from scratch | Mirror `FloatingXPManager` (FloatingXP.tsx already uses framer-motion `motion.div` with y-translate + opacity) | Battle-tested, same screen positioning math, single visual language |
| Damage flash | New CSS class on PlayerCharacter | Extend existing `setIsDamaged(true)` trigger at PlayerCharacter.tsx:101 | Already wired with timeout cleanup, just needs an additional trigger source |
| Lobby settings persistence | New localStorage key for autoAdvance | Extend `LobbySettingsStorage.updateEstimationSettings` (already exists) | Pattern in place, validation logic at line 115-145 |
| XP curve math | Hand-tune per-level thresholds | Adjust the single `exponent` value in DEFAULT_CURVE_CONFIG | All level math derives from one formula (`baseXP * (level-1)^exponent`); changes propagate correctly |
| Settings schema validation | Custom validators | Extend zod `EstimationSettingsSchema` at `shared/socket-schemas.ts:209+` | Existing validation pattern; all settings events use zod |

## Runtime State Inventory

> Phase 42 includes one event-rename (`lobby_updated` retirement) and one schema extension (`autoAdvance` field). Inventory required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `localStorage["scrum-monsters-lobby-settings"]` — JSON blob with timerSettings/jiraSettings/estimationSettings. After 42-02 ships, old persisted blobs lack `autoAdvance` field. | Code edit only — `LobbySettingsStorage.validateSettings` already defaults missing fields (line 115-145 pattern). Add default `autoAdvance: false` in `getDefaultSettings`. No migration needed. |
| Live service config | None — ScrumQuest is self-hosted with no external service that stores `lobby_updated` references. | None |
| OS-registered state | None | None — verified by inspection (no scheduled tasks, no systemd units reference event names). |
| Secrets/env vars | None — event renames don't touch env. | None |
| Build artifacts | TypeScript types — `shared/gameEvents.ts:322` declares `lobby_updated` in `ServerToClientEvents`. After 42-02, type must be removed/deprecated. asyncapi.yaml:715 documents the event. | Code edit: remove `lobby_updated` from `ServerToClientEvents`. Update `specs/asyncapi.yaml:715`. Update CLAUDE.md:78 documentation. Update `README.md:206`. |

## `lobby_updated` Server-Side Emit Audit (42-02)

**CONTEXT.md said "two known emit sites": `advancePhaseNow` (1272) and `forceVotingProgression` (1297).**
**ACTUAL: 18 live emit sites across `server/websocket.ts` and `server/gameState.ts`. Researcher escalating.**

| # | File:Line | Trigger / Handler | Semantic Event | Recommended Replacement |
|---|-----------|-------------------|----------------|-------------------------|
| 1 | websocket.ts:160 | `startBattle` flow (helper `broadcastLobbyState` for phase transitions) | Phase change + full lobby refresh on battle start | Already covered by `battle_started` (line 162 nearby) — **REMOVE** the `lobby_updated`. |
| 2 | websocket.ts:241 | Sweeper interval (host_transferred grace expiry) | Roster + host changed after grace | `session:host_changed` already emitted; **REMOVE** redundant `lobby_updated`. |
| 3 | websocket.ts:611 | `add_tickets` handler | Ticket list mutation | **NEW EVENT NEEDED**: `session:tickets_updated` (data: `{ tickets: JiraTicket[]; seq; timestamp }`). Add to `shared/gameEvents.ts`. |
| 4 | websocket.ts:629 | `remove_ticket` handler | Ticket list mutation | Same `session:tickets_updated` event. |
| 5 | websocket.ts:660 | `toggle_ready` handler (or similar host-side action) | Player ready-state change | **NEW EVENT NEEDED**: `session:player_ready_changed` (data: `{ playerId; isReady; seq; timestamp }`) OR fold into existing `session:player_joined`-style player-state event. |
| 6 | websocket.ts:693 | (verify in code — likely `start_battle` or `update_lobby_name`) | Lobby metadata mutation | If `update_lobby_name`: **NEW EVENT** `session:lobby_renamed` (data: `{ name; seq; timestamp }`). Plan must verify. |
| 7 | websocket.ts:810 | (verify — likely host-only state push) | Phase transition | Likely covered by `session:phase_changed`; verify and remove. |
| 8 | websocket.ts:927 | `submit_score` reveal trigger (after `scores_revealed`) | Phase transition battle→reveal | `scores_revealed` already carries the data; **REMOVE** redundant `lobby_updated`. May need `session:phase_changed` if not auto-emitted. |
| 9 | websocket.ts:959 | `update_discussion_vote` handler — broadcasts every discussion vote | Vote update during discussion | **NEW EVENT NEEDED**: `estimation:discussion_vote_updated` (data: `{ playerId; score; seq; timestamp }`). High frequency — fine-grained event matters for bandwidth. |
| 10 | websocket.ts:971 | Discussion phase auto-advance setTimeout (consensus countdown completion) | Phase transition discussion→next | `session:phase_changed` (already in taxonomy at line 425 of `shared/gameEvents.ts`). |
| 11 | websocket.ts:1130 | `restart_game` / `proceed_next_level` (major state reset) | Full game reset | **NEW EVENT NEEDED**: `session:game_reset` (data: `{ lobby: Lobby; seq; timestamp }`) — this IS legitimately a full-state event; alternatively reuse `system:full_state` at line 614. |
| 12 | websocket.ts:1145 | (Phase transition — verify exact handler) | Phase transition | `session:phase_changed`. |
| 13 | websocket.ts:1161 | (Phase transition — verify exact handler) | Phase transition | `session:phase_changed`. |
| 14 | websocket.ts:1178 | (Phase transition — verify exact handler) | Phase transition | `session:phase_changed`. |
| 15 | websocket.ts:1193 | (Phase transition — verify exact handler) | Phase transition | `session:phase_changed`. |
| 16 | websocket.ts:1277 | `advancePhaseNow` (host manual advance) | Phase transition | `session:phase_changed`. |
| 17 | websocket.ts:1302 | `forceVotingProgression` (host force) | Phase transition battle→reveal | `session:phase_changed`. |
| 18 | websocket.ts:1316 | `forceVotingProgression` reveal cascade | Phase transition reveal | `session:phase_changed` + existing `scores_revealed`. |
| 19 | websocket.ts:1453 | `update_timer_settings` | Timer settings mutation | **NEW EVENT NEEDED**: `session:settings_updated` (data: `{ timerSettings?; jiraSettings?; estimationSettings?; seq; timestamp }`). Single event, partial payloads. |
| 20 | websocket.ts:1464 | `update_jira_settings` | Jira settings mutation | Same `session:settings_updated`. |
| 21 | websocket.ts:1475 | `update_estimation_settings` (this is where `autoAdvance` lives!) | Estimation settings mutation | Same `session:settings_updated`. |
| 22 | websocket.ts:1554 | Reconnection broadcast to OTHER clients in lobby | Roster delta on reconnect | `session:player_joined` already covers reconnect-as-rejoin; verify or add `session:player_reconnected`. |
| 23 | websocket.ts:2157 | Disconnect host transfer fallback | Roster + host changed | `session:host_changed` (already exists). |
| 24 | websocket.ts:2172 | Player removal fallback | Roster delta | Existing `player_left` (line 345). |
| 25 | gameState.ts:173 | `restoreDisconnectedPlayer` (or similar) | Roster restored after grace recovery | `session:player_joined` (or new `session:player_reconnected`). |
| 26 | gameState.ts:1368 | `handleVotingTimeout` (3-min voting timeout — the ONE gameState.ts emit) | Phase transition battle→reveal via timeout | `session:phase_changed` + existing `voting_timeout` event (line 363). |

**Total: 26 emit sites identified** (some duplicates fold). CONTEXT estimate of 2 was based on grep scope error. The v1.0 milestone audit (`v1.0-MILESTONE-AUDIT.md:21`) explicitly noted "16 lobby_updated emissions retained for 16 edge cases (intentional, documented)" — actual count grew to 26 since v1.0.

**Required new events (consolidated, 4 total):**
1. `session:tickets_updated` — covers add/remove ticket
2. `session:player_ready_changed` — covers toggle_ready
3. `session:lobby_renamed` — covers update_lobby_name (verify if exists)
4. `session:settings_updated` — covers timer/jira/estimation settings (single event, optional fields)
5. `session:game_reset` — covers restart_game / next_level major reset (or reuse `system:full_state`)

**Most sites just need `session:phase_changed` + removal of redundant `lobby_updated`.** Phase-change broadcasts are already covered.

**Risk:** This is a LARGER scope than CONTEXT anticipated. Planner should consider splitting 42-02 into two plans:
- 42-02a: Auto-advance toggle (small, isolated)
- 42-02b: `lobby_updated` retirement (large, 26 sites + 4-5 new events)

OR escalate scope back to user for ship/cut decision. **Researcher recommends splitting** — auto-advance toggle is hours of work, full event retirement is days.

## `lobby_updated` Client-Side Audit (42-02)

**Live handlers:**
- `client/src/pages/GamePage.tsx:188-219` — the deprecated handler. Sets `setLobby(lobby)`, refreshes `currentPlayer` from `lobby.players`, triggers BattleScreen remount on phase transitions or ticket changes (`shouldRemount` logic at lines 204-216).
- `client/src/pages/GamePage.tsx:306` — the `socket.off('lobby_updated')` cleanup.
- `client/src/lib/socket/eventHandlers.ts:297` — comment-only reference; no actual handler.

**Side effects of GamePage.tsx:188-219 that must be preserved when handler is removed:**

| Side Effect | Current Trigger | Replacement Mechanism |
|-------------|----------------|----------------------|
| `setLobby(lobby)` (full lobby state set) | Every `lobby_updated` | Each fine-grained event handler at `eventHandlers.ts` already does scoped `setLobby` updates (verify all 4 new events do this). For full-state events use existing `system:full_state` (line 614). |
| `setPlayer(updatedPlayer)` (currentPlayer refresh) | Every `lobby_updated` | Already covered by `session:phase_changed`, `session:team_changed`, `session:avatar_selected` handlers. Verify GamePage doesn't depend on this for auth/identity (Phase 41 used refs). |
| BattleScreen remount on phase entry to `'battle'` | `lastPhase !== 'battle' && lobby.gamePhase === 'battle'` | Move into `session:phase_changed` handler — same logic, gated on `newPhase === 'battle'`. |
| BattleScreen remount on `currentTicket` change while in battle | `lastPhase === 'battle' && lobby.gamePhase === 'battle' && JSON.stringify(cl?.currentTicket) !== JSON.stringify(lobby.currentTicket)` | **NEW EVENT NEEDED** OR move to `session:game_reset` for next-level transitions. Current ticket changes happen via `proceed_next_level` flow which is already a major-reset event. |

The remount logic is the riskiest part of the handler removal — the planner must trace which fine-grained event corresponds to "next ticket loaded" and add the remount trigger there.

## Auto-Advance Current State Audit (42-02)

**Existing client-side auto-advance UI:** None active. Verified `Lobby.tsx` (no `autoAdvance` references). The `.bak` file (`Lobby.tsx.bak`) — `git status` shows it as untracked; not currently in the build. CONTEXT's user recollection ("auto-advance USED to be a Lobby UI setting") is plausible but unverified — the live `Lobby.tsx` has no such control.

**Server-side auto-advance paths:**

1. **Consensus auto-advance (gated by toggle in 42-02):** `server/gameState.ts:1534-1556` (`checkDiscussionConsensus`).
   - Triggered when both teams hit consensus during discussion phase.
   - Starts a 5-second countdown (`consensusSettings.countdownSeconds`, default 5).
   - On countdown completion → `completeConsensus(lobbyId)` → phase transition.
   - **THIS is what the toggle controls.**

2. **Voting timeout (NOT gated by toggle — preserve as-is):** `server/gameState.ts:1322-1342` (`startVotingPhase` → `handleVotingTimeout` at 1346).
   - 3-minute timer set when voting phase starts.
   - On expiry, force phase advance to reveal IF at least one vote submitted (line 1357).
   - Stays put per CONTEXT.

3. **Discussion auto-advance setTimeout (websocket.ts:961-977):** This is what CONTEXT references as "consensus auto-advance at 961-1000." Tracing:
   - `update_discussion_vote` handler emits `lobby_updated` (line 959 — to be retired).
   - Calls `gameState.checkDiscussionConsensus(lobby.id)` (line 962).
   - If returned lobby is past discussion phase, schedules a 2-second `setTimeout` (line 969-975) to broadcast a follow-up `lobby_updated`.
   - This is a UI-pacing delay, not auto-advance logic. The actual phase transition was already done by `checkDiscussionConsensus → startConsensusCountdown → completeConsensus` (gameState.ts).

**Host's "Advance Now" path today:** `advancePhaseNow` socket event (`websocket.ts:1252-1287`) → `gameState.manualAdvancePhase` (`gameState.ts:1597-1612`) → `clearConsensusCountdown` + `completeConsensus`. Already wired and used by client (search for `emit('advancePhaseNow')` in client). With auto-advance OFF, this becomes the primary path.

**Gate insertion point:** **`gameState.ts:1534`** (the `if (teamsAgree && lobby.boss && lobby.currentTicket)` line). Add `&& lobby.estimationSettings?.autoAdvance` to the condition, OR add an early-return guard before the countdown trigger.

## Lobby Settings Persistence Pattern (42-02)

**Live `.ts` exists:** `client/src/lib/utils/lobbySettingsStorage.ts` (NOT in `.bak` — `.bak` is a separate untracked artifact). 195 lines, fully functional.

**Schema location:** `EstimationSettings` is referenced from `@/lib/gameTypes` at `Lobby.tsx:23`. Server-side schema at `shared/socket-schemas.ts:268`.

**Persistence pattern (3-tier, copy this verbatim for autoAdvance):**

```typescript
// 1. Type extension (add to client/src/lib/gameTypes.ts EstimationSettings type
//    AND shared definition):
export interface EstimationSettings {
  scaleType: EstimationScaleType;
  customTshirtMapping?: Record<string, number>;
  autoAdvance?: boolean;  // NEW — default false
}

// 2. Schema extension (shared/socket-schemas.ts):
export const EstimationSettingsSchema = z.object({
  scaleType: z.enum(['fibonacci', 'doubling', 'tshirt']),
  customTshirtMapping: z.record(z.string(), z.number()).optional(),
  autoAdvance: z.boolean().optional().default(false),  // NEW
});

// 3. Storage default (client/src/lib/utils/lobbySettingsStorage.ts):
private static getDefaultSettings(): LobbySettingsPresets {
  return {
    // ...
    estimationSettings: {
      scaleType: 'fibonacci',
      autoAdvance: false,  // NEW
    }
  };
}
private static validateSettings(settings: any): LobbySettingsPresets {
  // ...
  estimationSettings: {
    scaleType: ...,
    customTshirtMapping: ...,
    autoAdvance: typeof settings.estimationSettings?.autoAdvance === 'boolean'
      ? settings.estimationSettings.autoAdvance
      : false,  // NEW
  }
}
```

**Server-side propagation:** Already wired. `update_estimation_settings` → `gameState.updateEstimationSettings` → existing emit. The new field rides through automatically.

**Reconnect round-trip:** Lobby state includes `estimationSettings` in the snapshot used by Phase 41 reconnect (`lobbySync.lobby` at `websocket.ts:1487`). Adding `autoAdvance` to `estimationSettings` means it auto-survives reconnect — no Phase 41 changes needed. ✓

## Lobby UI Surface for Toggle (42-02)

**Existing host-only toggle pattern (closest analog):**

Location: `client/src/components/game/Lobby.tsx:1815-1842` (timer-enabled checkbox, line 1815) and `1889-1893` (estimation scaleType select, line 1889).

**Recommended placement:** Inside the Estimation Settings panel (around `Lobby.tsx:1880-1930`), as a sibling to the scaleType select.

**Recommended UI** (matches existing panel styling):
```jsx
<label className="flex items-center gap-2 mt-2">
  <input
    type="checkbox"
    checked={currentLobby.estimationSettings?.autoAdvance || false}
    onChange={(e) => updateEstimationSettings({
      ...currentLobby.estimationSettings,
      autoAdvance: e.target.checked,
    })}
    disabled={!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby'}
  />
  <span>Auto-advance to next ticket on consensus (5s countdown)</span>
</label>
```

The existing `updateEstimationSettings` function (line 1638-1648) already handles the emit + LobbySettingsStorage persist + toast — no new wiring needed.

**Gate logic:** The `disabled` condition matches the existing pattern at line 1639 (`if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;`).

## XP Awards Inventory (42-03)

**Per-action awards** (single source of truth: `shared/progressionTypes.ts:16-21`):

| Source | Current Rate | Award Site | Trigger Frequency |
|--------|-------------|-----------|-------------------|
| `vote` | 10 XP fixed | `ProgressionManager.ts:202` (handles `estimation:vote_cast`) | 1× per ticket per voter |
| `boss_damage` | 2 XP × damage_dealt | `ProgressionManager.ts:210` (handles `combat:boss_damaged`) | Continuous during battle phase, scales with attack rate |
| `consensus` | 50 XP fixed | `ProgressionManager.ts:219` (handles `estimation:full_consensus_reached`, awards ALL voters) | 1× per ticket on consensus |
| `revival` | 30 XP fixed | `ProgressionManager.ts:227` (handles `combat:player_revived`) | Rare; only when player downed |

**Estimated per-session XP (30-min session, 5 tickets, average team):**
- 5 votes × 10 = 50 XP
- 5 consensus × 50 = 250 XP
- ~10 boss attacks × ~30 dmg × 2 = ~600 XP per ticket × 5 = ~3000 XP (DOMINANT — this is the "too fast" lever)
- 1-2 revivals × 30 = 30-60 XP

**Total ~3300 XP per 30-min session.**

**Curve thresholds (current `baseXP=100, exponent=1.5`):**
- L1→L2: 100 XP cumulative (`getLevelThreshold(2) = 100 * 1^1.5 = 100`)
- L1→L3: 100 + 283 = 383
- L1→L4: 100 + 283 + 520 = 903
- L1→L5: 1703
- L1→L6: 2820
- L1→L7: 4347
- L1→L8: 6303
- L1→L10: 11700

**Today's reality:** A single boss attack landing 50 dmg = 100 XP = full level 1→2 in one swing. A 30-min session reaches ~level 6-7. CONTEXT confirms "user has reached level cap or near it within a single session."

## XP Curve Current Values (42-03)

**Curve type:** Polynomial (exponent 1.5 — between linear 1.0 and quadratic 2.0).
**Cap:** No hard cap (safety check at level 1000, `ProgressionManager.ts:122`).
**Per-level thresholds:** `Math.floor(100 * (level-1)^1.5)`.

**Recommendation: Two-knob tune.**

| Knob | Current | Recommended | Effect |
|------|---------|-------------|--------|
| `XP_RATES.boss_damage` (per-action) | 2 | **1** | Halves the dominant XP source |
| `DEFAULT_CURVE_CONFIG.exponent` (curve) | 1.5 | **1.8** | Steepens late-level requirements |
| `DEFAULT_CURVE_CONFIG.baseXP` | 100 | 100 (unchanged) | Keep early-game pacing identical |

**Projected per-session XP after tuning:** ~50 + 250 + 1500 + 60 ≈ 1860 XP.
**Projected level after 30 min:** Level 4-5 (cumulative threshold for L5 with exp=1.8 is ~2440 XP).
**Level 10 with exp=1.8:** ~24,000 XP cumulative — requires ~13 sessions. Hits "level cap unreachable in single session" target.

**Why not just curve OR just per-action:**
- Curve-only (raise to 2.0): early levels still trivial (boss damage = full level in 2 swings)
- Per-action-only (boss_damage 2→1): late levels still cheap (1500 XP/session reaches L7 in 2 sessions on current 1.5 curve)
- **Both together:** smooth pacing, level cap as multi-session goal.

**Side-effect to verify:** `LevelUpCelebration.tsx` and `TierUpToast.tsx` celebration frequency. With faster early curve today, celebrations may spam mid-battle. New tuning REDUCES frequency, so risk is celebrations becoming rare — no spam risk introduced. Verify celebrations still fire correctly via existing `LevelUpCelebration.test.tsx`.

## Damage Feedback Inventory (42-01)

**Existing systems available for reuse:**

| System | File | Currently Reacts To | Reuse for Damage? |
|--------|------|--------------------|--------------------|
| `HealthBar` (UI primitive) | `client/src/components/ui/HealthBar.tsx` | Renders value/max with color zones; pulses on `pct ≤ 25%` | YES — already used in `PlayerCharacter.tsx`. Updates correctly when hp store changes. **No code change needed**, but visibly reactive. |
| `PlayerCharacter` damage flash | `PlayerCharacter.tsx:88-104` | `attackAnimations` queue (boss ring/projectile) | **PARTIAL** — extend this hook to also fire on `combat:player_damaged` for the matching playerId. |
| `FloatingXPManager` / `FloatingXP` | `FloatingXPManager.tsx`, `FloatingXP.tsx` | `useProgression.pendingXPGains` queue | **PATTERN to mirror** — build `FloatingDamageManager` consuming a parallel store slice. |
| `MagicEffect` | `MagicEffect.tsx` | Ability-cast trigger only | NOT a fit — too elaborate for damage; reserved for spell visuals. |
| `ExplosionAnimation` | `ExplosionAnimation.tsx` | Boss death only | NOT a fit. |
| `BossTelegraph` | `BossTelegraph.tsx` | Boss telegraph events (warning) | Already wired correctly; not for damage feedback. |

**Recommended approach for FIX-04 (minimum effective):**

1. **Extend `PlayerCharacter.tsx:88-104`** — add a `useEffect` listening to `currentLobby.playerCombatStates[playerId].hp` changes. On decrement, set `isDamaged=true` + clear after timeout. Reuses existing `isDamaged` state and CSS.
2. **New `FloatingDamageManager`** — mirror FloatingXPManager pattern. Listen for `combat:player_damaged` events (subscribe in `eventHandlers.ts:351` block, push to a new store slice or extend `useGameState`). Render red damage numbers above the player's screen position.
3. **Optional: HP bar shake** — add a brief CSS shake/flash to `HealthBar` when value drops. Pure CSS, no new state. Defer to planner.

**The bug fix MUST include item 1 minimum (zero-line component, just wire the existing flash to the canonical damage event). Item 2 is recommended for the user-visible "I got hit" signal.**

## Common Pitfalls

### Pitfall 1: Migrating `lobby_updated` without preserving the BattleScreen remount logic
**What goes wrong:** GamePage's `lobby_updated` handler triggers a BattleScreen remount on phase entry to battle AND on currentTicket change mid-battle (lines 204-216). If migrated only to `session:phase_changed`, the mid-battle ticket change case is lost.
**Why it happens:** No fine-grained event today corresponds to "next ticket loaded mid-battle."
**How to avoid:** Plan must add a `session:ticket_advanced` event OR fold this into `session:game_reset` for next-level transitions.
**Warning signs:** BattleScreen shows stale ticket data after consensus on second/third tickets.

### Pitfall 2: `combat:player_damaged` payload field mismatch
**What goes wrong:** Server emits `playerHealth` from EventBus (`CombatManager.ts:1303`) but `ClientEventEmitter.ts:241` translates it to `newHp` for the wire payload. Schema in `shared/gameEvents.ts:448` expects `newHp`. Client reads `data.newHp` (eventHandlers.ts:364). All correct — but the test infrastructure asserts on EventBus payload (`playerHealth`), not wire payload.
**Why it happens:** Two-layer event model (EventBus internal, socket external) with different field names.
**How to avoid:** When writing FIX-04 tests, server-side asserts on `playerHealth`, client-side asserts on `newHp`. Don't mix.

### Pitfall 3: Disabling auto-advance breaks existing host muscle memory
**What goes wrong:** Default OFF means hosts who relied on auto-advance suddenly need to click "Advance Now." Without UI signaling, this looks like a regression.
**Why it happens:** Default-OFF chosen for safety, but no migration UX.
**How to avoid:** Toast or hint when host enters discussion phase with `autoAdvance=false`: "Click Advance Now when ready." Optional but recommended.
**Warning signs:** Bug reports of "discussion phase stuck."

### Pitfall 4: XP curve change retroactively re-levels existing players
**What goes wrong:** `ProgressionManager.calculateLevel(totalXP)` is called every time XP is computed. After curve change, a player with stored XP=2000 might be level 5 today and level 4 tomorrow.
**Why it happens:** Persistent storage stores totalXP, not level.
**How to avoid:** This is actually CORRECT for re-balancing — players' levels recalibrate to the new curve. But: ensure `LevelUpCelebration` doesn't fire spuriously on first reconnect post-tuning (it shouldn't — `oldLevel`/`newLevel` are diffed within a single `awardXP` call, line 277-287, not across sessions). Verified safe.

### Pitfall 5: Phase 41 reconnect-token snapshot is built from `getLobbySnapshot` — if new fields aren't included, they won't survive reconnect
**What goes wrong:** Adding `autoAdvance` to `estimationSettings` but the snapshot serializer skips it.
**Why it happens:** Manual snapshot building.
**How to avoid:** Verify `gameState.getLobbySnapshot` (or equivalent) includes `lobby.estimationSettings` in full. Most settings already round-trip; this should be free if settings is part of the lobby spread. Add a Phase 41 regression test.

### Pitfall 6: 26 emit sites is way more than CONTEXT estimated
**What goes wrong:** Plan 42-02 underestimates work; ship slips.
**Why it happens:** CONTEXT was built from one grep against the wrong scope.
**How to avoid:** Planner splits 42-02 into 42-02a (toggle) and 42-02b (event retire), OR escalates back to discuss-phase for ship/cut decision.

## Code Examples

### FIX-04: Wire `combat:player_damaged` into PlayerCharacter damage flash

```typescript
// Source: extend client/src/components/game/PlayerCharacter.tsx:88-104

// Existing pattern (attackAnimations-based) STAYS.
// ADD:
const previousHp = useRef<number>(currentHp);
useEffect(() => {
  if (currentHp < previousHp.current && playerId) {
    setIsDamaged(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsDamaged(false), 300);
  }
  previousHp.current = currentHp;
}, [currentHp, playerId]);
```

### FIX-04: FloatingDamageManager (mirror of FloatingXPManager)

```typescript
// Source: new file client/src/components/game/FloatingDamageManager.tsx
// Pattern from: FloatingXPManager.tsx:23-85

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
// New store slice in useGameState: pendingDamageEvents: Array<{id, playerId, amount, position}>
// Populated by socket eventHandlers.ts when 'combat:player_damaged' fires.

interface ActiveDamage { id: string; amount: number; position: {x:number;y:number}; }
export function FloatingDamageManager() {
  const { pendingDamageEvents, clearPendingDamage } = useGameState();
  const [active, setActive] = useState<ActiveDamage[]>([]);
  // ... mirror FloatingXPManager processedRef + setTimeout cleanup pattern
  // Render: red, larger font, "-{amount}" instead of "+{amount} XP"
}
```

### FIX-05: Auto-advance gate

```typescript
// Source: server/gameState.ts:1534 — modify the if-condition

// BEFORE:
if (teamsAgree && lobby.boss && lobby.currentTicket) {
  if (!lobby.consensusCountdown?.isActive) {
    // start countdown
  }
}

// AFTER:
if (teamsAgree && lobby.boss && lobby.currentTicket && lobby.estimationSettings?.autoAdvance) {
  if (!lobby.consensusCountdown?.isActive) {
    // start countdown
  }
}
// When autoAdvance=false, host clicks "Advance Now" → existing manualAdvancePhase path.
```

### BAL-01: Two-knob curve change

```typescript
// Source 1: shared/progressionTypes.ts:16-21
export const XP_RATES = {
  vote: 10,
  boss_damage: 1,        // CHANGED from 2 → 1
  consensus: 50,
  revival: 30,
} as const;

// Source 2: server/domains/ProgressionManager.ts:43-46
const DEFAULT_CURVE_CONFIG: XPCurveConfig = {
  baseXP: 100,
  exponent: 1.8,         // CHANGED from 1.5 → 1.8
};

// Source 3: server/domains/ProgressionManager.ts:52-57 — duplicate to keep in sync
const XP_RATE_VALUES: typeof XP_RATES = {
  vote: 10,
  boss_damage: 1,        // CHANGED from 2 → 1
  consensus: 50,
  revival: 30,
};
// CONSIDER: delete this duplicate, import XP_RATES directly from shared.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `lobby_updated` full-state broadcasts | Fine-grained domain events (`session:*`, `combat:*`, `estimation:*`) | v1.0 milestone (Phase 05) | 80-95% bandwidth reduction. 26 emit sites remain as fallback (this phase finishes the migration). |
| Auto-advance always-on | Host-toggled (default OFF) | v5.0 (this phase) | Reduces accidental phase skipping; opt-in for streamlined teams. |
| XP `boss_damage = 2 × damage` | `boss_damage = 1 × damage` + curve exponent 1.8 | v5.0 (this phase) | Level cap requires multiple sessions instead of one. |

**Deprecated/outdated:**
- `lobby_updated` event: removed entirely after this phase. Update `CLAUDE.md:78`, `README.md:206`, `specs/asyncapi.yaml:715`, `shared/gameEvents.ts:322`.
- `lobbySettingsStorage.ts.bak`: untracked .bak file, no longer relevant — `.ts` is the canonical version.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`^1.x`) + happy-dom for client; node for server |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run path/to/file.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FIX-04 | Server: AoE attack decrements every fighting player's hp | unit | `npx vitest run server/domains/CombatManager.test.ts -t "applyDamage"` | ✅ existing tests at L881-944 cover applyDamage; ADD AoE coverage if missing |
| FIX-04 | Server: single-target boss attack reduces target hp via performBossAttack telegraph path | integration | `npx vitest run server/domains/CombatManager.test.ts -t "startBossAttackLoop"` | ✅ existing at L423-870 |
| FIX-04 | Client: PlayerCharacter triggers damage flash on hp decrement | unit | `npx vitest run client/src/components/game/PlayerCharacter.test.tsx` | ❌ Wave 0 — no test file exists |
| FIX-04 | Client: FloatingDamageManager renders popup on `combat:player_damaged` | unit | `npx vitest run client/src/components/game/FloatingDamageManager.test.tsx` | ❌ Wave 0 — new component |
| FIX-05 | Server: consensus countdown does NOT start when `estimationSettings.autoAdvance=false` | unit | `npx vitest run server/gameState.test.ts -t "checkDiscussionConsensus"` | ❌ Wave 0 — gameState.test.ts may not exist yet; verify |
| FIX-05 | Server: voting timeout still fires regardless of autoAdvance setting | unit | `npx vitest run server/gameState.test.ts -t "handleVotingTimeout"` | ❌ Wave 0 — verify file exists |
| FIX-05 | Schema: `EstimationSettingsSchema` accepts and defaults `autoAdvance` | unit | `npx vitest run shared/socket-schemas.test.ts` | ❌ Wave 0 — verify file exists |
| FIX-05 | Client: LobbySettingsStorage persists/loads `autoAdvance` | unit | `npx vitest run client/src/lib/utils/lobbySettingsStorage.test.ts` | ❌ Wave 0 — verify file exists |
| FIX-05 | Lobby_updated handler removed — no `console.warn` in dev | manual | Run dev server, play full game flow, watch console | manual-only |
| FIX-05 | All 26 emit sites migrated — grep returns 0 live emit sites | static-check | `npx tsc --noEmit` + `grep -rn "lobby_updated" server/` | scripted |
| BAL-01 | XPCurve: `getLevelThreshold(2)` = 100 with new exponent | unit | `npx vitest run server/domains/ProgressionManager.test.ts -t "XPCurve"` | ✅ existing curve tests at ProgressionManager.test.ts; UPDATE expected values |
| BAL-01 | XPCurve: `calculateLevel(2000)` returns level matching new curve | unit | same file | ✅ |
| BAL-01 | awardXP boss_damage applies new rate (1 not 2) | unit | `npx vitest run server/domains/ProgressionManager.test.ts -t "boss_damage"` | ✅ existing at L175 |
| Cross-cutting | Phase 41 reconnect: `estimationSettings.autoAdvance` round-trips | integration | `npx vitest run server/websocket.reconnect.test.ts` | ⚠️ verify file exists; if not, add to Wave 0 |
| Cross-cutting | Phase 40 tutorial: walkthroughs still pass | integration | `npm run test:e2e -- --grep tutorial` | manual or e2e |

### Sampling Rate
- **Per task commit:** `npx vitest run` against the touched test file(s).
- **Per wave merge:** `npm test` (full Vitest suite).
- **Phase gate:** Full suite green + manual smoke (boss damage visible, auto-advance toggle round-trips, XP feels right) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `client/src/components/game/PlayerCharacter.test.tsx` — covers FIX-04 client damage flash trigger
- [ ] `client/src/components/game/FloatingDamageManager.test.tsx` — covers FIX-04 floating damage popup
- [ ] `client/src/components/game/FloatingDamageManager.tsx` — new component (test depends on file)
- [ ] `client/src/lib/utils/lobbySettingsStorage.test.ts` — covers FIX-05 autoAdvance persist/default/validate
- [ ] `server/gameState.test.ts` — verify exists; if not, add minimal `checkDiscussionConsensus` + `handleVotingTimeout` tests for FIX-05
- [ ] `shared/socket-schemas.test.ts` — verify exists; if not, add EstimationSettingsSchema autoAdvance defaulting test
- [ ] `server/websocket.reconnect.test.ts` — verify Phase 41 reconnect coverage; if integration tests live elsewhere, point to that location

*(Updates to existing tests, not gaps: ProgressionManager.test.ts curve threshold expectations, CombatManager.test.ts AoE hp-decrement assertion if missing.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 43 owns auth |
| V3 Session Management | no | Phase 41 owns reconnect |
| V4 Access Control | yes | Host-only auto-advance toggle — server enforces via `playerId === lobby.hostId` check (existing pattern at `websocket.ts:1242, 1256, 1383`) |
| V5 Input Validation | yes | zod `EstimationSettingsSchema` validates `autoAdvance: boolean` |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-host client emits `update_estimation_settings` to flip auto-advance | Elevation of Privilege | `gameState.updateEstimationSettings` already checks `player.isHost`; verify in code (verified pattern in `Lobby.tsx:1639` client-side gate, server enforces) |
| Malicious client emits `attack_boss` with `damage = 999999` | Tampering | Server-side `gameState.attackBoss` should clamp/validate damage (out of scope for this phase but worth noting) |
| Replay of old `combat:player_damaged` events on reconnect | Tampering | Existing `seq`-based ordering in `useEventSync.ts:34-63` already discards old events |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 18+ `lobby_updated` emit sites in CONTEXT-stated lines (660, 693, 810, etc.) all correspond to phase-change scenarios coverable by `session:phase_changed` | lobby_updated audit | [ASSUMED] Some may need bespoke events. Plan must verify each by reading the calling handler. |
| A2 | `autoAdvance: false` default doesn't regress existing host workflows enough to require migration UX | Auto-advance | [ASSUMED] User-research call. CONTEXT explicitly chose default-OFF for "lower regression risk." |
| A3 | XP curve change targeting "level cap unreachable in single 30-min session" matches user's intent | BAL-01 | [ASSUMED] CONTEXT says "researcher recommends, planner adopts." User may want different feel (e.g., "level 5 mid-session"). |
| A4 | Reducing `boss_damage` rate doesn't break combat feedback expectations (XP popup frequency stays meaningful) | BAL-01 | [ASSUMED] At rate=1, average attack of ~30dmg = 30XP (still visible as a popup). Below 1 would feel dead. |
| A5 | The CombatManager AoE/single-target functions at lines 1140-1216 (`performAoEAttack`, `attackSingleTarget`) are dead code and the active path is `performBossAttack` at line 984 | Architecture diagram | [VERIFIED: grep confirms only doc references to performAoEAttack/attackSingleTarget; no callers in `server/`]. |

## Open Questions (RESOLVED)

1. **Should plan 42-02 split into 42-02a (toggle) + 42-02b (event retirement)?**
   - What we know: 26 emit sites + 4-5 new events vs CONTEXT's "two known sites" estimate.
   - What's unclear: Ship-blocking severity of full retirement.
   - Recommendation: Planner splits and lets verify-phase check both. If 42-02b proves too large, escalate to user for ship/cut.
   - **RESOLVED:** Split into 42-02a (autoAdvance toggle) + 42-02b (lobby_updated retirement) per user decision; both plans created. 42-02b further split Task 1 into 1a (16 mechanical sites) + 1b (10 new-event sites) per checker feedback to bound blast radius.

2. **What's the exact semantic of websocket.ts:660, 693, 810 emit sites?**
   - What we know: They emit `lobby_updated`. Likely phase transitions or roster changes.
   - What's unclear: Without reading more of `websocket.ts` (lines were on the persisted-output not fully read in research), the planner needs to verify each.
   - Recommendation: Plan 42-02 includes a "audit each site" task as Task 0.
   - **RESOLVED:** Each site mapped in the 42-02b migration table (660 -> session:player_ready_changed, 693 -> session:lobby_renamed, 810 -> session:phase_changed). Site 6 (693) marked conditional with handler verification step in Task 1b.

3. **Does FloatingDamageManager need its own store slice, or extend `useProgression.pendingXPGains` pattern with a parallel `pendingDamageEvents`?**
   - What we know: FloatingXPManager reads from `useProgression`; mixing concerns is awkward.
   - What's unclear: Whether to add a slice to `useGameState` or new store.
   - Recommendation: New slice on `useGameState` (closer to combat-state ownership). Planner's discretion.
   - **RESOLVED:** Placed `pendingDamageEvents` slice on `useGameState.tsx` per the recommendation (closer to combat-state ownership). 42-01 Task 0 owns this addition.

4. **Are there integration tests for the socket-event lifecycle that would catch lobby_updated being emitted but not handled?**
   - What we know: Vitest tests exist for individual managers. E2E uses Playwright.
   - What's unclear: Whether contract-test coverage from Phase 12 still runs.
   - Recommendation: Plan 42-02 verifies via `tsc --noEmit` after removing `lobby_updated` from `ServerToClientEvents` — TypeScript catches all dangling emit sites at compile time.
   - **RESOLVED:** 42-02b uses `tsc --noEmit` (after Task 3 removes `lobby_updated` from ServerToClientEvents) as the compile-time validation safety net. Phase 12 contract-test coverage is not relied on; the type-system gate is sufficient.

## Sources

### Primary (HIGH confidence — direct code reads)
- `server/domains/CombatManager.ts:984-1068, 1140-1216, 1281-1310` — boss attack flow + applyDamageToPlayer
- `server/events/ClientEventEmitter.ts:237-244` — combat:player_damaged wire emission
- `client/src/lib/socket/eventHandlers.ts:351-371` — client damage handler
- `client/src/lib/stores/useEventSync.ts:34-63` — seq-based event handling
- `client/src/components/game/PlayerCharacter.tsx:55-104` — existing damage flash mechanism
- `client/src/components/game/PlayerHUD.tsx` (full file) — confirmed NO HP bar
- `client/src/components/game/FloatingXPManager.tsx` (full file) — pattern to mirror
- `client/src/components/ui/HealthBar.tsx` (full file) — primitive available for reuse
- `server/websocket.ts` — 22 grep hits for `'lobby_updated'`; key lines 159-160, 241, 611, 629, 660, 693, 810, 894 (removed comment), 918 (removed), 927, 959, 971, 1039 (removed), 1129, 1145, 1161, 1178, 1193, 1276, 1301, 1316, 1374 (removed), 1387 (removed), 1441 (removed), 1452, 1463, 1474, 1553, 2156, 2171
- `server/gameState.ts:173, 1322-1410, 1469-1612` — voting timeout + consensus countdown
- `client/src/pages/GamePage.tsx:188-219, 306` — deprecated handler + cleanup
- `client/src/lib/utils/lobbySettingsStorage.ts` (full file, 195 lines) — persistence pattern
- `client/src/components/game/Lobby.tsx:1610-1648, 1815-1930` — settings update pattern
- `shared/progressionTypes.ts` (full file) — XP rates + curve config
- `server/domains/ProgressionManager.ts:43-296` — XP curve + awardXP logic
- `shared/gameEvents.ts:240-465` — full event taxonomy

### Secondary (MEDIUM confidence — historical context)
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md:21-205` — confirms 16 lobby_updated emissions intentionally retained as v1.0 fallback
- `.planning/phases/05-fine-grained-events/05-05-PLAN.md` — original migration plan with KEEP-vs-REMOVE guidance

### Tertiary (LOW confidence — none flagged)
- None. All findings verified by direct file reads.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no version research needed.
- Architecture: HIGH — damage flow traced end-to-end with file:line citations.
- lobby_updated audit: HIGH for emit-site count (26 verified by grep); MEDIUM for replacement-event recommendations (some sites need their handler context confirmed).
- Pitfalls: HIGH — derived from actual code reading + Phase 41 reconnect SUMMARY notes.
- XP recommendation: MEDIUM-HIGH — math is verified, target-feel is one researcher's call ([ASSUMED A3]).

**Research date:** 2026-05-07
**Valid until:** 2026-06-06 (30 days for stable)
