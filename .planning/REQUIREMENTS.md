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
- [ ] **FIX-04**: Boss attacks (single-target and AoE) correctly apply damage to player HP — investigate `BossAttack` → player HP write path; verify AoE targeting iterates affected players and applies damage
- [ ] **FIX-05**: Auto-advance feature is reconciled — either the Lobby UI control is restored and wired end-to-end, or all deprecated/dead code paths (including the deprecated `lobby_updated` event handler at `client/src/pages/GamePage.tsx:189` and any unused client/server hooks) are removed. No more `Received deprecated lobby_updated event` warning at runtime.

### Balance

- [ ] **BAL-01**: XP gain pacing feels rewarding without trivializing progression — XP curve and per-action XP awards reviewed and tuned

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
| FIX-04 | Phase 42 | Pending |
| FIX-05 | Phase 42 | Pending |
| BAL-01 | Phase 42 | Pending |

**Coverage:**
- v5.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-05-07 — Added FIX-04 (boss HP damage), FIX-05 (auto-advance reconcile), BAL-01 (XP pacing) for Phase 42 pre-ship cleanup; AVAT-01 (gender variants) deferred to v5.1.*
