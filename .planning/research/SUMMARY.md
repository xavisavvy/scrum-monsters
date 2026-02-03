# Project Research Summary

**Project:** ScrumQuest v1.3 Game Progression
**Domain:** XP/leveling systems, boss AI patterns, and team combat mechanics for real-time multiplayer JRPG-style game
**Researched:** 2026-02-03
**Confidence:** HIGH

## Executive Summary

ScrumQuest v1.3 transforms the existing combat system from a simple real-time multiplayer experience into a proper RPG progression system. The research confirms that the existing architecture (EventBus coordination, domain managers, Socket.IO, Zustand, Drizzle ORM) handles these features natively with minimal structural changes. The recommended approach adds two new domain managers (ProgressionManager, AbilityManager) and extends CombatManager with boss AI behavior patterns, all coordinated through the existing event bus. No new runtime dependencies are required.

The key insight from research is that XP formulas should be formula-based pure functions (not database lookup tables), boss AI should use explicit state machines (not boolean flags), and ability cooldowns must use server-authoritative timestamps (not client-predicted durations). These three architectural decisions prevent the most critical pitfalls: XP calculation race conditions, boss state explosion, and cooldown desynchronization. The existing codebase already demonstrates the patterns needed - the EventBus for cross-domain communication, CombatManager for state machine patterns, and Drizzle for schema extensions.

The most significant risk is the temptation to add XP logic directly into CombatManager rather than creating a separate ProgressionManager domain. This would create tight coupling that makes testing difficult and future changes risky. The research strongly recommends maintaining the domain-separated architecture that already exists. Combat emits events, Progression subscribes - never the reverse. Class ability power creep is a secondary risk that requires combination testing, not just individual ability testing.

## Key Findings

### Recommended Stack

No new runtime dependencies are required. The existing stack fully supports v1.3 requirements.

**Core technologies (existing):**
- **TypeScript discriminated unions**: Type-safe ability and effect definitions - compile-time safety without runtime overhead
- **Drizzle ORM generated columns**: PostgreSQL computed level from XP - query-efficient, no sync issues
- **EventBus pattern**: Cross-domain coordination for XP awards, ability triggers, item consumption - already handles 75+ event types
- **Zustand**: Client-side progression state - already manages game state reactively
- **Socket.IO**: Real-time XP notifications, ability broadcasts - already handles all real-time events

**Not recommended:**
- **XState**: CombatManager already implements state machine patterns; adds 15KB+ bundle and learning curve for patterns the team already knows
- **Dedicated XP libraries**: XP formulas are ~20 lines of pure TypeScript; custom formulas allow precise balancing control
- **Separate inventory database table (MVP)**: Items are session-scoped; in-memory storage sufficient for MVP

### Expected Features

**Must have (table stakes):**
- XP gain on vote submission and boss damage dealt - core gamification of scrum poker activity
- Persistent XP storage per account with level progression - progress must survive logout/reconnect
- Visual XP bar with level-up notifications - players need immediate feedback
- Phase-based boss attack patterns with telegraphing - bosses should feel dangerous but fair
- Unique attack pools per boss type - 5 existing bosses should feel different to fight
- HP-based difficulty scaling and enrage mechanics - progression through battle session

**Should have (differentiators):**
- Class mastery tracking with tier-based ability unlocks - long-term progression hook
- Voting accuracy XP bonuses - encourages thoughtful estimation
- Class-specific abilities with cooldown system (1-2 per class) - gives each of 10 classes identity
- Team combos triggered by class cooperation - encourages class diversity
- Combat items/consumables (session-scoped) - tactical depth layer

**Defer (v2+):**
- Prestige/rebirth system - end-game content for dedicated users
- Adaptive boss AI that learns player patterns - significant complexity
- Memory between sessions for bosses - persistence complexity
- Weekly/sprint leaderboards - social feature, not core progression
- Complex multi-class combo chains - requires extensive balancing

### Architecture Approach

The architecture extends the existing domain-separated pattern with two new managers and enhanced boss AI. ProgressionManager owns all XP state and subscribes to combat events (never the reverse). AbilityManager handles ability execution, cooldowns, effects, and combo detection. CombatManager's existing boss attack logic is extended with a PatternSequencer and BossBehavior interface for type-specific behaviors. All cross-domain communication flows through the EventBus.

**Major components:**
1. **ProgressionManager (new)** - Player progression outside sessions: account XP, class mastery, level calculations, persistence checkpoints
2. **AbilityManager (new)** - Ability execution, cooldown tracking (server-authoritative timestamps), effect application, team combo detection
3. **CombatManager (extended)** - Boss AI with PatternSequencer, phase-based attack selection, difficulty scaling formulas, threat evaluation
4. **Database schema extensions** - `player_progression` table with generated level column, `class_mastery` table with user-class unique constraint
5. **Client stores (extended)** - useProgression.tsx for persistent state, useAbilities.tsx for session combat state

### Critical Pitfalls

1. **XP Calculation Race Conditions** - Multiple events can trigger XP awards simultaneously. **Prevention:** Single-entry-point `awardXP()` method in ProgressionManager, queue XP awards, emit events AFTER state mutation completes.

2. **Boss State Machine Explosion** - Adding attack patterns as booleans (`isEnraged`, `isCharging`, `isCasting`) creates untestable combinatorial states. **Prevention:** Explicit FSM with enum states (`idle | telegraphing | attacking | recovering`), valid transitions defined, no boolean flags.

3. **Ability Cooldown Desynchronization** - Client predicts cooldown locally, server has different timing. **Prevention:** Server-authoritative `cooldownEndsAt` timestamps, client accepts server corrections, never store durations.

4. **XP Persistence Without Session Boundaries** - Reconnection loses in-progress XP or allows duplication. **Prevention:** Define "confirmed XP" (persisted) vs "pending XP" (session), persist only at checkpoints (ticket completion, phase transitions).

5. **Tight Coupling Between Combat and Progression** - Adding XP logic directly in CombatManager creates bidirectional dependencies. **Prevention:** Combat emits domain events, ProgressionManager subscribes, XP formulas live in ProgressionManager only.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: XP/Progression Foundation
**Rationale:** Foundation for all other progression. Without XP tracking, nothing else makes sense. Low-risk server changes with high-value reward feedback.
**Delivers:** ProgressionManager domain, player_progression schema with generated level column, XP formulas, event wiring for vote/damage/consensus
**Addresses:** XP gain on actions, persistent storage, level progression, visual XP bar
**Avoids:** Race conditions (single entry point), persistence issues (checkpoint-based), tight coupling (event-based communication)

### Phase 2: Class Mastery System
**Rationale:** Builds on XP foundation. Extends progression schema with class-specific tracking. Lower complexity than boss AI changes.
**Delivers:** class_mastery schema, class XP tracking on ability use, mastery tier definitions, unlock progression
**Addresses:** Account-level + class-specific XP split, long-term progression hook
**Uses:** ProgressionManager from Phase 1, existing AvatarClass definitions

### Phase 3: Boss AI Patterns
**Rationale:** Server-side changes that can be tested without client changes. Extends existing CombatManager. High value - 5 existing bosses gain distinct personalities.
**Delivers:** BossDefinition system, PatternSequencer, phase-based attack pools, difficulty scaling formulas, threat-based targeting
**Addresses:** Phase-based attacks, unique attacks per boss type, telegraphing, enrage mechanics
**Avoids:** State machine explosion (explicit FSM), predictability (weighted randomization with memory)

### Phase 4: Class Abilities
**Rationale:** Requires UI for activation and cooldown display. Benefits from stable boss patterns to test against. High complexity but high value.
**Delivers:** AbilityManager domain, ability definitions (1-2 per class), cooldown tracking, visual UI, effect application
**Addresses:** Class-specific abilities, cooldown system, visual feedback
**Avoids:** Cooldown desync (server timestamps), power creep (combination testing matrix)

### Phase 5: Team Combos
**Rationale:** Requires ability system to be complete. Adds coordination layer on top of individual abilities.
**Delivers:** Combo definitions, coordination window detection, bonus effect application, consensus-powered ultimates
**Addresses:** Class synergy, team cooperation rewards, scrum theme integration
**Uses:** AbilityManager from Phase 4, EstimationManager consensus events

### Phase 6: Combat Items
**Rationale:** Nice-to-have layer. Most complex UI (inventory, item selection). Can be cut or deferred without affecting core progression.
**Delivers:** Item definitions, session-scoped inventory, item effect application, drop/grant system
**Addresses:** Tactical depth, consumable strategy
**Avoids:** Too-awesome-to-use syndrome (make items common enough to use freely), inventory persistence complexity (session-scoped only for MVP)

### Phase Ordering Rationale

- **Dependencies:** XP system (Phase 1) is foundation for class mastery (Phase 2). Abilities (Phase 4) required for combos (Phase 5). Items (Phase 6) reuse ability effect system.
- **Risk management:** Server-side changes before client-side. XP system (low risk, high value) before boss AI (medium risk). Abilities before combos to reduce integration surface.
- **Testing efficiency:** Boss patterns (Phase 3) testable without client changes. Abilities (Phase 4) require UI but can be unit tested. Combos (Phase 5) require multi-player testing.
- **Cut points:** Phase 6 (items) can be deferred entirely. Phase 5 (combos) can be simplified to single combo type.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Boss AI):** Explicit FSM implementation patterns for TypeScript. May benefit from evaluating simple state machine utilities (not full XState).
- **Phase 4 (Class Abilities):** Client prediction patterns for cooldown display. Socket.IO latency compensation strategies.

Phases with standard patterns (skip research-phase):
- **Phase 1 (XP Foundation):** Formula-based XP calculations well-documented. Drizzle generated columns documented in official docs.
- **Phase 2 (Class Mastery):** Extension of Phase 1 patterns. Standard schema design.
- **Phase 5 (Team Combos):** Data-driven approach, straightforward event coordination.
- **Phase 6 (Combat Items):** Session-scoped inventory is simpler than persistent. Effect system reuses ability patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies needed. All recommended tools already in codebase. Verified against package.json and existing architecture. |
| Features | MEDIUM | Industry patterns well-documented. ScrumQuest-specific integration (scrum poker + RPG combat) needs validation during implementation. |
| Architecture | HIGH | Based on detailed codebase analysis. Extends existing domain manager patterns. EventBus already supports 75+ event types. |
| Pitfalls | HIGH | Verified against existing eventBus patterns, CombatManager state handling, and established game development patterns. |

**Overall confidence:** HIGH

The recommendations extend proven patterns already in the codebase. No architectural experiments required. Main uncertainty is balance tuning (XP amounts, ability damage values, boss difficulty) which requires playtesting.

### Gaps to Address

- **XP curve tuning:** Formula coefficients need playtesting. Start with conservative values, adjust based on session data.
- **Ability balance:** 20 abilities across 10 classes. Combination testing matrix needed during Phase 4.
- **Boss pattern variety:** How many patterns per boss? Research suggests 3-5, but needs validation against session length.
- **Item economy:** How do players obtain items? Research defers to session-only grants, but may need persistent unlocks for engagement.
- **Mastery tier bonuses:** Specific stat bonuses per tier not defined. Needs design decision during Phase 2 planning.

## Sources

### Primary (HIGH confidence)
- ScrumQuest codebase analysis - server/domains/*.ts, server/events/eventTypes.ts, shared/gameEvents.ts
- Drizzle ORM documentation - Generated columns, PostgreSQL schema patterns
- Game Programming Patterns (gameprogrammingpatterns.com) - State machine patterns for boss AI
- DEV Community XP System Guide - Formula-based progression calculations

### Secondary (MEDIUM confidence)
- Unreal Engine Gameplay Ability System (GAS) documentation - Cooldown and effect architecture patterns
- Game Developer articles - Boss design patterns, progression system design
- University XP progression research - Horizontal vs vertical progression taxonomy

### Tertiary (LOW confidence)
- Community blog posts on multiplayer cooldown synchronization - Patterns need validation for Socket.IO specifically
- RPG combo system examples (Game Rant, Campaign Mastery) - Design inspiration, not technical patterns

---
*Research completed: 2026-02-03*
*Ready for roadmap: yes*
