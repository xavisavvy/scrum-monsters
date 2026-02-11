# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** Focused estimation that doesn't bore people - voting distraction-free, waiting fun
**Current focus:** Phase 18 complete, ready for Phase 19

## Current Position

Phase: 18 of 20 (Class Abilities) — COMPLETE
Plan: 3/3 complete, verified
Status: Phase 18 verified (4/4 must-haves passed), ROADMAP updated
Last activity: 2026-02-11 - Phase 18 execution complete with verification

Progress: [█████████████████░░░] 85% (milestones 1.0+1.2 complete, 1.3 in progress)

**Phase 21 (Lobby Magic)**: Implemented ad-hoc, marked as partially complete

## Performance Metrics

**Velocity:**
- Total plans completed: 72 (v1.0: 30, v1.2: 21, v1.3: 21 incl. phase 18)
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
- [15-07]: Fire-and-forget XP persistence to avoid blocking gameplay
- [15-07]: Player-user ID registry for progression storage mapping
- [15-07]: Async IIFE pattern for non-blocking socket handlers
- [15-08]: Level badge displayed only for players above level 1 (progressive disclosure)
- [15-08]: JRPG gold aesthetic (amber-400) for level display consistency with XP bar
- [15-08]: Compact "LvN" format matches JRPG conventions
- [16-01]: 1:1 XP parity between class mastery and global progression
- [16-01]: Three-tier mastery system (Novice/Expert/Master) with stat multipliers (1.0/1.1/1.2)
- [16-01]: Award class XP to player's CURRENT class (encourages class experimentation)
- [16-01]: Fire-and-forget persistence for class mastery data
- [16-02]: Fire-and-forget async IIFE pattern for class mastery sync (consistent with progression)
- [16-02]: Emit class_mastery:sync only when masteryData has entries (avoid empty payloads)
- [16-02]: Class mastery events follow progression:* naming pattern for consistency
- [16-04]: Client-side tier calculation using ClassMasteryXPCurve for instant UI updates
- [16-04]: Progressive disclosure for MasteryProgressBar (only render if class has data)
- [16-04]: JRPG gold gradient aesthetic for mastery UI matching global XP bar
- [16-05]: Bottom-right toast positioning to avoid fullscreen level-up overlap
- [16-05]: Priority handling pattern: tier-up defers to level-up celebration when both trigger
- [16-05]: 3-second auto-dismiss for tier-up toast (vs 2.5s for level-up)
- [16-05]: Progressive disclosure for mastery badges (Expert/Master only, no Novice badge)
- [17-01]: Explicit FSM replaces boolean isEnraged flag for maintainability
- [17-01]: HP-based phases: Phase 1 (>66%), Phase 2 (34-66%), Phase 3 (<=33%)
- [17-01]: Phase transitions are one-way only (prevents oscillation bugs)
- [17-01]: Weighted pattern selection with anti-repeat logic
- [17-01]: Action-specific threat weights (damage 1.0x, healing 0.8x, revival 150)
- [17-02]: Data-driven boss behavior definitions with 9+ patterns per boss
- [17-02]: BossAI coordinator owns all subsystems for simple CombatManager API
- [17-02]: Pattern IDs include boss type prefix for collision prevention
- [17-03]: BossAI.recordThreat API replaces manual threat table updates for consistency
- [17-03]: Emit both boss_phase_transition and boss_enraged for backward compatibility
- [17-03]: Level scaling applies to HP (+8%/level) and damage (+5%/level) for difficulty scaling
- [17-04]: Auto-dismiss telegraph after attack lands (delayMs + 500ms buffer for animation)
- [17-04]: Auto-dismiss phase messages after 2 seconds (matches level-up pattern)
- [17-04]: Telegraph positioned top-center with z-50 (visible, no overlap with XP/combat UI)
- [17-04]: Visual effects mapped to Tailwind classes (charge/glow/shake/particles)
- [17-05]: ProgressionManager wired as adapter providing getPlayerLevel to CombatManager
- [17-05]: Boss sprite flows from gameState.createBossFromTickets through socket handlers to BossAI
- [18-01]: Server-authoritative cooldown tracking (Map<lobbyId, Map<playerId, Map<abilityId, CooldownState>>>)
- [18-01]: Ability IDs match CLASS_ABILITIES from classMasteryTypes.ts exactly
- [18-01]: Event-driven effect application (ability:effect_applied events, not direct CombatManager calls)
- [18-01]: Independent cooldowns per ability (no global cooldown)
- [18-01]: Heal targeting selects lowest HP fighting player for single-target heals
- [18-01]: Role distribution: 3 tank, 2 healer, 5 DPS classes
- [18-02]: use_ability handler validates battle phase before calling AbilityManager
- [18-02]: Damage effects applied via CombatManager.applyAbilityDamageToBoss for threat tracking
- [18-02]: Taunt effects use recordThreat with 'damage' type (500 threat value)
- [18-02]: ClientEventEmitter adds seq/timestamp to all ability:* events
- [18-03]: Ref-based requestAnimationFrame loops for smooth cooldown animations (avoid per-tick re-renders)
- [18-03]: CSS conic-gradient for cooldown overlay (performant, no canvas needed)
- [18-03]: 100ms client buffer on isOnCooldown to prevent client/server race conditions
- [18-03]: Border color based on ability role: amber (tank), green (healer), blue (DPS)
- [18-03]: Optimistic UI with pendingAbility state to prevent spam clicks

### Pending Todos

None yet for v1.3.

### Blockers/Concerns

Open items from v1.2:
- ARGOCD_AUTH_TOKEN secret and GitHub environment protection rules must be configured before rollback workflow can be used in production
- Husky deprecation warning (v10 breaking change) - address when upgrading

## Session Continuity

Last session: 2026-02-11
Stopped at: Phase 18 complete and verified (4/4 must-haves). Ready for Phase 19.
Resume file: None
