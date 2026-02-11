# Research Summary: JRPG UI, Mobile UX, Routing & Lobby Magic

**Domain:** UI/UX redesign for real-time multiplayer game
**Researched:** 2026-02-11
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

Research covered four domains for ScrumQuest's next milestone: JRPG-themed UI redesign, mobile game UX optimization, SPA routing with SEO support, and lobby interaction enhancements. Key finding: **Most table stakes features can leverage existing infrastructure** (WebSocket reconnection, emote events, phase transitions), reducing implementation complexity. The project is well-positioned for mobile-first design and JRPG theming without major architectural changes.

**Critical insight:** Social media SEO requires middleware for crawler detection (not full SSR) to avoid Google's cloaking penalties in 2026. Modern browsers support View Transitions API for smooth phase changes. Mobile safe area handling is straightforward with CSS environment variables. The biggest complexity lies in dual-orientation support (landscape for battle, portrait for lobby) and ensuring 44px minimum touch targets across all phases.

**Existing features to leverage:** WebSocket reconnection system handles mobile network interruptions. `lobby_emote`, `battle_emote`, and `player_charge` events exist but need UI polish. Phase transition system (`GamePhase` type) is ready for animation hooks. This milestone is primarily frontend polish + routing infrastructure rather than server-side complexity.

**Architecture recommendation:** Component library with JRPG theme tokens + React Router (BrowserRouter) + React Helmet Async for meta tags + Express middleware for social crawler detection. Avoid full SSR (unnecessary complexity, Google penalty risk). Keep animations in 100-500ms range for optimal feel.

## Key Findings

**Stack:** React Router (BrowserRouter) + React Helmet Async + CSS custom properties for safe areas + audio library (Howler.js or Web Audio API) + pixel art asset optimization

**Architecture:** Theme token system for JRPG consistency + responsive layout with viewport-based component variants + middleware layer for social crawler meta tag injection + animation hooks on existing phase transitions

**Critical pitfall:** Testing only on desktop or tablets will miss mobile touch target issues. Must test on iPhone SE-sized screens (smallest common viewport). SSR for SEO is overkill and risks Google penalties — middleware for social crawlers only.

## Implications for Roadmap

Based on research, suggested phase structure:

### 1. **JRPG Theme Foundation** - Design system and visual language
   - Addresses: Ornamental frames, theme tokens, component library, sound effects
   - Avoids: Inconsistent theming across phases (build foundation first)
   - Duration: Medium (component refactoring, asset sourcing)
   - Dependencies: None, foundational work

### 2. **Mobile UX Critical Path** - Touch targets, safe areas, responsive layouts
   - Addresses: Touch-friendly buttons, safe area handling, orientation support
   - Avoids: Desktop-only UX that breaks on mobile (85% traffic is mobile web games)
   - Duration: Medium (UI audit, responsive refactor)
   - Dependencies: Theme foundation (reusable components)

### 3. **Routing & SEO Infrastructure** - Clean URLs, meta tags, social sharing
   - Addresses: React Router setup, React Helmet Async, Open Graph tags, social crawler middleware
   - Avoids: Hash routing (breaks SEO), missing meta tags (poor social sharing)
   - Duration: Low-Medium (routing straightforward, middleware moderate)
   - Dependencies: None, parallel to UI work

### 4. **Lobby Polish & Animations** - Enhanced emotes, readiness, idle animations, phase transitions
   - Addresses: Lobby engagement, visual polish, smooth state changes
   - Avoids: Static lobby (feels dead), jarring phase changes
   - Duration: Low-Medium (UI polish, animation timing)
   - Dependencies: Theme foundation (consistent animations), mobile UX (touch-friendly)

### Phase ordering rationale:
- **Theme first:** Prevents rework. All subsequent UI work inherits design system.
- **Mobile second:** Ensures core UX works on primary device type before polish.
- **Routing parallel:** Can be developed alongside UI work (minimal overlap).
- **Lobby polish last:** Builds on theme + mobile foundation. Adds differentiators after table stakes.

### Research flags for phases:
- **Phase 1 (Theme):** Standard patterns, unlikely to need deeper research. Asset sourcing may need exploration.
- **Phase 2 (Mobile):** Safe area handling well-documented. Dual-orientation support may need testing-based iteration.
- **Phase 3 (Routing):** Social crawler middleware needs careful implementation to avoid cloaking. May need deeper research on user-agent detection.
- **Phase 4 (Lobby):** Straightforward polish work. Animation timing may need playtesting.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| JRPG Theming | MEDIUM-HIGH | Design patterns well-established (Game UI Database). Asset sourcing and integration need validation. |
| Mobile UX | HIGH | Safe areas, touch targets, responsive design are solved problems. Reconnection UX already built. |
| Routing & SEO | MEDIUM | React Helmet Async is standard. Social crawler middleware less documented — needs careful implementation. |
| Lobby Interactions | HIGH | Server events exist. UI polish is straightforward. Animation timing needs playtesting. |

## Gaps to Address

### Areas where research was inconclusive:
- **Audio asset sourcing:** Found design principles and best practices, but not specific asset libraries or creation workflows. Need to research royalty-free game sound effect sources (freesound.org, OpenGameArt.org, itch.io).
- **Social crawler user-agent detection:** General approach documented, but specific implementation for Vite/Express needs validation. Risk of false positives (blocking real users) or false negatives (missing crawlers).
- **View Transitions API browser support:** Modern API, may need fallback for older browsers. Need to verify support across target devices.

### Topics needing phase-specific research later:
- **Phase 1 (Theme):** Pixel art asset creation or sourcing workflow. Audio integration patterns for React apps.
- **Phase 2 (Mobile):** Testing methodology for safe areas across devices. Emulator vs. real device testing requirements.
- **Phase 3 (Routing):** Social crawler detection implementation. Meta tag validation for different platforms (Twitter, Discord, Slack, LinkedIn).
- **Phase 4 (Lobby):** Idle animation loops (sprite sheets vs. CSS animations). Emote UI patterns (toast vs. bubble vs. overhead).

### Critical unknowns:
- **Performance impact of JRPG-themed frames:** Will ornamental borders (CSS or canvas) affect frame rate on mobile?
- **Social crawler middleware reliability:** How to test that crawlers receive correct meta tags without manual verification on each platform?
- **Dual-orientation UX flow:** Should app hint/enforce orientation, or adapt silently? User testing needed.
