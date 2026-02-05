# Pitfalls Research: Game Progression Systems

**Domain:** Adding XP/leveling, boss AI patterns, and combat abilities to existing real-time multiplayer game
**Researched:** 2026-02-03
**Confidence:** HIGH (verified against codebase architecture and established game development patterns)

## Context

ScrumQuest is adding:
- **XP System:** Account XP + class mastery progression
- **Boss AI Variety:** Attack patterns, difficulty scaling, boss-specific mechanics
- **Combat Abilities:** Class abilities, team combos, items

The existing codebase has:
- Domain-separated architecture (`SessionManager`, `CombatManager`, `EstimationManager`)
- Event bus for cross-domain communication
- Real-time Socket.IO sync with fine-grained events
- Working combat loop with boss attacks, player HP, downed state, revival

---

## Critical Pitfalls

Mistakes that cause rewrites or major architectural problems.

### Pitfall 1: XP Calculation Race Conditions

**What goes wrong:** Multiple events can trigger XP awards simultaneously (boss damage, voting, revival assists). Without proper serialization, race conditions cause XP to be miscalculated or lost.

**Why it happens:** The existing `CombatManager` uses event-based communication. Multiple events (`combat:boss_damaged`, `estimation:vote_cast`, `combat:player_revived`) could all award XP in the same tick.

**Consequences:**
- Players lose XP rewards they earned
- XP totals become inconsistent between server and client
- Class mastery calculations produce impossible values

**Current codebase risk:** HIGH - The `eventBus.emit()` pattern in `CombatManager.ts` (lines 502-507, 591-597) dispatches events synchronously. If an XP system subscribes to multiple events, concurrent state mutations are likely.

**Prevention:**
1. Create a dedicated `ProgressionManager` domain that owns all XP state
2. Queue XP awards through a single entry point method (e.g., `awardXP(playerId, amount, source)`)
3. Use a per-player lock or transaction for XP modifications
4. Emit `progression:xp_awarded` event AFTER state mutation completes

**Detection:**
- XP totals differ between server logs and client display
- Players report "missing" XP after complex battles
- Class mastery percentages exceed 100% or go negative

**Phase to address:** Phase 1 (XP System Foundation) - Architecture must be right from the start

---

### Pitfall 2: Boss State Machine Explosion

**What goes wrong:** Adding attack patterns without a proper state machine leads to boolean soup (`isEnraged`, `isCharging`, `isCasting`, `isVulnerable`). Combinations multiply, creating untestable states and bugs where the boss is simultaneously in conflicting states.

**Why it happens:** The existing `BossCombat` interface in `CombatManager.ts` (lines 76-86) already has `isEnraged`. Adding more states as booleans is the path of least resistance.

**Consequences:**
- Boss can be "charging AND vulnerable" simultaneously
- Attack logic becomes deeply nested if/else chains
- Adding new boss types requires copy-pasting and modifying complex logic
- State transitions become untestable

**Current codebase evidence:** The `selectAttackType()` method (lines 947-962) already branches on `isEnraged`. Adding more attack patterns will compound this branching.

**Prevention:**
1. Implement explicit Finite State Machine (FSM) for boss AI
2. Define states as enum: `idle | telegraphing | attacking | recovering | enraged_idle | enraged_attacking`
3. Define valid state transitions explicitly
4. Store `currentState` and `previousState` to enable "return to previous" patterns

**Pattern to use:**
```typescript
type BossState = 'idle' | 'telegraphing' | 'attacking' | 'recovering' | 'vulnerable';

interface BossStateMachine {
  currentState: BossState;
  previousState: BossState;
  stateEnteredAt: number;
  transitionTo(newState: BossState): boolean; // Returns false if invalid transition
}
```

**Detection:**
- Boss exhibits "glitchy" behavior (attacks cancel mid-animation)
- Same boss type behaves differently in different lobbies
- Test coverage becomes impossible without combinatorial explosion

**Phase to address:** Phase 2 (Boss AI Patterns) - Before adding any new attack types

---

### Pitfall 3: Ability Cooldown Desynchronization

**What goes wrong:** Client predicts ability cooldown locally, but server has different timing due to latency. Player thinks ability is ready, uses it, server rejects it. Or worse: server accepts it when client thinks it's still on cooldown.

**Why it happens:** The existing architecture uses `lobby_updated` events for full state sync, but ability cooldowns require millisecond precision that full syncs can't provide.

**Consequences:**
- Player frustration ("I pressed the button!")
- Cooldown UI shows wrong time
- Exploits where players spam abilities faster than intended
- Healer abilities (critical for team survival) become unreliable

**Current codebase risk:** The revival system in `CombatManager.ts` (lines 1315-1391) already uses timing (`REVIVAL_CHANNEL_DURATION_MS = 2500`). Adding ability cooldowns with similar patterns will hit sync issues at scale.

**Prevention:**
1. Server is authoritative for cooldown start time
2. Client predicts locally but accepts server corrections
3. Include `cooldownEndsAt` timestamp in state, not `cooldownRemaining` duration
4. Use `combat:ability_cooldown_started` events with server timestamp

**Design principle:** Store absolute timestamps, not durations. Let clients calculate remaining time.

**Detection:**
- Players report abilities "not working" on first press
- QA finds timing exploits with rapid clicking
- Ability usage logs show impossible sequences

**Phase to address:** Phase 3 (Class Abilities) - Must be designed correctly, not retrofitted

---

### Pitfall 4: XP Persistence Without Session Boundaries

**What goes wrong:** XP is persisted during gameplay, but reconnection or session recovery loses in-progress XP. Or XP is double-awarded when a player disconnects and reconnects mid-battle.

**Why it happens:** The existing `DisconnectedPlayer` interface (in `SessionManager.ts`) preserves combat state but has no concept of "pending XP" or "session-scoped rewards."

**Consequences:**
- Players who disconnect and reconnect have different XP than those who stayed
- Rage-quitters can reconnect to "undo" XP losses
- XP total in UI doesn't match account total

**Current codebase risk:** `handlePlayerDisconnect()` (lines 591-674) stores `lastKnownCombatState` but wouldn't store pending XP awards. The `attemptPlayerReconnect()` would restore combat state without XP context.

**Prevention:**
1. Define "confirmed XP" (persisted) vs "pending XP" (this battle)
2. Persist XP only at clean checkpoints: ticket completion, phase transitions
3. Include `pendingXP` in `DisconnectedPlayer` record
4. On reconnect, restore pending XP from disconnect record
5. Never allow XP to decrease except through explicit "punishment" mechanics

**Pattern:**
```typescript
interface ProgressionState {
  confirmedXP: number;     // Persisted to database
  pendingXP: number;       // This session, not yet persisted
  lastCheckpointAt: number; // When confirmedXP was last updated
}
```

**Detection:**
- XP totals don't match between sessions
- Players discover "XP duplication" exploits
- Database XP doesn't match in-memory XP

**Phase to address:** Phase 1 (XP System Foundation) - Persistence boundaries must be designed upfront

---

## Moderate Pitfalls

Mistakes that cause delays or significant technical debt.

### Pitfall 5: Tight Coupling Between Combat and Progression

**What goes wrong:** Combat events directly modify XP state, creating bidirectional dependencies. CombatManager needs to know about XP, and ProgressionManager needs to know about combat internals.

**Why it happens:** It's tempting to add XP awards directly in `playerAttackBoss()` (CombatManager.ts line 468) or `completeRevival()` (line 1435).

**Consequences:**
- Can't unit test combat without mocking progression
- Can't change XP formulas without touching combat code
- Feature flags for XP events affect combat behavior

**Prevention:**
1. Combat emits domain events, never modifies XP directly
2. ProgressionManager subscribes to combat events
3. Use `eventBus` pattern already established in codebase
4. XP formulas live in ProgressionManager, not CombatManager

**Current architecture supports this:** The `eventBus.emit('combat:boss_damaged', ...)` pattern (line 502) is exactly right. Just don't add XP logic inside CombatManager.

**Detection:**
- Import statements between domain managers grow
- Tests require complex setup to verify simple behaviors
- Changing XP values requires changes in multiple files

**Phase to address:** Phase 1 (XP System Foundation) - Architecture decision

---

### Pitfall 6: Boss Pattern Predictability

**What goes wrong:** Boss attack patterns become too predictable. Players memorize the sequence and the "boss fight" becomes a rote execution exercise rather than dynamic gameplay.

**Why it happens:** Deterministic FSM transitions (e.g., "after 3 light attacks, always do heavy") are easy to implement but boring.

**Consequences:**
- Engagement drops after players "solve" each boss
- No replay value for boss fights
- Players watch videos for "optimal patterns" instead of playing

**Prevention:**
1. Use weighted random selection for attacks (already started in `selectAttackType()`)
2. Add "reaction" patterns that respond to player behavior (e.g., target player who just healed)
3. Include "memory" for variety (don't use same attack twice in a row)
4. Balance predictability for fairness (telegraph heavy attacks)

**Design principle:** Unpredictable within constraints. Players should be able to react, but not fully predict.

**Detection:**
- Players describe optimal "attack rotations" for bosses
- Win rates plateau after initial learning curve
- Feedback mentions fights feel "scripted"

**Phase to address:** Phase 2 (Boss AI Patterns) - Design consideration

---

### Pitfall 7: Class Ability Power Creep

**What goes wrong:** Each class ability is balanced in isolation, but combinations become overpowered. A healer ability + tank ability + DPS ability together trivialize content.

**Why it happens:** The existing class definitions in `gameEvents.ts` (lines 471-560) have stats but no ability interactions. Testing individual abilities doesn't reveal combo issues.

**Consequences:**
- "Meta" compositions emerge that make other classes feel weak
- Content is either too easy (with meta comp) or too hard (without)
- Players feel forced into specific classes

**Prevention:**
1. Define "ability budget" per team, not per player
2. Test ability combinations, not just individual abilities
3. Include "diminishing returns" when multiple buffs stack
4. Design abilities to complement, not multiply

**Testing approach:** Create a "combo test matrix" for all 2-class and 3-class combinations.

**Detection:**
- Win rates vary dramatically by team composition
- Certain classes are never picked
- Community agrees on "required" team comp

**Phase to address:** Phase 3 (Class Abilities) - Balance testing

---

### Pitfall 8: Event Ordering Dependencies

**What goes wrong:** The fine-grained event system creates implicit ordering dependencies. `combat:player_downed` must fire before `progression:xp_adjusted` for death penalties, but event ordering isn't guaranteed.

**Why it happens:** The `ScopedEventBus` in the codebase emits events synchronously to all subscribers. Subscriber execution order depends on subscription order, which is fragile.

**Current risk:** The combat manager already has ordering dependencies (e.g., `combat:player_downed` triggers `combat:player_permanently_downed` via timeout). Adding progression events compounds this.

**Consequences:**
- XP penalties apply before death is recorded
- "Kill credit" awarded to wrong player
- Race conditions appear only under load

**Prevention:**
1. Make event handlers idempotent where possible
2. Use event sequencing (already have `seq` in event types - lines 393-437 of gameEvents.ts)
3. For critical sequences, use explicit method calls instead of events
4. Document event ordering requirements in event type definitions

**Detection:**
- Intermittent failures in test suite
- "Impossible" game states in production logs
- Player reports of effects happening "out of order"

**Phase to address:** All phases - Ongoing vigilance

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 9: XP Number Inflation

**What goes wrong:** XP numbers grow too large, becoming meaningless. "You earned 1,847,392 XP!" feels hollow compared to "You earned 15 XP!"

**Prevention:**
- Use logarithmic scaling for display (e.g., "15.2K XP")
- Keep per-action rewards small (single digits for attacks)
- Reserve large numbers for milestones

**Phase to address:** Phase 1 (XP System Foundation) - Design decision

---

### Pitfall 10: Boss Variety Without Visual Distinction

**What goes wrong:** Five boss types with different attack patterns, but they all look similar. Players can't visually distinguish which boss they're fighting.

**Current state:** The codebase has 5 boss sprites (`bug-hydra.png`, `sprint-demon.png`, etc.) but they currently share attack patterns.

**Prevention:**
- Tie attack patterns to visual themes (fire boss = fire attacks)
- Use distinct color palettes for attack telegraphs
- Make boss silhouettes distinguishable at a glance

**Phase to address:** Phase 2 (Boss AI Patterns) - Art/design coordination

---

### Pitfall 11: Mastery Progress Feels Invisible

**What goes wrong:** Class mastery increases, but players don't notice because there's no immediate feedback.

**Prevention:**
- Show mastery progress after each battle
- Add "mastery milestone" popups (10%, 25%, 50%, etc.)
- Unlock visible rewards at mastery thresholds

**Phase to address:** Phase 1 (XP System Foundation) - UX consideration

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation | Research Flag |
|-------|---------------|------------|---------------|
| **Phase 1: XP System** | Race conditions (#1), Persistence boundaries (#4) | Single-entry-point XP modifications, checkpoint-based persistence | MEDIUM - Standard patterns, verify implementation |
| **Phase 2: Boss AI** | State machine explosion (#2), Predictability (#6) | FSM architecture, weighted randomization | HIGH - Likely needs deeper research on FSM libraries |
| **Phase 3: Abilities** | Cooldown desync (#3), Power creep (#7) | Server-authoritative timestamps, combo testing | HIGH - May need client prediction research |
| **Phase 4: Integration** | Event ordering (#8), Tight coupling (#5) | Event sequence numbers, domain boundaries | LOW - Patterns already established |

---

## Sources

### Server Authority and Anti-Cheat
- [Securing Game Code in 2025: Modern Anti-Cheat Techniques](https://medium.com/@lzysoul/securing-game-code-in-2025-modern-anti-cheat-techniques-and-best-practices-e2e0f6f14173)
- [Unity Netcode Authority Documentation](https://docs.unity3d.com/Packages/com.unity.netcode.gameobjects@2.4/manual/terms-concepts/authority.html)

### State Machine Patterns
- [Game Programming Patterns - State](https://gameprogrammingpatterns.com/state.html)
- [Designing a Boss Using a State Machine](https://medium.com/@dcargile84/designing-a-boss-part-2-using-a-state-machine-3d04a4700890)
- [Finite State Machines for Game Developers](https://gamedevelopertips.com/finite-state-machine-game-developers/)

### Ability System Architecture
- [Unreal Engine Gameplay Ability System Documentation](https://github.com/tranek/GASDocumentation)
- [GAS Multiplayer Considerations](https://vorixo.github.io/devtricks/gas/)

### Multiplayer Synchronization
- [Concurrency Patterns for Real-Time Multiplayer Games](https://www.momentslog.com/development/design-pattern/concurrency-patterns-for-real-time-multiplayer-games)
- [Building Real-Time Multiplayer Game Server with Socket.io and Redis](https://dev.to/dowerdev/building-a-real-time-multiplayer-game-server-with-socketio-and-redis-architecture-and-583m)
- [How Multiplayer Games Sync Their State](https://medium.com/@qingweilim/how-do-multiplayer-games-sync-their-state-part-1-ab72d6a54043)

### Persistence Patterns
- [Persistence for Ephemeral Game Servers](https://blog.hathora.dev/persistence-for-ephemeral-game-servers/)
- [Epic Games - Persistable Data in Verse](https://dev.epicgames.com/documentation/en-us/fortnite/using-persistable-data-in-verse)

### Progression Design
- [The Fundamentals of Game Progression](https://www.gamedeveloper.com/design/the-fundamentals-of-game-progression)
- [RPG Leveling Systems to Keep Players Coming Back](https://medium.com/@jonathonmcclendon/rpg-leveling-systems-to-keep-players-coming-back-db83b79a9a04)
- [Avoiding the God Class Anti-Pattern](https://www.wayline.io/blog/god-class-intervention-avoiding-anti-pattern)

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Race Conditions | HIGH | Verified against existing eventBus patterns in codebase |
| State Machine | HIGH | Established game development pattern, well-documented |
| Cooldown Sync | HIGH | Common multiplayer issue, multiple authoritative sources |
| Persistence | MEDIUM | Depends on database choice not yet made |
| Power Creep | MEDIUM | Design issue, hard to verify before implementation |
| Event Ordering | HIGH | Verified against existing fine-grained event system |

---

## Summary for Roadmap

1. **Phase 1 (XP System):** Create `ProgressionManager` domain from the start. Single entry point for XP modifications. Design persistence checkpoints before implementation.

2. **Phase 2 (Boss AI):** Implement FSM architecture before adding patterns. Avoid boolean flags for boss states. Consider existing FSM libraries.

3. **Phase 3 (Abilities):** Use server-authoritative timestamps for cooldowns. Plan combo testing matrix. Consider diminishing returns for stacking effects.

4. **All Phases:** Maintain domain separation. Combat emits events, Progression subscribes. Never add cross-domain state modifications.
