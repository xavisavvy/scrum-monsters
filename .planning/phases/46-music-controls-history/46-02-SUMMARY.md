---
phase: 46-music-controls-history
plan: "02"
subsystem: client-ui
tags: [music, youtube, history, react, rtl-tests]
dependency_graph:
  requires: ["46-01"]
  provides: ["MusicControls component", "RTL test suite"]
  affects: ["client/src/components/ui/MusicControls.tsx"]
tech_stack:
  added: []
  patterns: ["Zustand store mutable-variable mock pattern", "vi.importActual for selective mocking"]
key_files:
  created:
    - client/src/components/ui/MusicControls.tsx
    - client/src/components/ui/MusicControls.test.tsx
    - client/src/lib/utils/musicHistory.ts
    - client/src/lib/utils/musicHistory.test.ts
    - client/src/lib/utils/youtubeTitle.ts
    - client/src/lib/utils/youtubeTitle.test.ts
  modified: []
decisions:
  - "Mutable module-level variables (not require()) for per-test store mock control in ESM/Vitest"
  - "Plan 01 helper files copied into worktree (were on main, not in worktree base commit)"
  - "Accept-only Option B for bare playlists: show inline note, emit { videoId: '', url } for server rejection"
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_changed: 6
  completed_date: "2026-06-18"
---

# Phase 46 Plan 02: MusicControls Component + RTL Tests Summary

**One-liner:** Host-only YouTube control panel with oEmbed title resolution, per-host localStorage history dropdown, and read-only non-host status indicator — tested with 9 RTL cases.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build MusicControls.tsx (host write + non-host read-only) | db806a1 | client/src/components/ui/MusicControls.tsx, musicHistory.ts, youtubeTitle.ts |
| 2 | MusicControls RTL tests | 7d8e50d | client/src/components/ui/MusicControls.test.tsx, musicHistory.test.ts, youtubeTitle.test.ts |

## What Was Built

### MusicControls.tsx

The unified control panel (`client/src/components/ui/MusicControls.tsx`) exports `function MusicControls()` with two branches:

**Host branch** (`currentPlayer?.isHost === true`):
- Settings toggle button reveals a RetroCard panel
- URL text input bound to `tempUrl` local state
- History dropdown populated from `loadHistory(hostId)` on panel open; clicking an entry pre-fills the URL input (no auto-submit)
- Bare-playlist note: shown when `isPlaylistUrl(tempUrl) && extractVideoId(tempUrl) === null` (Option B accept-only)
- "Play" submit button: calls `fetchYoutubeTitle`, `saveHistory`, then `socket.emit('youtube_play', { videoId: videoId ?? '', url: tempUrl })`. Does NOT call `playYoutubeAudio` locally (relies on server broadcast)
- "Stop" button: emits `socket.emit('youtube_stop')`
- Panel closes after submit

**Non-host branch** (`currentPlayer?.isHost !== true`):
- Read-only status: "Music playing" (when `isYoutubeAudioActive`) or "Music stopped"
- No input, no settings button, no history

**Boss music mute toggle**: visible to all players (matches BossMusicControls pattern).

**Dropdown anchoring**: uses a relative-positioned wrapper inside the panel (not `absolute top-full right-0` anchored to a parent) — works in both Lobby and BattleScreen contexts (Pitfall 4 from RESEARCH.md).

### MusicControls.test.tsx (9 RTL tests)

All behaviors from the plan's `<behavior>` block covered:
- Non-host: URL input absent; "Music stopped" / "Music playing" status
- Host: settings toggle reveals input; Play button disabled on empty URL
- History click: pre-fills input, does NOT fire socket.emit
- Valid watch?v= submit: emits `youtube_play` with non-empty `videoId` and no `playlistId` key
- Bare playlist submit: shows inline note + emits `{ videoId: '', url }` with no `playlistId` key

**Mock strategy**: mutable module-level variables (`mockIsHost`, `mockIsYoutubeAudioActive`) — per-test mutation before render, reset in `beforeEach`. This avoids `require()` in ESM/Vitest environments. `fetchYoutubeTitle` mocked via `vi.importActual` partial mock (pure helpers real, async fetch mocked).

## Verification

- `npm run check` exits 0 (TypeScript clean)
- `npx vitest run client/src/components/ui/MusicControls.test.tsx`: 9/9 tests pass
- Full suite: 795 tests pass (9 new from this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01 helper files absent from worktree**
- **Found during:** Task 1 setup (before any code written)
- **Issue:** `musicHistory.ts`, `youtubeTitle.ts` (and their test files) were merged into `main` (`8cc363b`) AFTER this worktree was branched from `d694bba`. The worktree had no access to them.
- **Fix:** Copied all 4 Plan 01 files from the main repo (`C:/Users/Preston/git/ScrumMonsters/`) into the worktree before creating MusicControls.tsx. Staged with the Task 1 commit.
- **Files modified:** client/src/lib/utils/musicHistory.ts, youtubeTitle.ts, musicHistory.test.ts, youtubeTitle.test.ts
- **Commit:** db806a1, 7d8e50d

**2. [Rule 1 - Bug] `require()` not available in ESM/Vitest for per-test mock override**
- **Found during:** Task 2, first test run (all 9 tests failed)
- **Issue:** Initial test design used `vi.mocked(require('@/lib/stores/useAudio').useAudio).mockReturnValue(...)` inside helper functions to vary `isYoutubeAudioActive` per-test. Vitest runs in ESM mode; `require()` with path aliases throws `Cannot find module`.
- **Fix:** Replaced `require()` calls with mutable module-level variables (`mockIsHost`, `mockIsYoutubeAudioActive`). Tests mutate these before each render; the `vi.mock` factory closes over them.
- **Files modified:** client/src/components/ui/MusicControls.test.tsx
- **Commit:** 7d8e50d

## Known Stubs

None. All UI branches render real data. The `placeholder` attribute on the URL input is intentional UX text, not a stub.

## Threat Flags

No new security surface beyond what was declared in the plan's threat model.

| T-ID | Status | Notes |
|------|--------|-------|
| T-46-04 | Accepted | Client `isHost` gate is UX only; server enforces host identity (existing) |
| T-46-05 | Mitigated | oEmbed `title` rendered as React text node (auto-escaped); no `dangerouslySetInnerHTML` found |

## Self-Check: PASSED

Files created:
- `client/src/components/ui/MusicControls.tsx` — FOUND
- `client/src/components/ui/MusicControls.test.tsx` — FOUND
- `client/src/lib/utils/musicHistory.ts` — FOUND
- `client/src/lib/utils/youtubeTitle.ts` — FOUND

Commits:
- `db806a1` — feat(46-02): build MusicControls.tsx — FOUND
- `7d8e50d` — test(46-02): add RTL tests — FOUND

Tests: 795 passed, 0 failed.

## Scope Boundary

Per plan: BossMusicControls.tsx intentionally NOT deleted (Plan 03 does the migration). No changes to socket types, Zod schemas, or server-side code.
