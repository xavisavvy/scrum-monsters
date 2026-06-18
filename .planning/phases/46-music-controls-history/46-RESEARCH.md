# Phase 46: Music Controls & History - Research

**Researched:** 2026-06-17
**Domain:** React UI extraction, YouTube oEmbed/IFrame API, localStorage persistence, Socket.IO sync
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create `client/src/components/ui/MusicControls.tsx` as the unified control panel, replacing direct usage of `BossMusicControls` in `BattleScreen.tsx` and new usage in `Lobby.tsx`.
- **D-02:** Only the host can change the URL or trigger play/stop. Non-host players see a read-only status indicator (playing / stopped). Host-check uses `currentPlayer?.isHost` from `useGameState`.
- **D-03:** Resolve YouTube title via oEmbed: `https://www.youtube.com/oembed?url=<encoded-url>&format=json` → `response.title`. No API key. Graceful fallback to URL truncated to ~40 chars on failure.
- **D-04:** History in localStorage. Key: `scrum-monsters-music-history-<hostPlayerId>` where `hostPlayerId` is `currentPlayer?.id`. Structure: `Array<{ url: string; title: string; usedAt: number }>`. Sorted desc by `usedAt`, trimmed to 10 on save. Client-only, no socket emission.
- **D-05:** Collapsible dropdown/list below URL input. Each entry shows title (or truncated URL fallback). Selecting pre-fills URL input. Host confirms/plays from same submit button.
- **D-06:** Both screens emit existing `youtube_play` / `youtube_stop` events. No new socket events. `YoutubeAudioPlayer` must be mounted in render tree for BOTH screens so `useAudio.youtubePlayer` is non-null.
- **D-07:** `extractVideoId` regex only matches single-video URLs. Accept playlist URLs as-is (skip `extractVideoId` validation when URL contains `list=`), let YouTube iframe handle playback. Display a note when a playlist URL is detected.

### Claude's Discretion
- Exact visual design of MusicControls panel (retro card style matching BossMusicControls)
- Whether to show a "now playing" title to all players (non-blocking enhancement)
- Transition animation when opening/closing history dropdown
- Error toast vs inline error message for oEmbed failures

### Deferred Ideas (OUT OF SCOPE)
- Server-side URL persistence (history survives refresh for non-hosts)
- Volume control slider in the panel
- "Now playing" title display for all players (non-host read-only view)
- Cross-device history sync
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MUSIC-01 | Persistent music controls in both Lobby and BattleScreen | New `MusicControls.tsx` extracted from `BossMusicControls`; mount in `Lobby.tsx` + replace both `BattleScreen.tsx` sites. `YoutubeAudioPlayer` must also mount in Lobby (see Pitfall 1). |
| MUSIC-02 | YouTube URL input with live sync to all players | Existing `youtube_play`/`youtube_stop` events + server host-gated broadcast already work; client `youtube_play_synced` handler is global (see Architecture). |
| MUSIC-03 | Top-10 recently-used history per host | localStorage keyed by stable `currentPlayer.id` (verified stable across reconnect). |
| MUSIC-04 | History shows video title, not raw URL | oEmbed verified live: returns `title` for videos AND playlists; CORS reflects Origin so client `fetch` works (see Code Examples). |
| MUSIC-05 | Host-only write, non-host read-only status | Server already host-gates `youtube_play`/`youtube_stop` via `lobby.hostId !== playerId`. Client gates UI on `currentPlayer?.isHost`. |
</phase_requirements>

## Summary

The YouTube playback + sync pipeline already exists end-to-end and works as of Phase 45-04. The server (`server/websocket.ts:1337-1371`) host-gates `youtube_play`/`youtube_stop` and broadcasts `youtube_play_synced`/`youtube_stop_synced` to the whole lobby. The client listeners (`eventHandlers.ts:936-943`) are registered globally on socket connect — **not phase-gated** — so a host triggering play from the Lobby will correctly sync to all peers regardless of game phase. This is a low-risk, mostly-additive phase.

The single highest-risk integration gap is **D-06's own warning**: `YoutubeAudioPlayer` is currently mounted ONLY inside `BattleScreen.tsx` (line 822). It registers the `youtubePlayer` ref in the `useAudio` store on its `onReady` event. If the host clicks Play from the Lobby and `YoutubeAudioPlayer` is not mounted, `useAudio.youtubePlayer` is `null` and `playYoutubeAudio`'s `if (youtubePlayer && videoId)` guard silently no-ops — and worse, peers who ARE in BattleScreen would still play (sync event fires server-side regardless), producing a confusing desync. The plan MUST mount `YoutubeAudioPlayer` in `Lobby.tsx` (or hoist it to a common ancestor like `GamePage`).

The second real issue is **playlist support (D-07)**. The store's `playYoutubeAudio(videoId)` calls `youtubePlayer.loadVideoById(videoId)` — and the player wrapper interface exposes ONLY `loadVideoById`, no `loadPlaylist`/`cuePlaylist`. A playlist URL has no 11-char videoId, so even if you skip `extractVideoId` validation and emit `youtube_play`, the synced handler (`playYoutubeAudio(data.videoId)`) receives an empty/invalid videoId and the `&& videoId` guard no-ops. **Playlists will silently fail today unless the player wrapper, store function, socket payload type, and Zod schema are all extended.** See Pitfall 2.

**Primary recommendation:** Extract `BossMusicControls` → `MusicControls.tsx`, hoist `YoutubeAudioPlayer` to a common ancestor of both Lobby and BattleScreen so the player ref is always live, add oEmbed title fetch + localStorage history, and — if true playlist playback is required (not just "accept the URL") — extend the player wrapper with `loadPlaylist`, widen the socket payload, and branch in the synced handler. If playlist *playback* is acceptable to defer, treat D-07 as "first video of playlist plays via its videoId" and document the limitation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL input + history UI | Browser / Client | — | Pure client UX; no server involvement per D-04 |
| oEmbed title fetch | Browser / Client | — | Client `fetch` to youtube.com; CORS confirmed permissive |
| History persistence | Browser / Client | — | localStorage, per-host, no socket emission (D-04) |
| Host authorization | API / Backend | Browser (UI gating) | Server is source of truth (`lobby.hostId`); client UI gating is convenience only |
| Play/stop sync fan-out | API / Backend | — | Server broadcasts `*_synced` to lobby room (`io.to(lobbyId)`) |
| Audio playback | Browser / Client | — | YouTube IFrame API runs in hidden iframe per client |

## Standard Stack

This phase introduces **no new dependencies**. Everything is in-repo or browser-native.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| YouTube IFrame Player API | live (loaded from `youtube.com/iframe_api`) | Hidden audio playback | Already integrated in `YoutubeAudioPlayer.tsx` [VERIFIED: codebase] |
| YouTube oEmbed | live (`youtube.com/oembed`) | Title resolution, no API key | Verified working with CORS this session [VERIFIED: live curl] |
| `fetch` (browser native) | — | oEmbed request | No library needed |
| `localStorage` (browser native) | — | History persistence | Existing pattern in `useAudio.tsx:90-116` (mute settings) |
| zustand | (existing) | `useAudio` / `useGameState` stores | Already the project's state layer |
| zod | (existing) | Socket payload validation in `shared/socket-schemas.ts` | Required if playlist payload is widened |

**Installation:** None.

## Package Legitimacy Audit

Not applicable — no external packages installed in this phase. All capabilities use in-repo code and browser-native APIs.

## Architecture Patterns

### System Architecture Diagram

```
HOST CLIENT (Lobby OR BattleScreen)
  │
  │  user pastes URL → [MusicControls]
  │     ├─ fetch oEmbed → title  ──────────────┐
  │     ├─ save {url,title,usedAt} to localStorage (history)
  │     └─ extractVideoId / detect list=
  │           │
  │           ▼
  │     socket.emit('youtube_play', {videoId, url})
  │           │
  ▼           ▼
SERVER (websocket.ts youtube_play handler)
  ├─ verify socket.data.playerId === lobby.hostId   ← host gate (MUSIC-05)
  └─ io.to(lobbyId).emit('youtube_play_synced', {videoId, url})
           │  (fan-out to ALL sockets in lobby room, host included)
           ▼
ALL CLIENTS (eventHandlers.ts, global listener — phase-independent)
  socket.on('youtube_play_synced') → useAudio.playYoutubeAudio(videoId)
           │
           ▼
  useAudio.youtubePlayer.loadVideoById(videoId)   ← requires YoutubeAudioPlayer mounted!
           │
           ▼
  [YoutubeAudioPlayer hidden iframe] plays audio; onStateChange(0) → stopYoutubeAudio()
```

Key insight: the host receives its own `youtube_play_synced` (server broadcasts to the whole room including sender). So the host does NOT need a local `playYoutubeAudio` call after emit — the synced handler covers it. `BossMusicControls` today relies on exactly this (it only emits; it never calls `playYoutubeAudio` locally). Preserve that pattern.

### Recommended Component Structure
```
client/src/components/ui/
├── MusicControls.tsx          # NEW — unified panel (host write + non-host read-only)
│                              #   replaces BossMusicControls usage
├── BossMusicControls.tsx      # DELETE after migration (or keep as thin re-export — prefer delete)
└── YoutubeAudioPlayer.tsx     # unchanged internals; MOUNT must move/duplicate (see Pitfall 1)
```

### Pattern 1: Hidden Player Mounted at a Common Ancestor
**What:** Mount `<YoutubeAudioPlayer />` once at a component that is rendered for BOTH lobby and battle phases, rather than inside `BattleScreen`.
**When to use:** Whenever play can be triggered from multiple screens.
**Why:** The player registers `youtubePlayer` in `useAudio` via `onReady`. If it unmounts (e.g., leaving BattleScreen back to Lobby) the ref is destroyed (`playerRef.current.destroy()` in cleanup). A single persistent mount avoids null-ref races.
**Candidate ancestor:** Investigate `GamePage` (the component that renders `AvatarSelection` / `Lobby` / `BattleScreen` based on phase per CLAUDE.md). Mounting `YoutubeAudioPlayer` there keeps one stable player instance across the lobby↔battle transition. [ASSUMED — verify GamePage is the common ancestor of both Lobby and BattleScreen during planning]

### Pattern 2: localStorage Read/Write Helpers (mirror existing mute-settings code)
**What:** Wrap `localStorage.getItem`/`setItem` in try/catch helpers returning safe defaults, exactly as `useAudio.tsx:93-116` does for mute settings.
**When to use:** All history persistence.
**Why:** localStorage throws in private-browsing / quota-exceeded; existing code already swallows these with `console.warn`.

### Anti-Patterns to Avoid
- **Calling `playYoutubeAudio` locally on the host after emitting `youtube_play`** — double-trigger. The server broadcasts back to the host; rely on the synced handler.
- **Phase-gating the `youtube_play_synced` listener** — it's intentionally global; keep it that way so lobby-initiated playback reaches battle-screen peers.
- **Keying history by socket.id or a random per-mount id** — use `currentPlayer.id` (stable across reconnect, see Runtime State Inventory).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video title lookup | A YouTube Data API client + key management | oEmbed endpoint (no key) | oEmbed is keyless, CORS-open, returns `title` for videos and playlists [VERIFIED] |
| Hidden audio playback | Custom `<audio>` + youtube-dl | Existing `YoutubeAudioPlayer` IFrame integration | Already handles autoplay policy, end-of-track stop |
| localStorage safety wrapper | Inline `JSON.parse` everywhere | Copy `loadMuteSettings`/`saveMuteSettings` shape | Proven try/catch pattern already in `useAudio.tsx` |
| Host authorization | Client-only `isHost` check | Server host-gate already in `websocket.ts` | Client gate is UX; server is the security boundary |

**Key insight:** The entire sync + playback substrate is already built and tested (`eventHandlers.test.ts:341-381` covers the synced handlers). This phase is UI extraction + two additive features (oEmbed title, localStorage history) + closing the Lobby-mount gap.

## Runtime State Inventory

This is a refactor/extraction phase (BossMusicControls → MusicControls) plus a new localStorage namespace. Runtime-state audit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New localStorage key `scrum-monsters-music-history-<playerId>`. Existing `scrum-monsters-mute-settings` (unrelated, untouched). | Code only — new writes; no migration of existing data. |
| Live service config | None — no external service stores the music URL; server does not persist it (`youtube_play` handler only broadcasts, see `websocket.ts:1337-1353`). | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — oEmbed needs no key; no new env vars. | None. |
| Build artifacts | `client/src/components/ui/BossMusicControls.tsx` becomes dead after migration. Note: numerous stale `.bak` files exist in `client/src/components/game/` (e.g., `Lobby.tsx.bak`, `BattleScreen.tsx.bak`) — these are untracked git cruft, NOT part of this phase; do not edit them. | Delete `BossMusicControls.tsx` after all imports migrated (only importer is `BattleScreen.tsx:12`). |

**Stability of `currentPlayer.id`:** VERIFIED stable across reconnections. Server assigns `id: generateSecureId()` once (`gameState.ts:493,579,1290`); the reconnect flow (`gameState.ts:375-425`) looks the player up by the original `token.playerId` and returns the same `player` object (`yourPlayer: player`, line 425). The reconnect token carries `playerId` forward and a new token is minted for the same id. Therefore the localStorage history key is consistent for a given player across disconnect/reconnect within a lobby session. (Note: `id` is NOT persisted in the browser across full page reloads / new lobbies — it is server-generated per join. History is therefore per-lobby-session per-host, which matches D-04's "UX convenience only" framing.)

## Common Pitfalls

### Pitfall 1: YoutubeAudioPlayer not mounted in Lobby → null player ref (CRITICAL)
**What goes wrong:** Host clicks Play in Lobby; `useAudio.youtubePlayer` is `null` because the player only mounts in `BattleScreen` (`BattleScreen.tsx:822`). `playYoutubeAudio` no-ops via `if (youtubePlayer && videoId)` (`useAudio.tsx:682`). Host hears nothing; peers in BattleScreen DO hear it (server broadcast is phase-independent) → desync + confusion.
**Why it happens:** D-06 explicitly flags this. Player is currently battle-scoped.
**How to avoid:** Mount `<YoutubeAudioPlayer />` so it is live whenever either Lobby or BattleScreen is shown. Prefer a single mount at the common ancestor (`GamePage`?) over duplicating it in both (two mounts = two players = the second `onReady` overwrites the store ref, and unmounting one calls `.destroy()` — fragile). Verify the chosen ancestor renders continuously across the lobby→battle transition.
**Warning signs:** Play works in battle but not lobby; or stops working after navigating lobby→battle→lobby.

### Pitfall 2: Playlist URLs silently fail to play (D-07 gap)
**What goes wrong:** A playlist URL (`youtube.com/playlist?list=...`) has no 11-char videoId. Skipping `extractVideoId` validation lets the emit happen, but `youtube_play` payload requires `videoId: z.string().min(1)` (`socket-schemas.ts:347`) and `url: z.string().url()`. An empty videoId fails Zod validation server-side and the event is rejected. Even if it passed, `playYoutubeAudio` guards on `&& videoId`, and the player wrapper has no `loadPlaylist` — only `loadVideoById` (`useAudio.tsx:12`, `YoutubeAudioPlayer.tsx:13`).
**Why it happens:** The whole pipeline is videoId-centric; playlists were never supported.
**How to avoid:** Decide the D-07 scope explicitly during planning:
  - **Option A (true playlist playback):** Extend `YTPlayer`/`YouTubePlayer` interfaces with `loadPlaylist(opts)`; add a store method or branch in `playYoutubeAudio`; widen the `youtube_play` payload to allow a playlist id (e.g., `{ videoId?: string; playlistId?: string; url }`) and update `YoutubePlayPayloadSchema` + `ServerToClientEvents.youtube_play_synced` type (`gameEvents.ts:297,390`); branch in the synced handler.
  - **Option B (defer real playlist playback):** For a `watch?v=...&list=...` URL, `extractVideoId` already matches the `v=` portion (the regex matches `watch?v=` then 11 chars), so the first video plays via its videoId and the title still resolves via oEmbed. A bare `playlist?list=...` URL (no `v=`) cannot play — show the "Playlist detected" note as an informational limitation. Document that bare-playlist playback is out of scope.
**Warning signs:** Pasting a `playlist?list=` URL produces a title in history but no audio; server logs a Zod validation rejection.
**Note on oEmbed for playlists:** oEmbed DOES return a title for bare playlist URLs (verified: "Select Lectures") — so MUSIC-04 (title in history) works for playlists even if playback (MUSIC-02) does not. These two requirements decouple here.

### Pitfall 3: oEmbed 404 for private/unavailable/invalid videos
**What goes wrong:** Private, deleted, region-blocked, or malformed video URLs return HTTP 404 from oEmbed (verified live). A naive `await fetch(...).json()` on a 404 throws.
**Why it happens:** oEmbed only succeeds for publicly embeddable content.
**How to avoid:** Check `response.ok` before `.json()`; on failure use the D-03 fallback (URL truncated to ~40 chars). Wrap in try/catch for network errors.
**Warning signs:** Unhandled promise rejection in console when saving an odd URL.

### Pitfall 4: BossMusicControls' absolute-positioned dropdown vs new mount contexts
**What goes wrong:** `BossMusicControls` settings panel uses `absolute top-full right-0` inside a parent that `BattleScreen` positions `absolute top-6 right-6 z-[60]` (`BattleScreen.tsx:328-337`). Dropped into a Lobby layout with different positioning/overflow, the dropdown may clip or mis-anchor.
**Why it happens:** Positioning assumes a specific anchored parent.
**How to avoid:** Make `MusicControls` self-contained re: its dropdown anchoring, or document required wrapper positioning. Test the history dropdown in both Lobby and BattleScreen layouts.
**Warning signs:** Dropdown clipped by `overflow-hidden` ancestor or off-screen in Lobby.

## Code Examples

### oEmbed title fetch with fallback (client-side, CORS-verified)
```typescript
// CORS verified 2026-06-17: youtube.com/oembed reflects request Origin in
// Access-Control-Allow-Origin, so a plain browser fetch works cross-origin.
async function fetchYoutubeTitle(url: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) throw new Error(`oEmbed ${res.status}`); // 404 for private/invalid
    const data = await res.json();
    return data.title ?? truncate(url);
  } catch {
    return truncate(url); // D-03 fallback
  }
}
const truncate = (s: string) => (s.length > 40 ? s.slice(0, 40) + '…' : s);
```

### localStorage history (mirrors useAudio mute-settings pattern)
```typescript
interface MusicHistoryItem { url: string; title: string; usedAt: number; }

const historyKey = (hostId: string) => `scrum-monsters-music-history-${hostId}`;

function loadHistory(hostId: string): MusicHistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey(hostId));
    return raw ? (JSON.parse(raw) as MusicHistoryItem[]) : [];
  } catch (e) { console.warn('Failed to load music history:', e); return []; }
}

function saveHistory(hostId: string, item: MusicHistoryItem) {
  try {
    const existing = loadHistory(hostId).filter(h => h.url !== item.url); // de-dup by url
    const next = [item, ...existing]
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, 10); // D-04 trim
    localStorage.setItem(historyKey(hostId), JSON.stringify(next));
  } catch (e) { console.warn('Failed to save music history:', e); }
}
```

### Playlist detection (D-07)
```typescript
const isPlaylistUrl = (url: string) => /[?&]list=/.test(url);
// watch?v=ID&list=... → extractVideoId still matches the v= (plays first video)
// playlist?list=...   → no videoId; playback requires loadPlaylist (see Pitfall 2)
```

### Existing server host-gate (do not change — reference only)
```typescript
// server/websocket.ts:1337 — already enforces MUSIC-05 server-side
socket.on('youtube_play', ({ videoId, url }) => {
  const { playerId, lobbyId } = socket.data;
  if (!playerId || !lobbyId) return;
  const lobby = gameState.getLobby(lobbyId);
  if (!lobby || lobby.hostId !== playerId) {
    socket.emit('game_error', { message: 'Only the host can control YouTube music' });
    return;
  }
  io.to(lobbyId).emit('youtube_play_synced', { videoId, url });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| YouTube sync events emitted but no client listener (broken feature) | `youtube_play_synced`/`youtube_stop_synced` wired in `eventHandlers.ts:936-943` | Phase 45-04 | Sync now works; Phase 46 builds on a working base |
| Full-state socket event | Fine-grained domain events via `eventBus` | Phase 42 | Not directly relevant; music events are their own channel |

**Deprecated/outdated:** `BossMusicControls.tsx` becomes redundant once `MusicControls.tsx` lands — delete it (only importer is `BattleScreen.tsx:12`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GamePage` is the common ancestor that renders both Lobby and BattleScreen and persists across the transition | Architecture / Pitfall 1 | If wrong, hoisting `YoutubeAudioPlayer` there won't cover both screens; planner must find the correct shared ancestor or mount in each screen carefully (single-instance caveat applies) |
| A2 | True playlist *playback* is desired (vs. just accepting the URL + first-video playback) | Pitfall 2 / D-07 | If only Option B is needed, the phase is much smaller (no payload/schema/player-interface changes). Confirm scope with user. |

## Open Questions

1. **What is the exact common ancestor for mounting YoutubeAudioPlayer?**
   - What we know: CLAUDE.md says `GamePage` renders `AvatarSelection`/`Lobby` and phase-based views; `YoutubeAudioPlayer` currently lives in `BattleScreen`.
   - What's unclear: Whether `GamePage` (or another component) stays mounted across lobby↔battle and is the cleanest single-mount point.
   - Recommendation: During planning, read the component that switches between Lobby and BattleScreen and mount the player there (single instance). Verify with a navigate lobby→battle→lobby test.

2. **D-07 scope: playback or just acceptance?** (A2)
   - What we know: oEmbed gives playlist titles; the IFrame player wrapper has only `loadVideoById`.
   - What's unclear: Whether the user expects a bare `playlist?list=` URL to actually play audio, or just to be accepted/labeled.
   - Recommendation: Confirm. Option B (first-video-of-watch-URL plays; bare playlist is title-only) is far cheaper and matches the "let the iframe handle it" spirit only partially. True playlist playback (Option A) touches the socket payload type, Zod schema, store, and player wrapper.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| YouTube oEmbed endpoint | MUSIC-04 title fetch | ✓ | live | URL truncation (D-03) |
| YouTube IFrame API | MUSIC-02 playback | ✓ (already integrated) | live | — |
| localStorage | MUSIC-03 history | ✓ (browser) | — | In-memory only (history lost on reload; acceptable per D-04) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None blocking.

## Validation Architecture

> `.planning/config.json` was not located during research; treating nyquist_validation as enabled (default). Planner: confirm and adjust.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (happy-dom) + Playwright (E2E) |
| Config file | `vitest` config per CLAUDE.md; tests colocated `*.test.ts(x)` |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MUSIC-02 | synced handler dispatches play/stop | unit | `npx vitest run client/src/lib/socket/eventHandlers.test.ts` | ✅ (lines 341-381 already cover synced handlers) |
| MUSIC-03 | history save trims to 10, de-dups, sorts desc | unit | `npx vitest run <new MusicControls/history test>` | ❌ Wave 0 |
| MUSIC-04 | oEmbed fetch returns title, falls back on !ok | unit | `npx vitest run <new test>` (mock `fetch`) | ❌ Wave 0 |
| MUSIC-05 | non-host sees read-only; host sees input | unit (RTL) | `npx vitest run <MusicControls.test.tsx>` | ❌ Wave 0 |
| MUSIC-01 | controls render + play works in BOTH Lobby and Battle | E2E | `npm run test:e2e` (two-screen smoke) | ❌ Wave 0 (consider) |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + manual two-browser sync check (host in Lobby → peer hears audio).

### Wave 0 Gaps
- [ ] `client/src/components/ui/MusicControls.test.tsx` — host vs non-host rendering (MUSIC-05), history dropdown (MUSIC-03/05)
- [ ] History helper unit test (trim/de-dup/sort) — MUSIC-03
- [ ] oEmbed fetch unit test with mocked `fetch` (ok + 404 + network error) — MUSIC-04
- [ ] (Optional) E2E two-screen sync test — MUSIC-01/02. Manual two-browser check is acceptable if E2E is heavy.

## Security Domain

> `security_enforcement` config not located; including baseline. Planner: confirm config.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — host identity already established by socket session |
| V3 Session Management | no | Existing reconnect-token flow unchanged |
| V4 Access Control | **yes** | Server-side host gate (`lobby.hostId !== playerId`) already enforced in `websocket.ts:1345,1363`. Client `isHost` gating is UX only. |
| V5 Input Validation | **yes** | `YoutubePlayPayloadSchema` validates `videoId`/`url` server-side. If payload widened for playlists, extend the Zod schema (do NOT relax `url: z.string().url()`). |
| V6 Cryptography | no | None |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-host forces music on lobby | Elevation of Privilege | Server host-gate (existing) — never trust client `isHost` |
| Malicious/oversized URL in `youtube_play` | Tampering | Zod `z.string().url()` + `videoId` min-length (existing); keep on any payload widening |
| oEmbed response treated as trusted HTML | XSS | Use only `response.title` as text (React escapes by default). Do NOT render oEmbed `html` field. |
| localStorage key collision across hosts in same browser (dev) | Tampering (low) | Key includes `currentPlayer.id` (server-generated, unique per join) — sufficient; no extra namespacing needed for production. In dev with one browser/two tabs, each tab is a distinct player id, so keys differ. |

## Sources

### Primary (HIGH confidence)
- Codebase: `BossMusicControls.tsx`, `YoutubeAudioPlayer.tsx`, `useAudio.tsx`, `eventHandlers.ts:936-943`, `websocket.ts:1337-1371`, `socket-schemas.ts:346-349,710-711`, `gameEvents.ts:297-298,390-391`, `gameState.ts:375-425`, `BattleScreen.tsx:12,336,403,822` — [VERIFIED: grep + read]
- Live YouTube oEmbed test (curl, 2026-06-17): single-video returns title; `watch?v=&list=` returns video title; bare `playlist?list=` returns playlist title (HTTP 200); invalid video → HTTP 404; CORS `Access-Control-Allow-Origin` reflects request Origin — [VERIFIED: live]
- Phase 45-04 plan + H5 triage confirming sync handlers were wired — [VERIFIED: codebase docs]

### Secondary (MEDIUM confidence)
- None required.

### Tertiary (LOW confidence)
- A1 (GamePage as common ancestor) — [ASSUMED], flagged in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all infra verified in-repo
- Architecture: HIGH — sync pipeline read end-to-end; oEmbed verified live
- Pitfalls: HIGH — null-player and playlist gaps confirmed by reading the actual guards and interfaces

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable; oEmbed behavior and in-repo code are unlikely to shift)
