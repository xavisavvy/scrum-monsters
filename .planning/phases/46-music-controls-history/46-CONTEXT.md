# Phase 46: Music Controls & History - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Source:** PRD Express Path (command args)

<domain>
## Phase Boundary

This phase adds persistent music controls to both the Lobby and BattleScreen (currently BossMusicControls only lives in BattleScreen). The YouTube playback infrastructure (`BossMusicControls`, `YoutubeAudioPlayer`, `useAudio` store, `youtube_play`/`youtube_stop` socket events) already exists and works. Work is:

1. Extract/create a shared `<MusicControls>` component usable in both screens
2. Add oEmbed title fetching when the host saves a URL
3. Persist a top-10 recently-used URL history per host in localStorage
4. Add a history UI (dropdown/list showing titles) below the URL input
5. Confirm socket sync fires identically from both Lobby and BattleScreen contexts

Out of scope: changing the YouTube player internals, altering server-side game state, any non-host player UI changes beyond receiving the synced event.

</domain>

<decisions>
## Implementation Decisions

### D-01: Shared component location
- Create `client/src/components/ui/MusicControls.tsx` as the unified control panel, replacing direct usage of `BossMusicControls` in `BattleScreen.tsx` and new usage in `Lobby.tsx`.

### D-02: Host-only write access
- Only the host can change the YouTube URL or trigger play/stop. Non-host players see a read-only status indicator (currently playing / stopped). The host-check uses `currentPlayer?.isHost` from `useGameState`.

### D-03: YouTube title resolution via oEmbed
- When the host submits a URL, fetch the title via the YouTube oEmbed endpoint: `https://www.youtube.com/oembed?url=<encoded-url>&format=json`
- No API key required.
- Graceful fallback: if the fetch fails (private video, network error, playlist with generic title), display the URL truncated to ~40 chars.

### D-04: History storage — client-side localStorage
- Key: `scrum-monsters-music-history-<hostPlayerId>` where `hostPlayerId` is `currentPlayer?.id`
- Structure: `Array<{ url: string; title: string; usedAt: number }>` (ISO timestamp as epoch ms)
- Sorted descending by `usedAt`. Trim to 10 entries on each save.
- This is UX convenience only — not server state, no socket emission for history.

### D-05: History UI
- A collapsible dropdown/list below the URL input in the MusicControls panel.
- Each entry shows the video title (or truncated URL fallback). Selecting an entry pre-fills the URL input field.
- The host confirms/plays from the same submit button.

### D-06: Socket sync — same events, both screens
- Both Lobby and BattleScreen emit `youtube_play` and `youtube_stop` socket events using the existing server handlers (`server/websocket.ts` lines ~1337–1369).
- No new socket events needed.
- Verify that `YoutubeAudioPlayer` (the invisible iframe player) is mounted in the render tree for both screens so `useAudio.youtubePlayer` is non-null when either screen triggers play.

### D-07: Playlist URL handling
- The existing `extractVideoId` regex only matches single-video URLs. Playlist URLs do not produce an 11-char video ID match.
- Decision: accept playlist URLs as-is (skip `extractVideoId` validation when the URL contains `list=`), let the YouTube iframe handle playlist playback. The oEmbed endpoint also handles playlist URLs.
- Display a note to the host if a playlist URL is detected ("Playlist detected — will play from start").

### Claude's Discretion
- Exact visual design of the MusicControls panel (retro card style matching existing BossMusicControls)
- Whether to show a "now playing" title to all players (non-blocking enhancement)
- Transition animation when opening/closing the history dropdown
- Error toast vs inline error message for oEmbed failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing music infrastructure
- `client/src/components/ui/BossMusicControls.tsx` — current host control panel (to be extracted/replaced)
- `client/src/components/ui/YoutubeAudioPlayer.tsx` — invisible iframe player, registers `youtubePlayer` in useAudio
- `client/src/lib/stores/useAudio.tsx` — Zustand audio store (youtubeUrl, isYoutubeAudioActive, playYoutubeAudio, stopYoutubeAudio)
- `client/src/lib/socket/eventHandlers.ts` — `youtube_play_synced` / `youtube_stop_synced` handlers (lines ~936–941)

### Socket contracts
- `shared/gameEvents.ts` — `ClientToServerEvents`: `youtube_play`, `youtube_stop` (lines ~297–298); `ServerToClientEvents`: `youtube_play_synced`, `youtube_stop_synced` (lines ~390–391)
- `server/websocket.ts` — server handlers for `youtube_play` / `youtube_stop` (lines ~1337–1369)

### Host gating pattern
- `client/src/components/game/BattleScreen.tsx` — shows BossMusicControls at lines 336, 403; mounts YoutubeAudioPlayer at line 822
- `client/src/components/game/Lobby.tsx` — does NOT currently mount BossMusicControls or YoutubeAudioPlayer; lobby background music only at line 305

### UI component patterns
- `client/src/components/ui/retro-button.tsx` — RetroButton component
- `client/src/components/ui/retro-card.tsx` — RetroCard component

</canonical_refs>

<specifics>
## Specific Ideas

- oEmbed endpoint: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json` → `response.title`
- localStorage key pattern: `scrum-monsters-music-history-${hostPlayerId}`
- Playlist detection: `url.includes('list=')` or regex `/[?&]list=/`
- History item type: `{ url: string; title: string; usedAt: number }` — `usedAt` is `Date.now()` at save time
- Trim logic: `history.sort((a,b) => b.usedAt - a.usedAt).slice(0, 10)`

</specifics>

<deferred>
## Deferred Ideas

- Server-side URL persistence (so history survives browser refresh for non-hosts)
- Volume control slider in the panel
- "Now playing" title display for all players (non-host read-only view)
- Cross-device history sync

</deferred>

---

*Phase: 46-music-controls-history*
*Context gathered: 2026-06-17 via PRD Express Path (command args)*
