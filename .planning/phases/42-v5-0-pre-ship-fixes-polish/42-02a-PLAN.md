---
phase: 42-v5-0-pre-ship-fixes-polish
plan: 02a
type: execute
wave: 1
depends_on: []
files_modified:
  - shared/socket-schemas.ts
  - shared/gameEvents.ts
  - client/src/lib/utils/lobbySettingsStorage.ts
  - client/src/lib/gameTypes.ts
  - client/src/components/game/Lobby.tsx
  - server/gameState.ts
  - client/src/lib/utils/lobbySettingsStorage.test.ts
  - server/gameState.test.ts
  - server/websocket.autoAdvance.reconnect.test.ts
autonomous: true
requirements: [FIX-05]
tags: [lobby-settings, host-controls, schema, sockets]
must_haves:
  truths:
    - "Host sees an 'Auto-advance to next ticket on consensus' checkbox in the Estimation Settings section of the Lobby UI"
    - "The toggle is disabled for non-hosts and outside the lobby phase"
    - "Default value is OFF for newly created lobbies"
    - "When toggle is OFF, server does NOT start the consensus countdown on team agreement"
    - "When toggle is ON, server DOES start the existing consensus countdown"
    - "The 3-minute voting-timeout fallback fires regardless of the toggle state (safety net preserved)"
    - "autoAdvance value persists in localStorage across new lobbies (host preference) and round-trips through Phase 41 reconnect"
    - "A regression test asserts autoAdvance survives reconnect-token round-trip"
  artifacts:
    - path: shared/socket-schemas.ts
      provides: "EstimationSettingsSchema extended with autoAdvance: z.boolean().optional().default(false)"
      contains: "autoAdvance"
    - path: client/src/lib/utils/lobbySettingsStorage.ts
      provides: "getDefaultSettings + validateSettings handle autoAdvance with default false"
      contains: "autoAdvance"
    - path: client/src/components/game/Lobby.tsx
      provides: "Auto-advance checkbox in Estimation Settings section"
      contains: "Auto-advance to next ticket"
    - path: server/gameState.ts
      provides: "checkDiscussionConsensus countdown gated on lobby.estimationSettings?.autoAdvance"
  key_links:
    - from: client/src/components/game/Lobby.tsx
      to: updateEstimationSettings
      via: "existing function at Lobby.tsx:1638-1648 (no new wiring needed)"
      pattern: "updateEstimationSettings"
    - from: server/gameState.ts (checkDiscussionConsensus, ~line 1534)
      to: lobby.estimationSettings.autoAdvance
      via: "added to existing if-condition"
      pattern: "autoAdvance"
    - from: client/src/lib/utils/lobbySettingsStorage.ts
      to: localStorage["scrum-monsters-lobby-settings"]
      via: "existing 3-tier persistence — defaults + validator extended"
      pattern: "autoAdvance"
---

<objective>
Restore auto-advance as a host-only Lobby UI setting (default OFF), persisted with other lobby settings, gating ONLY the consensus countdown. The 3-minute voting-timeout fallback at gameState.ts:1322-1346 stays untouched (safety net per CONTEXT D-Auto-advance).

Cross-plan handoff to 42-02b: this plan introduces a `session:settings_updated` fine-grained event payload designed to absorb the future migration of all settings emit sites (timer/jira/estimation) — payload shape uses optional fields so 42-02b can fold timer/jira sites into the same event.

Purpose: Close the toggle half of FIX-05.
Output: Schema extension, type extension, storage extension, Lobby UI checkbox, server gate, two new Vitest test files.
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

# Pattern source-of-truth (DO NOT modify these — copy patterns from)
@shared/socket-schemas.ts
@client/src/lib/utils/lobbySettingsStorage.ts
@client/src/components/game/Lobby.tsx
@server/gameState.ts

<interfaces>
<!-- Existing schema (shared/socket-schemas.ts:125-128) -->
```typescript
export const EstimationSettingsSchema = z.object({
  scaleType: EstimationScaleTypeSchema,
  customTshirtMapping: z.record(z.string(), z.number()).optional(),
});
```

<!-- Existing storage default (lobbySettingsStorage.ts:97-110) — extend in place -->
<!-- Existing validator (lobbySettingsStorage.ts:115-145) — extend in place -->

<!-- Existing Lobby.tsx host-gated update flow (lines 1638-1648): -->
<!-- updateEstimationSettings emits + persists + toasts; no new wiring needed -->

<!-- Existing server gate point (server/gameState.ts:1534): -->
```typescript
if (teamsAgree && lobby.boss && lobby.currentTicket) {
  if (!lobby.consensusCountdown?.isActive) { /* start countdown */ }
}
```

<!-- session:settings_updated payload (NEW — designed for 42-02b multi-settings absorption): -->
```typescript
'session:settings_updated': (data: {
  timerSettings?: TimerSettings;
  jiraSettings?: JiraSettings;
  estimationSettings?: EstimationSettings;
  seq: number;
  timestamp: number;
}) => void;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 0 (Wave 0): Extend EstimationSettings schema/type + LobbySettingsStorage with autoAdvance</name>
  <files>shared/socket-schemas.ts, shared/gameEvents.ts, client/src/lib/gameTypes.ts, client/src/lib/utils/lobbySettingsStorage.ts, client/src/lib/utils/lobbySettingsStorage.test.ts</files>
  <read_first>
    - shared/socket-schemas.ts (locate EstimationSettingsSchema around line 125-128 + line 268)
    - shared/gameEvents.ts (locate EstimationSettings interface declaration; verify if it lives here or in client/src/lib/gameTypes.ts)
    - client/src/lib/gameTypes.ts (read EstimationSettings interface)
    - client/src/lib/utils/lobbySettingsStorage.ts (full file, 195 lines — locate getDefaultSettings ~97-110 and validateSettings ~115-145)
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-PATTERNS.md (Plan 42-02a patterns — verbatim snippets)
  </read_first>
  <behavior>
    - Test 1: getDefaultSettings() returns estimationSettings with autoAdvance === false
    - Test 2: validateSettings({ estimationSettings: { scaleType: 'fibonacci', autoAdvance: true } }) preserves autoAdvance: true
    - Test 3: validateSettings({ estimationSettings: { scaleType: 'fibonacci', autoAdvance: 'not-a-bool' } }) coerces autoAdvance to false
    - Test 4: A round-trip through saveSettings/loadSettings preserves autoAdvance: true
    - Test 5: zod EstimationSettingsSchema.parse({ scaleType: 'fibonacci' }) succeeds with autoAdvance defaulting to false
  </behavior>
  <action>
    1. In `shared/socket-schemas.ts`, extend `EstimationSettingsSchema` (around line 125-128 — and the second occurrence near line 268 if duplicated, verify by grep):
       ```typescript
       export const EstimationSettingsSchema = z.object({
         scaleType: EstimationScaleTypeSchema,
         customTshirtMapping: z.record(z.string(), z.number()).optional(),
         autoAdvance: z.boolean().optional().default(false),
       });
       ```
       If a duplicate schema definition exists, update both.

    2. Extend the `EstimationSettings` TypeScript interface (per D-AutoAdvance, lives in `client/src/lib/gameTypes.ts` per Lobby.tsx:23 import; verify by grep). Add:
       ```typescript
       autoAdvance?: boolean;
       ```
       Verify if `shared/gameEvents.ts` also declares an EstimationSettings interface and update there too — both must be in sync.

    3. In `client/src/lib/utils/lobbySettingsStorage.ts`:
       - Update `getDefaultSettings()` estimationSettings to include `autoAdvance: false`.
       - Update `validateSettings()` to coerce autoAdvance to boolean (use the `typeof settings.estimationSettings?.autoAdvance === 'boolean'` guard pattern):
         ```typescript
         autoAdvance: typeof settings.estimationSettings?.autoAdvance === 'boolean'
           ? settings.estimationSettings.autoAdvance
           : false,
         ```

    4. Create `client/src/lib/utils/lobbySettingsStorage.test.ts` covering all 4 storage behaviors above. Use happy-dom's localStorage. Mirror the vitest describe/it pattern from server/domains/ProgressionManager.test.ts. At minimum:
       ```typescript
       import { describe, it, expect, beforeEach } from 'vitest';
       import { LobbySettingsStorage } from './lobbySettingsStorage';

       describe('LobbySettingsStorage autoAdvance', () => {
         beforeEach(() => { localStorage.clear(); });

         it('default settings have autoAdvance false', () => {
           const s = LobbySettingsStorage.loadSettings();
           expect(s.estimationSettings?.autoAdvance).toBe(false);
         });

         it('round-trips autoAdvance: true', () => {
           LobbySettingsStorage.updateEstimationSettings({ scaleType: 'fibonacci', autoAdvance: true });
           const s = LobbySettingsStorage.loadSettings();
           expect(s.estimationSettings?.autoAdvance).toBe(true);
         });

         it('coerces non-boolean autoAdvance to false', () => {
           localStorage.setItem('scrum-monsters-lobby-settings', JSON.stringify({
             estimationSettings: { scaleType: 'fibonacci', autoAdvance: 'oops' },
           }));
           const s = LobbySettingsStorage.loadSettings();
           expect(s.estimationSettings?.autoAdvance).toBe(false);
         });
       });
       ```
       (Adjust method names to match the actual exported API — read the storage file first.)

    5. Verify the existing `server/domains/ProgressionManager.test.ts` is the closest analog and use the exact describe/it/beforeEach style.
  </action>
  <verify>
    <automated>npx vitest run client/src/lib/utils/lobbySettingsStorage.test.ts</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>node -e "const s=require('fs').readFileSync('shared/socket-schemas.ts','utf8'); if(!/autoAdvance/.test(s)){process.exit(1)}"</automated>
    <automated>node -e "const s=require('fs').readFileSync('client/src/lib/utils/lobbySettingsStorage.ts','utf8'); if((s.match(/autoAdvance/g)||[]).length<2){process.exit(1)}"</automated>
  </verify>
  <done>
    - All 3 storage layers carry autoAdvance with default false
    - Vitest passes the new test file
    - tsc --noEmit clean
  </done>
  <acceptance_criteria>
    - At least 1 occurrence of `autoAdvance` in `shared/socket-schemas.ts` (canonical check: the `<verify>` `node -e` script above)
    - At least 2 occurrences of `autoAdvance` in `client/src/lib/utils/lobbySettingsStorage.ts` (default + validator; canonical check: the `<verify>` `node -e` script above)
    - `npx vitest run client/src/lib/utils/lobbySettingsStorage.test.ts` passes
    - `npx tsc --noEmit` passes
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 1: Add Lobby UI auto-advance checkbox + server-side consensus gate + gameState test</name>
  <files>client/src/components/game/Lobby.tsx, server/gameState.ts, server/gameState.test.ts</files>
  <read_first>
    - client/src/components/game/Lobby.tsx (full file is large; offset to lines 1810-1940 — read the existing timer-enabled checkbox at 1810-1822 + the estimation scaleType select around 1880-1933 + updateEstimationSettings function at 1638-1648)
    - server/gameState.ts (offset to lines 1500-1612 — read checkDiscussionConsensus countdown gate ~1534-1556 + manualAdvancePhase ~1597-1612 + handleVotingTimeout ~1322-1346 to confirm safety-net path is untouched)
    - server/domains/ProgressionManager.test.ts (analog test file structure for server-side vitest)
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-PATTERNS.md (lines 392-456)
  </read_first>
  <behavior>
    - Test 1: A lobby with estimationSettings.autoAdvance=false does NOT start consensusCountdown when checkDiscussionConsensus is called with team agreement
    - Test 2: A lobby with estimationSettings.autoAdvance=true DOES start consensusCountdown under the same conditions
    - Test 3: handleVotingTimeout (3-min safety net) STILL fires regardless of autoAdvance setting (sanity: prove path is unchanged)
  </behavior>
  <action>
    1. In `client/src/components/game/Lobby.tsx`, INSIDE the Estimation Settings section (around line 1933, after the scaleType select), add the auto-advance checkbox using the timer-enabled checkbox pattern (Lobby.tsx:1810-1822) as the analog:
       ```tsx
       <label className="flex items-center gap-2 cursor-pointer mt-3">
         <input
           type="checkbox"
           className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
           checked={currentLobby.estimationSettings?.autoAdvance ?? false}
           onChange={(e) => updateEstimationSettings({
             scaleType: currentLobby.estimationSettings?.scaleType ?? 'fibonacci',
             customTshirtMapping: currentLobby.estimationSettings?.customTshirtMapping,
             autoAdvance: e.target.checked,
           })}
           disabled={!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby'}
         />
         <span className="text-sm font-medium">Auto-advance to next ticket on consensus (5s countdown)</span>
       </label>
       ```
       Do NOT modify `updateEstimationSettings` function (lines 1638-1648) — it already does the emit + persist + toast.

    2. In `server/gameState.ts` `checkDiscussionConsensus` function (around line 1534), MODIFY the existing condition:
       ```typescript
       // BEFORE:
       if (teamsAgree && lobby.boss && lobby.currentTicket) {
         if (!lobby.consensusCountdown?.isActive) {
           // start countdown ...
         }
       }
       // AFTER:
       if (teamsAgree && lobby.boss && lobby.currentTicket && lobby.estimationSettings?.autoAdvance) {
         if (!lobby.consensusCountdown?.isActive) {
           // start countdown ...
         }
       }
       ```
       Do NOT modify `handleVotingTimeout` (lines 1322-1346) — the 3-min safety net is locked.

    3. Create or extend `server/gameState.test.ts` (verify if file exists; if not, create new). Cover all 3 behaviors. Mock or construct minimal lobby state with two teams, currentTicket, boss, and discussion votes that constitute teamsAgree. Assert:
       - With `autoAdvance: false`: `lobby.consensusCountdown?.isActive` is falsy after `checkDiscussionConsensus(lobbyId)`
       - With `autoAdvance: true`: `lobby.consensusCountdown?.isActive` is true after the same call
       - With either setting and elapsed voting timeout: `handleVotingTimeout` still advances the phase
       Use the vitest describe/it/beforeEach pattern from `server/domains/ProgressionManager.test.ts`.
  </action>
  <verify>
    <automated>npx vitest run server/gameState.test.ts</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>node -e "const s=require('fs').readFileSync('client/src/components/game/Lobby.tsx','utf8'); if(!/Auto-advance to next ticket/.test(s)||!/autoAdvance: e\.target\.checked/.test(s)){process.exit(1)}"</automated>
    <automated>node -e "const s=require('fs').readFileSync('server/gameState.ts','utf8').replace(/^\s*\/\/.*$/gm,''); if(!/estimationSettings\?\.autoAdvance/.test(s)){process.exit(1)}"</automated>
    <automated>node -e "const s=require('fs').readFileSync('server/gameState.ts','utf8'); if(!/handleVotingTimeout/.test(s)){console.error('safety-net function missing');process.exit(1)}"</automated>
  </verify>
  <done>
    - Lobby UI has the host-gated checkbox at the documented position
    - Server gate added to checkDiscussionConsensus
    - 3-min handleVotingTimeout untouched (verified by grep + test)
    - Vitest passes; tsc --noEmit clean
  </done>
  <acceptance_criteria>
    - The string `Auto-advance to next ticket` appears in `client/src/components/game/Lobby.tsx` (canonical check: the `<verify>` `node -e` script above)
    - At least 1 occurrence of `estimationSettings?.autoAdvance` in `server/gameState.ts` non-comment lines (canonical check: the `<verify>` `node -e` script above)
    - `npx vitest run server/gameState.test.ts` passes all three behaviors
    - `npx tsc --noEmit` passes
    - Phase 41 reconnect tests still pass (estimationSettings round-trips through snapshot — verify no new code in reconnect path)
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add Phase 41 reconnect regression test for autoAdvance round-trip</name>
  <files>server/websocket.autoAdvance.reconnect.test.ts</files>
  <read_first>
    - server/websocket.reconnect.test.ts (if it exists -- read full file to mirror reconnect-token round-trip pattern). If absent, read server/websocket.ts:1487 area for `lobbySync.lobby` snapshot shape and any existing reconnect helpers.
    - .planning/phases/42-v5-0-pre-ship-fixes-polish/42-RESEARCH.md (Pitfall 5 -- reconnect-token snapshot inclusion).
  </read_first>
  <behavior>
    - Test 1: A lobby with `estimationSettings.autoAdvance === true` survives a reconnect-token round-trip (snapshot -> restore -> reconnect -> reads back true).
    - Test 2: A lobby with `estimationSettings.autoAdvance === false` (default) survives the same round-trip.
  </behavior>
  <action>
    1. If `server/websocket.reconnect.test.ts` exists, EXTEND it with a new `describe('autoAdvance reconnect round-trip', ...)` block. Otherwise CREATE `server/websocket.autoAdvance.reconnect.test.ts` mirroring the existing reconnect test pattern in this codebase (search for `reconnect_token` or `lobbySync` test fixtures).
    2. Test the round-trip:
       - Create a lobby with `estimationSettings: { scaleType: 'fibonacci', autoAdvance: true }`.
       - Serialize via the snapshot path used at `websocket.ts:1487` (lobbySync.lobby).
       - Deserialize / restore.
       - Assert: restored `lobby.estimationSettings.autoAdvance === true`.
       - Repeat for `autoAdvance: false`.
    3. ~10 lines of test code total (it is a property assertion, not a full reconnect simulation -- the value just needs to round-trip through the snapshot serializer).
  </action>
  <verify>
    <automated>npx vitest run server/websocket.autoAdvance.reconnect.test.ts</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - New (or extended) reconnect test file exists with both round-trip assertions
    - Vitest passes; tsc --noEmit clean
    - Phase 41 reconnect path is unchanged (this is purely a regression assertion)
  </done>
  <acceptance_criteria>
    - The new test passes (canonical check: `npx vitest run` exits 0)
    - tsc --noEmit passes
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client→server (update_estimation_settings) | Untrusted client emits new settings; server must enforce host-only |
| localStorage (lobbySettingsStorage) | Tampered storage values must not crash app |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-42-04 | Elevation of Privilege | Non-host emits update_estimation_settings to flip autoAdvance | mitigate | Existing host-id check in `gameState.updateEstimationSettings` (verified pattern). Client-side `disabled={!currentPlayer?.isHost}` is defense in depth; server is authoritative |
| T-42-05 | Tampering | Malformed autoAdvance value in localStorage | mitigate | validateSettings coerces non-boolean to false |
| T-42-06 | Tampering | Malformed autoAdvance over the wire | mitigate | zod EstimationSettingsSchema validates and defaults |
</threat_model>

<verification>
- Phase 41 reconnect tests still pass (lobby snapshot must round-trip estimationSettings — already covered)
- Phase 40 tutorial tests still pass (no overlay/z-index changes)
- `npx tsc --noEmit` clean
- `npm test` overall green
</verification>

<success_criteria>
1. Host sees the checkbox in Lobby; non-hosts see it disabled (or the same disabled state pattern as timer-enabled checkbox)
2. With autoAdvance=false: voting on consensus does NOT auto-advance; "Advance Now" button still works
3. With autoAdvance=true: 5-second countdown begins on consensus, completing into the next phase
4. With either setting: 3-minute voting timeout still fires (safety net intact)
5. autoAdvance survives Phase 41 reconnect round-trip (no test changes; lobby snapshot inherently includes estimationSettings)
</success_criteria>

<output>
Create `.planning/phases/42-v5-0-pre-ship-fixes-polish/42-02a-SUMMARY.md` documenting:
- Schema/type/storage extensions (file:line refs)
- Lobby.tsx checkbox insertion point (file:line)
- gameState.ts gate condition change (single-line)
- Confirmation that handleVotingTimeout (3-min safety net) is unchanged
- Cross-plan handoff note: `session:settings_updated` payload shape designed to absorb timer/jira/estimation emit sites in 42-02b
- Vitest commands and pass output
</output>
