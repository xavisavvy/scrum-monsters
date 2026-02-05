# Feature Research: Game Server Domain Separation

**Domain:** Real-time multiplayer game server architecture
**Researched:** 2026-02-01
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features that proper domain separation must provide. Missing these = broken architecture.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Clear Bounded Contexts** | Each domain owns its state and logic completely | MEDIUM | Session manages players/lobby, Estimation manages voting, Combat manages battle |
| **Single Source of Truth** | Server is authoritative for all state | LOW | Already exists - maintain this pattern |
| **Domain Events** | Each domain emits its own events, not generic "state updated" | MEDIUM | Replace `lobby_updated` with `session_updated`, `estimation_updated`, `combat_updated` |
| **State Isolation** | Domains cannot directly access each other's internals | MEDIUM | Use interfaces/facades for cross-domain communication |
| **Independent State Updates** | Changing combat state doesn't require copying entire session state | MEDIUM | Critical for performance in real-time games |
| **Validation at Boundaries** | Each domain validates inputs against its own invariants | LOW | Session validates player actions, Estimation validates votes, Combat validates attacks |
| **Lifecycle Management** | Each domain manages its own initialization/cleanup | MEDIUM | Session lifecycle independent from Combat lifecycle |
| **Type Safety** | Strong typing for domain state and events | LOW | TypeScript already supports this - use it properly |

### Differentiators (Competitive Advantage)

Features that make domain separation excellent, not just functional.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Event Sourcing** | Track state changes as event stream for debugging/replay | HIGH | Useful for troubleshooting "what happened?" questions |
| **Domain-Specific Timers** | Each domain manages its own timeouts/intervals independently | MEDIUM | Combat timer separate from voting timer |
| **Graceful Degradation** | One domain failing doesn't crash entire game | HIGH | Combat bug shouldn't kill session |
| **Hot State Migration** | Transition between domains without data loss | MEDIUM | Move from estimation → battle preserves player positions |
| **Cross-Domain Sagas** | Coordinate multi-domain workflows without coupling | HIGH | "All voted → battle ends → discussion starts" |
| **Domain-Specific Reconnection** | Restore domain state independently on reconnect | MEDIUM | Restore combat state without reloading session |
| **Telemetry per Domain** | Separate metrics for Session, Estimation, Combat performance | LOW | Debug "estimation is slow" vs "combat is laggy" |
| **Snapshot/Restore** | Save/load domain state independently | HIGH | Save combat state for replay or testing |
| **Command/Query Separation (CQRS)** | Write operations separate from read operations | HIGH | Estimation commands vs reading current votes |
| **Domain Event Bus** | Centralized event routing with subscription model | MEDIUM | Combat subscribes to "vote_completed" from Estimation |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems in domain separation.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Shared Mutable State** | "Just reference the object" seems simple | Breaks encapsulation, creates hidden dependencies, makes testing impossible | Use immutable data + events for cross-domain communication |
| **God Domain** | "One domain can coordinate everything" | Becomes new monolith, defeats separation purpose | Use event-driven sagas for coordination |
| **Synchronous Cross-Domain Calls** | "Just call the other domain" is direct | Creates tight coupling, circular dependencies, hard to reason about | Use async events or command pattern |
| **Domain-Spanning Types** | "Lobby type works for everything" | Changes ripple across all domains, can't evolve independently | Split into SessionState, EstimationState, CombatState |
| **Centralized Event Handler** | "One handler for all domains" | Handler becomes monolithic, hard to test domains in isolation | Each domain has its own event handlers |
| **Database-Per-Domain** | "Microservices best practice" | Overkill for monolithic game server, adds complexity without benefit | Single database with domain-specific tables/namespaces |
| **Over-Normalization** | "Eliminate all duplication" | Some duplication is healthy for independence, extreme normalization creates coupling | Allow domains to cache what they need |
| **Premature Extraction** | "Each domain in separate service" | Adds network latency, deployment complexity for no gain in monolithic app | Keep domains in same process, separate logically |

## Feature Dependencies

```
[Session Domain]
    ├──emits──> player_joined
    ├──emits──> player_left
    ├──emits──> host_changed
    └──provides──> Player roster (read-only)

[Estimation Domain]
    ├──requires──> Session.Players (who can vote)
    ├──emits──> vote_submitted
    ├──emits──> voting_complete
    └──emits──> consensus_reached

[Combat Domain]
    ├──requires──> Session.Players (who can fight)
    ├──listens──> Estimation.vote_submitted (trigger battle entry)
    ├──listens──> Estimation.voting_complete (end battle phase)
    ├──emits──> combat_started
    ├──emits──> player_damaged
    ├──emits──> boss_damaged
    └──emits──> combat_ended

[Discussion Domain]
    ├──requires──> Estimation.votes (what to discuss)
    ├──emits──> vote_changed
    ├──emits──> discussion_complete
    └──triggers──> Estimation.consensus_check

Dependencies flow downward: Session → Estimation → Combat → Discussion
```

### Dependency Notes

- **Session → Estimation:** Estimation needs player roster but doesn't modify session state
- **Session → Combat:** Combat needs player list but operates independently
- **Estimation → Combat:** First vote triggers combat entry; all votes trigger combat end
- **Combat → Discussion:** Combat ending triggers discussion phase
- **Discussion → Estimation:** Discussion allows vote updates, feeds back to Estimation
- **No circular dependencies:** Each domain only depends on events from upstream domains

## MVP Definition (Domain Separation Features)

### Launch With (v1) - Table Stakes Only

Minimum viable domain separation — what's essential to fix the architecture.

- [x] **Split GameStateManager** — Three classes: SessionManager, EstimationManager, CombatManager
- [x] **Split Lobby type** — SessionState, EstimationState, CombatState interfaces
- [x] **Fine-grained events** — Domain-specific events instead of lobby_updated
- [x] **Validation boundaries** — Each domain validates its own operations
- [x] **Independent lifecycles** — Domains init/cleanup independently
- [x] **State isolation** — No direct cross-domain field access
- [x] **Event-driven coordination** — Domains communicate via events only
- [x] **Type safety** — Strong types for all domain boundaries

### Add After Validation (v1.x) - Early Differentiators

Features to add once core separation is working and tested.

- [ ] **Domain-specific timers** — Each domain manages own intervals (trigger: timer conflicts)
- [ ] **Telemetry per domain** — Separate performance metrics (trigger: need to debug "which domain is slow")
- [ ] **Domain event bus** — Centralized subscription model (trigger: managing event listeners gets messy)
- [ ] **Hot state migration** — Seamless domain transitions (trigger: state loss during phase changes)
- [ ] **Domain-specific reconnection** — Granular state restore (trigger: reconnect restoring too much/too little)

### Future Consideration (v2+) - Advanced Patterns

Features to defer until product-market fit and architecture is proven stable.

- [ ] **Event sourcing** — Full event stream replay (trigger: need production debugging/analytics)
- [ ] **CQRS pattern** — Command/query separation (trigger: read scaling issues)
- [ ] **Snapshot/restore** — Save domain state for testing (trigger: QA needs reproducible scenarios)
- [ ] **Graceful degradation** — Domain fault isolation (trigger: production stability issues)
- [ ] **Cross-domain sagas** — Complex workflow orchestration (trigger: flow becomes too complex for simple events)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Split GameStateManager | HIGH (maintainability) | HIGH (large refactor) | P1 |
| Split Lobby type | HIGH (clarity) | HIGH (type changes ripple) | P1 |
| Fine-grained events | HIGH (performance) | MEDIUM (event definitions) | P1 |
| State isolation | HIGH (testability) | MEDIUM (refactor access patterns) | P1 |
| Validation boundaries | HIGH (correctness) | LOW (add checks) | P1 |
| Domain-specific timers | MEDIUM (independence) | MEDIUM (refactor timers) | P2 |
| Domain event bus | MEDIUM (scalability) | MEDIUM (build infrastructure) | P2 |
| Hot state migration | MEDIUM (UX) | MEDIUM (data transformation) | P2 |
| Telemetry per domain | MEDIUM (observability) | LOW (add logging) | P2 |
| Domain reconnection | LOW (nice UX) | HIGH (complex logic) | P3 |
| Event sourcing | LOW (debugging) | HIGH (storage + replay) | P3 |
| CQRS pattern | LOW (performance at scale) | HIGH (architecture change) | P3 |
| Graceful degradation | LOW (rare edge cases) | HIGH (error handling everywhere) | P3 |
| Snapshot/restore | LOW (testing convenience) | MEDIUM (serialization) | P3 |
| Cross-domain sagas | LOW (complex workflows) | HIGH (orchestration framework) | P3 |

**Priority key:**
- P1: Must have for launch (table stakes)
- P2: Should have, add when possible (early differentiators)
- P3: Nice to have, future consideration (advanced patterns)

## Architecture Patterns Analysis

### Server-Authoritative State Management

**What:** Server maintains single source of truth, validates all client actions.

**Why it matters:** Prevents cheating, ensures consistency in multiplayer.

**Implementation:** Each domain validates inputs against invariants before applying changes.

**Complexity:** LOW - already established pattern in ScrumQuest.

### Event-Driven Architecture

**What:** Components communicate through events with well-defined schemas.

**Why it matters:** Loose coupling, teams can work independently, easier to test.

**Implementation:** Each domain emits typed events; other domains subscribe.

**Complexity:** MEDIUM - requires event infrastructure and coordination logic.

### Domain-Driven Design (Bounded Contexts)

**What:** Divide system into bounded contexts with explicit boundaries.

**Why it matters:** Each context has its own model rather than attempting a unified model.

**Implementation:** Session, Estimation, Combat are bounded contexts with their own types.

**Complexity:** MEDIUM - initial setup cost, but pays dividends in maintainability.

### CQRS Pattern (Command Query Responsibility Segregation)

**What:** Separate commands (state changes) from queries (state reads).

**Why it matters:** Allows scaling write and read capacity independently.

**Implementation:** Commands modify state, queries retrieve state through read-only views.

**Complexity:** HIGH - architectural change, defer to v2+ unless scaling issues emerge.

## Real-Time Game Server Best Practices

### Network Protocol Separation

**Pattern:** Gameplay state runs over UDP with selective reliability; chat/commerce over TCP.

**Application to ScrumQuest:** Not directly applicable (Socket.IO handles protocol), but principle applies to event granularity.

**Lesson:** Separate critical state updates (player votes) from non-critical (player positions).

### Trust Boundaries

**Pattern:** Server doesn't trust client device; validates all inputs against invariants.

**Application to ScrumQuest:** Each domain validates actions (can player vote? can spectator attack?).

**Lesson:** Validation at domain boundaries is table stakes, not optional.

### Zoning Architecture

**Pattern:** Virtual world divided into zones handled by different servers.

**Application to ScrumQuest:** Domains are logical "zones" within single process.

**Lesson:** Separation of concerns works at multiple scales (processes or modules).

## Competitor Feature Analysis

| Feature | Tencent Games (Real-Time Analytics) | Session-Based Games (Nakama) | Our Approach |
|---------|-------------------------------------|------------------------------|--------------|
| Domain Separation | Event-driven analytics pipeline | Session manager + match state | Session + Estimation + Combat |
| State Sync | Real-time event stream | Authoritative server state | Server-authoritative with events |
| Cross-Domain Communication | Event bus with subscribers | RPC calls between systems | Event-driven coordination |
| Reconnection | State snapshot + delta sync | Session restore | Domain-specific state restore |

## Complexity Analysis

### Low Complexity (Quick Wins)
- Validation boundaries
- Type safety improvements
- Basic telemetry
- Domain-specific event definitions

### Medium Complexity (Core Work)
- Splitting GameStateManager class
- Splitting Lobby type hierarchy
- Event-driven coordination
- Domain lifecycle management
- Domain-specific timers
- Event bus infrastructure

### High Complexity (Long-Term)
- Event sourcing with replay
- CQRS implementation
- Graceful degradation
- Cross-domain sagas
- Hot state migration without data loss

## Sources

**Game Server Architecture:**
- [Server Architecture: A Noobs Guide](https://www.gamedeveloper.com/programming/server-architecture-a-noobs-guide)
- [Client-Server Game Architecture - Gabriel Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [Game Server Architecture Basics - TechTide Solutions](https://techtidesolutions.com/blog/game-server-architecture-basics/)
- [Building a Game Engine from Scratch (2026)](https://medium.com/@jasani.nisarg01/building-a-game-engine-from-scratch-a-systems-journey-f490448262df)

**State Management & Domain Boundaries:**
- [Mastering Multiplayer Game Architecture - Getgud.io](https://www.getgud.io/blog/mastering-multiplayer-game-architecture-choosing-the-right-approach/)
- [Session-Based Multiplayer - Heroic Labs](https://heroiclabs.com/docs/nakama/concepts/multiplayer/session-based/)
- [Authoritative Multiplayer - Heroic Labs](https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/)

**Event-Driven Architecture:**
- [Event-Driven Architecture: When to Use It (2026)](https://blog.stackademic.com/event-driven-architecture-when-to-use-it-and-when-to-avoid-it-2b6faa861334)
- [Inside Tencent Games' Real-Time Event-Driven Analytics System](https://thenewstack.io/inside-tencent-games-real-time-event-driven-analytics-system/)
- [Event-Driven Architecture - System Design](https://www.geeksforgeeks.org/system-design/event-driven-architecture-system-design/)

**Domain-Driven Design:**
- [Bounded Context - Martin Fowler](https://martinfowler.com/bliki/BoundedContext.html)
- [Domain Events: Design and Implementation - Microsoft](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation)
- [Domain Event Pattern - Microservices.io](https://microservices.io/patterns/data/domain-event.html)

**Anti-Patterns:**
- [State Management Anti-Patterns](https://www.sourceallies.com/2020/11/state-management-anti-patterns/)
- [Microservices Anti-Patterns - InfoQ](https://www.infoq.com/articles/seven-uservices-antipatterns/)
- [The new wave of React state management](https://frontendmastery.com/posts/the-new-wave-of-react-state-management/)

---
*Feature research for: Game Server Domain Separation (ScrumQuest refactoring)*
*Researched: 2026-02-01*
*Confidence: HIGH (verified with multiple authoritative sources + existing codebase analysis)*
