---
phase: 52
plan: 04
subsystem: client/lobby
tags: [refactor, performance, react-memo, component-extraction, MAINT-13]
dependency_graph:
  requires: [52-03]
  provides: [TavernScene, LobbySettingsDialog, LobbyAvatar]
  affects: [client/src/components/game/Lobby.tsx]
tech_stack:
  added: []
  patterns: [React.memo named-function, explicit-props interface, pure helper extraction, computeSizeScale]
key_files:
  created:
    - client/src/components/game/TavernScene.tsx
    - client/src/components/game/TavernScene.test.tsx
    - client/src/components/game/LobbySettingsDialog.tsx
    - client/src/components/game/LobbySettingsDialog.test.tsx
    - client/src/components/game/LobbyAvatar.tsx
  modified:
    - client/src/components/game/Lobby.tsx
decisions:
  - "dpr owned inside TavernScene — Canvas never a controlled prop-receiver, WebGL context not re-created on PerformanceMonitor adjustment"
  - "host+phase guard preserved verbatim on updateEstimationSettings only (intentional asymmetry with timer/jira)"
  - "LobbyAvatar uses explicit showInvisibleBadge/showReadyBadge props, NOT isLocal flag — 3+ real divergences"
  - "computeSizeScale extracted as pure exported helper — single source of truth for enlarge/reduce scale math"
  - "Extended LobbyAvatarProps beyond patterns spec: flyRotation, opacity, pointerEventsDisabled, isJumping, avatarClass for full behavior fidelity"
metrics:
  duration: "~45 minutes"
  completed: "2026-06-24"
  tasks: 3
  files_created: 5
  files_modified: 1
---

# Phase 52 Plan 04: MAINT-13 Seams 1–3 (TavernScene + LobbySettingsDialog + LobbyAvatar) Summary

React.memo extractions of TavernScene (dpr inside Canvas boundary), LobbySettingsDialog (host+phase guard preserved), and LobbyAvatar (explicit props, no isLocal flag) — behavior-identical, 1033 tests passing, tsc + lint clean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract TavernScene + dpr + TavernLighting co-location + render-count test | b0c6198 | TavernScene.tsx, TavernScene.test.tsx, Lobby.tsx |
| 2 | Extract LobbySettingsDialog + exact host+phase guard + guard test | 4aca28d | LobbySettingsDialog.tsx, LobbySettingsDialog.test.tsx, Lobby.tsx |
| 3 | Extract LobbyAvatar + computeSizeScale + full suite green | d5137a8 | LobbyAvatar.tsx, Lobby.tsx |

## What Was Built

### TavernScene (seam 1 — performance fix)

`dpr` is owned inside `TavernScene` as `useState<number>(Math.min(window.devicePixelRatio, 2))`. `PerformanceMonitor`'s `onDecline`/`onIncline` callbacks call `setDpr` inside the component, never propagating upward to Lobby. Canvas is no longer a controlled prop-receiver — the WebGL context is not re-created on every PerformanceMonitor adjustment.

`TavernLighting` is co-located inside `TavernScene.tsx` (zero props, no external deps, only used by this scene).

The render-count test (`TavernScene.test.tsx`) uses the `MemoCounter = React.memo(...)` proxy pattern: a TrackingWrapper subscribes to `playerPositions`, mutates it, and verifies `renderCountRef.tavernScene` is unchanged — confirming `React.memo` bail-out is working.

### LobbySettingsDialog (seam 2 — host+phase guard)

The `updateEstimationSettings` handler stays in Lobby.tsx and is passed as `onEstimationUpdate`. The guard `if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;` is preserved verbatim — only on estimation. Timer and jira handlers have NO phase guard (intentional asymmetry, documented in Pitfall 3).

The guard test (`LobbySettingsDialog.test.tsx`) has 7 pure logic tests: non-host blocked, non-lobby-phase blocked, host+lobby passes, timer/jira pass regardless of phase.

### LobbyAvatar (seam 3 — explicit props)

Three structural divergences between local and other-player rendering are captured as explicit boolean props (`showInvisibleBadge`, `showReadyBadge`, `interactive`) rather than a single `isLocal: boolean` flag. Additional explicit props for full behavior fidelity: `flyRotation` (local only, computed from keys), `opacity` (different formula: 0.5 for local invisible vs 0/0.2 for other invisible/flickering), `pointerEventsDisabled` (other invisible non-flickering), `isJumping`, `avatarClass` (pre-resolved at call site).

`computeSizeScale(sizeBuff?)` is an exported pure helper replacing duplicated size math in both branches.

Lobby.tsx call sites:
- My-player: `showInvisibleBadge={true} showReadyBadge={false} interactive={true} opacity={isInvisible ? 0.5 : 1} flyRotation={flyRotation}`
- Other-players: `showInvisibleBadge={false} showReadyBadge={true} interactive={false} opacity={playerOpacity} pointerEventsDisabled={isInvisible && !isFlickering}`

### DevTools Profiler Note

After Task 1 (TavernScene extraction): PerformanceMonitor dpr adjustments re-render only the `TavernScene` subtree. The WebGL context is not re-created because `dpr` is internal state. Before this fix, every dpr change propagated through Lobby as a controlled prop, potentially triggering a Canvas remount.

After Task 3 (LobbyAvatar extraction): both avatar blocks are now `React.memo`'d. Avatar-only state mutations (emotes, magicEffects) will re-render only the affected `LobbyAvatar` instance, not all of Lobby. Render counts during movement + settings changes are not increased relative to pre-refactor baseline (behavior-identical extraction by construction — no new subscriptions added).

TavernScene shows 0–1 renders on playerPositions mutation (verified by test).

## Acceptance Criteria Verified

- `grep -c "const [dpr" Lobby.tsx` = 0 (PERF GUARDRAIL — dpr no longer in Lobby)
- `grep -c "<TavernScene" Lobby.tsx` = 1
- `grep -c "gamePhase !== 'lobby'" Lobby.tsx` = 8 (guard retained in updateEstimationSettings)
- `grep -c "isLocal" LobbyAvatar.tsx` = 0 (no isLocal flag)
- `grep -c "<LobbyAvatar" Lobby.tsx` = 2 (my-player + other-players)
- `grep -c "setAfterimages" Lobby.tsx` = 5 (debunked seams untouched)
- `npm test` = 1033 passing
- `npm run check` exits 0
- `npm run lint` exits 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Correctness] Extended LobbyAvatarProps beyond patterns spec**
- **Found during:** Task 3 implementation
- **Issue:** The PATTERNS.md interface spec did not include all props needed for behavior-identical extraction: `flyRotation` (local-player key-based tilt), `opacity` (different formulas: 0.5 local invisible vs 0/0.2 other invisible/flickering), `pointerEventsDisabled` (other invisible non-flickering), `isJumping` (for animation + idle detection), `avatarClass: AvatarClass` (pre-resolved, avoids passing Player to getAvatarClass inside component)
- **Fix:** Added these 5 additional explicit props to LobbyAvatarProps interface; `avatarClass` typed as `AvatarClass` (not `string`) to satisfy SpriteRenderer's prop type
- **Files modified:** LobbyAvatar.tsx
- **Commit:** d5137a8

**2. [Rule 1 - Bug] TypeScript error: string not assignable to AvatarClass**
- **Found during:** Task 3 tsc check
- **Issue:** `avatarClass: string` in LobbyAvatarProps was not assignable to SpriteRenderer's `avatarClass: AvatarClass` prop
- **Fix:** Changed prop type to `AvatarClass`, imported from `@/lib/gameTypes`
- **Files modified:** LobbyAvatar.tsx
- **Commit:** d5137a8

**3. [Rule 1 - Bug] Unused imports in Lobby.tsx (SpeechBubble, MagicEffect, motion)**
- **Found during:** Task 3 lint run
- **Issue:** After moving both avatar blocks to LobbyAvatar.tsx, the SpeechBubble, MagicEffect, and motion (framer-motion) imports in Lobby.tsx became unused
- **Fix:** Removed the three unused imports; replaced SpeechBubble + MagicEffect with single LobbyAvatar import
- **Files modified:** Lobby.tsx
- **Commit:** d5137a8

## Self-Check

### Created files exist
- `client/src/components/game/TavernScene.tsx` — exists (from Task 1)
- `client/src/components/game/TavernScene.test.tsx` — exists (from Task 1)
- `client/src/components/game/LobbySettingsDialog.tsx` — exists (from Task 2)
- `client/src/components/game/LobbySettingsDialog.test.tsx` — exists (from Task 2)
- `client/src/components/game/LobbyAvatar.tsx` — exists (from Task 3)

### Commits exist
- b0c6198 — feat(52-04): TavernScene
- 4aca28d — feat(52-04): LobbySettingsDialog
- d5137a8 — feat(52-04): LobbyAvatar

## Self-Check: PASSED
