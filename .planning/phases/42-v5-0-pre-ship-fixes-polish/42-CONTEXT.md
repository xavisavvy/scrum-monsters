# Phase 42: v5.0 Pre-Ship Fixes & Polish - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning
**Source:** /gsd-discuss-phase

<domain>
## Phase Boundary

Three independent pre-ship defects flagged late in milestone v5.0:

1. **FIX-04 (42-01)** — Boss attacks don't reliably apply damage to player HP. Especially suspicious for AoE attacks. Includes verifying or adding damage feedback (HP bar shake / floating damage number / screen flash) as part of the fix.
2. **FIX-05 (42-02)** — Auto-advance is half-broken (a setting that may have once existed in the Lobby UI is gone, server still has consensus + timeout auto-advance behavior), AND the client logs `Received deprecated lobby_updated event` from `GamePage.tsx:189` while the server still emits the event. Both halves are reconciled in this plan.
3. **BAL-01 (42-03)** — XP pacing is currently too fast; progression trivializes. Tune to make leveling feel earned again.

Out of scope: gender/avatar variants (deferred to v5.1, AVAT-01); auth/sign-in loop (separate Phase 43, AUTH-01); new gameplay features; new tutorial content.

</domain>

<decisions>
## Implementation Decisions

### Boss HP damage (42-01 / FIX-04)

- **Scope of failure:** unconfirmed — researcher must diagnose by reading the boss-attack damage-application path and reproducing. Hypothesis: AoE targeting iterates affected players but doesn't actually write the HP decrement. Could also be all attacks. Don't pre-narrow.
- **Damage feedback is in scope.** If the bug turns out to be "HP IS decrementing but the user can't tell because feedback is missing," that's still 42-01's responsibility. The plan must verify (or add) at least one feedback channel — HP bar reaction, floating damage number, or comparable signal — so a successful hit is visible to the player.
- **Verification gate:** the plan's success criterion is a repro test that hits a player (single-target AND AoE) and asserts both `player.hp` decreased server-side AND a feedback signal fired client-side.

### Auto-advance (42-02 / FIX-05) — restore path

- **Restore as a Lobby UI setting**, NOT remove. Host-only toggle.
- **Default OFF.** Hosts opt in. Lower regression risk; matches current behavior for any host who didn't know the setting existed.
- **Persisted alongside other lobby settings** (in the same `lobbySettings`-style object that survives reconnect). Pattern lives in `shared/gameEvents.ts` and `client/src/lib/utils/lobbySettingsStorage.ts` (or equivalent — researcher confirms current path).
- **Server respects the toggle on consensus only.** When ON: existing consensus auto-advance fires. When OFF: server does NOT auto-advance on consensus; the host must use "Advance Now."
- **3-minute voting-timeout fallback stays put regardless of toggle state.** This is a game-stall safety net (a player walking away during voting shouldn't soft-lock the lobby), not a UX feature. Don't tie it to the new toggle.
- **Where the toggle lives in the UI:** Claude's discretion (planner picks against existing Lobby Settings patterns — likely the host settings panel/menu).

### `lobby_updated` event retirement (42-02 / FIX-05) — full retire path

- **Fully retire the event.** Server stops emitting `lobby_updated` everywhere; client handler at `GamePage.tsx:188-189` removed entirely (deprecation warning included).
- **Each emit site must be migrated to a fine-grained event.** Two known sites today:
  - `server/websocket.ts:1272` — `advancePhaseNow` handler
  - `server/websocket.ts:1297` — `forceVotingProgression` handler
- **Researcher must audit `server/` for any other `lobby_updated` emit sites** (grep `'lobby_updated'`) before planning, and propose the fine-grained replacement event name(s) drawn from the existing taxonomy in `shared/gameEvents.ts`.
- **No half-migration.** If migrating any one site is non-trivial enough to gate the v5.0 ship, escalate during research — do not leave the event partially retired.
- **Client must drop the handler in the same plan/commit set as the last server-side emit removal** so there's never a window where the server emits an event the client doesn't handle.

### XP pacing (42-03 / BAL-01)

- **Direction:** too fast — progression trivializes today. Plan tunes XP pacing to feel earned.
- **Knob selection: researcher's call.** Researcher must inventory current per-action XP awards (combo, vote, kill, ability use, etc.) and the level-up curve, then recommend curve-only / per-action-only / both based on the actual data. Don't pick blindly.
- **Plan SUMMARY MUST include before/after curve documentation** (a small table is fine — old XP-per-level vs. new XP-per-level, and old vs. new per-action awards if those changed). This is a Phase 42 ROADMAP success criterion.
- **No specific level-cap-time target** is locked here. Researcher should recommend a target feel ("level cap unreachable in a single session" vs. "level 5 reachable mid-session", etc.) based on average session length + boss count, and the planner adopts the recommendation.

### Cross-cutting

- **No regressions to Phase 40 tutorial work or Phase 41 reconnection work.** Phase 39 z-index ladder (SpotlightMask 100, HintBubble 101, HelpMenu 200) and battle focus guard remain untouched.
- **All three plans are independent** — they can be executed in parallel waves if the planner sees no shared file conflicts. The planner should still group them sensibly.

### Claude's Discretion

- Exact location of the auto-advance toggle in the Lobby UI (settings panel item vs. inline toggle) — match existing Lobby Settings patterns.
- Names of the fine-grained replacement events for each `lobby_updated` emit site (drawn from existing `shared/gameEvents.ts` taxonomy).
- Specific XP curve numbers and per-action awards (researcher inventories, planner picks against the "too fast → earned" target).
- Whether damage feedback is a new component or verifying the existing `FloatingXP`/`MagicEffect`/HP-bar machinery already covers it.
- Test approach for each plan (unit / integration / Playwright) — follow existing patterns in adjacent test files.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/REQUIREMENTS.md` — FIX-04, FIX-05, BAL-01 definitions; AVAT-01 deferred to v5.1
- `.planning/ROADMAP.md` Phase 42 entry — success criteria

### 42-01 (Boss HP damage)
- `server/gameState.ts` — boss attack handlers + damage application
- `client/src/components/game/BossDisplay.tsx` and `client/src/components/game/BossTelegraph.tsx` — telegraph and visual feedback
- `client/src/components/game/PlayerHUD.tsx` — HP rendering on the player side
- `client/src/components/game/FloatingXPManager.tsx` and `FloatingXP.tsx` — existing floating-number machinery (potential reuse for damage popups)
- `client/src/components/game/MagicEffect.tsx` — existing visual-effect system

### 42-02 (Auto-advance + lobby_updated retire)
- `server/websocket.ts:961-1000` — consensus auto-advance logic
- `server/websocket.ts:1252-1282` — `advancePhaseNow` handler (emits `lobby_updated` at line 1272)
- `server/websocket.ts:1284+` — `forceVotingProgression` handler (emits `lobby_updated` at line 1297)
- `server/gameState.ts:1342-1371` — voting timeout auto-advance + reveal-phase advance (the 3-min safety net to preserve)
- `client/src/pages/GamePage.tsx:188-199` — deprecated `lobby_updated` handler to remove
- `shared/gameEvents.ts` — fine-grained event taxonomy (researcher inventories which events replace each emit)
- `client/src/lib/utils/lobbySettingsStorage.ts` (or `.bak` if currently disabled) — existing lobby settings persistence model
- `client/src/components/game/Lobby.tsx` — Lobby UI; existing host settings surfaces

### 42-03 (XP pacing)
- Server XP curve / level-up source of truth — researcher locates (likely in `server/` or `shared/`)
- Per-action XP award sites — researcher inventories (likely scattered across combat handlers)
- `client/src/components/game/MasteryProgressBar.tsx` and `XPBar` — UI feedback for the new pacing
- `client/src/components/game/LevelUpCelebration.tsx` and `TierUpToast.tsx` — frequency of these will change as a side effect of pacing tuning

### Adjacent invariants (do not break)
- Phase 39 z-index ladder (locked: SpotlightMask 100, HintBubble 101, HelpMenu popover 200)
- Phase 39 battle focus guard
- Phase 40 tutorial walkthroughs and contextual hints (TUTR-01/02/03 must still pass)
- Phase 41 reconnection state behavior (FIX-03 must still pass)

</canonical_refs>

<specifics>
## Specific Ideas

- The user's recollection: auto-advance USED to be a Lobby UI setting; it appears to have been removed at some point. Git history confirms `aedc5cf` ("Add new scoring and auto-advance logic for game progression") originally introduced server-side consensus auto-advance — the matching client UI control either was never added or was removed since. Researcher confirms which.
- Two-emitter audit so far for `lobby_updated`: `advancePhaseNow` and `forceVotingProgression`. Researcher must confirm there are no other emit sites server-side before the planner commits to the migration table.
- Damage feedback already has `FloatingXPManager`, `MagicEffect`, and `BossTelegraph` infrastructure to lean on — favor reusing existing systems over adding a new component.
- "Too fast" XP today: the user has reached level cap or near it within a single session. Tuning target should make level cap feel like it requires multiple sessions, OR make late levels significantly harder to reach.

</specifics>

<deferred>
## Deferred Ideas

- Per-team auto-advance overrides (e.g., devs auto-advance, QA doesn't) — overengineered for current need
- Auto-advance as a user-account preference (instead of lobby-scoped) — depends on auth (Phase 43); revisit only if v5.1 brings auth-tied user prefs
- XP curve visualization in a host-side debug panel — nice-to-have, not pre-ship-blocking
- Animated damage popup variants (per-attack-type effects, color-coded by element) — visual polish for a later phase
- Configurable per-action XP awards in dev menu — overengineered until balance is dialed in
- Migrating the 3-minute voting-timeout fallback to be configurable — keep as a fixed safety net for now

</deferred>

---

*Phase: 42-v5-0-pre-ship-fixes-polish*
*Context gathered: 2026-05-07 via /gsd-discuss-phase*
