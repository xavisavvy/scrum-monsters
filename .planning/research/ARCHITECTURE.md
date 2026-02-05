# Architecture Research: Domain-Separated Real-Time Game Servers

**Domain:** Real-time multiplayer estimation game (Socket.IO + TypeScript)
**Researched:** 2026-02-01
**Confidence:** HIGH

## Standard Architecture

### System Overview

Domain-separated real-time game servers follow an **event-driven, manager-based architecture** where distinct domain managers own their state and communicate through events rather than direct coupling.

```
┌────────────────────────────────────────────────────────────┐
│                     WebSocket Layer (Socket.IO)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Connection   │  │   Event      │  │   Room       │    │
│  │   Handler    │  │  Dispatcher  │  │  Management  │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
├─────────┴──────────────────┴──────────────────┴────────────┤
│                     Manager Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Session    │  │  Estimation  │  │   Combat     │    │
│  │   Manager    │  │   Manager    │  │   Manager    │    │
│  │              │  │              │  │              │    │
│  │ • Lobbies    │  │ • Voting     │  │ • Boss       │    │
│  │ • Players    │  │ • Consensus  │  │ • Health     │    │
│  │ • Teams      │  │ • Timers     │  │ • Positions  │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
├─────────┴──────────────────┴──────────────────┴────────────┤
│                    Event Bus / Mediator                     │
│  ┌──────────────────────────────────────────────────┐      │
│  │  Internal Events: player_voted, boss_damaged,    │      │
│  │  phase_changed, consensus_reached, etc.          │      │
│  └──────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────┤
│                        State Layer                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Session   │  │ Estimation │  │   Combat   │           │
│  │   State    │  │   State    │  │   State    │           │
│  └────────────┘  └────────────┘  └────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **SessionManager** | Player lifecycle, lobby membership, team assignments | Handles join/leave, reconnection, host transfer |
| **EstimationManager** | Voting mechanics, consensus detection, ticket progression | Tracks votes, timers, triggers reveals |
| **CombatManager** | Battle simulation, health, positions, animations | Physics, damage calculation, revival system |
| **Event Bus** | Inter-manager communication | Internal pub/sub for domain events |
| **Socket Handler** | WebSocket event routing | Maps external events to manager methods |
| **State Store** | Persistence & caching | Redis/PostgreSQL for lobby state |

## Recommended Project Structure

```
server/
├── managers/                 # Domain-specific managers
│   ├── SessionManager.ts    # Player/lobby lifecycle
│   ├── EstimationManager.ts # Voting/consensus logic
│   ├── CombatManager.ts     # Battle mechanics
│   └── index.ts             # Manager factory/registry
├── state/                   # State type definitions
│   ├── SessionState.ts      # Lobby, Player, Team types
│   ├── EstimationState.ts   # Vote, Timer, Consensus types
│   ├── CombatState.ts       # Health, Position, Boss types
│   └── index.ts             # Combined state exports
├── events/                  # Event definitions
│   ├── internal.ts          # Manager-to-manager events
│   ├── external.ts          # Client-to-server events (Socket.IO)
│   └── EventBus.ts          # Internal event dispatcher
├── handlers/                # Socket.IO handlers
│   ├── sessionHandlers.ts   # Join, leave, team change
│   ├── estimationHandlers.ts # Vote, reveal, timer
│   ├── combatHandlers.ts    # Attack, move, revive
│   └── index.ts             # Handler registration
├── storage.ts               # Database/cache abstraction
└── websocket.ts             # Socket.IO initialization

shared/
├── types/                   # Shared TypeScript types
│   ├── session.ts           # Lobby, Player, Team
│   ├── estimation.ts        # Vote, Ticket, Timer
│   ├── combat.ts            # Boss, Health, Position
│   └── events.ts            # Socket.IO event contracts
└── gameEvents.ts            # (Legacy - to be split)
```

### Structure Rationale

- **`managers/`**: Each domain manager is a self-contained module owning its state and business logic
- **`state/`**: Explicit state types replace the monolithic `Lobby` type with 27 fields
- **`events/`**: Clear separation between internal events (manager-to-manager) and external events (Socket.IO)
- **`handlers/`**: Thin adapter layer mapping Socket.IO events to manager method calls
- **`shared/`**: Type contracts shared between client and server, split by domain

## Architectural Patterns

### Pattern 1: Event-Driven Manager Communication

**What:** Managers communicate through an internal event bus rather than direct method calls. When EstimationManager detects consensus, it emits `consensus_reached` event; CombatManager subscribes and applies boss damage.

**When to use:** When you need loose coupling between domain managers that have complex interdependencies.

**Trade-offs:**
- ✅ **Pros:** Complete decoupling, easy to add new managers, clear event audit trail
- ❌ **Cons:** Harder to trace execution flow, potential event ordering issues, slight performance overhead

**Example:**
```typescript
// EstimationManager emits internal event
class EstimationManager {
  checkConsensus(lobbyId: string) {
    const result = this.calculateConsensus(lobbyId);
    if (result.achieved) {
      this.eventBus.emit('consensus_reached', {
        lobbyId,
        finalScore: result.score,
        teamScores: result.breakdown
      });
    }
  }
}

// CombatManager subscribes to internal event
class CombatManager {
  constructor(eventBus: EventBus) {
    eventBus.on('consensus_reached', (data) => {
      this.applyBossDamage(data.lobbyId, data.finalScore * 10);
    });
  }
}
```

### Pattern 2: State Machine Per Manager

**What:** Each manager maintains its own state machine for domain-specific phases. SessionManager tracks `lobby → avatar_selection → active_game → lobby`, while EstimationManager tracks `voting → reveal → discussion → completed`.

**When to use:** When different domains have independent lifecycles that don't map 1:1 to global game phases.

**Trade-offs:**
- ✅ **Pros:** Avoids n×m state explosion, domain states are independent, easier to reason about
- ❌ **Cons:** Need coordination mechanism for global phase transitions, multiple sources of truth

**Example:**
```typescript
// SessionManager has its own state machine
type SessionPhase = 'lobby' | 'avatar_selection' | 'active_game';

class SessionManager {
  private sessions = new Map<string, { phase: SessionPhase, players: Player[] }>();

  startGame(lobbyId: string) {
    const session = this.sessions.get(lobbyId);
    if (session.phase === 'avatar_selection') {
      session.phase = 'active_game';
      this.eventBus.emit('game_started', { lobbyId });
    }
  }
}

// EstimationManager has its own independent state machine
type EstimationPhase = 'voting' | 'reveal' | 'discussion' | 'completed';

class EstimationManager {
  private estimations = new Map<string, { phase: EstimationPhase, votes: Map<string, number> }>();

  submitVote(lobbyId: string, playerId: string, score: number) {
    const est = this.estimations.get(lobbyId);
    if (est.phase === 'voting') {
      est.votes.set(playerId, score);
      if (this.allVotesIn(lobbyId)) {
        est.phase = 'reveal';
        this.eventBus.emit('votes_ready', { lobbyId });
      }
    }
  }
}
```

### Pattern 3: Aggregate Root Pattern (DDD)

**What:** Each manager exposes only aggregate roots (e.g., `Lobby`, `Battle`, `Estimation`) and prevents direct access to internal entities. External code cannot modify individual players or votes directly.

**When to use:** When you need to enforce invariants and business rules within domain boundaries.

**Trade-offs:**
- ✅ **Pros:** Strong encapsulation, business rules enforced, prevents inconsistent state
- ❌ **Cons:** More verbose API, requires careful boundary design, can lead to anemic models if overdone

**Example:**
```typescript
// SessionManager exposes only Lobby aggregate root
class SessionManager {
  // ❌ BAD: Direct access to players
  // getPlayers(lobbyId: string): Player[] { ... }

  // ✅ GOOD: Operations on Lobby aggregate
  assignPlayerToTeam(lobbyId: string, playerId: string, team: TeamType): Lobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!this.canAssignTeam(lobby, playerId, team)) {
      throw new Error('Team assignment not allowed');
    }
    lobby.assignTeam(playerId, team); // Business logic in aggregate
    return lobby;
  }
}
```

### Pattern 4: Fine-Grained Events (Granular Broadcasting)

**What:** Replace coarse-grained `lobby_updated` events with specific events like `player_voted`, `boss_damaged`, `phase_changed`. Clients subscribe to only the events they need.

**When to use:** When you have large state objects and want to minimize bandwidth and client-side re-rendering.

**Trade-offs:**
- ✅ **Pros:** Less bandwidth, targeted client updates, easier to debug specific changes
- ❌ **Cons:** More events to maintain, need event versioning strategy, clients must handle event ordering

**Example:**
```typescript
// ❌ CURRENT: Coarse-grained event (sends entire 27-field Lobby object)
io.to(lobbyId).emit('lobby_updated', { lobby });

// ✅ TARGET: Fine-grained events
io.to(lobbyId).emit('player_voted', {
  playerId,
  team: 'developers',
  hasVoted: true
});

io.to(lobbyId).emit('boss_damaged', {
  bossId,
  currentHealth: 450,
  maxHealth: 1000,
  damageAmount: 50
});

io.to(lobbyId).emit('phase_changed', {
  from: 'battle',
  to: 'reveal',
  triggeredBy: 'consensus'
});
```

### Pattern 5: Manager Mediator (Coordination)

**What:** A lightweight coordinator that orchestrates complex workflows spanning multiple managers without containing business logic itself.

**When to use:** When you have cross-cutting concerns that require coordination but shouldn't live in any single manager.

**Trade-offs:**
- ✅ **Pros:** Centralized orchestration, easier to understand complex flows, prevents manager coupling
- ❌ **Cons:** Can become a "god object" if misused, adds indirection layer

**Example:**
```typescript
class GameCoordinator {
  constructor(
    private sessionMgr: SessionManager,
    private estimationMgr: EstimationManager,
    private combatMgr: CombatManager,
    private eventBus: EventBus
  ) {
    // Listen for cross-domain workflows
    this.eventBus.on('consensus_reached', this.handleConsensus.bind(this));
  }

  // Orchestrates: consensus → boss damage → phase transition
  private handleConsensus(data: ConsensusEvent) {
    const damage = data.finalScore * 10;
    this.combatMgr.applyBossDamage(data.lobbyId, damage);

    const bossDefeated = this.combatMgr.isBossDefeated(data.lobbyId);
    if (bossDefeated) {
      this.estimationMgr.completeEstimation(data.lobbyId);
      this.sessionMgr.advanceToNextTicket(data.lobbyId);
    }
  }
}
```

## Data Flow

### Request Flow (Player Vote Submission)

```
[Client Vote Action]
    ↓ (WebSocket: submit_score)
[Socket Handler] → validates event schema
    ↓
[EstimationManager.submitVote()] → stores vote, checks completion
    ↓ (if all votes in)
[EventBus.emit('votes_ready')] → internal event
    ↓
[EstimationManager] listens → transitions to 'reveal' phase
    ↓
[Socket Broadcast: player_voted] → notifies clients
    ↓
[Client UI Update] ← receives targeted event
```

### Cross-Manager Flow (Consensus → Boss Damage)

```
[EstimationManager detects consensus]
    ↓
[EventBus.emit('consensus_reached', { score: 8 })]
    ↓
[CombatManager listens] → applyBossDamage(lobbyId, 80)
    ↓
[CombatManager updates boss health] → health: 1000 → 920
    ↓ (if health <= 0)
[EventBus.emit('boss_defeated', { lobbyId })]
    ↓
[SessionManager listens] → advances to next ticket
    ↓
[Socket Broadcast: boss_defeated] → notifies clients
```

### State Synchronization Flow

```
[Manager State Change]
    ↓
[Manager emits domain event] → e.g., 'player_joined'
    ↓
[EventBus routes to subscribers]
    ↓                           ↓                    ↓
[Socket Broadcast]    [State Cache (Redis)]   [Other Managers]
    ↓                           ↓                    ↓
[Clients receive      [Persistence for       [Update their own
 targeted updates]     reconnection]          dependent state]
```

### Key Data Flows

1. **Player Actions → State Changes:** Client events routed through handlers to managers, managers emit internal events
2. **Manager-to-Manager Coordination:** Internal event bus decouples managers while enabling workflows
3. **State Broadcasting:** Fine-grained events reduce bandwidth vs. full state syncs
4. **Reconnection Recovery:** Cached state snapshots allow fast client resync without replaying all events

## Component Boundaries

### SessionManager Boundaries

**Owns:**
- Lobby existence, player membership, team assignments
- Host privileges, reconnection grace periods
- Avatar selection, spectator mode

**Does NOT Own:**
- Vote tallying (EstimationManager)
- Boss health (CombatManager)
- Timer logic (EstimationManager)

**Communication:**
- **Inbound Events:** `player_reconnected`, `estimation_completed`
- **Outbound Events:** `player_joined`, `player_left`, `host_transferred`, `game_started`
- **Exposes:** `getLobby()`, `addPlayer()`, `removePlayer()`, `assignTeam()`, `promoteHost()`

### EstimationManager Boundaries

**Owns:**
- Vote collection, consensus detection, timer management
- Ticket queue, current ticket state, estimation history
- Fibonacci/T-shirt scale configuration

**Does NOT Own:**
- Player roster (SessionManager)
- Boss damage calculation (CombatManager)
- Position/movement (CombatManager)

**Communication:**
- **Inbound Events:** `player_joined`, `player_left`, `game_started`
- **Outbound Events:** `player_voted`, `votes_ready`, `consensus_reached`, `estimation_completed`, `timer_expired`
- **Exposes:** `submitVote()`, `getVotes()`, `checkConsensus()`, `startTimer()`, `advanceTicket()`

### CombatManager Boundaries

**Owns:**
- Boss health/phases, player health/positions, combat animations
- Attack/heal mechanics, revival system, ring attack logic
- Battle modifier (time-based difficulty scaling)

**Does NOT Own:**
- Vote logic (EstimationManager)
- Team membership (SessionManager)
- Ticket progression (EstimationManager)

**Communication:**
- **Inbound Events:** `consensus_reached`, `estimation_completed`, `game_started`
- **Outbound Events:** `boss_damaged`, `boss_healed`, `player_damaged`, `player_healed`, `boss_defeated`, `game_over`
- **Exposes:** `attackBoss()`, `attackPlayer()`, `healParty()`, `updatePosition()`, `revivePlayer()`

## Refactoring Order & Dependencies

### Phase 1: Extract State Types (Foundation)
**Goal:** Split monolithic `Lobby` type into domain-specific state types

**Why First:** No code changes, just type definitions. Establishes vocabulary for remaining phases.

**Dependencies:** None

**Deliverables:**
- `SessionState` (id, name, hostId, players, teams)
- `EstimationState` (currentTicket, tickets, votes, consensus, timer)
- `CombatState` (boss, playerHealth, playerPositions, battleModifier)

**Validation:** TypeScript compiles, no runtime changes

---

### Phase 2: Create Event Bus (Infrastructure)
**Goal:** Implement internal event system for manager communication

**Why Second:** Provides communication backbone before extracting managers

**Dependencies:** Phase 1 (state types for event payloads)

**Deliverables:**
- `EventBus` class with `emit()`, `on()`, `off()` methods
- Internal event type definitions (`player_voted`, `boss_damaged`, etc.)
- Unit tests for event routing

**Validation:** Event pub/sub works, subscribers receive correct data

---

### Phase 3: Extract SessionManager (Core)
**Goal:** Move player/lobby lifecycle logic into dedicated manager

**Why Third:** Least complex manager, foundational for others

**Dependencies:** Phase 1 (SessionState), Phase 2 (EventBus)

**Deliverables:**
- `SessionManager` class with player/lobby methods
- Socket handlers updated to call SessionManager
- Emits `player_joined`, `player_left`, `host_transferred` events

**Validation:** Player join/leave/reconnect flows work, no game logic broken

---

### Phase 4: Extract EstimationManager (Mid)
**Goal:** Move voting/consensus/timer logic into dedicated manager

**Why Fourth:** Depends on SessionManager for player roster, independent of combat

**Dependencies:** Phase 3 (SessionManager for player list)

**Deliverables:**
- `EstimationManager` class with voting methods
- Timer system integration
- Consensus detection logic
- Emits `player_voted`, `consensus_reached`, `timer_expired`

**Validation:** Voting flows work, consensus detection accurate, timers function

---

### Phase 5: Extract CombatManager (Complex)
**Goal:** Move battle mechanics into dedicated manager

**Why Fifth:** Most complex manager with physics, animations, health tracking

**Dependencies:** Phase 4 (EstimationManager for consensus → damage conversion)

**Deliverables:**
- `CombatManager` class with combat methods
- Boss health, player health, revival system
- Position tracking, ring attacks
- Emits `boss_damaged`, `player_damaged`, `game_over`

**Validation:** Battle mechanics work, boss defeated at 0 health, revival system functions

---

### Phase 6: Replace Coarse Events with Fine-Grained (Optimization)
**Goal:** Replace `lobby_updated` with targeted events like `player_voted`, `boss_damaged`

**Why Last:** Requires all managers to be extracted first, optimization not critical for correctness

**Dependencies:** Phases 3-5 (all managers emitting internal events)

**Deliverables:**
- Socket broadcasts use fine-grained events
- Client updated to handle new event types
- Bandwidth reduction metrics

**Validation:** Clients receive updates, no missing data, reduced payload sizes

---

### Dependency Diagram

```
Phase 1: State Types (Foundation)
    ↓
Phase 2: Event Bus (Infrastructure)
    ↓
Phase 3: SessionManager ────────┐
    ↓                           │
Phase 4: EstimationManager ─────┤ (depends on SessionManager)
    ↓                           │
Phase 5: CombatManager ─────────┘ (depends on EstimationManager)
    ↓
Phase 6: Fine-Grained Events (depends on all managers)
```

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Redis (Upstash) | State caching via adapter | Cache lobby snapshots for reconnection, TTL: 1 hour |
| PostgreSQL | Session persistence (optional) | Drizzle ORM, store completed games for analytics |
| Socket.IO | Event-driven adapter | Thin handlers map external events to manager calls |
| Jira API | Ticket import (future) | Async queue for fetching ticket details |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| SessionManager ↔ EstimationManager | EventBus (async) | Session emits `player_joined` → Estimation initializes vote state |
| EstimationManager ↔ CombatManager | EventBus (async) | Estimation emits `consensus_reached` → Combat applies damage |
| CombatManager ↔ SessionManager | EventBus (async) | Combat emits `game_over` → Session resets lobby |
| All Managers ↔ Socket Handlers | Direct method calls (sync) | Handlers call manager methods, managers don't know about sockets |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-100 lobbies** | Single Node.js process, in-memory state with Redis cache backup |
| **100-1K lobbies** | Add Redis Pub/Sub for horizontal scaling, sticky sessions in load balancer |
| **1K-10K lobbies** | Separate processes per manager type (SessionManager instances, EstimationManager instances), shared Redis state |
| **10K+ lobbies** | Kubernetes deployment with auto-scaling, dedicated Combat worker nodes (CPU-intensive), separate WebSocket gateway layer |

### Scaling Priorities

1. **First bottleneck (500-1K lobbies):** Memory exhaustion from in-memory state
   - **Solution:** Move all state to Redis, use managers as stateless coordinators
   - **Implementation:** Each manager reads/writes to Redis on every operation, cache locally for read-heavy operations

2. **Second bottleneck (2K-5K lobbies):** Single Socket.IO server can't handle concurrent connections
   - **Solution:** Socket.IO cluster mode with Redis adapter for cross-server broadcasting
   - **Implementation:** Deploy 3-5 WebSocket servers behind load balancer, use Redis Pub/Sub for room broadcasts

3. **Third bottleneck (10K+ lobbies):** Combat calculations (physics, collision) become CPU-bound
   - **Solution:** Separate CombatManager into dedicated worker pool
   - **Implementation:** Combat operations enqueue to Redis Stream, worker pods process async, results published back

## Anti-Patterns

### Anti-Pattern 1: Manager Cross-Calling (Tight Coupling)

**What people do:** Managers call each other's methods directly
```typescript
// ❌ BAD: EstimationManager calls CombatManager directly
class EstimationManager {
  checkConsensus(lobbyId: string) {
    if (this.hasConsensus(lobbyId)) {
      this.combatManager.applyBossDamage(lobbyId, 100); // Direct call
    }
  }
}
```

**Why it's wrong:** Creates circular dependencies, tight coupling, hard to test, manager order matters

**Do this instead:** Use event bus for manager-to-manager communication
```typescript
// ✅ GOOD: EstimationManager emits event
class EstimationManager {
  checkConsensus(lobbyId: string) {
    if (this.hasConsensus(lobbyId)) {
      this.eventBus.emit('consensus_reached', { lobbyId, score: 8 });
    }
  }
}

// CombatManager subscribes independently
class CombatManager {
  constructor(eventBus: EventBus) {
    eventBus.on('consensus_reached', (data) => {
      this.applyBossDamage(data.lobbyId, data.score * 10);
    });
  }
}
```

### Anti-Pattern 2: Leaking Internal State

**What people do:** Expose mutable state objects directly
```typescript
// ❌ BAD: Return mutable state
class SessionManager {
  private lobbies = new Map<string, Lobby>();

  getLobby(id: string): Lobby {
    return this.lobbies.get(id); // Caller can mutate directly
  }
}

// Caller can break invariants
const lobby = sessionManager.getLobby('ABC');
lobby.players.push({ /* invalid player */ }); // Bypasses validation
```

**Why it's wrong:** Breaks encapsulation, bypasses business rules, inconsistent state

**Do this instead:** Return immutable copies or use read-only types
```typescript
// ✅ GOOD: Return deep copy or readonly type
class SessionManager {
  private lobbies = new Map<string, Lobby>();

  getLobby(id: string): Readonly<Lobby> | null {
    const lobby = this.lobbies.get(id);
    return lobby ? Object.freeze(structuredClone(lobby)) : null;
  }

  // Provide explicit mutation methods
  addPlayer(lobbyId: string, player: Player): Lobby {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');

    // Validation logic here
    lobby.players.push(player);
    return Object.freeze(structuredClone(lobby));
  }
}
```

### Anti-Pattern 3: God Event Bus (Event Soup)

**What people do:** Use event bus for ALL communication, including synchronous operations
```typescript
// ❌ BAD: Even simple queries go through events
sessionManager.eventBus.emit('get_lobby_request', { lobbyId });
sessionManager.eventBus.on('lobby_response', (lobby) => {
  // Process lobby...
});
```

**Why it's wrong:** Over-complicates simple operations, event ordering issues, hard to debug synchronous flows

**Do this instead:** Direct method calls for queries, events for state changes
```typescript
// ✅ GOOD: Direct calls for queries
const lobby = sessionManager.getLobby(lobbyId);

// ✅ GOOD: Events for state changes
sessionManager.addPlayer(lobbyId, player);
// ^ This internally emits 'player_joined' event for interested subscribers
```

### Anti-Pattern 4: Mixing Domain Logic in Handlers

**What people do:** Put business logic in Socket.IO handlers
```typescript
// ❌ BAD: Handler contains voting logic
socket.on('submit_score', (data) => {
  const lobby = gameState.getLobby(socket.lobbyId);
  const player = lobby.players.find(p => p.id === socket.playerId);

  // Business logic in handler (BAD!)
  if (player.team === 'spectators') return;
  if (data.score < 0 || data.score > 100) return;

  player.currentScore = data.score;

  // More business logic...
  const allVoted = lobby.players.every(p => p.hasSubmittedScore);
  if (allVoted) {
    lobby.gamePhase = 'reveal';
  }

  io.to(socket.lobbyId).emit('lobby_updated', { lobby });
});
```

**Why it's wrong:** Handlers become bloated, business rules duplicated, hard to test, tight coupling

**Do this instead:** Handlers are thin adapters, managers own business logic
```typescript
// ✅ GOOD: Handler delegates to manager
socket.on('submit_score', async (data) => {
  try {
    const result = await estimationManager.submitVote(
      socket.lobbyId,
      socket.playerId,
      data.score
    );

    // Manager emits events internally, handler just broadcasts results
    socket.emit('vote_submitted', { success: true });
  } catch (error) {
    socket.emit('game_error', { message: error.message });
  }
});

// Business logic lives in EstimationManager
class EstimationManager {
  submitVote(lobbyId: string, playerId: string, score: number) {
    this.validateVote(score); // Validation logic
    this.storeVote(lobbyId, playerId, score); // State mutation

    if (this.allPlayersVoted(lobbyId)) {
      this.eventBus.emit('votes_ready', { lobbyId });
    }
  }
}
```

### Anti-Pattern 5: Premature Microservices

**What people do:** Split managers into separate microservices immediately
```typescript
// ❌ BAD: Managers in separate processes from day 1
// SessionManager → HTTP API on port 3001
// EstimationManager → HTTP API on port 3002
// CombatManager → HTTP API on port 3003
```

**Why it's wrong:** Over-engineering for current scale, network latency, deployment complexity, distributed transactions

**Do this instead:** Start as modular monolith, extract services when needed
```typescript
// ✅ GOOD: Managers in same process, clear boundaries
const sessionManager = new SessionManager(eventBus);
const estimationManager = new EstimationManager(eventBus);
const combatManager = new CombatManager(eventBus);

// Scale horizontally by deploying more instances (not splitting services)
// Only split into microservices when:
// 1. Different scaling needs (e.g., Combat is CPU-bound, others are I/O-bound)
// 2. Team size justifies organizational boundaries
// 3. Deployment independence required
```

## Domain-Specific Patterns for Real-Time Games

### Pattern: Eventual Consistency with Snapshots

**Context:** Real-time games need fast updates, but perfect consistency is expensive.

**Solution:** Broadcast state changes immediately (optimistic), periodically send full state snapshots (correction).

```typescript
class CombatManager {
  broadcastPositions() {
    // Fast: Send position deltas every 50ms
    setInterval(() => {
      const deltas = this.getPositionDeltas();
      io.emit('position_delta', deltas);
    }, 50);

    // Slow: Send full snapshot every 2s for correction
    setInterval(() => {
      const snapshot = this.getAllPositions();
      io.emit('position_snapshot', snapshot);
    }, 2000);
  }
}
```

### Pattern: Input Prediction + Server Reconciliation

**Context:** Network latency makes movement feel sluggish.

**Solution:** Client predicts movement locally, server validates and corrects if needed.

```typescript
// Client predicts immediately
handleInput(dx: number, dy: number) {
  this.predictedPosition.x += dx;
  this.predictedPosition.y += dy;
  socket.emit('move', { dx, dy, sequence: this.sequence++ });
}

// Server validates and responds
socket.on('move', (data) => {
  const newPos = combatManager.updatePosition(playerId, data.dx, data.dy);
  socket.emit('position_correction', {
    position: newPos,
    sequence: data.sequence
  });
});

// Client corrects if prediction was wrong
socket.on('position_correction', (data) => {
  if (data.sequence < this.sequence) {
    // Server position differs from prediction, apply correction
    this.reconcilePosition(data.position);
  }
});
```

### Pattern: Time-Based Authority (Battle Modifier)

**Context:** Current ScrumQuest has battle modifier increasing every 10s, but time is managed server-side.

**Solution:** Server broadcasts time anchors, clients calculate current modifier locally.

```typescript
// Server broadcasts anchor when battle starts
socket.emit('battle_started', {
  startTime: Date.now(),
  modifierInterval: 10000 // 10s
});

// Client calculates current modifier locally (reduces server load)
getCurrentModifier(): number {
  const elapsed = Date.now() - this.battleStartTime;
  return Math.floor(elapsed / this.modifierInterval);
}

// Server validates client actions using same calculation
class CombatManager {
  getCurrentModifier(lobbyId: string): number {
    const battle = this.battles.get(lobbyId);
    const elapsed = Date.now() - battle.startTime;
    return Math.floor(elapsed / 10000);
  }
}
```

## Implementation Checklist for ScrumQuest Refactoring

### Pre-Refactoring
- [ ] Audit current GameStateManager methods, group by domain (session/estimation/combat)
- [ ] Map current `lobby_updated` broadcasts to specific state changes
- [ ] Document current event flow (client → handler → gameState → broadcast)
- [ ] Create branch protection: require tests to pass before merging

### Phase 1: State Types
- [ ] Define `SessionState`, `EstimationState`, `CombatState` types
- [ ] Create `state/index.ts` with type exports
- [ ] Update `shared/gameEvents.ts` to reference new types
- [ ] Ensure TypeScript compiles, no runtime changes

### Phase 2: Event Bus
- [ ] Implement `EventBus` class with type-safe events
- [ ] Define internal event types in `events/internal.ts`
- [ ] Write unit tests for event pub/sub
- [ ] Add event logging for debugging

### Phase 3: SessionManager
- [ ] Create `SessionManager` class, move player/lobby methods
- [ ] Update socket handlers to call `SessionManager` methods
- [ ] Emit `player_joined`, `player_left`, `host_transferred` events
- [ ] Migrate reconnection logic to `SessionManager`
- [ ] Write integration tests for player lifecycle

### Phase 4: EstimationManager
- [ ] Create `EstimationManager` class, move voting/timer methods
- [ ] Subscribe to `player_joined` events from SessionManager
- [ ] Emit `player_voted`, `consensus_reached`, `timer_expired` events
- [ ] Write integration tests for voting flows

### Phase 5: CombatManager
- [ ] Create `CombatManager` class, move battle/health/position methods
- [ ] Subscribe to `consensus_reached` events from EstimationManager
- [ ] Emit `boss_damaged`, `player_damaged`, `game_over` events
- [ ] Write integration tests for combat flows

### Phase 6: Fine-Grained Events
- [ ] Replace `lobby_updated` with specific events (10-15 event types)
- [ ] Update client to handle new event types
- [ ] Measure bandwidth reduction
- [ ] Add event versioning for future changes

## Sources

This research synthesizes patterns from multiple authoritative sources on real-time game server architecture and domain-driven design:

**Domain-Driven Design for Games:**
- [Why Multiplayer Skill Games Need a Domain-Driven Design](https://hackernoon.com/why-multiplayer-skill-games-need-a-domain-driven-design) (HackerNoon, Feb 2025)
- [Domain-Driven Design in TypeScript](https://ddd.academy/domain-driven-design-in-typescript/) (DDD Academy, 2026)

**Real-Time Architecture Patterns:**
- [Building a Real-Time Multiplayer Game Server with Socket.io and Redis](https://dev.to/dowerdev/building-a-real-time-multiplayer-game-server-with-socketio-and-redis-architecture-and-583m) (DEV Community, 2025)
- [Client-Server Game Architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html) (Gabriel Gambetta)
- [Mastering Multiplayer Game Architecture](https://www.getgud.io/blog/mastering-multiplayer-game-architecture-choosing-the-right-approach/) (Getgud.io)

**Event-Driven & Manager Patterns:**
- [Event Bus pattern](https://ducmanhphan.github.io/2020-06-06-Event-Bus-pattern/)
- [Event Queue - Game Programming Patterns](https://gameprogrammingpatterns.com/event-queue.html)
- [State Pattern - Game Programming Patterns](https://gameprogrammingpatterns.com/state.html)

**Separation of Concerns & Refactoring:**
- [Breaking Down Monolithic Codebases](https://the-pi-guy.com/blog/breaking_down_monolithic_codebases_a_guide_to_refactoring_for_modern_software_development/)
- [Separation of Concerns (SoC)](https://nordicapis.com/separation-of-concerns-soc-the-cornerstone-of-modern-software-development/) (Nordic APIs)
- [5 AI-Powered TypeScript Refactoring Workflows](https://medium.com/@jsmanifest/5-ai-powered-typescript-refactoring-workflows-that-save-hours-169247e42f59) (Medium, Jan 2026)

---

*Architecture research for: ScrumQuest domain-separated refactoring*
*Researched: 2026-02-01*
*Confidence: HIGH - Patterns verified across multiple authoritative sources, combined with analysis of existing ScrumQuest codebase*
