---
phase: 42-v5-0-pre-ship-fixes-polish
plan: 02b
type: execute
wave: 2
depends_on: [01, 02a]
files_modified:n  - server/websocket.tsn  - client/src/pages/GamePage.tsxn  - client/src/lib/stores/useGameState.tsx
  - specs/asyncapi.yaml
  - CLAUDE.md
  - README.md
autonomous: true
requirements: [FIX-05]
tags: [sockets, event-taxonomy, refactor, ship-blocker]
must_haves:
  truths:
    - "Server emits ZERO `lobby_updated` events anywhere in server/"
    - "Client GamePage.tsx no longer registers a `lobby_updated` handler (lines 188-219 deleted) and no longer logs the deprecation warning"
    - "All 26 emit sites identified in RESEARCH.md are migrated to fine-grained events from the shared/gameEvents.ts taxonomy"
    - "BattleScreen remount logic for phase entry to battle AND mid-battle ticket change is preserved (moved into eventHandlers.ts)"
    - "TypeScript catches any dangling emit at compile time (lobby_updated removed from ServerToClientEvents)"
    - "No regressions in Phase 41 reconnect tests (lobbySync.lobby snapshot path is unchanged)"
  artifacts:
    - path: shared/gameEvents.ts
      provides: "New events: session:tickets_updated, session:player_ready_changed, session:lobby_renamed, session:settings_updated, session:game_reset, session:ticket_advanced; lobby_updated REMOVED from ServerToClientEvents"
      contains: "session:tickets_updated"
    - path: client/src/lib/socket/eventHandlers.ts
      provides: "Handlers for all new fine-grained events plus migrated BattleScreen-remount logic"
    - path: client/src/pages/GamePage.tsx
      provides: "Deprecated handler at lines 188-219 DELETED; cleanup at line 306 DELETED"
  key_links:
    - from: server/websocket.ts (every lobby_updated emit site, 25 sites)
      to: fine-grained event from shared/gameEvents.ts taxonomy
      via: "RESEARCH.md migration table lines 250-276 (authoritative)"
      pattern: "session:phase_changed|session:tickets_updated|session:settings_updated|session:game_reset|session:player_ready_changed|session:lobby_renamed|session:ticket_advanced|session:host_changed|player_left|battle_started|scores_revealed"
    - from: server/gameState.ts (1 lobby_updated emit site at line 1368)
      to: session:phase_changed + voting_timeout
      via: "RESEARCH.md row #26"
      pattern: "session:phase_changed"
    - from: client/src/lib/socket/eventHandlers.ts
      to: BattleScreen remount logic
      via: "session:phase_changed handler (newPhase==='battle') + new session:ticket_advanced handler (mid-battle ticket change)"
      pattern: "session:ticket_advanced"
---

<objective>
Fully retire the deprecated `lobby_updated` socket event. RESEARCH.md identified 26 live emit sites (CONTEXT estimate of 2 was wrong — researcher escalated). Migrate every site to the existing `shared/gameEvents.ts` fine-grained taxonomy, add 6 new events to fill remaining gaps, delete the client handler, and update documentation. The client handler removal MUST land in the same commit set as the LAST server emit removal — no in-flight events without a handler.

Depends on 42-02a so the new `session:settings_updated` event payload (designed there) is already part of the shared taxonomy when this plan absorbs the timer/jira/estimation emit sites.

Purpose: Close the event-retirement half of FIX-05.
Output: Type taxonomy update, 26-site migration in server/, client handler additions, GamePage handler deletion, doc updates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/42-v5-0-pre-ship-fixes-polish/42-CONTEXT.md
@.planning/phases/42-v5-0-pre-ship-fixes-polish/42-RESEARCH.md
@.planning/phases/42-v5-0-pre-ship-fixes-polish/42-PATTERNS.md
@.planning/phases/42-v5-0-pre-ship-fixes-polish/42-02a-SUMMARY.md

# Pattern source-of-truth (DO NOT modify these — copy patterns from)
@shared/gameEvents.ts
@server/websocket.ts
@server/gameState.ts
@client/src/pages/GamePage.tsx
@client/src/lib/socket/eventHandlers.ts

<!-- File coordination with 42-01 (Wave 1):
     Task 2 of this plan extends `client/src/lib/stores/useGameState.tsx` AFTER 42-01 Task 0 has
     added its `pendingDamageEvents` slice. Both slices co-exist on the same store —
     do NOT remove 42-01's additions when adding the `requestBattleRemount` slice. -->

<interfaces>
<!-- Authoritative migration table — copy verbatim from RESEARCH.md lines 250-276 -->

| # | File:Line | Trigger | Replacement |
|---|-----------|---------|-------------|
| 1 | websocket.ts:160 | startBattle | REMOVE (battle_started already covers) |
| 2 | websocket.ts:241 | sweeper interval (host_transferred grace expiry) | REMOVE (session:host_changed already covers) |
| 3 | websocket.ts:611 | add_tickets | session:tickets_updated (NEW) |
| 4 | websocket.ts:629 | remove_ticket | session:tickets_updated |
| 5 | websocket.ts:660 | toggle_ready | session:player_ready_changed (NEW) |
| 6 | websocket.ts:693 | update_lobby_name (verify) | session:lobby_renamed (NEW, conditional on handler verification) |
| 7 | websocket.ts:810 | host-only state push (verify) | session:phase_changed (verify) |
| 8 | websocket.ts:927 | submit_score reveal | session:phase_changed; scores_revealed already covers data |
| 9 | websocket.ts:959 | update_discussion_vote | estimation:discussion_vote_updated (NEW) |
| 10 | websocket.ts:971 | discussion auto-advance setTimeout | session:phase_changed |
| 11 | websocket.ts:1130 | restart_game / proceed_next_level | session:game_reset (NEW) OR system:full_state |
| 12-15 | websocket.ts:1145, 1161, 1178, 1193 | phase transitions | session:phase_changed |
| 16 | websocket.ts:1277 | advancePhaseNow | session:phase_changed |
| 17-18 | websocket.ts:1302, 1316 | forceVotingProgression | session:phase_changed (+ scores_revealed) |
| 19 | websocket.ts:1453 | update_timer_settings | session:settings_updated (from 42-02a) |
| 20 | websocket.ts:1464 | update_jira_settings | session:settings_updated |
| 21 | websocket.ts:1475 | update_estimation_settings | session:settings_updated |
| 22 | websocket.ts:1554 | reconnect broadcast | session:player_joined OR session:player_reconnected (NEW, optional) |
| 23 | websocket.ts:2157 | host transfer fallback | session:host_changed |
| 24 | websocket.ts:2172 | player removal fallback | player_left |
| 25 | gameState.ts:173 | restoreDisconnectedPlayer | session:player_joined |
| 26 | gameState.ts:1368 | handleVotingTimeout | session:phase_changed (+ voting_timeout) |

<!-- New events to add to shared/gameEvents.ts ServerToClientEvents (mirror existing seq+timestamp envelope, lines 422-462): -->
```typescript
'session:tickets_updated': (data: { tickets: JiraTicket[]; seq: number; timestamp: number }) => void;
'session:player_ready_changed': (data: { playerId: string; isReady: boolean; seq: number; timestamp: number }) => void;
'session:lobby_renamed': (data: { name: string; seq: number; timestamp: number }) => void;
'session:settings_updated': (data: { timerSettings?: TimerSettings; jiraSettings?: JiraSettings; estimationSettings?: EstimationSettings; seq: number; timestamp: number }) => void;
'session:game_reset': (data: { lobby: Lobby; seq: number; timestamp: number }) => void;
'session:ticket_advanced': (data: { currentTicket: JiraTicket; seq: number; timestamp: number }) => void;
'estimation:discussion_vote_updated': (data: { playerId: string; score: number | string; seq: number; timestamp: number }) => void;
```

<!-- REMOVE: -->
```typescript
'lobby_updated': (data: { lobby: Lobby }) => void; // shared/gameEvents.ts:322 — DELETE
```

<!-- Handler shape to copy for every new event (eventHandlers.ts:351-371): -->
```typescript
socket.on('<event_name>', (data: any) => {
  const { handleEvent } = useEventSync.getState();
  const processed = handleEvent('<event_name>', data, socket);
  if (processed) {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      setLobby({ ...currentLobby, /* scoped update from data */ });
    }
  }
});
```

<!-- BattleScreen remount logic to migrate (currently at GamePage.tsx:201-216): -->
```typescript
const shouldRemount = (
  (lastPhase && lastPhase !== 'battle' && lobby.gamePhase === 'battle') ||
  (lastPhase === 'battle' && lobby.gamePhase === 'battle' &&
   JSON.stringify(cl?.currentTicket) !== JSON.stringify(lobby.currentTicket))
);
```
Split into:
- session:phase_changed handler: newPhase === 'battle' branch
- session:ticket_advanced handler (NEW): mid-battle ticket change branch
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 0: Add new fine-grained events to shared/gameEvents.ts and add corresponding client handlers</name>
  <files>shared/gameEvents.ts, client/src/lib/socket/eventHandlers.ts</files>
  <read_first>
    - shared/gameEvents.ts (full file — read ServerToClientEvents declaration around line 240-465; locate `lobby_updated` declaration at line 322; locate existing JiraTicket/TimerSettings/JiraSettings/EstimationSettings/Lobby imports/types)
    - client/src/lib/socket/eventHandlers.ts (full file — locate combat:player_damaged handler at 351-371 and any existing session:* handlers as analogs; locate any `lobby_updated`-related references at line 297)
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-RESEARCH.md (lines 250-311 — migration table + side-effect inventory)
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-PATTERNS.md (lines 460-582 — event signatures and handler shape)
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-02a-SUMMARY.md (confirm session:settings_updated payload shape from 42-02a)
  </read_first>
  <action>
    1. In `shared/gameEvents.ts`, ADD the 7 new event signatures listed in `<interfaces>` above to `ServerToClientEvents`. Do NOT remove `lobby_updated` yet — that happens in Task 3 once all emits are gone.

    2. In `client/src/lib/socket/eventHandlers.ts`, ADD a handler for each new event using the canonical shape (eventHandlers.ts:351-371 analog). Specifically:
       - `session:tickets_updated` → `setLobby({ ...currentLobby, tickets: data.tickets })`
       - `session:player_ready_changed` → update `players[i].isReady` for the matching playerId in lobby state
       - `session:lobby_renamed` → `setLobby({ ...currentLobby, name: data.name })`
       - `session:settings_updated` → spread optional fields:
         ```typescript
         setLobby({
           ...currentLobby,
           ...(data.timerSettings && { timerSettings: data.timerSettings }),
           ...(data.jiraSettings && { jiraSettings: data.jiraSettings }),
           ...(data.estimationSettings && { estimationSettings: data.estimationSettings }),
         });
         ```
       - `session:game_reset` → `setLobby(data.lobby)` (full replace)
       - `session:ticket_advanced` → `setLobby({ ...currentLobby, currentTicket: data.currentTicket })` AND trigger BattleScreen remount (see Task 2)
       - `estimation:discussion_vote_updated` → update the discussion vote map for that player; copy shape from existing `submit_score`/discussion handler if present

    3. Each handler MUST go through the `useEventSync.handleEvent(...)` gate (drops out-of-order events).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>node -e "const s=require('fs').readFileSync('shared/gameEvents.ts','utf8'); ['session:tickets_updated','session:player_ready_changed','session:lobby_renamed','session:settings_updated','session:game_reset','session:ticket_advanced','estimation:discussion_vote_updated'].forEach(e=>{if(!s.includes(e)){console.error('missing event',e);process.exit(1)}})"</automated>
    <automated>node -e "const s=require('fs').readFileSync('client/src/lib/socket/eventHandlers.ts','utf8'); ['session:tickets_updated','session:player_ready_changed','session:lobby_renamed','session:settings_updated','session:game_reset','session:ticket_advanced','estimation:discussion_vote_updated'].forEach(e=>{if(!new RegExp(\"socket\\\\.on\\\\('\"+e.replace(':','\\\\:')+\"'\").test(s)){console.error('missing handler',e);process.exit(1)}})"</automated>
  </verify>
  <done>
    - 7 new event signatures present in ServerToClientEvents
    - 7 handler registrations present in eventHandlers.ts
    - tsc --noEmit clean (lobby_updated still defined; no breakage yet)
  </done>
  <acceptance_criteria>
    - All 7 event names present in shared/gameEvents.ts (grep)
    - All 7 socket.on registrations present in eventHandlers.ts (grep with `socket.on('<name>'`)
    - tsc --noEmit passes
  </acceptance_criteria>
</task>

<!-- Task 1 split into 1a + 1b per checker recommendation. Migration table groups sites
     by replacement type. Task 1a handles mechanical sites (REMOVE-only + session:phase_changed
     reuse, ~16 sites). Task 1b handles sites requiring NEW fine-grained event types (~10 sites).
     Either subtask can land independently; both must be complete before Task 2 (handler delete). -->

<task type="auto">
  <name>Task 1a: Migrate REMOVE-only + session:phase_changed sites (16 sites, mechanical)</name>
  <files>server/websocket.ts, server/gameState.ts</files>
  <read_first>
    - server/websocket.ts -- sites at 160, 241, 810, 927, 971, 1145, 1161, 1178, 1193, 1277, 1302, 1316, 1554, 2157, 2172. +/-15 lines per site.
    - server/gameState.ts:160-180 (site 173 -- restoreDisconnectedPlayer) and lines 1336-1380 (site 1368 -- handleVotingTimeout).
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-RESEARCH.md migration table (lines 250-276) -- authoritative.
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-PATTERNS.md lines 486-523 (replacement emit patterns).
  </read_first>
  <action>
    Apply the migration table for the mechanical subset.

    **A. REMOVE-only sites (no replacement needed because another event already covers):**
    - Site 1 (websocket.ts:160) -- `battle_started` adjacent emit covers; DELETE.
    - Site 2 (websocket.ts:241) -- `session:host_changed` already emitted; DELETE.
    - Site 22 (websocket.ts:1554) -- `session:player_joined` already covers reconnect-as-rejoin; DELETE.
    - Site 23 (websocket.ts:2157) -- `session:host_changed` already exists; DELETE.
    - Site 24 (websocket.ts:2172) -- `player_left` already exists; DELETE.
    - Site 25 (gameState.ts:173) -- `session:player_joined` covers; DELETE.

    **B. session:phase_changed sites (sites 7, 8, 10, 12-18, 26):**
       Replace each `io.to(lobbyId).emit(\'lobby_updated\', { lobby: updatedLobby });` with:
       ```typescript
       io.to(lobbyId).emit('session:phase_changed', {
         oldPhase: previousPhase,    // capture the lobby phase BEFORE the mutation
         newPhase: updatedLobby.gamePhase,
         seq: getNextSeq(lobbyId),
         timestamp: Date.now(),
       });
       ```
       Specific sites covered here: 7 (websocket.ts:810), 8 (927), 10 (971), 12-15 (1145, 1161, 1178, 1193), 16 (1277), 17-18 (1302, 1316), 26 (gameState.ts:1368).
       For sites 8 + 17 (reveal-emitting paths), confirm `scores_revealed` is already emitted nearby -- if so just remove the `lobby_updated`. For site 26, also keep the existing `voting_timeout` emit if present.

    Track every removal in a comment block at the top of websocket.ts (or the SUMMARY) referencing the migration table row. Sites NOT in this task's scope (3, 4, 5, 6, 9, 11, 19, 20, 21) are handled in Task 1b.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    <!-- After Task 1a, remaining lobby_updated occurrences should be <=10 (the Task 1b sites) -->
    <automated>node -e "const s=require('fs').readFileSync('server/websocket.ts','utf8').replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); const m=(s.match(/'lobby_updated'/g)||[]).length; if(m>10){console.error('Task 1a incomplete; expected <=10 remaining sites, found',m);process.exit(1)}"</automated>
  </verify>
  <done>
    - All 16 mechanical sites migrated or deleted
    - tsc --noEmit clean
    - Remaining `'lobby_updated'` occurrences in server/ are exclusively the Task 1b sites
  </done>
  <acceptance_criteria>
    - At most 10 non-comment occurrences of `'lobby_updated'` remain in `server/websocket.ts` after Task 1a (canonical check: the `<verify>` `node -e` script; passes with exit 0)
    - tsc --noEmit passes
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 1b: Migrate sites requiring NEW fine-grained event types (10 sites)</name>
  <files>server/websocket.ts</files>
  <read_first>
    - server/websocket.ts -- sites at 611, 629, 660, 693, 959, 1130, 1453, 1464, 1475. +/-15 lines per site to identify the calling handler.
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-RESEARCH.md migration table (lines 250-276).
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-PATTERNS.md lines 486-523.
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-02a-SUMMARY.md (confirms `session:settings_updated` payload from 42-02a).
  </read_first>
  <action>
    Apply the migration table for sites needing the NEW events added in Task 0.

    1. **session:tickets_updated (sites 3, 4 -- websocket.ts:611, 629):**
       ```typescript
       io.to(lobbyId).emit('session:tickets_updated', {
         tickets: updatedLobby.tickets,
         seq: getNextSeq(lobbyId),
         timestamp: Date.now(),
       });
       ```

    2. **session:player_ready_changed (site 5 -- websocket.ts:660):**
       ```typescript
       io.to(lobbyId).emit('session:player_ready_changed', {
         playerId: <player>.id,
         isReady: <player>.isReady,
         seq: getNextSeq(lobbyId),
         timestamp: Date.now(),
       });
       ```

    3. **session:lobby_renamed (site 6 -- websocket.ts:693, conditional):**
       Verify the handler is `update_lobby_name` (read context). If yes:
       ```typescript
       io.to(lobbyId).emit('session:lobby_renamed', {
         name: updatedLobby.name,
         seq: getNextSeq(lobbyId),
         timestamp: Date.now(),
       });
       ```
       If the handler turns out to be a different action, use the appropriate fine-grained replacement and document deviation in the SUMMARY.

    4. **estimation:discussion_vote_updated (site 9 -- websocket.ts:959):**
       ```typescript
       io.to(lobbyId).emit('estimation:discussion_vote_updated', {
         playerId, score,
         seq: getNextSeq(lobbyId),
         timestamp: Date.now(),
       });
       ```

    5. **session:game_reset (site 11 -- websocket.ts:1130):**
       ```typescript
       io.to(lobbyId).emit('session:game_reset', {
         lobby: updatedLobby,
         seq: getNextSeq(lobbyId),
         timestamp: Date.now(),
       });
       ```

    6. **session:settings_updated (sites 19, 20, 21 -- websocket.ts:1453, 1464, 1475):**
       ```typescript
       io.to(lobbyId).emit('session:settings_updated', {
         timerSettings: updatedLobby.timerSettings,    // include only the slice this handler updated
         // OR: jiraSettings / estimationSettings depending on site
         seq: getNextSeq(lobbyId),
         timestamp: Date.now(),
       });
       ```

    **Handoff with 42-02a:** site 21 (`update_estimation_settings`) is the same path 42-02a already wires through `updateEstimationSettings`. Confirm 42-02a's emit isn't redundant -- if 42-02a left a `lobby_updated` emit there, replace it with `session:settings_updated`. If 42-02a already emitted `session:settings_updated` there, skip site 21.

    Track every removal in a comment block referencing the migration table row.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>node -e "const s=require('fs').readFileSync('server/websocket.ts','utf8').replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); const m=(s.match(/'lobby_updated'/g)||[]).length; if(m>0){console.error('lobby_updated still present in websocket.ts:',m);process.exit(1)}"</automated>
    <automated>node -e "const s=require('fs').readFileSync('server/gameState.ts','utf8').replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); const m=(s.match(/'lobby_updated'/g)||[]).length; if(m>0){console.error('lobby_updated still present in gameState.ts:',m);process.exit(1)}"</automated>
  </verify>
  <done>
    - Zero live `lobby_updated` emit sites in server/ (verified by grep with comments stripped)
    - tsc --noEmit clean (lobby_updated declaration still in shared/gameEvents.ts; emits all replaced)
  </done>
  <acceptance_criteria>
    - 0 non-comment occurrences of `'lobby_updated'` in `server/websocket.ts` (canonical check: the `<verify>` `node -e` script; passes with exit 0)
    - 0 non-comment occurrences of `'lobby_updated'` in `server/gameState.ts` (canonical check: the `<verify>` `node -e` script; passes with exit 0)
    - tsc --noEmit passes
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Delete GamePage.tsx lobby_updated handler + migrate BattleScreen remount logic</name>
  <files>client/src/pages/GamePage.tsx, client/src/lib/socket/eventHandlers.ts</files>
  <read_first>
    - client/src/pages/GamePage.tsx (read lines 180-310 — full handler at 188-219 + cleanup at 306; identify how `setIsBattleUnmounting`, `setBattleRemountKey`, `lastGamePhaseRef`, `currentLobbyRef` are wired and whether they live on GamePage local state or a store)
    - client/src/lib/socket/eventHandlers.ts (Task 0 added the handlers; this task EXTENDS them with remount triggers)
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-RESEARCH.md lines 295-311 (side-effect inventory) and Pitfall 1 (lines 497-501)
  </read_first>
  <action>
    1. Migrate BattleScreen remount logic out of `GamePage.tsx:188-219` into either:
       - **Option A (preferred per PATTERNS.md):** Move remount trigger into `eventHandlers.ts` for `session:phase_changed` (newPhase === 'battle' branch) and `session:ticket_advanced` (mid-battle branch). To do this, GamePage's `setIsBattleUnmounting` + `setBattleRemountKey` setters must be exposed via a store (likely a new slice on `useGameState` like `requestBattleRemount: () => void`). Add this slice if needed.
       - **Option B:** Keep the remount setters local to GamePage but subscribe GamePage to `session:phase_changed` and `session:ticket_advanced` events directly via the existing socket-listener useEffect.

       Choose Option A — it keeps event handling centralized in eventHandlers.ts (matches existing pattern). Add `requestBattleRemount` to useGameState that performs the same `setIsBattleUnmounting(true) + setTimeout(100, () => { setBattleRemountKey++; setIsBattleUnmounting(false) })` sequence.

       Inside `eventHandlers.ts`:
       - In the `session:phase_changed` handler: after the `setLobby` call, if `data.oldPhase !== 'battle' && data.newPhase === 'battle'`, call `useGameState.getState().requestBattleRemount()`.
       - In the `session:ticket_advanced` handler: after the `setLobby` call, if `currentLobby.gamePhase === 'battle'`, call `requestBattleRemount()`.

    2. DELETE `GamePage.tsx:188-219` (the full `socket.on('lobby_updated', ...)` block including the `console.warn('Received deprecated lobby_updated event')`).
    3. DELETE the matching `socket.off('lobby_updated')` cleanup at line 306.
    4. If GamePage had local state for `isBattleUnmounting` + `battleRemountKey` and the migration moves these to the store (Option A), delete that local state and read it from `useGameState`.
    5. Verify the BattleScreen JSX still receives the same key + unmount props from the store.

    **Server-emit ↔ client-handler atomicity (per CONTEXT):** This task MUST be in the same commit set as Task 1 (the last server emit removal). Plan executor should commit Task 1 + Task 2 together OR as two commits in a single PR with no shipping between them.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>node -e "const s=require('fs').readFileSync('client/src/pages/GamePage.tsx','utf8'); if(/socket\.on\('lobby_updated'/.test(s)||/Received deprecated lobby_updated/.test(s)||/socket\.off\('lobby_updated'/.test(s)){console.error('lobby_updated handler/warning/cleanup still in GamePage');process.exit(1)}"</automated>
    <automated>node -e "const s=require('fs').readFileSync('client/src/lib/socket/eventHandlers.ts','utf8'); if(!/requestBattleRemount/.test(s)){console.error('requestBattleRemount migration missing');process.exit(1)}"</automated>
  </verify>
  <done>
    - GamePage.tsx no longer references lobby_updated (handler + cleanup deleted)
    - BattleScreen remount logic preserved via session:phase_changed + session:ticket_advanced
    - tsc --noEmit clean
  </done>
  <acceptance_criteria>
    - 0 occurrences of `lobby_updated` in `client/src/pages/GamePage.tsx` (canonical check: the `<verify>` `node -e` script; passes with exit 0)
    - 0 occurrences of `Received deprecated lobby_updated` in `client/src/pages/GamePage.tsx` (canonical check: the `<verify>` `node -e` script)
    - At least 1 occurrence of `requestBattleRemount` in `client/src/lib/socket/eventHandlers.ts` (canonical check: the `<verify>` `node -e` script)
    - tsc --noEmit passes
    - npm test passes overall
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Remove lobby_updated from shared/gameEvents.ts + update docs</name>
  <files>shared/gameEvents.ts, specs/asyncapi.yaml, CLAUDE.md, README.md</files>
  <read_first>
    - shared/gameEvents.ts:322 (the `lobby_updated` declaration in ServerToClientEvents)
    - specs/asyncapi.yaml:715 (the lobby_updated documentation entry)
    - CLAUDE.md:78 (state-sync philosophy line referencing lobby_updated — currently stale per RESEARCH.md)
    - README.md:206 (lobby_updated reference)
  </read_first>
  <action>
    1. In `shared/gameEvents.ts`, DELETE the `'lobby_updated': (data: { lobby: Lobby }) => void;` line from `ServerToClientEvents` (around line 322). After this deletion, `tsc --noEmit` will catch any remaining emit site that Task 1 missed (this is the safety net per RESEARCH.md Open Question 4).

    2. In `specs/asyncapi.yaml:715`, DELETE the `lobby_updated` channel/operation entry. Verify YAML still parses.

    3. In `CLAUDE.md:78`, REPLACE the stale documentation line ("Server emits `lobby_updated` event whenever game state changes...") with:
       ```
       ## State Sync
       Server emits fine-grained domain events (session:*, combat:*, estimation:*) defined in `shared/gameEvents.ts` whenever game state changes. The legacy `lobby_updated` full-state event was retired in Phase 42; all state mutations in `gameState.ts` should broadcast scoped fine-grained events.
       ```

    4. In `README.md:206`, REMOVE or UPDATE the lobby_updated reference (keep the surrounding context coherent).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>node -e "const s=require('fs').readFileSync('shared/gameEvents.ts','utf8'); if(/'lobby_updated'/.test(s)){console.error('lobby_updated still declared in shared/gameEvents.ts');process.exit(1)}"</automated>
    <automated>node -e "const s=require('fs').readFileSync('specs/asyncapi.yaml','utf8'); if(/lobby_updated/.test(s)){console.error('lobby_updated still in asyncapi.yaml');process.exit(1)}"</automated>
    <automated>node -e "const s=require('fs').readFileSync('CLAUDE.md','utf8'); if(/Server emits .lobby_updated. event whenever/.test(s)){console.error('CLAUDE.md still references stale lobby_updated doc');process.exit(1)}"</automated>
    <automated>npm test</automated>
  </verify>
  <done>
    - `lobby_updated` removed from shared/gameEvents.ts ServerToClientEvents
    - asyncapi.yaml + CLAUDE.md + README.md updated
    - tsc --noEmit catches zero dangling emits (proves Task 1 was complete)
    - Full Vitest suite passes
  </done>
  <acceptance_criteria>
    - 0 occurrences of `'lobby_updated'` in `shared/gameEvents.ts` (canonical check: the `<verify>` `node -e` script; passes with exit 0)
    - 0 occurrences of `lobby_updated` in `specs/asyncapi.yaml` (canonical check: the `<verify>` `node -e` script)
    - 0 occurrences of the stale "Server emits `lobby_updated` event whenever..." doc line in `CLAUDE.md` (historical "Phase 42 retired" notes allowed; canonical check: the `<verify>` `node -e` script)
    - tsc --noEmit passes
    - `npm test` passes overall
    - Phase 41 reconnect tests still pass
    - Phase 40 tutorial tests still pass
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server→client (every fine-grained event) | Server-authoritative state push; client validates seq ordering |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-42-07 | Tampering | Out-of-order replay of session:* events on reconnect | mitigate | Existing useEventSync.handleEvent (eventHandlers.ts) seq gate already discards stale events; new handlers reuse the same gate |
| T-42-08 | Information Disclosure | session:game_reset full-lobby payload to non-members | accept | Existing room-scoped emit (`io.to(lobbyId)`) already gates audience |
| T-42-09 | Denial of Service | Removal of lobby_updated breaks a critical path mid-flight | mitigate | Task 2 + Task 3 land same commit set; tsc --noEmit catches dangling emits before commit; Phase 41 reconnect tests must pass |
</threat_model>

<verification>
- `npx tsc --noEmit` passes (proves lobby_updated declaration removal is safe)
- `grep -c "'lobby_updated'" server/` returns 0 across all server files
- Phase 40 tutorial tests pass (no overlay changes)
- Phase 41 reconnect tests pass (lobbySync.lobby snapshot path is unchanged; Pitfall 5)
- Phase 42-01 tests pass (no overlap with this plan)
- `npm test` overall green
- Manual smoke: full game flow (lobby → battle → reveal → next_level) — no `Received deprecated lobby_updated event` warning in browser console
</verification>

<success_criteria>
1. Zero live `lobby_updated` emits in server/ (grep with comments stripped returns 0)
2. Zero references to lobby_updated in client GamePage.tsx
3. shared/gameEvents.ts no longer declares lobby_updated; tsc --noEmit confirms no dangling emit
4. BattleScreen still remounts on phase entry to battle AND on mid-battle ticket change (Pitfall 1 — verified manually + by Phase 41 tests)
5. Phase 41 reconnect round-trip still works (lobby snapshot includes settings; no Phase 41 changes needed)
6. asyncapi.yaml + CLAUDE.md + README.md no longer document the retired event
</success_criteria>

<output>
Create `.planning/phases/42-v5-0-pre-ship-fixes-polish/42-02b-SUMMARY.md` documenting:
- Migration table (verbatim from RESEARCH.md, marked with PR/commit refs for each row)
- New events added to shared/gameEvents.ts (with line refs)
- BattleScreen remount migration approach (which option taken)
- Doc updates (CLAUDE.md:78 before/after, asyncapi.yaml:715 deletion, README.md:206)
- Confirmation that Task 2 + Task 3 landed in same commit set as Task 1 (no in-flight events without handler)
- Vitest + tsc output proving zero dangling references
</output>
