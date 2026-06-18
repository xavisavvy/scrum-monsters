---
phase: 46-music-controls-history
plan: "03"
subsystem: client-ui
tags: [music, youtube, integration, gamepage, lobby, battlescreen]
dependency_graph:
  requires: ["46-01", "46-02"]
  provides:
    - "Single persistent YoutubeAudioPlayer at GamePage"
    - "MusicControls in Lobby and BattleScreen phases"
  affects:
    - client/src/pages/GamePage.tsx
    - client/src/components/game/BattleScreen.tsx
    - client/src/components/game/Lobby.tsx
    - client/src/components/game/phases/PhaseContainer.tsx
tech_stack:
  added: []
  patterns:
    - "Single persistent player ref pattern (GamePage common ancestor)"
    - "Component replacement migration (BossMusicControls -> MusicControls)"
key_files:
  created: []
  modified:
    - client/src/pages/GamePage.tsx
    - client/src/components/game/BattleScreen.tsx
    - client/src/components/game/Lobby.tsx
    - client/src/components/game/phases/PhaseContainer.tsx
    - client/src/components/ui/MusicControls.test.tsx
  deleted:
    - client/src/components/ui/BossMusicControls.tsx
decisions:
  - "[46-03] YoutubeAudioPlayer mounted at GamePage fragment sibling (not inside renderGamePhase) so it persists across all phase transitions"
  - "[46-03] MusicControls placed in Lobby top-right flex wrapper alongside existing mute button (gap-2) to avoid overflow-x-hidden clipping"
  - "[46-03] PhaseContainer.tsx also migrated from BossMusicControls to MusicControls (not in plan but required by Rule 1 — same importer pattern)"
metrics:
  duration_seconds: 600
  completed_date: "2026-06-17"
  tasks_completed: 1
  files_created: 0
  files_modified: 5
  files_deleted: 1
---

# Phase 46 Plan 03: Integration Wave — YoutubeAudioPlayer Hoist + BossMusicControls Removal Summary

**One-liner:** Single persistent YoutubeAudioPlayer hoisted to GamePage, MusicControls wired into Lobby and both BattleScreen phases, BossMusicControls.tsx deleted — closes the null-player gap (RESEARCH Pitfall 1).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hoist YoutubeAudioPlayer; swap BattleScreen controls; add to Lobby; delete BossMusicControls | b6f5523 | GamePage.tsx, BattleScreen.tsx, Lobby.tsx, PhaseContainer.tsx, MusicControls.test.tsx (deleted: BossMusicControls.tsx) |

## Task 2: PENDING HUMAN CHECKPOINT

**Status:** Awaiting two-browser live verification.

**What was built:**
- `YoutubeAudioPlayer` mounted exactly once in the `GamePage` fragment (persists across lobby/battle transitions)
- `MusicControls` replaces `BossMusicControls` in `BattleScreen.tsx` (both battle and discussion phases)
- `MusicControls` added to `Lobby.tsx` top-right region (flex wrapper, gap-2 next to mute button)
- `BossMusicControls.tsx` deleted
- `PhaseContainer.tsx` also migrated (was an undiscovered second importer)

**How to verify (9 steps):**
1. `npm run dev`, open http://localhost:5000 in two browser windows
2. Window A creates a lobby and picks an avatar (becomes host); Window B joins and picks avatar
3. In Window A's LOBBY, open Music Settings, paste a YouTube watch URL, click Play — audio should play in BOTH windows; history dropdown should show the video title
4. Window B (non-host) should show NO URL input — only read-only "Music playing" status
5. Host clicks Stop — audio stops in both windows
6. Start the battle — MusicControls should still appear top-right in battle screen; play/stop should sync to both windows
7. Enter battle — verify play still works (proves GamePage player mount survived the lobby→battle transition; Pitfall 1 closed)
8a. Paste a watch URL with playlist param (`watch?v=ID&list=...`) — first video should play in both windows (no warning note)
8b. Paste a bare playlist URL (`playlist?list=...`) — should show accept-only note; entry saved to history; play submits but no inline audio (server rejects empty videoId — Option B behavior)
9. Reload Window A host browser, rejoin same lobby, open Music Settings — history dropdown should still list previous entries (localStorage persistence)

**Resume signal:** Type "approved" or describe any step that failed.

## What Was Built

### Task 1 — Integration of Plans 01 + 02

**`GamePage.tsx`** — Added `import { YoutubeAudioPlayer } from '@/components/ui/YoutubeAudioPlayer'` and a single `<YoutubeAudioPlayer />` inside the top-level fragment return as a sibling to `{renderGamePhase()}` and `<TutorialOverlay />`. This single mount persists across all phase transitions (lobby/battle/scoring/victory) because GamePage stays mounted with a stable URL.

**`BattleScreen.tsx`** — Replaced `import { BossMusicControls }` and `import { YoutubeAudioPlayer }` on lines 12-13 with a single `import { MusicControls } from '@/components/ui/MusicControls'`. Replaced both `<BossMusicControls />` occurrences (battle and discussion phases) with `<MusicControls />`. Removed the `<YoutubeAudioPlayer />` mount that was previously at line 822 — leaving it would have created a second player instance whose `onReady` would overwrite the store ref and whose `unmount` would call `.destroy()` (RESEARCH Pitfall 1).

**`Lobby.tsx`** — Added `import { MusicControls } from '@/components/ui/MusicControls'`. Wrapped the existing mute button in a flex container (`flex items-center gap-2`) and prepended `<MusicControls />` so the controls sit side-by-side in the top-right. The flex wrapper prevents `overflow-x-hidden` clipping on the Lobby root container (RESEARCH Pitfall 4).

**`BossMusicControls.tsx`** — Deleted entirely. All importers have been migrated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PhaseContainer.tsx also imported BossMusicControls**
- **Found during:** Task 1 — `npm run check` after deleting `BossMusicControls.tsx`
- **Issue:** `client/src/components/game/phases/PhaseContainer.tsx` imported `BossMusicControls` (line 5) and rendered `<BossMusicControls />` inside its `renderBattleLayout()` function. The plan's `read_first` list did not include this file, but the deletion exposed it immediately via a TS2307 compilation error.
- **Fix:** Changed the import to `MusicControls` and replaced the single `<BossMusicControls />` usage with `<MusicControls />`. No prop changes needed (the `showBossMusic` prop flag was retained as-is).
- **Files modified:** `client/src/components/game/phases/PhaseContainer.tsx`
- **Commit:** b6f5523

**2. [Rule 1 - Bug] Pre-existing TS2769 in MusicControls.test.tsx blocked `npm run check`**
- **Found during:** Task 1 — `npm run check` after fixing PhaseContainer
- **Issue:** Two test lines at 238 and 281 used destructuring `([event]: [string])` in `.find()` callbacks on `mockSocketEmit.mock.calls`. TypeScript infers `mock.calls` as `any[][]` and cannot assign `any[]` to the tuple `[string]`. These errors were already present in `main` (confirmed by running `npm run check` on the main repo — same 2 errors). They were carried into this worktree with the Plan 02 files.
- **Fix:** Replaced `([event]: [string]) => event === 'youtube_play'` with `(args: unknown[]) => args[0] === 'youtube_play'` (both occurrences via `replace_all`). Semantically identical, TypeScript-safe.
- **Files modified:** `client/src/components/ui/MusicControls.test.tsx`
- **Commit:** b6f5523

## Verification Results

- `npm run check` — exits 0 (TypeScript clean)
- `grep -rn "BossMusicControls" client/src` (excluding .bak) — one match: a source comment in `youtubeTitle.ts` documenting the origin of the `extractVideoId` regex (`// Copied verbatim from BossMusicControls.tsx lines 22-26`). No imports, no JSX usages.
- `client/src/components/ui/BossMusicControls.tsx` — does not exist (confirmed deleted)
- `npm test` (pre-commit hook) — 795/795 tests passed

## Acceptance Criteria Check

- [x] `GamePage.tsx` contains exactly one `<YoutubeAudioPlayer` occurrence and imports it
- [x] `BattleScreen.tsx` imports `MusicControls` and contains zero `BossMusicControls` references
- [x] `BattleScreen.tsx` contains zero `YoutubeAudioPlayer` references (mount + import both removed)
- [x] `Lobby.tsx` imports and renders `MusicControls`
- [x] `client/src/components/ui/BossMusicControls.tsx` does not exist
- [x] The grep for `BossMusicControls` across `client/src` (excluding .bak) returns no import/JSX matches
- [x] `npm run check` exits 0

## Known Stubs

None. All wiring is complete. The only thing pending is the human-verify checkpoint (Task 2) which requires two-browser live testing.

## Threat Flags

No new security surface introduced. T-46-06 (dual-player desync DoS) is mitigated: a single `<YoutubeAudioPlayer />` mount at GamePage and zero mounts in BattleScreen — verified by grep (no `YoutubeAudioPlayer` in BattleScreen) and `npm run check`.

## Self-Check: PASSED

Files modified:
- `client/src/pages/GamePage.tsx` — FOUND (has YoutubeAudioPlayer import + render)
- `client/src/components/game/BattleScreen.tsx` — FOUND (has MusicControls, no BossMusicControls, no YoutubeAudioPlayer)
- `client/src/components/game/Lobby.tsx` — FOUND (has MusicControls import + render)
- `client/src/components/game/phases/PhaseContainer.tsx` — FOUND (has MusicControls, no BossMusicControls)
- `client/src/components/ui/MusicControls.test.tsx` — FOUND (TS2769 fixed)
- `client/src/components/ui/BossMusicControls.tsx` — CONFIRMED DELETED

Commits:
- b6f5523 — feat(46-03): hoist YoutubeAudioPlayer to GamePage; replace BossMusicControls — FOUND
