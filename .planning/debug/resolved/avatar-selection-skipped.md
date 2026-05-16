---
slug: avatar-selection-skipped
status: resolved
trigger: avatar selection skipped on fresh battle
created: 2026-05-15
updated: 2026-05-15
resolved: 2026-05-15
---

# Debug: avatar-selection-skipped

## Symptoms

<DATA_START>
- **Trigger:** Every fresh battle start — avatar selection phase is skipped on every new lobby
- **Symptom:** Normally players are supposed to select an avatar before entering the lobby, but it doesn't appear
- **Expected location in flow:** Avatar selection should appear BEFORE the lobby is enterable (user picks avatar first, THEN sees lobby/ready screen)
- **Repro:** Both single-player (create lobby + start) and multi-player (host + join + start) flows skip avatar selection
- **Timeline:** Has been broken for a while — longstanding, not recent
- **Errors:** None on console — silent dead-code path
</DATA_END>

## Root Cause

The `start_battle` socket event handler in `server/websocket.ts:865-923` calls
`gameState.startBattle()` (server/gameState.ts:785), which sets
`lobby.gamePhase = 'battle'` directly at line 805 — jumping straight from
`'lobby'` to `'battle'` and skipping `'avatar_selection'` entirely. The two
`GameState` methods that would route through `'avatar_selection'` —
`startGame` (line 1109) and `proceedToNextPhase` (line 1129) — are orphaned
dead code, never invoked from any socket handler, REST endpoint, or other
call site. Players therefore always end up in `battle` with the default
`'warrior'` avatar.

## Fix (chosen approach: per-player client-side gate)

Decision: keep `lobby.gamePhase = 'lobby'` (don't reintroduce a shared
`avatar_selection` server phase) and instead use a per-player flag. Rationale:

- Matches the user's stated UX expectation: "pick your avatar before you see
  the lobby."
- Smaller blast radius than a shared-phase approach. The existing
  `server/websocket.ts` handlers gate ticket/settings actions on
  `lobby.gamePhase === 'lobby'` (lines 723, 744, 763, 782, 820). Switching
  the lobby phase to `avatar_selection` while joiners are still picking
  would block the host from importing tickets / changing settings.
- Per-player gating lets the host pick, drop into the Lobby view, and start
  configuring tickets while late joiners are still on their AvatarSelection
  screen — closer to natural UX.

### Changes

1. **`shared/gameEvents.ts`** — added `hasSelectedAvatar?: boolean` to
   `Player`. Optional so existing test fixtures and persisted data don't
   break.
2. **`server/domains/SessionManager.ts`**
   - `createLobby`: host player starts with `hasSelectedAvatar: false`.
   - `joinLobby`: fresh joiners start `false`; reconnecting players whose
     stale record had a non-default avatar (`preservedAvatar !== undefined`)
     start `true` so they skip re-selection. `'warrior'` defaults are
     correctly treated as "never picked" because `preservedAvatar` is only
     set when `stalePlayer.avatarClass !== 'warrior'` (existing guard at
     SessionManager.ts:245).
3. **`server/gameState.ts`**
   - Legacy `createLobby` and `joinLobby` mirror the same flag init.
   - `startGame` and `proceedToNextPhase` marked `@deprecated` with JSDoc
     pointing at this debug file. Kept (not deleted) to avoid breaking any
     external integration; should be removed after Phase 43.
4. **`server/websocket.ts`** — `select_avatar` handler now sets
   `player.hasSelectedAvatar = true` before emitting the existing
   `avatar_selected` and `session:avatar_selected` events. No new event
   added; clients infer the gate flip from receipt of those events.
5. **`client/src/pages/GamePage.tsx`** — `renderGamePhase()` now renders
   `<AvatarSelection />` whenever `currentPlayer.hasSelectedAvatar === false`,
   regardless of `lobby.gamePhase`. The legacy `phase === 'avatar_selection'`
   branch is preserved as a defensive fallback. The legacy `avatar_selected`
   socket listener now also flips the flag on the local store.
6. **`client/src/lib/socket/eventHandlers.ts`** — `session:avatar_selected`
   handler now sets `hasSelectedAvatar: true` on both the lobby roster entry
   and `currentPlayer` so remote peers see the gate transition too.
7. **`CLAUDE.md`** — Game Flow section updated: removed `avatar_selection`
   from the documented phase chain, added a paragraph explaining the
   client-driven per-player gate and noting `startGame` /
   `proceedToNextPhase` are deprecated.

### Reconnection behavior

The `SessionManager.joinLobby` stale-player preservation block already only
captured `preservedAvatar` when the stale player's class was NOT `'warrior'`
(line 245). That preserves the original "the user explicitly picked
something" signal. Setting `hasSelectedAvatar = preservedAvatar !== undefined`
therefore correctly:

- Skips AvatarSelection on reconnect for users who had picked a non-warrior.
- Shows AvatarSelection on reconnect for users who never picked (still on
  the `'warrior'` default).

This is a slight behavior change for the `'warrior'` edge case: a player who
explicitly chose Warrior and then reconnected would previously keep their
Warrior selection (because everyone defaults to Warrior anyway, so the
visual outcome was identical) but would now be re-prompted. Acceptable
trade-off given the rarity and the documented expectation that avatar
selection is mandatory.

## Verification

- `npm run check`: clean (0 errors).
- `npm test`: **718/718 passing** across 42 test files. Notably:
  - `server/domains/SessionManager.test.ts` (65 tests) — passes; the
    `gamePhase === 'lobby'` assertion at line 34 still holds.
  - `server/gameState.test.ts` (5 tests) — passes.
- `npx eslint` on the 6 edited files: 0 errors (121 pre-existing warnings,
  none introduced).

## Files Touched

- `shared/gameEvents.ts`
- `server/domains/SessionManager.ts`
- `server/gameState.ts`
- `server/websocket.ts`
- `client/src/pages/GamePage.tsx`
- `client/src/lib/socket/eventHandlers.ts`
- `CLAUDE.md`

## Specialist Review

Skipped — fix shape is straightforward Socket.IO event wiring + a single
boolean flag on a shared type. No framework-deep TypeScript concerns
(no generics, variance, or complex inference). Pattern matches the existing
`hasSubmittedScore` / `isReady` per-player boolean flags already on `Player`.

## Resolution

- root_cause: `start_battle` handler calls `gameState.startBattle()` which
  jumps `lobby → battle` directly; the methods that route through
  `avatar_selection` are dead code.
- fix: switched to a per-player client-side gate via
  `Player.hasSelectedAvatar`; lobby stays in `gamePhase: 'lobby'`, but
  GamePage renders `<AvatarSelection />` until the player picks. The shared
  `'avatar_selection'` server phase is no longer used; legacy methods
  marked `@deprecated`.
