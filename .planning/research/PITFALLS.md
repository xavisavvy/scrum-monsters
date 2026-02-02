# Pitfalls Research: Refactoring Monolithic Real-Time Game Servers

**Domain:** Real-time multiplayer game server refactoring (Socket.IO, Node.js)
**Researched:** 2026-02-01
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Event Listener Memory Leaks During Domain Separation

**What goes wrong:**
Socket.IO event listeners attached during the monolithic phase remain in memory indefinitely after refactoring to separate domains. Each player connection accumulates orphaned listeners across multiple domain handlers, causing memory to grow unbounded. In production, this manifests as gradual server slowdown over hours/days until eventual crash.

**Why it happens:**
When extracting domains (voting, combat, timers) from the monolith, developers forget that Socket.IO maintains references to all registered handlers. The original GameStateManager had listeners registered in a single location with clear ownership. After refactoring, multiple domain modules register listeners independently without coordinated cleanup on disconnect.

**How to avoid:**
- Implement centralized event listener registry that tracks which domain owns which listeners
- Use `socket.removeAllListeners(eventName)` in domain cleanup hooks
- Create domain-specific disconnect handlers that clean up their own listeners
- Add memory monitoring to detect listener accumulation in development

**Warning signs:**
- MaxListenersExceededWarning in production logs
- Memory usage growing proportionally to connection count × uptime
- Server performance degrading over hours despite stable player count
- Socket objects not being garbage collected after disconnect

**Phase to address:**
Phase 1 (Architecture & Boundaries) - Establish listener cleanup contracts before extracting domains

**Recovery cost:**
HIGH - Requires auditing all event handlers across domains, adding cleanup logic, and verifying no leaked references. Potential data corruption if domains lose track of player state during cleanup.

---

### Pitfall 2: Race Conditions in Sequential Phase Transitions

**What goes wrong:**
The monolith handles phase transitions (battle → reveal → discussion → scoring) atomically within a single state manager. After refactoring to separate domain services, race conditions emerge where multiple domains try to transition phases simultaneously. Example: Timer expiry triggers reveal while host manually advances phase, causing players to see inconsistent game states.

**Why it happens:**
The monolith's single-threaded execution model provided implicit serialization. Timer callbacks, socket events, and consensus checks all ran on the same event loop with predictable ordering. When domains become separate modules or services, these operations race without coordination. The current codebase has 12+ timer instances and 140+ socket event handlers that could conflict during refactor.

**How to avoid:**
- Implement phase transition state machine with exclusive locks
- Single "PhaseOrchestrator" domain owns phase transitions, other domains request changes
- Add transaction-style phase updates with rollback on conflict
- Queue phase transition requests instead of executing immediately

**Warning signs:**
- Players seeing different phases in the same lobby
- "Phase transition rejected" errors in logs
- Duplicate score submissions or double timer expirations
- Consensus countdown starting twice simultaneously

**Phase to address:**
Phase 2 (Core Domains) - Design phase orchestration before splitting voting/timer/consensus domains

**Recovery cost:**
HIGH - Requires introducing distributed locking or event sourcing. May need to roll back to monolith temporarily while fixing, causing deployment downtime.

---

### Pitfall 3: Lost Reconnection Context After Domain Split

**What goes wrong:**
The monolith stores disconnected player state (position, health, voting progress) in-memory within GameStateManager. After refactoring, each domain owns its own state (CombatDomain has health, VotingDomain has votes). When a player reconnects, domains don't coordinate to restore full context - player rejoins with 100% health but their vote is missing, or vice versa.

**Why it happens:**
The monolith's reconnection token system (lines 171-231 in gameState.ts) snapshots complete player state in one place. Refactored domains each implement their own state persistence without a unified "player context" abstraction. The 10-minute grace period becomes domain-specific rather than player-specific.

**How to avoid:**
- Design unified PlayerContext that aggregates state from all domains
- Implement domain state hydration protocol on reconnect
- Create ReconnectionCoordinator that queries all domains for player state
- Use event sourcing pattern to replay missed domain events on reconnect

**Warning signs:**
- Reconnected players starting battles with partial state
- "Player found but combat state missing" errors
- Votes not restoring after network drop
- Position desync between reconnected client and server

**Phase to address:**
Phase 1 (Architecture & Boundaries) - Define PlayerContext aggregation contract before domain extraction

**Recovery cost:**
MEDIUM - Requires adding cross-domain state queries and aggregation logic. Can be patched incrementally per domain, but poor UX until complete.

---

### Pitfall 4: Timer Interval Drift Across Domain Boundaries

**What goes wrong:**
The monolith manages timers centrally (revival watchdog, disconnect watchdog, consensus countdown, battle modifier) with coordinated intervals. After refactoring, each domain starts its own timers without synchronization. Revival checks run every 100ms, consensus ticks every 100ms, modifier updates every 10s - these drift out of phase, causing uneven CPU usage and missed coordination windows.

**Why it happens:**
JavaScript's `setInterval` is not precise and accumulates drift over time. When multiple domains each call `setInterval`, their phases randomize. The monolith's single watchdog loop (line 38-45) provided implicit synchronization. Distributed timers have no shared clock reference.

**How to avoid:**
- Create TimerCoordinator service with shared tick loop
- All domain timers register callbacks on common intervals (100ms, 1s, 10s tiers)
- Use `Date.now()` for elapsed time checks instead of counting ticks
- Implement timer health monitoring to detect drift > 50ms

**Warning signs:**
- Consensus countdown occasionally skipping seconds
- Revival completing in 2.7s or 3.4s instead of exactly 3s
- Battle modifier updating inconsistently (8s then 12s then 9s intervals)
- CPU spikes at irregular intervals instead of steady usage

**Phase to address:**
Phase 2 (Core Domains) - Establish shared timing infrastructure before extracting time-dependent domains

**Recovery cost:**
LOW - Can be fixed by migrating domains to shared ticker incrementally. No data loss risk, just timing inaccuracy.

---

### Pitfall 5: Circular Dependencies Between Consensus and Voting Domains

**What goes wrong:**
VotingDomain needs to know when consensus is reached to trigger scoring. ConsensusDomain needs voting results to calculate agreement. After naive domain separation, these become circular dependencies - VotingDomain imports ConsensusDomain which imports VotingDomain, causing module loading failures or infinite initialization loops.

**Why it happens:**
The monolith's `checkDiscussionConsensus()` method (lines 1443-1541) directly accesses voting state and directly updates consensus state in one function. This bidirectional coupling is hidden when everything is in one class. Domain extraction makes the circular dependency explicit and breaks module initialization.

**How to avoid:**
- Use mediator pattern - neither domain imports the other, both publish events
- Implement domain events: VotingDomain emits "vote_submitted", ConsensusDomain subscribes
- Create boundary interfaces: ConsensusDomain depends on IVotingState abstraction, not concrete VotingDomain
- Use dependency injection with lazy initialization to break cycles

**Warning signs:**
- TypeScript "circular dependency" errors during build
- Runtime "Cannot access before initialization" errors
- Domains throwing null reference errors on each other's methods
- Unpredictable domain initialization order

**Phase to address:**
Phase 1 (Architecture & Boundaries) - Design event-based communication before extracting interdependent domains

**Recovery cost:**
MEDIUM - Requires refactoring domain interfaces and introducing event mediator. Not data-destructive but requires architectural rework.

---

### Pitfall 6: Premature Redis Adapter Introduction

**What goes wrong:**
Teams read that Socket.IO scaling requires Redis and add the adapter during early refactoring. This introduces a critical external dependency before understanding actual scaling needs. Redis becomes a single point of failure. When Redis goes down, all lobbies disconnect even though the app server is healthy. Development velocity drops 40% because local setup now requires Docker.

**Why it happens:**
Well-meaning advice to "design for scale from the start." The current codebase has Redis caching (lines 48-64) but it's optional - the app falls back gracefully. Teams often make Redis *required* during refactoring, thinking it simplifies state management across domains. In reality, it just moves in-memory complexity to network complexity.

**How to avoid:**
- Keep Redis optional until proven scaling bottleneck
- Implement domain state as serializable objects that *could* use Redis later
- Measure: add metrics for lobby count, concurrent users, memory usage
- Add Redis only when single-server memory limit is reached (not preemptively)

**Warning signs:**
- Local development requiring Docker/Redis
- Integration tests failing due to Redis connection timeouts
- Production incidents where Redis outage takes down healthy app servers
- Redis memory usage growing faster than player count

**Phase to address:**
Phase 4 (Performance & Scale) - Only after domains are stable and metrics show scaling need

**Recovery cost:**
LOW - Can be removed by reverting to in-memory state. Main cost is development time wasted on premature optimization.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Copy-paste domain extraction (duplicate code in each domain) | Fast initial extraction, each domain is independent | Bugs multiply across domains, features require N updates instead of 1 | Never - always refactor shared logic into utilities first |
| Skipping TypeScript type updates after domain split | Compilation succeeds with `any` types | Domain contracts undefined, runtime type errors, no IDE autocomplete | Only for MVP/prototype phase, must be fixed before production |
| Hardcoding domain boundaries in websocket routing | Simple if/else chains to route events | Every new domain requires modifying central router, high coupling | Only for 2-3 domains, use plugin system for 4+ |
| Using process.exit() for domain errors instead of graceful degradation | Quick way to force restart on corruption | Kills all lobbies for one domain failure, poor UX | Never in production - implement circuit breakers |
| Storing player references across domains instead of passing IDs | Faster method calls (direct object access) | Memory leaks, stale references, can't serialize for Redis | Never - always use IDs as foreign keys between domains |
| Synchronous domain communication (direct method calls) | Low latency, simple debugging | Tight coupling, can't distribute domains, blocks event loop | Acceptable for read-only queries within same process |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Redis adapter for Socket.IO | Making it required dependency in all environments | Keep optional with in-memory fallback, only require in production |
| Jira API for ticket import | Calling Jira API on every vote submission to "sync status" | Cache tickets in-memory, sync on user-triggered refresh only |
| OAuth providers (optional auth) | Blocking lobby creation while OAuth validates token | Authenticate asynchronously, allow anonymous play, sync after join |
| PostgreSQL (optional DB) | Querying database in critical path (every phase transition) | Write-behind caching: update DB async after state changes, never block game loop |
| Health check endpoints | Returning 200 OK if app process is running | Check domain health, timer responsiveness, memory usage - fail if degraded |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Broadcasting lobby_updated to all players on every vote | Smooth UX with 4 players | Debounce broadcasts to 100ms intervals, batch state changes | 10+ players per lobby |
| Storing all completed tickets in lobby object forever | Fast history access | Archive tickets after 100 completions, paginate history | 500+ tickets completed |
| O(N²) player position distance calculations every tick | Works fine in testing | Use spatial grid or proximity lists for lookups | 15+ players in lobby |
| Serializing entire lobby state to Redis on every change | Simple cache invalidation | Delta updates - only sync changed fields | 50+ lobbies active |
| Single global event emitter for all domains | Simple pub/sub | Domain-scoped emitters with explicit subscriptions | 5+ domains |
| JSON.stringify for socket events without size checks | Easy serialization | Implement max payload size, paginate large arrays | Lobby state > 1MB |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Allowing spectators to emit player_damage events | Spectators can cheat - instantly kill all players by spamming damage events | Validate event origin team in domain handlers, ignore invalid team actions |
| Accepting arbitrary lobbyId in reconnect token | Attacker can craft token to join any lobby | Cryptographically sign tokens with HMAC (already implemented lines 182-183) |
| No rate limiting on vote_update events | Single player can spam votes to DoS server with broadcast load | Per-player rate limits (max 10 vote changes/second) |
| Host privileges not revoked on disconnect | Disconnected host retains control if they reconnect quickly | Immediately transfer host on disconnect (implemented line 332), but verify in ALL host actions |
| Trusting client-side timer expiry events | Client can fake "timer expired" to force reveal early | Server is source of truth - ignore client timer events, only trust server timers |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during domain refactor rollout | Players see "something broke" without context | Feature flags per domain, graceful degradation messages |
| Losing lobby state during deployment | All active games end abruptly on server restart | Persist lobby snapshots to Redis, restore on startup |
| Silent failure when domain is unhealthy | Players stuck in battle phase indefinitely | Timeout detection - auto-return to lobby if domain unresponsive > 30s |
| Reconnection losing all UI state | Player returns to lobby phase instead of battle continuation | Include UI phase in reconnection sync, restore client view state |
| No indication which players are disconnected | Team waits for disconnected player to vote | Visual indicator showing disconnected players, countdown shows "waiting for X/Y connected" |
| Phase transitions without animation/sound | Jarring instant changes between battle/reveal/discussion | Add 500ms transition animations, keep both UIs mounted briefly |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Domain Extraction:** Often missing cleanup/teardown hooks - verify each domain has `shutdown()` method that clears all timers/listeners
- [ ] **Event Handlers:** Often missing error boundaries - verify every `socket.on()` has try/catch and emits error event on failure
- [ ] **Reconnection:** Often missing partial reconnect handling - verify domains can restore state even if some domains fail hydration
- [ ] **Phase Transitions:** Often missing rollback logic - verify failed phase changes revert to previous stable phase
- [ ] **Timer Management:** Often missing cleanup on lobby deletion - verify `timerIntervals` map entries are deleted when lobby removed
- [ ] **Consensus Logic:** Often missing team composition edge cases - verify works with: 0 devs, 0 QA, 0 both, 1 of each
- [ ] **Combat System:** Often missing revival session cleanup - verify `revivalSessions` map doesn't grow unbounded
- [ ] **Memory Leaks:** Often missing WeakMap usage - verify large objects (boss sprites, completed tickets) use weak references
- [ ] **Domain Events:** Often missing event documentation - verify each domain has exported TypeScript types for its events
- [ ] **Testing:** Often missing integration tests - verify happy path works end-to-end with all domains, not just unit tests

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Event Listener Memory Leak | MEDIUM | 1. Add `/admin/debug/listeners` endpoint showing count per socket 2. Add cleanup audit to each domain 3. Deploy fix 4. Monitor memory for 48h |
| Race Condition in Phase Transitions | HIGH | 1. Add mutex lock to phase setter 2. Queue conflicting transitions 3. Add transaction log for debugging 4. May require rollback to monolith if corruption occurred |
| Lost Reconnection Context | MEDIUM | 1. Add PlayerContext aggregator 2. Deploy new reconnection flow 3. Manually fix corrupted player states in DB 4. Monitor reconnect success rate |
| Timer Interval Drift | LOW | 1. Add TimerCoordinator service 2. Migrate domains to register callbacks instead of setInterval 3. No data recovery needed |
| Circular Domain Dependencies | LOW | 1. Introduce event mediator 2. Refactor domain A to use events 3. Refactor domain B to use events 4. No data recovery needed |
| Premature Redis Dependency | LOW | 1. Add in-memory fallback adapter 2. Make Redis optional in config 3. Document Redis setup for prod only |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Event Listener Memory Leaks | Phase 1 (Architecture) | Load test with 100 connections × 30min, memory should stabilize |
| Race Conditions in Phase Transitions | Phase 2 (Core Domains) | Concurrent phase transition test - 10 domains requesting changes simultaneously |
| Lost Reconnection Context | Phase 1 (Architecture) | Reconnection test after extracting first domain - all state restored |
| Timer Interval Drift | Phase 2 (Core Domains) | Run timers for 1 hour, measure drift < 100ms from expected |
| Circular Domain Dependencies | Phase 1 (Architecture) | TypeScript compilation should succeed without warnings |
| Premature Redis Dependency | Phase 4 (Performance) | App starts and runs all tests without Docker/Redis |

## Domain-Specific Anti-Patterns for This Codebase

Based on analysis of gameState.ts (2000+ lines).

### Anti-Pattern 1: God Class Disguised as Domains
**What it looks like:** Create CombatDomain, VotingDomain, TimerDomain classes but they all take GameStateManager as constructor argument and call `this.gameState.getLobby()` for everything.

**Why it fails:** Domains are still tightly coupled to monolith. Can't test domains in isolation. Can't scale domains independently. Extraction provides no benefit.

**Correct approach:** Domains own their state. Pass domain-specific DTOs (CombatState, VotingState) not entire lobby. Use events for cross-domain communication.

---

### Anti-Pattern 2: Extracting Methods Before Understanding Boundaries
**What it looks like:** Move `updatePlayerTeam()` to TeamDomain, `updatePlayerAvatar()` to AvatarDomain, `updatePlayerPosition()` to MovementDomain. Now 15 domains each managing one aspect of Player object.

**Why it fails:** Player becomes distributed entity with no clear owner. Setting a player's position requires cross-domain coordination. Too fine-grained.

**Correct approach:** Start with coarse domains (Lobby, Battle, Voting). Only split domains when one reaches 500+ lines or serves multiple use cases.

---

### Anti-Pattern 3: Thinking Domains = Phases
**What it looks like:** Create LobbyPhaseDomain, AvatarSelectionPhaseDomain, BattlePhaseDomain, RevealPhaseDomain, DiscussionPhaseDomain mirroring GamePhase enum.

**Why it fails:** Phases are views of the game state, not bounded contexts. Combat persists across battle→reveal→discussion phases. Timers span multiple phases.

**Correct approach:** Domains based on capabilities (Voting, Combat, Teams, Lifecycle) that operate across phases. PhaseOrchestrator coordinates domains.

---

### Anti-Pattern 4: Event Storm (Publishing Everything)
**What it looks like:** Every domain method emits events: `team_changed`, `avatar_changed`, `position_changed`, `health_changed`, `vote_changed`. 50+ event types.

**Why it fails:** Event listeners proliferate. Debugging becomes "why did this happen?" treasure hunt through event chain. Event ordering becomes critical and fragile.

**Correct approach:** Events for domain boundaries only. Internal domain changes use direct method calls. Emit: `player_joined`, `phase_transitioned`, `battle_ended` not `player_hp_decreased`.

---

## Sources

### Game Server Refactoring
- [Building a Real-Time Multiplayer Game Server with Socket.io and Redis](https://dev.to/dowerdev/building-a-real-time-multiplayer-game-server-with-socketio-and-redis-architecture-and-583m)
- [Mastering Multiplayer Game Architecture: Choosing the Right Approach](https://www.getgud.io/blog/mastering-multiplayer-game-architecture-choosing-the-right-approach/)
- [Modular Monolith: A Sane Architecture for Indie Game Devs](https://www.wayline.io/blog/modular-monolith-indie-game-dev)

### Monolith Refactoring Pitfalls
- [Why Breaking Up Your Monolith Can Kill Your Project](https://medium.com/andamp/why-breaking-up-your-monolith-can-kill-your-project-mistakes-you-cant-afford-to-make-9e673d20b570)
- [Monoliths vs microservices in gaming architecture](https://ascendion.com/insights/monoliths-vs-microservices-in-gaming-architecture-striking-the-right-balance/)
- [How to Refactor a Monolithic Codebase Over Time](https://www.cloudbees.com/blog/how-to-refactor-a-monolithic-codebase-over-time)

### Socket.IO Scaling Issues
- [Scaling Socket.IO: Real-world challenges and proven strategies](https://ably.com/topic/scaling-socketio)
- [10 Socket.IO Best Practices](https://climbtheladder.com/10-socket-io-best-practices/)
- [Socket.io — The Good, the Bad, and the Ugly](https://dzone.com/articles/socketio-the-good-the-bad-and-the-ugly)

### Event Listener Memory Leaks
- [How to Avoid Memory Leaks in JavaScript Event Listeners](https://dev.to/alex_aslam/how-to-avoid-memory-leaks-in-javascript-event-listeners-4hna)
- [Understanding the MaxListenersExceededWarning Event in Node.js](https://www.dhiwise.com/post/best-practices-for-handling-maxlistenersexceededwarning)
- [4 Types of Memory Leaks in JavaScript](https://auth0.com/blog/four-types-of-leaks-in-your-javascript-code-and-how-to-get-rid-of-them/)

### Domain Separation & Coupling
- [Component Pattern - Game Programming Patterns](https://gameprogrammingpatterns.com/component.html)
- [Separation of concerns in game architecture](https://www.gamedev.net/forums/topic/643292-separation-of-concerns-in-game-architecture/)
- [Separation of Concerns: The Cornerstone of Modern Software Development](https://nordicapis.com/separation-of-concerns-soc-the-cornerstone-of-modern-software-development/)

### Strangler Pattern Migration
- [The Strangler Pattern: Kill Legacy Like a Boss](https://medium.com/@josesousa8/the-strangler-pattern-kill-legacy-like-a-boss-db3db41564ed)
- [Strangler Fig Pattern - Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig)
- [Strangler Pattern in Microservices System Design](https://thelinuxcode.com/strangler-pattern-in-microservices-system-design-a-practical-migration-playbook/)

### Game State Management Anti-Patterns
- [State Pattern - Game Programming Patterns](https://gameprogrammingpatterns.com/state.html)
- [Video game project management anti-patterns](https://dl.acm.org/doi/10.1145/3524494.3527623)
- [Game State Management - Nuclex Games Blog](http://blog.nuclex-games.com/tutorials/cxx/game-state-management/)

---

*Pitfalls research for: Real-time multiplayer game server refactoring*
*Researched: 2026-02-01*
*Based on ScrumQuest codebase analysis (server/gameState.ts: 2004 lines, 15 timers, 140+ socket events)*
