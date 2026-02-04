# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** Focused estimation that doesn't bore people - voting distraction-free, waiting fun
**Current focus:** Phase 15 - XP/Progression Foundation

## Current Position

Phase: 15 of 20 (XP/Progression Foundation)
Plan: 5 of 6 in current phase
Status: In progress
Last activity: 2026-02-04 - Completed 15-05-PLAN.md (Level-Up Celebration)

Progress: [███████████████░░░░░] 73% (milestones 1.0+1.2 complete, 1.3 in progress)

## Performance Metrics

**Velocity:**
- Total plans completed: 55 (v1.0: 30, v1.2: 21, v1.3: 4)
- Average duration: varies by phase complexity
- Total execution time: see milestone archives

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Domain Separation | 1-6 | 30 | Complete |
| v1.2 SDLC Best Practices | 7-14 | 21 | Complete |
| v1.3 Game Progression | 15-20 | TBD | In Progress |

**Recent Trend:**
- v1.2 phases completed efficiently with CI/CD patterns
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0]: Domain separation (Session/Estimation/Combat) - foundation for new domains
- [v1.0]: EventBus for cross-domain coordination - will use for XP events
- [v1.2]: 12% coverage baseline - maintain during feature work
- [15-01]: XP curve exponential (baseXP=100, exponent=1.5) for balanced progression
- [15-01]: Per-lobby XP isolation with ProgressionManager domain
- [15-01]: XP rates: vote=10, boss_damage=2x, consensus=50, revival=30
- [15-03]: Progressive disclosure UI pattern (minimal by default, expand on hover)
- [15-03]: JRPG aesthetic (gold gradient #b8860b → #ffd700 → #ffec8b with beveled edges)
- [15-04]: Source-specific XP positioning (vote=left, boss=center, revival=right)
- [15-04]: Bonus XP animations (consensus, revival) larger with pulse effect
- [15-04]: R3F components need smoke tests only (WebGL not available in Vitest)
- [15-05]: 2.5s auto-dismiss for level-up celebration (balanced impact vs. disruption)
- [15-05]: Class-specific particle colors for visual variety and class identity
- [15-05]: Audio store extension pattern (dedicated sound handlers vs. generic playSound)

### Pending Todos

None yet for v1.3.

### Blockers/Concerns

Open items from v1.2:
- ARGOCD_AUTH_TOKEN secret and GitHub environment protection rules must be configured before rollback workflow can be used in production
- Husky deprecation warning (v10 breaking change) - address when upgrading

## Session Continuity

Last session: 2026-02-04 01:19 UTC
Stopped at: Completed 15-05-PLAN.md (Level-Up Celebration)
Resume file: None
