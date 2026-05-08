# Requirements: ScrumQuest

**Defined:** 2026-03-11
**Core Value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun

## v5.0 Requirements

Requirements for UX & Onboarding milestone. Each maps to roadmap phases.

### State Polish

- [ ] **POLISH-01**: User sees themed empty state messages with CTAs on blank screens (no players, no tickets, no abilities, empty scoreboard)
- [ ] **POLISH-02**: User sees skeleton loading screens for lobby player list and themed loading spinner for battle preparation
- [ ] **POLISH-03**: User sees JRPG-themed error fallback UI with retry button when a component crashes, with granular per-phase error boundaries
- [ ] **POLISH-04**: User sees JRPG interstitial screens during phase transitions ("Encounter!", "Victory!", "Tallying results...")

### Interaction Feedback

- [ ] **FEED-01**: User sees press/spring-back animations on buttons and glow/bounce on vote card selection
- [ ] **FEED-02**: User receives toast notifications for key events (score submitted, reconnected, settings saved, ability used)
- [ ] **FEED-03**: User sees brief confirmation flash and cooldown indicator when activating abilities

### Tutorial System

- [x] **TUTR-01**: User sees a phase-aware spotlight walkthrough on first visit to lobby, avatar selection, and battle (skippable, remembers completion) (Phase 40-01)
- [x] **TUTR-02**: User sees one-time contextual hints on first encounter with features (first combo, first item drop, first boss telegraph) (Phase 40-01)
- [x] **TUTR-03**: Tutorial and hint text appears in JRPG dialogue box style with narrator character (Guild Master, Battle Advisor, Sage) (Phase 40-02)
- [ ] **TUTR-04**: User can re-trigger tutorial from a help menu button

### Bug Fixes

- [ ] **FIX-01**: VictoryPhase "New Game" button has a valid server handler
- [ ] **FIX-02**: DeveloperMenu Character Tools and Boss Tools buttons are functional or removed
- [x] **FIX-03**: Reconnecting to a lobby restores original player + host status; localStorage keys (`scrum-monsters-last-lobby`, `scrum-monsters-lobby-snapshot`, `scrum-monsters-reconnect-token`) cannot drift; reconnect tokens validate within the full grace window (Phase 41)
- [x] **FIX-04**: Boss attacks (single-target and AoE) correctly apply damage to player HP — investigate `BossAttack` → player HP write path; verify AoE targeting iterates affected players and applies damage (completed 42-01, 2026-05-07: server damage path verified intact; client perceptual signal added — HP bar in HUD + character flash on HP decrement + floating red damage popup wired to combat:player_damaged)
- [x] **FIX-05**: Auto-advance feature is reconciled — Lobby UI control restored and wired end-to-end (Phase 42-02a, host-only checkbox defaulting OFF, persisted with lobby settings) AND all `lobby_updated` paths fully retired (Phase 42-02b, 26 server emit sites migrated to fine-grained events, GamePage handler deleted, `'lobby_updated'` removed from `ServerToClientEvents`). No more `Received deprecated lobby_updated event` warning at runtime; tsc serves as the future safety net.

### Balance

- [x] **BAL-01**: XP gain pacing feels rewarding without trivializing progression — XP curve and per-action XP awards reviewed and tuned (completed 42-03, 2026-05-07)

### Authentication

- [x] **AUTH-01**: Sign-in via Auth0 completes end-to-end (no redirect loop), authenticated session is recognized client-side via `/api/auth/me`, sign-out works, account-tied surfaces (profile, stats) render when authenticated, anonymous play preserved, and missing Auth0 env vars surface a clear error (not a silent loop) (Phase 43-01 + 43-02, completed 2026-05-08)

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Progressive UX

- **PROG-01**: User sees simplified battle UI for first 2 rounds, with advanced features progressively revealed
- **PROG-02**: User can toggle "Show all features" to bypass progressive revelation

### Power User

- **PWR-01**: User sees keyboard shortcut badges on vote cards and ability buttons
- **PWR-02**: User can access quick-reference card of all shortcuts via "?" button

### Avatar Variants (v5.1 candidate)

- **AVAT-01**: Each playable class has selectable male and female variants in avatar selection (likely a content + asset phase — defer to v5.1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Separate tutorial mode / practice battle | Enormous effort for a feature most users skip; real game IS the tutorial |
| Video tutorial / walkthrough recording | Goes stale when UI changes, users skip videos |
| Onboarding quiz / knowledge check | Patronizing for a work tool used during sprint planning |
| Mandatory (unskippable) tutorial | #1 complaint in game UX research; always skippable |
| Animated mascot that follows you | Clippy syndrome; narrator appears only at specific moments |
| Complex achievement notification system | Existing progression celebrations (LevelUp, TierUp, FloatingXP) sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| POLISH-01 | Phase 37 | Pending |
| POLISH-02 | Phase 37 | Pending |
| POLISH-03 | Phase 37 | Pending |
| POLISH-04 | Phase 38 | Pending |
| FEED-01 | Phase 38 | Pending |
| FEED-02 | Phase 38 | Pending |
| FEED-03 | Phase 38 | Pending |
| TUTR-01 | Phase 40 | Pending |
| TUTR-02 | Phase 40 | Pending |
| TUTR-03 | Phase 40 | Complete (40-02) |
| TUTR-04 | Phase 39 | Pending |
| FIX-01 | Phase 37 | Pending |
| FIX-02 | Phase 37 | Pending |
| FIX-03 | Phase 41 | Complete (2026-05-06) |
| FIX-04 | Phase 42 (42-01) | Complete |
| FIX-05 | Phase 42 (42-02a + 42-02b) | Complete |
| BAL-01 | Phase 42 (42-03) | Complete |
| AUTH-01 | Phase 43 (43-01 + 43-02) | Complete (2026-05-08) |

**Coverage:**
- v5.0 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-05-08 — AUTH-01 complete (Phase 43-01 graceful unconfig UX + Phase 43-02 configured-path tests + AUTH0_* env hardening; 705/705 tests pass).*
