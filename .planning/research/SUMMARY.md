# Project Research Summary

**Project:** ScrumQuest — Real-Time Multiplayer Game Server Domain Separation
**Domain:** Real-time multiplayer game server refactoring (Socket.IO, TypeScript, Node.js)
**Researched:** 2026-02-01
**Confidence:** HIGH

## Executive Summary

ScrumQuest requires refactoring a 2000+ line monolithic GameStateManager into separate Session, Estimation, and Combat domains to improve maintainability while preserving real-time performance. Research shows this is best accomplished using a domain manager pattern with event-driven coordination, Socket.IO rooms for isolation, and fine-grained events for state synchronization. This approach is proven in game architecture and avoids heavyweight frameworks (CQRS/Event Sourcing, microservices) that add latency without proportional benefit for in-memory game state.

The critical insight is that refactoring must happen in phases that establish communication infrastructure before moving state ownership. The event bus provides the coordination backbone, allowing domains to communicate without tight coupling. The recommended approach uses Node.js built-in EventEmitter (zero dependencies) with Socket.IO's native namespace/room features rather than introducing external frameworks.

Key risks include event listener memory leaks during extraction (listeners not cleaned up on disconnect), race conditions in phase transitions (multiple domains trying to change phases simultaneously), and lost reconnection context (domains not coordinating to restore full player state). These are all preventable through careful architecture design in Phase 1 before extracting any domain logic. The migration strategy follows the strangler pattern: create domain managers that delegate to the monolith first, introduce event coordination second, move state ownership third, and optimize client sync last.

## Key Findings

### Recommended Stack

The optimal stack builds on ScrumQuest's existing architecture rather than introducing new dependencies. The core pattern is event-driven domain managers coordinating through a lightweight mediator.

**Core technologies:**
- **Node.js EventEmitter (built-in)** - Lightweight in-process event bus for domain coordination with <1ms overhead, no external dependencies
- **Socket.IO namespaces/rooms** - Built-in domain separation and per-lobby isolation, automatic cleanup on disconnect, native scoped broadcasting
- **TypeScript strict types** - Strong typing for domain boundaries prevents leaky abstractions, compile-time contract verification
- **class-validator or zod** - Schema validation at domain boundaries to enforce invariants, decorator-based or functional style
- **neverthrow (optional)** - Type-safe error handling with Result types for domain manager APIs, makes error paths explicit

**Avoid:**
- Full CQRS/Event Sourcing frameworks (massive overhead for in-memory state, unnecessary audit trails)
- Microservices architecture (network latency kills real-time performance, distributed state complexity)
- Heavy DDD frameworks like @node-ts/ddd (too much ceremony for game domains that prioritize performance over perfect modeling)
- Premature Redis adapter (keep optional until proven scaling need at 500+ lobbies)

### Expected Features

Domain separation is an architectural refactoring, not a user-facing feature, but certain capabilities must be maintained or introduced.

**Must have (table stakes):**
- Clear bounded contexts — Session manages players/lobby, Estimation manages voting, Combat manages battle, no overlap
- Single source of truth — Server authoritative for all state, domains don't drift out of sync
- Domain events — Fine-grained events (player_voted, boss_damaged) replace coarse lobby_updated broadcasts
- State isolation — Domains cannot directly access each other's internals, use interfaces/events only
- Independent state updates — Changing combat state doesn't require copying entire session state
- Validation at boundaries — Each domain validates inputs against its own invariants
- Type safety — Strong TypeScript types for domain state and events

**Should have (competitive):**
- Domain-specific timers — Each domain manages its own intervals independently (combat timer separate from voting timer)
- Hot state migration — Transition between domains without data loss (estimation → battle preserves player positions)
- Telemetry per domain — Separate metrics for Session/Estimation/Combat performance to debug slowdowns
- Domain-specific reconnection — Restore domain state independently on reconnect
- Event bus with subscriptions — Centralized event routing model for clean cross-domain coordination

**Defer (v2+):**
- Event sourcing with replay — Full event stream for production debugging (add only when analytics/anti-cheat needs emerge)
- CQRS command/query separation — Separate write/read operations (defer until read scaling issues)
- Snapshot/restore system — Save domain state for testing (defer until QA needs reproducible scenarios)
- Graceful degradation — One domain failing doesn't crash entire game (defer until production stability issues)
- Cross-domain sagas — Complex workflow orchestration (defer until flows become too complex for simple events)

### Architecture Approach

The standard architecture for domain-separated real-time game servers uses event-driven manager-based design. Each domain manager owns a slice of state (SessionManager: lobbies/players, EstimationManager: votes/consensus, CombatManager: health/positions) and communicates through an internal event bus rather than direct method calls. Socket.IO handlers remain thin adapters that route external events to domain methods, while managers emit internal events for cross-domain coordination. This provides loose coupling without the overhead of distributed systems.

**Major components:**
1. **Domain Managers** (SessionManager, EstimationManager, CombatManager) — Own state and business logic, emit domain events, subscribe to events from other domains
2. **Event Bus** (extends Node.js EventEmitter) — Type-safe internal pub/sub for manager-to-manager communication, separate from Socket.IO external events
3. **Socket Handlers** (thin adapters) — Map client events to manager method calls, managers broadcast results via Socket.IO, handlers contain no business logic
4. **State Types** (SessionState, EstimationState, CombatState) — Domain-specific state interfaces replace monolithic Lobby type with 27 fields
5. **Phase Orchestrator** (optional coordinator) — Manages complex cross-domain workflows like consensus → damage → phase transition without coupling managers

**Key patterns:**
- Event-driven manager communication (not direct method calls) prevents circular dependencies
- Fine-grained events (player_voted, boss_damaged) instead of full state broadcasts reduce bandwidth
- Aggregate root pattern (expose only Lobby/Battle/Estimation aggregates) enforces invariants at domain boundaries
- State machine per manager (SessionManager phases independent from EstimationManager phases) avoids n×m phase explosion

### Critical Pitfalls

1. **Event listener memory leaks during domain separation** — Socket.IO listeners accumulate across multiple domain handlers without cleanup, causing unbounded memory growth. Prevent by implementing centralized listener registry, domain-specific disconnect handlers with removeAllListeners(), and memory monitoring to detect accumulation. Address in Phase 1 (Architecture) before extracting domains.

2. **Race conditions in sequential phase transitions** — Monolith's single-threaded execution provided implicit serialization, but separate domains race without coordination. Timer expiry triggers reveal while host manually advances phase, causing inconsistent states. Prevent with phase transition state machine with exclusive locks, single PhaseOrchestrator owning transitions, and transaction-style updates with rollback. Address in Phase 2 (Core Domains).

3. **Lost reconnection context after domain split** — Monolith snapshots complete player state in one place, but refactored domains each persist independently. Player reconnects with 100% health but missing vote, or vice versa. Prevent with unified PlayerContext aggregating state from all domains, domain state hydration protocol, and ReconnectionCoordinator querying all domains. Address in Phase 1 (Architecture).

4. **Timer interval drift across domain boundaries** — JavaScript setInterval accumulates drift when multiple domains start independent timers without synchronization. Revival checks every 100ms, consensus ticks every 100ms, modifier updates every 10s drift out of phase. Prevent with shared TimerCoordinator service, common tick loop (100ms, 1s, 10s tiers), and Date.now() for elapsed time checks instead of counting ticks. Address in Phase 2 (Core Domains).

5. **Circular dependencies between consensus and voting domains** — VotingDomain needs consensus results to trigger scoring, ConsensusDomain needs votes to calculate agreement. Naive separation creates circular imports breaking module loading. Prevent with mediator pattern (domains publish events, don't import each other), boundary interfaces (ConsensusDomain depends on IVotingState abstraction), and dependency injection with lazy initialization. Address in Phase 1 (Architecture).

6. **Premature Redis adapter introduction** — Teams add Redis during early refactoring thinking it simplifies state management, but it becomes a single point of failure and slows development. Redis outage takes down healthy app servers. Prevent by keeping Redis optional until proven scaling bottleneck (500+ lobbies), implementing serializable state objects that could use Redis later, and measuring metrics before adding dependencies. Address in Phase 4 (Performance) only if metrics show need.

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order: infrastructure before logic, coordination before state migration, stability before optimization.

### Phase 1: Extract State Types & Event Bus (Foundation)
**Rationale:** Establish domain vocabulary and communication infrastructure without any code changes. Type definitions and event bus provide the contracts that all subsequent phases depend on. No risk of breaking existing functionality since this is purely additive.

**Delivers:**
- SessionState, EstimationState, CombatState type definitions
- EventBus implementation (extends EventEmitter)
- Internal event type definitions (player_voted, consensus_reached, boss_damaged, etc.)
- Domain boundary contracts documented

**Addresses:**
- Clear bounded contexts (table stakes feature)
- Type safety (table stakes feature)
- Prevention of circular dependencies pitfall
- Prevention of lost reconnection context pitfall

**Avoids:**
- Event listener memory leaks by establishing cleanup contracts upfront
- Circular dependencies by defining event-based communication before domain extraction

**Research Flags:** Low complexity, well-documented patterns. No additional research needed.

---

### Phase 2: Extract SessionManager (Core Domain)
**Rationale:** SessionManager is the least complex domain (player/lobby lifecycle) and foundational for others. EstimationManager needs player roster, CombatManager needs player list. Extracting Session first proves the domain manager pattern works without tackling complex voting/combat logic.

**Delivers:**
- SessionManager class with player/lobby methods
- Socket handlers updated to call SessionManager instead of GameStateManager
- Emits player_joined, player_left, host_transferred events
- Reconnection token system migrated to SessionManager

**Uses:**
- EventBus from Phase 1
- SessionState types from Phase 1
- Socket.IO rooms for per-lobby isolation

**Implements:**
- Domain manager pattern (from ARCHITECTURE.md)
- Aggregate root pattern (expose only Lobby aggregate)

**Addresses:**
- Validation boundaries (table stakes feature)
- Independent lifecycles (table stakes feature)

**Avoids:**
- Mixing domain logic in handlers anti-pattern by delegating to manager
- God class disguised as domains anti-pattern by owning state instead of delegating

**Research Flags:** Standard patterns, no additional research needed. May need `/gsd:research-phase` if reconnection token migration reveals complexity.

---

### Phase 3: Extract EstimationManager (Mid Complexity)
**Rationale:** Voting/consensus/timer logic is more complex than session management but independent of combat. Depends on SessionManager for player roster but doesn't need combat state. This phase tests cross-domain event coordination (session emits player_joined → estimation initializes vote state).

**Delivers:**
- EstimationManager class with voting/consensus methods
- Timer system integration (consensus countdown, voting timer)
- Consensus detection logic migrated from monolith
- Emits player_voted, consensus_reached, timer_expired events

**Uses:**
- EventBus to subscribe to player_joined from SessionManager
- EstimationState types from Phase 1
- Validation (class-validator or zod) for vote inputs

**Implements:**
- State machine per manager pattern (voting → reveal → discussion → completed phases)
- Event-driven coordination between Session and Estimation domains

**Addresses:**
- Domain-specific timers (should-have feature)
- Domain events (table stakes feature)

**Avoids:**
- Timer interval drift by establishing TimerCoordinator pattern
- Race conditions in phase transitions by implementing phase locks

**Research Flags:** Timer coordination may need deeper research if drift issues emerge. Consider `/gsd:research-phase` for "timer synchronization across domains" if complexity discovered.

---

### Phase 4: Extract CombatManager (High Complexity)
**Rationale:** Battle mechanics are the most complex domain with physics, animations, health tracking, and revival system. Depends on EstimationManager for consensus → damage conversion. This must come last so event coordination infrastructure is proven stable.

**Delivers:**
- CombatManager class with combat/health/position methods
- Boss health, player health, revival system
- Position tracking, ring attack logic
- Emits boss_damaged, player_damaged, player_healed, boss_defeated, game_over events

**Uses:**
- EventBus to subscribe to consensus_reached from EstimationManager
- CombatState types from Phase 1
- Socket.IO rooms for position broadcasting

**Implements:**
- Fine-grained events pattern (boss_damaged with delta instead of full state)
- Input prediction + server reconciliation for movement

**Addresses:**
- Hot state migration (should-have feature)
- Independent state updates (table stakes feature)

**Avoids:**
- O(N²) position calculations by using spatial grid (performance trap)
- Broadcasting full state on every change (performance trap)

**Research Flags:** Complex domain, likely needs `/gsd:research-phase` for "real-time physics sync patterns" and "revival system state management" if issues arise.

---

### Phase 5: Replace Coarse Events with Fine-Grained (Optimization)
**Rationale:** With all domains extracted and stable, optimize client sync by replacing lobby_updated full-state broadcasts with targeted events. This is purely optimization - correctness is already achieved. Requires client-side updates to handle new event types.

**Delivers:**
- Socket broadcasts use fine-grained events (player_voted, boss_damaged, phase_changed)
- Client updated to handle new event types
- Bandwidth reduction metrics
- Event versioning strategy for future changes

**Uses:**
- Domain events from all managers
- Socket.IO rooms for scoped broadcasting

**Implements:**
- Fine-grained events pattern (from ARCHITECTURE.md)
- Eventual consistency with snapshots (deltas + periodic full state)

**Addresses:**
- Domain events (table stakes feature, now optimized)
- Telemetry per domain (should-have feature, can measure per-event metrics)

**Avoids:**
- Event storm anti-pattern by limiting to meaningful domain events (not every property change)
- JSON payload size trap by implementing max payload size checks

**Research Flags:** Standard pattern for real-time games. No additional research needed unless client-side state reconciliation becomes complex.

---

### Phase 6: Domain-Specific Reconnection (Polish)
**Rationale:** With domains stable and fine-grained events working, enhance reconnection to restore domain state independently. This improves UX but is not critical for core functionality. Can be incrementally added per domain.

**Delivers:**
- Domain-specific reconnection handlers
- PlayerContext aggregator combining state from all domains
- Granular state restore (reconnect to battle phase with exact health/position/votes)

**Addresses:**
- Domain-specific reconnection (should-have feature)
- Hot state migration (should-have feature, now enhanced)

**Avoids:**
- Reconnection losing all UI state (UX pitfall)
- Silent failure when domain is unhealthy (UX pitfall)

**Research Flags:** May need `/gsd:research-phase` for "partial state hydration strategies" if coordination complexity emerges.

---

### Phase Ordering Rationale

- **Foundation first (Phase 1):** Type definitions and event bus establish contracts without breaking changes. All subsequent phases depend on these contracts.
- **Session before Estimation (Phases 2→3):** Estimation needs player roster from Session. Can't vote without knowing who the players are.
- **Estimation before Combat (Phases 3→4):** Combat triggers on consensus from Estimation. Can't damage boss without knowing consensus score.
- **Optimization last (Phase 5):** Fine-grained events require all domains to be stable. Optimizing before stability leads to rework.
- **Polish last (Phase 6):** Enhanced reconnection is UX improvement, not core functionality. Ship working reconnection first, enhance later.

**Dependency flow:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

**Risk mitigation:** Each phase is independently testable and deployable. Phase failures don't cascade. Can pause or revert at phase boundaries.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (EstimationManager):** Timer synchronization across domains is critical for real-time game feel. Needs validation if drift issues emerge. Research: "multi-domain timer coordination patterns."
- **Phase 4 (CombatManager):** Real-time physics sync with Socket.IO is complex. Position reconciliation and prediction may need deeper patterns. Research: "client-side prediction with server authority" and "spatial optimization for multiplayer."
- **Phase 6 (Domain Reconnection):** Partial state hydration is niche. If coordination gets complex, research: "reconnection strategies for stateful WebSocket domains."

Phases with standard patterns (skip research-phase):
- **Phase 1 (State Types & Event Bus):** Well-documented TypeScript and EventEmitter patterns. Established in game architecture.
- **Phase 2 (SessionManager):** Player lifecycle management is straightforward. Socket.IO connection handling is well-documented.
- **Phase 5 (Fine-Grained Events):** Industry standard for real-time games. Multiple authoritative sources confirm approach.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | EventEmitter and Socket.IO are well-understood, minimal external dependencies, proven at scale in game servers |
| Features | HIGH | Clear separation between table stakes (must have), competitive (should have), and advanced (defer to v2+) based on multiple sources |
| Architecture | HIGH | Domain manager pattern with event bus is well-documented in game architecture, combines Game Programming Patterns with DDD bounded contexts |
| Pitfalls | HIGH | Based on actual ScrumQuest codebase analysis (2004 lines, 15 timers, 140+ socket events) combined with documented refactoring pitfalls |

**Overall confidence:** HIGH

Research is comprehensive, verified across multiple authoritative sources (Game Programming Patterns, Socket.IO official docs, DDD literature, real-time multiplayer case studies). Patterns are proven in production game servers. ScrumQuest-specific analysis grounds recommendations in actual codebase structure.

### Gaps to Address

While overall confidence is high, some areas need validation during implementation:

- **Timer coordination specifics:** Research shows TimerCoordinator pattern but doesn't specify optimal tick intervals for ScrumQuest's needs (revival watchdog 100ms, consensus countdown 1s, battle modifier 10s). Needs experimentation in Phase 3.
- **Socket.IO namespace performance at scale:** Research recommends namespaces for domain separation but lacks specific benchmarks for >1000 concurrent connections. May need load testing in Phase 5 to validate or fall back to single namespace with room-based isolation.
- **Client-side state reconciliation:** Research focuses on server architecture. Client-side Zustand store updates for fine-grained events are out of scope. Phase 5 will need client-side research or experimentation.
- **Reconnection token cryptography:** Current implementation uses HMAC signing (lines 182-183 in gameState.ts). Needs security audit to verify signing algorithm is resistant to timing attacks before production deployment.
- **Memory profiling for domain manager approach:** Research provides theoretical benefits but lacks specific memory benchmarks. Needs profiling in Phase 2 to verify domain separation actually reduces memory vs. monolith, not just redistributes it.

## Sources

### Primary (HIGH confidence)
- [Game Programming Patterns by Robert Nystrom](https://gameprogrammingpatterns.com/) — Component pattern, state pattern, event queue pattern
- [Socket.IO Official Documentation](https://socket.io/docs/v4/) — Namespaces, rooms, event handling, scaling patterns
- [Domain-Driven Design in TypeScript (DDD Academy)](https://ddd.academy/domain-driven-design-in-typescript/) — Bounded contexts, aggregate roots, domain events
- [Building a Real-Time Multiplayer Game Server with Socket.io and Redis](https://dev.to/dowerdev/building-a-real-time-multiplayer-game-server-with-socketio-and-redis-architecture-and-583m) — Real-world architecture patterns
- [Gabriel Gambetta's Client-Server Game Architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html) — Authoritative server patterns

### Secondary (MEDIUM confidence)
- [Why Multiplayer Skill Games Need a Domain-Driven Design (HackerNoon)](https://hackernoon.com/why-multiplayer-skill-games-need-a-domain-driven-design) — DDD application to games
- [Mastering Multiplayer Game Architecture (Getgud.io)](https://www.getgud.io/blog/mastering-multiplayer-game-architecture-choosing-the-right-approach/) — Architecture comparison
- [Node.js Architectural Patterns with Examples](https://dev.to/sasithwarnakafonseka/nodejs-architectural-patterns-with-examples-1335) — Manager pattern, event-driven architecture
- [How to Avoid Memory Leaks in JavaScript Event Listeners](https://dev.to/alex_aslam/how-to-avoid-memory-leaks-in-javascript-event-listeners-4hna) — Event listener cleanup patterns
- [Strangler Fig Pattern - Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) — Incremental refactoring strategy

### Tertiary (LOW confidence)
- [Modular Monolith: A Sane Architecture for Indie Game Devs](https://www.wayline.io/blog/modular-monolith-indie-game-dev) — Opinion piece favoring monolithic approach, needs validation against scaling requirements
- [Monoliths vs microservices in gaming architecture (Ascendion)](https://ascendion.com/insights/monoliths-vs-microservices-in-gaming-architecture-striking-the-right-balance/) — Generic advice, not specific to real-time games

---
*Research completed: 2026-02-01*
*Ready for roadmap: yes*
