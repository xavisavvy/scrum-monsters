# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** v2.0 UI Redesign & Mobile milestone — Phase 21 (Production Security Hardening)

## Current Position

Phase: 21 of 25 (Production Security Hardening)
Plan: 4 of 5 in current phase
Status: In progress
Last activity: 2026-02-18 — Completed 21-04: GitHub Actions top-level permissions

Progress: [████████████████████████████░░░░░] 74% (88/119 total plans across all milestones)

## Performance Metrics

**Velocity (v1.0-v1.3 shipped milestones):**
- Total plans completed: 88 (v1.0: 30, v1.2: 21, v1.3: 28, v2.0: 0)
- Average duration: ~45 min (estimated from milestone timelines)
- Total execution time: ~66 hours across 4 milestones

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Domain Separation | 1-6 | 30 | Complete |
| v1.2 SDLC Best Practices | 7-14 | 21 | Complete |
| v1.3 Game Progression | 15-20 | 28 | Complete |
| v2.0 UI Redesign & Mobile | 21-25 | 0/23 | In progress |

**Recent Trend:**
- Last 5 phases (v1.3): 3-8 plans per phase
- Trend: Stable complexity, consistent velocity

*Updated: 2026-02-18 after completing 21-04 (GitHub Actions permissions)*

| Phase | Plans Completed | Tasks | Files |
|-------|----------------|-------|-------|
| Phase 21 P04 | 1 | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting v2.0 milestone work:

- **Theme foundation first:** Prevents rework across 20+ phase components. Design system establishes standards upfront before responsive/routing work.
- **Mobile-first responsive:** Ensures core UX works on primary device type (mobile) before polish work.
- **Routing parallel to UI work:** Minimal overlap, integrates at App.tsx level without touching individual components.
- **Server state authoritative for phases:** URLs reflect game state, don't drive it. Prevents state machine vs URL navigation conflicts.
- [Phase 21]: Top-level permissions: contents: read added to rollback.yml; job-level contents: write preserved for audit-and-notify job

### Pending Todos

- Lobby magic/emote system (Phase 21 backlog) — now formalized as Phase 24 (Lobby Polish)

### Blockers/Concerns

**Asset sourcing (Phase 21):**
- UI sound effects library needs research during plan-phase (freesound.org, OpenGameArt.org, itch.io)
- JRPG ornamental frame assets need sourcing or creation workflow

**Social crawler middleware (Phase 23):**
- User-agent detection needs careful implementation to avoid false positives/negatives
- Testing methodology for crawler meta tag validation needs definition

**Earlier milestones (not blocking v2.0):**
- ARGOCD_AUTH_TOKEN secret and GitHub environment protection rules must be configured before rollback workflow used in production
- Husky deprecation warning (v10 breaking change) — address when upgrading

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 21-04-PLAN.md (GitHub Actions top-level permissions)
Resume file: None

**Next action:** Execute plan 05 of phase 21 (if remaining) or start next phase.

---
*State initialized: 2026-02-11*
*Last updated: 2026-02-11 after v2.0 roadmap creation*
