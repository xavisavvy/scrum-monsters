---
slug: solo-vote-stuck-discussion
status: resolved
trigger: solo-player vote — Discussion UI stuck on "Team Discussion in Progress" until refresh; Advance Now flaky after refresh
created: 2026-05-16
updated: 2026-05-16
resolved: 2026-05-16
---

# Debug: solo-vote-stuck-discussion

## Symptoms

<DATA_START>
- **Primary symptom (solo player, single-player lobby):**
  1. User submits their estimate via the Score Submission UI.
  2. Server moves the phase forward (battle → reveal → discussion).
  3. Client UI gets stuck displaying *"Team Discussion in Progress"* — the
     Discussion screen does not see the user's own vote, so `hasConsensus`
     stays false and the Advance Now button is not rendered.
  4. After a full-page refresh, the lobby state hydrates with the user's
     vote populated on `currentLobby.players[*].currentScore`, so the
     Discussion UI now sees `hasConsensus = true` and shows the Advance Now
     button.

- **Secondary symptom (after refresh):** the Advance Now button works
  sometimes and silently does nothing other times.

- **Console error reported by user:** Chrome-extension-emitted noise
  ("listener indicated an asynchronous response...") — red herring.

- **Repro:** Create a lobby as a single player, add a ticket, start the
  battle, submit any estimate. UI stuck on Team Discussion in Progress.
</DATA_END>

## Evidence

- timestamp: 2026-05-16 — `grep` confirmed `scores_revealed` has **zero**
  client handlers (`client/src/lib/socket/eventHandlers.ts`); only the
  `estimation:votes_revealed` handler at line 318 could populate per-player
  `currentScore`.
- timestamp: 2026-05-16 — `grep` confirmed **no production emit site** for
  `estimation:votes_revealed` server-side. Defined in
  `shared/gameEvents.ts:449` and `shared/clientEvents.ts:78` but never sent.
  `ClientEventEmitter.ts` has no bridge for it.
- timestamp: 2026-05-16 — Inspected `server/websocket.ts:961-992`: the
  `submit_score` reveal block emits the team-aggregate `scores_revealed`
  but no per-player vote event.
- timestamp: 2026-05-16 — Inspected `Discussion.tsx:58-77`: `hasConsensus`
  is derived from `currentLobby.teams.{developers,qa}[*].currentScore`,
  which is undefined for everyone (including the voter themselves) until
  the next full-state hydration (lobby_sync on refresh).
- timestamp: 2026-05-16 — Inspected the client handler at
  `eventHandlers.ts:318-338`: it expects `data.teamScores[playerTeam][p.id]`,
  which does **not** match the canonical typed contract `{ votes, team }`.
  So even if the server had been emitting the typed shape, the client
  would have dropped it on the floor.
- timestamp: 2026-05-16 — Inspected `advancePhaseNow` handler at
  `server/websocket.ts:1331-1371`: silently no-ops if
  `lobby.gamePhase !== 'discussion'` (auto-advance race). The flakiness
  reported is a downstream consequence of the primary bug: when the client
  doesn't receive per-player reveal data, `hasConsensus` is false and the
  button is never rendered. After refresh it sometimes works and sometimes
  hits the server-side phase race.
- timestamp: 2026-05-16 — Type check (`npm run check`) and full test
  suite (`npx vitest run`, 736 tests across 45 files) pass after fix.

## Eliminated

- Chrome extension console error — not app code; canonical
  `chrome.runtime.onMessage` warning string. No further action.
- Advance Now button as a standalone bug — flakiness is a symptom of the
  primary missing-reveal-event bug; the server handler's silent no-op on
  out-of-phase advance is intentional (logged at debug level).

## Resolution

**Root cause:** The legacy `submit_score` reveal path emits only the
team-aggregate `scores_revealed` event, which carries `teamScores` keyed
by `{ developers, qa }` but has no client handler that updates
per-player `currentScore`. The fine-grained `estimation:votes_revealed`
event (defined in `shared/gameEvents.ts:449`) has a client handler at
`client/src/lib/socket/eventHandlers.ts:318`, but no server code path
emits it on the `submit_score` flow. Result: per-player vote values are
held server-side only; `Discussion.tsx` sees undefined scores and renders
"Team Discussion in Progress" until a full lobby_sync (page refresh)
hydrates them. The "Advance Now" flakiness is downstream of this — the
button is gated behind `hasConsensus`, which can never be true without
per-player data, and after refresh it can race the auto-advance timer.

**Fix:**

1. `server/websocket.ts` — In both the `submit_score` reveal block and
   the `forceVotingProgression` reveal cascade, after the existing
   `scores_revealed` emit, emit `estimation:votes_revealed` once per
   non-empty team with the canonical `{ votes, team }` payload via the
   existing `emitFineGrained(...)` helper (which adds seq + timestamp +
   buffers for missed-event recovery).
2. `client/src/lib/socket/eventHandlers.ts` — Rewrite the
   `estimation:votes_revealed` handler to read `data.votes` keyed by
   playerId and use `data.team` to scope the player update, matching the
   typed contract in `shared/clientEvents.ts`. Kept a legacy fallback for
   `data.teamScores[data.team]` for forward-compat noise.

**Files changed:**

- `C:\Users\Preston\git\ScrumMonsters\server\websocket.ts`
  (lines ~964 and ~1403 — two reveal call sites)
- `C:\Users\Preston\git\ScrumMonsters\client\src\lib\socket\eventHandlers.ts`
  (lines ~318)

**Validation:**

- `npm run check` — clean (no new TS errors).
- `npx vitest run` — 736/736 tests pass.
- Manual repro recommended: solo lobby, vote → expect Discussion screen
  to render with consensus + Advance Now immediately (no refresh needed).

## Current Focus

- hypothesis: confirmed and fixed
- next_action: manual smoke test in dev; consider adding a regression
  test that asserts `estimation:votes_revealed` is emitted on the
  `submit_score` reveal path (no existing test covers this).
