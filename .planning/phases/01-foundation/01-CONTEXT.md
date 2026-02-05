# Phase 1: Foundation - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish domain vocabulary (SessionState, EstimationState, CombatState types) and communication infrastructure (EventBus) without breaking existing functionality. This is foundational work that later phases build upon — creating the contracts and plumbing for domain separation.

</domain>

<decisions>
## Implementation Decisions

### State Shape Design
- Domains are self-contained with IDs — each domain stores only IDs to reference other domains (not embedded objects)
- Central Player type with domain-specific optional fields — one Player type with vote?, health?, etc. rather than distributed player state across domains
- Timestamps use Unix milliseconds — timers and phase transitions store absolute timestamps, client computes remaining time

### Event Granularity
- Hybrid granularity — fine-grained for cross-domain events (player_voted triggers combat), aggregate within domain
- Domain-prefixed naming convention — events named like `estimation:vote_cast`, `combat:boss_damaged`, `session:player_joined`
- Strongly typed EventBus — TypeScript generics with compile-time checking of event names and payloads
- Fire-and-forget async — listeners can be async but aren't awaited; fast emit, listeners handle their own timing

### Event Sourcing
- Full event sourcing — events are the source of truth; state can be rebuilt from event log
- Events persisted to database — full replay capability across server restarts
- Async persistence with queue — events queue for DB write; game continues; background worker retries failures

### Error Handling
- Isolate listener failures — log errors, continue to other listeners; one bad listener doesn't break the chain
- Error events for invalid transitions — emit `transition_rejected` event with reason rather than throwing or silently ignoring
- Scoped subscriptions — subscriptions tied to lobby ID; scope cleanup removes all listeners (prevents memory leaks)
- Global error boundary with recovery — catch unhandled errors, attempt state recovery, notify affected clients
- Circuit breaker for repeated failures — temporarily disable repeatedly-failing listeners to prevent cascade failures

### Integration Approach
- Full foundation — types + EventBus + domain managers instantiated and wired in parallel with existing code
- Direct replacement — once new code exists, it replaces old code (no shadow mode or feature flags)
- Dependency injection — domain managers receive EventBus via constructor for testability
- Repository pattern — abstraction layer between domain managers and database for testability

### Network Optimization
- Protocol Buffers for serialization — schema-defined binary format for smallest payloads and strict typing
- Hybrid state sync — optimistic updates for low-risk actions (animations), server-authoritative for state changes (votes)
- Hybrid tick strategy — event-driven for state changes, periodic heartbeat for time-sensitive data (timers)
- All messages compressed — lower bandwidth at slightly higher CPU cost
- Adaptive quality for mobile — detect connection quality, reduce update frequency on poor connections
- Full state sync on reconnect — send complete current state rather than deltas
- Client-side prediction — client predicts combat animations/damage locally, server confirms
- No offline mode — game requires server connection

### Claude's Discretion
- Mapping of current Lobby type to new domains — Claude determines cleanest distribution
- Player type structure (nullable fields vs discriminated unions) — based on type safety vs complexity
- Immutability strategy for state updates — based on performance needs and React integration
- Derived/computed values caching — based on real-time performance needs
- Coexistence strategy during transition — how new types work alongside Lobby
- Event payload content (deltas vs full relevant state) — based on subscriber needs
- EventBus priority/ordering — based on game requirements
- Event ordering for out-of-order arrivals — based on real-time game needs
- Domain manager instantiation (per-lobby vs singleton) — based on memory and isolation tradeoffs
- Kubernetes pod stickiness — based on complexity vs resilience tradeoff
- Dependency wiring approach — based on project scale
- Client backwards compatibility in Phase 1 — safest migration path
- Transport protocol (WebSocket vs alternatives) — based on office/home/mobile environment needs

</decisions>

<specifics>
## Specific Ideas

- Kubernetes horizontal scaling is the deployment model — architecture decisions should optimize for this
- Game must work well in office environments (corporate firewalls), home networks, and mobile devices
- Real-time performance is critical — this is a multiplayer game with combat and voting that needs to feel responsive
- Event sourcing enables debugging and replay capabilities — valuable for a game with complex state interactions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-01*
