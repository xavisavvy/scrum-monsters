# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** v2.0 UI Redesign & Mobile milestone — Phase 23 (Mobile UX Critical Path)

## Current Position

Phase: 23 of 25 (Mobile UX Critical Path) — IN PROGRESS
Plan: 5 of 6 in current phase — COMPLETE
Status: Phase 23 Plan 05 complete — Safe-area insets on all edge UI, dvh height on all game screens
Last activity: 2026-02-18 — Completed 23-05: ReconnectionStatus safe-area+touch-targets, PlayerHUD pb-safe, TimerDisplay/BossMusicControls safe-area offsets, LobbyCreation/LobbyJoin/AvatarSelection dvh+pb-safe, PhaseContainer dvh

Progress: [█████████████████████████████████░░░] 86% (103/119 total plans across all milestones)

## Performance Metrics

**Velocity (v1.0-v1.3 shipped milestones):**
- Total plans completed: 100 (v1.0: 30, v1.2: 21, v1.3: 28, v2.0: 13)
- Average duration: ~45 min (estimated from milestone timelines)
- Total execution time: ~66 hours across 4 milestones

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Domain Separation | 1-6 | 30 | Complete |
| v1.2 SDLC Best Practices | 7-14 | 21 | Complete |
| v1.3 Game Progression | 15-20 | 28 | Complete |
| v2.0 UI Redesign & Mobile | 21-25 | 16/23 | In progress (Phase 23 P05 complete) |

**Recent Trend:**
- Last 5 phases (v1.3): 3-8 plans per phase
- Trend: Stable complexity, consistent velocity

*Updated: 2026-02-18 after completing Phase 23 Plan 05 (safe-area integration pass on all edge UI and game screens)*

| Phase | Plans Completed | Tasks | Files |
|-------|----------------|-------|-------|
| Phase 23 P05 | 1 | 3 tasks | 8 files |
| Phase 23 P04 | 1 | 2 tasks | 2 files |
| Phase 23 P03 | 1 | 2 tasks | 4 files |
| Phase 23 P02 | 1 | 1 task | 2 files |
| Phase 23 P01 | 1 | 2 tasks | 6 files |
| Phase 22 P06 | 1 | 2 tasks | 5 files |
| Phase 22 P05 | 1 | 2 tasks | 3 files |
| Phase 22 P04 | 1 | 2 tasks | 3 files |
| Phase 22 P03 | 1 | 2 tasks | 2 files |
| Phase 22 P02 | 1 | 2 tasks | 4 files |
| Phase 22 P01 | 1 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting v2.0 milestone work:

- **Theme foundation first:** Prevents rework across 20+ phase components. Design system establishes standards upfront before responsive/routing work.
- **Mobile-first responsive:** Ensures core UX works on primary device type (mobile) before polish work.
- **Routing parallel to UI work:** Minimal overlap, integrates at App.tsx level without touching individual components.
- **Server state authoritative for phases:** URLs reflect game state, don't drive it. Prevents state machine vs URL navigation conflicts.
- [Phase 21]: Top-level permissions: contents: read added to rollback.yml; job-level contents: write preserved for audit-and-notify job
- [Phase 21-01]: authLimiter only on /api/auth/login and /api/auth/register (not OAuth routes — OAuth uses state param for CSRF); trust proxy set to 1 (single hop); lobbyId regex case-insensitive, normalizes to uppercase
- [Phase 21-03]: Use crypto.randomBytes for all security-sensitive IDs; preserve Math.random for gameplay randomness (boss AI, damage, positioning)
- [Phase 21-03]: generateSecureLobbyCode uses alphanumeric charset for human-readable lobby codes; generateSecureId uses 13-char hex for player/boss/projectile IDs
- [Phase 21-02]: Read CSRF token from x-csrf-token header (not form body) — SPA clients use headers; OAuth routes excluded from CSRF (use OAuth state param); token re-fetched after login/register/logout (session may regenerate)
- [Phase 21-05]: Security verification sweep is verification-only (no code changes); all 10 automated checks + human runtime verification confirm Phase 21 hardening is correctly wired end-to-end
- [Phase 22-01]: tokens.css imported in App.tsx (not index.css) — retro.css was already there, maintaining consistent import pattern
- [Phase 22-01]: --jrpg-panel-bg references var(--retro-primary) not hardcoded #16213e — single source of truth for primitive values
- [Phase 22-02]: GamePanel/GameButton are canonical names; RetroCard/RetroButton are backward-compatible re-export aliases — re-export wrapper avoids 30-file import migration
- [Phase 22-02]: useAudio.getState() used in GameButton (not hook) to avoid re-renders on audio state changes
- [Phase 22-02]: accent variant maps to danger in RetroButton->GameButton variantMap for backward compatibility
- [Phase 22-03]: HealthBar is standalone (not a StatBar wrapper) — threshold-based dynamic color is fundamentally different from StatBar's static per-variant colors
- [Phase 22-03]: Dynamic health color applied via inline style not Tailwind class — color is computed at runtime based on HP percentage
- [Phase 22-04]: useGameSounds maps to existing useAudio functions — no new Audio objects created; temporary mappings documented in JSDoc for future SFX replacement
- [Phase 22-04]: PhaseTransition uses key={toPhase} for AnimatePresence — phase string as key drives declarative enter/exit without isTransitioning prop
- [Phase 22-04]: framer-motion import from 'framer-motion' package (not 'motion/react') — v11.x uses the framer-motion package name
- [Phase 22-05]: .retro-text-glow uses --jrpg-text-primary (#f5f5f5, 12.6:1) not --retro-glow-light — animated hue fails at many hue positions
- [Phase 22-05]: .retro-text-glow-light uses --jrpg-text-accent (#ffd700 gold, 9.8:1) — preserves themed look while passing WCAG AA
- [Phase 22-05]: text-shadow animated glow is WCAG-exempt per WCAG 2.1 — shadow is decorative, not the text color
- [Phase 22-05]: e2e/accessibility.spec.ts uses direct AxeBuilder (not a11y-fixture) with color-contrast-only rule — focused JRPG theme regression test
- [Phase 22-06]: StatBar color prop uses color ?? VARIANT_COLORS[variant] — caller overrides variant color without touching variant system
- [Phase 22-06]: XPBar test updated to check role=progressbar ARIA attrs instead of .xp-bar-fill CSS class (implementation detail test tied to removed DOM node)
- [Phase 23-01]: viewport-fit=cover replaces maximum-scale=1 — enables env() safe-area CSS while preserving WCAG 1.4.4 pinch-to-zoom
- [Phase 23-01]: touch-action: manipulation in mobile.css @layer base replaces maximum-scale=1 for double-tap prevention
- [Phase 23-01]: Global canvas touch-action: none removed — applied per-component for Three.js canvases only
- [Phase 23-01]: fibonacci-button aspect-ratio: auto on mobile — rectangular buttons improve text readability on 4-col grid
- [Phase 23-01]: 100dvh with 100vh fallback — fixes iOS Safari address bar collapsing visible viewport
- [Phase 23-02]: PerformanceMonitor defaults used (250ms window, 10 iterations, 0.75 threshold) — drei defaults match intended adaptive behavior
- [Phase 23-02]: DPR steps in 0.5 increments (1.0 to 2.0) via onDecline/onIncline for smooth visual transitions
- [Phase 23-02]: mobile.css must use plain CSS (not @layer) when imported outside Tailwind directive scope
- [Phase 23-03]: RotateDeviceOverlay uses local dismissed state reset on phase change — soft nudge per phase, not a one-time global dismiss
- [Phase 23-03]: battle-sidebar CSS class added as prefix to existing className string — minimal BattleScreen change, no logic refactor
- [Phase 23-03]: Portrait bottom-sheet uses fixed positioning so it overlays game world without reflowing game layout
- [Phase 23-04]: MobileControls uses makeButtonHandlers factory — DRY pattern creates onPointerDown/onPointerUp/onPointerCancel per button via spread
- [Phase 23-04]: handleMobileKeyDown replicates handleKeyDown logic (not calls it) — keyboard handler takes KeyboardEvent, mobile handler takes string code; same side effects
- [Phase 23-04]: handleScreenClick renamed handleScreenPointerDown with pointerType guard — prevents double-fire where touch fires both pointer and click events
- [Phase 23-04]: handleMobileKeyDown placed after findNearestTargetPlayer — TypeScript hoisting constraint with const useCallback
- [Phase 23-05]: ReconnectionStatus uses calc(16px + env(safe-area-inset-top)) in style — Tailwind top-4 class cannot incorporate env() values
- [Phase 23-05]: TimerDisplay uses top/left inline style with calc(1.5rem + env(safe-area-inset-*)) — overrides top-6/left-6 classes while preserving px-4/py-2 padding
- [Phase 23-05]: pb-safe (not p-safe) on lobby screens — avoids overriding existing horizontal padding where env() resolves to 0px
- [Phase 23-05]: PhaseContainer gets style={{ height: '100dvh' }} inline override — h-screen provides 100vh fallback

### Pending Todos

- Lobby magic/emote system (Phase 21 backlog) — now formalized as Phase 24 (Lobby Polish)

### Blockers/Concerns

**Social crawler middleware (Phase 23):**
- User-agent detection needs careful implementation to avoid false positives/negatives
- Testing methodology for crawler meta tag validation needs definition

**Earlier milestones (not blocking v2.0):**
- ARGOCD_AUTH_TOKEN secret and GitHub environment protection rules must be configured before rollback workflow used in production
- Husky deprecation warning (v10 breaking change) — address when upgrading

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 23-05-PLAN.md (safe-area integration pass on all edge UI and game screens)
Resume file: None

**Next action:** Continue Phase 23 — execute 23-06-PLAN.md (next plan in Mobile UX Critical Path).

---
*State initialized: 2026-02-11*
*Last updated: 2026-02-18 after completing 23-05 (safe-area integration pass on all edge UI and game screens)*
