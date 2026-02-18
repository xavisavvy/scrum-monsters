# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** v2.0 UI Redesign & Mobile milestone — Phase 23 (Social Meta Tags & OG Images)

## Current Position

Phase: 22 of 25 (JRPG Theme Foundation) — COMPLETE
Plan: 5 of 5 in current phase — COMPLETE
Status: Phase 22 Complete — Moving to Phase 23
Last activity: 2026-02-18 — Completed 22-05: WCAG AA contrast validation + E2E axe-core accessibility test

Progress: [██████████████████████████████░░░] 81% (97/119 total plans across all milestones)

## Performance Metrics

**Velocity (v1.0-v1.3 shipped milestones):**
- Total plans completed: 89 (v1.0: 30, v1.2: 21, v1.3: 28, v2.0: 1)
- Average duration: ~45 min (estimated from milestone timelines)
- Total execution time: ~66 hours across 4 milestones

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Domain Separation | 1-6 | 30 | Complete |
| v1.2 SDLC Best Practices | 7-14 | 21 | Complete |
| v1.3 Game Progression | 15-20 | 28 | Complete |
| v2.0 UI Redesign & Mobile | 21-25 | 10/23 | In progress (Phase 22 complete) |

**Recent Trend:**
- Last 5 phases (v1.3): 3-8 plans per phase
- Trend: Stable complexity, consistent velocity

*Updated: 2026-02-18 after completing 22-05 (WCAG AA contrast validation + E2E accessibility test)*

| Phase | Plans Completed | Tasks | Files |
|-------|----------------|-------|-------|
| Phase 22 P05 | 1 | 2 tasks | 3 files |
| Phase 22 P04 | 1 | 2 tasks | 3 files |
| Phase 22 P03 | 1 | 2 tasks | 2 files |
| Phase 22 P02 | 1 | 2 tasks | 4 files |
| Phase 22 P01 | 1 | 2 tasks | 3 files |
| Phase 21 P05 | 1 | 2 tasks | 0 files |

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
Stopped at: Completed 22-05-PLAN.md (WCAG AA contrast validation + E2E axe-core accessibility test) — Phase 22 complete
Resume file: None

**Next action:** Begin Phase 23 (Social Meta Tags & OG Images).

---
*State initialized: 2026-02-11*
*Last updated: 2026-02-18 after completing 22-05 (WCAG AA contrast validation + E2E accessibility test — Phase 22 complete)*
