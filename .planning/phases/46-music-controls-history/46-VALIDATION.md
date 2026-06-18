---
phase: 46
slug: music-controls-history
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (happy-dom) + Playwright (E2E) |
| **Config file** | Colocated `*.test.ts(x)` per CLAUDE.md conventions |
| **Quick run command** | `npx vitest run <file>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (unit); ~2 min (full with E2E) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + manual two-browser sync check
- **Max feedback latency:** ~30 seconds (unit suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 46-01-T1 | 01 | 1 | MUSIC-03 | — | history trims to 10, sorts desc by usedAt | unit | `npx vitest run client/src/lib/utils/musicHistory.test.ts` | ❌ W0 | ⬜ pending |
| 46-01-T2 | 01 | 1 | MUSIC-04 | oEmbed XSS | oEmbed returns title text; fallback on 404/error; never renders html field | unit | `npx vitest run client/src/lib/utils/youtubeTitle.test.ts` | ❌ W0 | ⬜ pending |
| 46-01-T3 | 01 | 1 | MUSIC-02 | EoP host-gate | non-host youtube_play rejected server-side; schema validates url + videoId/playlistId | unit | `npx vitest run client/src/lib/socket/eventHandlers.test.ts` | ✅ (lines 341-381) | ⬜ pending |
| 46-02-T1 | 02 | 2 | MUSIC-05 | — | non-host sees read-only status; host sees URL input + history dropdown | unit (RTL) | `npx vitest run client/src/components/ui/MusicControls.test.tsx` | ❌ W0 | ⬜ pending |
| 46-02-T2 | 02 | 2 | MUSIC-01/03/04 | — | history pre-fill works; oEmbed title shown; playlist note shown | unit (RTL) | `npx vitest run client/src/components/ui/MusicControls.test.tsx` | ❌ W0 | ⬜ pending |
| 46-03-T1 | 03 | 3 | MUSIC-01/02 | double-mount | single YoutubeAudioPlayer in GamePage; removed from BattleScreen | manual + grep | `grep -r YoutubeAudioPlayer client/src --include="*.tsx" \| grep -v GamePage \| grep -v definition` exits 0 | N/A grep | ⬜ pending |
| 46-03-T2 | 03 | 3 | MUSIC-01 | — | MusicControls renders in Lobby + BattleScreen; host can play from both | E2E / manual | two-browser smoke: host in Lobby submits URL → peer hears audio | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/src/lib/utils/musicHistory.test.ts` — trim/de-dup/sort logic (MUSIC-03)
- [ ] `client/src/lib/utils/youtubeTitle.test.ts` — oEmbed ok + 404 + network error (MUSIC-04)
- [ ] `client/src/components/ui/MusicControls.test.tsx` — host vs non-host render, history dropdown, playlist note (MUSIC-01/03/04/05)

*Plan 01 Tasks 1+2 and Plan 02 Task 2 create these as part of TDD execution — Wave 0 is satisfied by the plan tasks themselves.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Host plays from Lobby → peer in BattleScreen hears audio | MUSIC-01/02 | Requires two real browser tabs + WebSocket session | Open two browsers: Browser A creates lobby (host), Browser B joins. A submits YT URL from Lobby. B should hear audio within 2s. Repeat with A in BattleScreen. |
| Playlist "Playlist detected" note shows for `playlist?list=` URL | MUSIC-04/D-07 | Requires inline rendering check | Host pastes a bare playlist URL. Confirm note appears. Confirm submit still fires. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
