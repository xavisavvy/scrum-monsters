# Phase 2: SessionManager - Research

**Researched:** 2026-02-01
**Domain:** Session/Lobby Lifecycle Management, Player Presence, Reconnection Systems
**Confidence:** HIGH

## Summary

This research investigates extracting player and lobby lifecycle management from the monolithic GameStateManager (2000+ lines in `server/gameState.ts`) into a dedicated SessionManager domain. The current implementation mixes session concerns (player join/leave, host transfer, reconnection) with estimation and combat logic, making the codebase difficult to maintain and test.

The phase requirements are clear: create a SessionManager that handles lobby creation/destruction, player lifecycle (join, leave, reconnect), host transfer, and reconnection tokens. The Phase 1 EventBus infrastructure (`ScopedEventBus`, typed event payloads) is already in place and will be used for cross-domain communication. The existing reconnection system in `gameState.ts` (lines 141-450) provides a working reference implementation.

**Primary recommendation:** Create SessionManager as a class instantiated via dependency injection, owning the `lobbies` Map and `playerToLobby` Map. Use typed exceptions for validation errors (LobbyNotFoundError, LobbyFullError). Emit session domain events (already defined in `eventTypes.ts`) for cross-domain coordination. Migrate existing reconnection token logic directly since it already meets the 5-minute token validity requirement with room to spare (currently 15 minutes).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js EventEmitter (native) | Node 18+ | Internal EventBus (Phase 1) | Already implemented in `server/events/EventBus.ts` |
| crypto (native) | Node 18+ | Token signature (HMAC-SHA256) | Already used in `gameState.ts` for reconnect tokens |
| Socket.IO | 4.8.1 | WebSocket communication | Already integrated, SessionManager emits events but doesn't hold Socket.IO reference |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 3.23.8 | Runtime validation | Already in project for validating session data |
| uuid | 9.x | Player/lobby ID generation | Consider if crypto.randomUUID() insufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom typed exceptions | Result<T, E> pattern | Exceptions cleaner for validation failures; Result pattern adds verbosity for simple cases |
| Map<string, Lobby> | WeakMap or external cache | WeakMap won't work (string keys); external cache adds latency for hot path |
| localStorage (client) | URL-based tokens | localStorage already implemented and working; URL tokens expose reconnect data |

**Installation:**
```bash
# No new dependencies needed for Phase 2
# All required packages already present
```

## Architecture Patterns

### Recommended Project Structure
```
server/
├── domains/                    # NEW: Domain managers
│   └── SessionManager.ts       # This phase
├── events/                     # Phase 1: Already exists
│   ├── EventBus.ts
│   ├── ScopedEventBus.ts
│   ├── eventTypes.ts           # Has session event types already
│   └── index.ts
├── errors/                     # NEW: Typed exceptions
│   └── SessionErrors.ts
├── gameState.ts                # MODIFY: Delegate session methods to SessionManager
└── websocket.ts                # MODIFY: Use SessionManager for session handlers
```

### Pattern 1: SessionManager with Event Emission
**What:** Domain manager that owns session state and emits domain events for cross-domain coordination
**When to use:** Extracting session logic from GameStateManager
**Example:**
```typescript
// server/domains/SessionManager.ts
import { ScopedEventBus } from '../events';
import { Lobby, Player, TeamType, GamePhase } from '../../shared/gameEvents';
import { LobbyNotFoundError, LobbyFullError, PlayerNotFoundError } from '../errors/SessionErrors';

export interface SessionManagerDeps {
  eventBus: ScopedEventBus;
}

export class SessionManager {
  private lobbies = new Map<string, Lobby>();
  private playerToLobby = new Map<string, string>();
  private disconnectedPlayers = new Map<string, DisconnectedPlayer>();
  private reconnectTokens = new Map<string, ReconnectToken>();

  constructor(private deps: SessionManagerDeps) {}

  createLobby(hostName: string, lobbyName: string, options?: CreateLobbyOptions): Lobby {
    const lobbyId = this.generateLobbyId(options?.customLobbyId);
    const hostId = this.generatePlayerId();

    const lobby: Lobby = {
      id: lobbyId,
      name: lobbyName,
      hostId,
      players: [/* ... */],
      gamePhase: 'lobby',
      // ... other fields
    };

    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(hostId, lobbyId);

    // Emit domain event (fire-and-forget)
    this.deps.eventBus.emit('session:player_joined', {
      lobbyId,
      playerId: hostId,
      playerName: hostName
    });

    return lobby;
  }

  joinLobby(lobbyId: string, playerName: string): { lobby: Lobby; player: Player } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new LobbyNotFoundError(lobbyId);
    }

    // ... create player, add to lobby

    this.deps.eventBus.emit('session:player_joined', {
      lobbyId,
      playerId: player.id,
      playerName
    });

    return { lobby, player };
  }

  // Query methods for other domains
  getLobby(lobbyId: string): Lobby | null {
    return this.lobbies.get(lobbyId) ?? null;
  }

  getPlayerLobby(playerId: string): Lobby | null {
    const lobbyId = this.playerToLobby.get(playerId);
    return lobbyId ? this.lobbies.get(lobbyId) ?? null : null;
  }
}
```

### Pattern 2: Typed Exception Hierarchy
**What:** Custom error classes for session validation failures
**When to use:** Replacing null returns with meaningful errors
**Example:**
```typescript
// server/errors/SessionErrors.ts
export class SessionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SessionError';
  }
}

export class LobbyNotFoundError extends SessionError {
  constructor(public lobbyId: string) {
    super(`Lobby not found: ${lobbyId}`, 'LOBBY_NOT_FOUND');
    this.name = 'LobbyNotFoundError';
  }
}

export class LobbyFullError extends SessionError {
  constructor(public lobbyId: string, public maxPlayers: number) {
    super(`Lobby ${lobbyId} is full (max ${maxPlayers} players)`, 'LOBBY_FULL');
    this.name = 'LobbyFullError';
  }
}

export class PlayerNotFoundError extends SessionError {
  constructor(public playerId: string) {
    super(`Player not found: ${playerId}`, 'PLAYER_NOT_FOUND');
    this.name = 'PlayerNotFoundError';
  }
}

export class PlayerNotHostError extends SessionError {
  constructor(public playerId: string) {
    super(`Player ${playerId} is not the host`, 'NOT_HOST');
    this.name = 'PlayerNotHostError';
  }
}

export class ReconnectionFailedError extends SessionError {
  constructor(public reason: 'invalid_token' | 'lobby_closed' | 'grace_expired') {
    super(`Reconnection failed: ${reason}`, 'RECONNECTION_FAILED');
    this.name = 'ReconnectionFailedError';
  }
}
```

### Pattern 3: Reconnection Token System
**What:** Secure token-based session restoration after network interruption
**When to use:** Preserving player identity across disconnections
**Example:**
```typescript
// Based on existing implementation in gameState.ts (lines 171-226)
import { createHmac } from 'crypto';

interface ReconnectToken {
  playerId: string;
  lobbyId: string;
  playerName: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

// Per CONTEXT.md: 5-minute token validity window
private readonly TOKEN_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
private readonly TOKEN_SECRET = process.env.RECONNECT_TOKEN_SECRET || 'scrum-monsters-secret-' + crypto.randomUUID();

generateReconnectToken(playerId: string, lobbyId: string, playerName: string): string {
  const now = Date.now();
  const tokenData = {
    playerId,
    lobbyId,
    playerName,
    issuedAt: now,
    expiresAt: now + this.TOKEN_EXPIRY_TIME
  };

  const tokenPayload = JSON.stringify(tokenData);
  const signature = createHmac('sha256', this.TOKEN_SECRET)
    .update(tokenPayload)
    .digest('hex');

  const token: ReconnectToken = { ...tokenData, signature };
  const tokenString = Buffer.from(JSON.stringify(token)).toString('base64');
  this.reconnectTokens.set(tokenString, token);

  return tokenString;
}

validateReconnectToken(tokenString: string): ReconnectToken | null {
  const token = this.reconnectTokens.get(tokenString);
  if (!token) return null;

  if (Date.now() > token.expiresAt) {
    this.reconnectTokens.delete(tokenString);
    return null;
  }

  // Verify signature
  const { signature, ...tokenData } = token;
  const expectedSignature = createHmac('sha256', this.TOKEN_SECRET)
    .update(JSON.stringify(tokenData))
    .digest('hex');

  if (signature !== expectedSignature) {
    this.reconnectTokens.delete(tokenString);
    return null;
  }

  return token;
}
```

### Pattern 4: Host Transfer with Activity Tracking
**What:** Transfer host privileges based on most recent activity
**When to use:** When host disconnects and grace period expires
**Example:**
```typescript
// Per CONTEXT.md: Most recent activity among remaining players
interface PlayerActivity {
  playerId: string;
  lastActivityAt: number;
}

private playerActivity = new Map<string, number>();

recordPlayerActivity(playerId: string): void {
  this.playerActivity.set(playerId, Date.now());
}

promoteNewHost(lobbyId: string, oldHostId: string): { newHostId: string; newHostName: string } | null {
  const lobby = this.lobbies.get(lobbyId);
  if (!lobby) return null;

  // Get connected players (not in disconnectedPlayers)
  const connectedPlayers = lobby.players.filter(
    p => p.id !== oldHostId && !this.disconnectedPlayers.has(p.id)
  );

  if (connectedPlayers.length === 0) return null;

  // Sort by most recent activity (descending)
  const sortedByActivity = connectedPlayers.sort((a, b) => {
    const aActivity = this.playerActivity.get(a.id) ?? 0;
    const bActivity = this.playerActivity.get(b.id) ?? 0;
    return bActivity - aActivity;
  });

  const newHost = sortedByActivity[0];

  // Update host
  const oldHost = lobby.players.find(p => p.id === oldHostId);
  if (oldHost) oldHost.isHost = false;
  newHost.isHost = true;
  lobby.hostId = newHost.id;

  this.deps.eventBus.emit('session:host_changed', {
    lobbyId,
    oldHostId,
    newHostId: newHost.id
  });

  return { newHostId: newHost.id, newHostName: newHost.name };
}
```

### Pattern 5: Disconnected Player Visual State
**What:** Emit events that trigger "grayed out with reconnecting..." UI state
**When to use:** When player disconnects but grace period is active
**Example:**
```typescript
// Server emits state change, client handles visual representation
handlePlayerDisconnect(playerId: string): DisconnectedPlayer | null {
  const lobbyId = this.playerToLobby.get(playerId);
  if (!lobbyId) return null;

  const lobby = this.lobbies.get(lobbyId);
  if (!lobby) return null;

  const player = lobby.players.find(p => p.id === playerId);
  if (!player) return null;

  const disconnectedPlayer: DisconnectedPlayer = {
    playerId,
    lobbyId,
    playerName: player.name,
    disconnectedAt: Date.now(),
    graceExpiresAt: Date.now() + this.DISCONNECT_GRACE_PERIOD,
    lastKnownPosition: lobby.playerPositions[playerId],
    lastKnownCombatState: lobby.playerCombatStates[playerId]
  };

  this.disconnectedPlayers.set(playerId, disconnectedPlayer);

  // Emit event for client to show "reconnecting" state
  // Client interprets: grayed out avatar with subtle indicator
  this.deps.eventBus.emit('session:player_disconnected', {
    lobbyId,
    playerId,
    playerName: player.name,
    graceExpiresAt: disconnectedPlayer.graceExpiresAt
  });

  return disconnectedPlayer;
}
```

### Anti-Patterns to Avoid
- **Holding Socket.IO reference in SessionManager:** SessionManager emits domain events; a separate layer (websocket.ts or presenter) translates to Socket.IO events
- **Returning null for validation failures:** Use typed exceptions; null returns obscure the failure reason
- **Storing full state snapshots in reconnect tokens:** Token contains IDs only; state is retrieved from SessionManager
- **Mixing session concerns with estimation/combat:** Keep SessionManager focused on player presence and lobby lifecycle
- **Immediate player removal on disconnect:** Always use grace period pattern from CONTEXT.md

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token signatures | Custom encoding | crypto.createHmac | Already used in existing code; battle-tested, secure |
| ID generation | Custom random strings | crypto.randomUUID() or existing pattern | Existing `Math.random().toString(36)` is fine for non-security-critical IDs |
| Reconnection UI state | Custom disconnect indicators | Leverage existing DisconnectedPlayer type | Already defined in shared/gameEvents.ts |
| Grace period watchdog | Custom interval management | Existing setInterval pattern | Current `processDisconnectedPlayers()` pattern works well |

**Key insight:** The existing reconnection system in gameState.ts (lines 141-450) is well-designed and meets requirements. The task is extraction and refactoring, not reimplementation.

## Common Pitfalls

### Pitfall 1: State Mutation During Extraction
**What goes wrong:** Modifying lobby/player state while iterating or during async operations causes race conditions.
**Why it happens:** Multiple handlers may trigger SessionManager methods concurrently.
**How to avoid:**
- Use immutable update patterns for lobby/player modifications
- Complete state mutations before emitting events
- Consider Immer if nested updates become complex
**Warning signs:**
- Players appearing/disappearing unexpectedly
- Host transfer happening multiple times
- Reconnection restoring stale state

### Pitfall 2: Memory Leaks from Orphaned Listeners
**What goes wrong:** SessionManager registers event listeners that aren't cleaned up when lobbies are destroyed.
**Why it happens:** Forgetting to call `cleanupScope(lobbyId)` or using `on()` instead of `subscribeScoped()`.
**How to avoid:**
- Always use `subscribeScoped(lobbyId, ...)` for lobby-specific listeners
- Call `cleanupScope(lobbyId)` in `destroyLobby()` method
- Monitor `getTotalScopedListenerCount()` in development
**Warning signs:**
- Node.js "MaxListenersExceededWarning" in logs
- Memory usage growing over time
- Old lobby IDs appearing in logs after destruction

### Pitfall 3: Token Expiry Race Conditions
**What goes wrong:** Player reconnects at exactly the moment token expires, leading to inconsistent state.
**Why it happens:** Token validation and session restoration aren't atomic.
**How to avoid:**
- Validate token freshness immediately before any state changes
- Delete token from map before processing (single use)
- Generate new token after successful reconnection
**Warning signs:**
- Player successfully reconnects but isn't added to lobby
- Duplicate reconnection attempts for same player
- Token validation passing but restoration failing

### Pitfall 4: Host Transfer During Reconnection
**What goes wrong:** Original host reconnects after transfer, leading to two hosts or privilege conflicts.
**Why it happens:** Per CONTEXT.md: "Original host regains privileges if they reconnect after transfer" - but this needs careful handling.
**How to avoid:**
- Store `wasHost` flag in DisconnectedPlayer record
- On reconnection, check if original host and current host differs
- Emit `session:host_changed` event to notify current host of transfer back
**Warning signs:**
- Two players with `isHost: true` in same lobby
- Host-only actions available to wrong player
- Settings changes by non-host succeeding

### Pitfall 5: Circular Dependency Between Domains
**What goes wrong:** SessionManager needs to know about combat state, combat needs session info, creating import cycles.
**Why it happens:** Eager coupling during extraction instead of using events.
**How to avoid:**
- SessionManager owns only session state (players, teams, phase, presence)
- Other domains query SessionManager via methods, not direct Map access
- Cross-domain coordination happens through EventBus
**Warning signs:**
- TypeScript import errors
- Runtime circular dependency warnings
- Need to pass combat/estimation state into SessionManager methods

## Code Examples

### Example 1: SessionManager Initialization and Dependency Injection
```typescript
// server/domains/index.ts
import { ScopedEventBus } from '../events';
import { SessionManager } from './SessionManager';

// Create shared EventBus instance
const eventBus = new ScopedEventBus();

// Inject into SessionManager
const sessionManager = new SessionManager({ eventBus });

// Export for use in websocket handlers
export { eventBus, sessionManager };
```

### Example 2: Socket Handler Delegation
```typescript
// server/websocket.ts - Modified pattern
import { sessionManager, eventBus } from './domains';
import { LobbyNotFoundError, PlayerNotHostError } from './errors/SessionErrors';

socket.on('join_lobby', ({ lobbyId, playerName }) => {
  try {
    const { lobby, player } = sessionManager.joinLobby(lobbyId, playerName);

    socket.data.playerId = player.id;
    socket.data.lobbyId = lobby.id;
    socket.join(lobby.id);

    // Generate reconnect token
    const reconnectToken = sessionManager.generateReconnectToken(
      player.id, lobby.id, player.name
    );

    socket.emit('lobby_joined', { lobby, player });
    socket.emit('lobby_sync', {
      lobby,
      yourPlayer: player,
      reconnectToken,
      pendingActions: {},
      stateChanges: {}
    });

    socket.to(lobby.id).emit('player_joined', { player, lobby });
    socket.to(lobby.id).emit('lobby_updated', { lobby });

  } catch (error) {
    if (error instanceof LobbyNotFoundError) {
      socket.emit('game_error', { message: 'Lobby not found' });
    } else {
      socket.emit('game_error', { message: 'Failed to join lobby' });
    }
  }
});
```

### Example 3: Testing SessionManager
```typescript
// server/domains/SessionManager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from './SessionManager';
import { ScopedEventBus } from '../events';
import { LobbyNotFoundError } from '../errors/SessionErrors';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let eventBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
  });

  describe('createLobby', () => {
    it('should create a lobby and emit player_joined event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const lobby = sessionManager.createLobby('TestHost', 'TestLobby');

      expect(lobby.name).toBe('TestLobby');
      expect(lobby.players).toHaveLength(1);
      expect(lobby.players[0].isHost).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith('session:player_joined', {
        lobbyId: lobby.id,
        playerId: lobby.hostId,
        playerName: 'TestHost'
      });
    });
  });

  describe('joinLobby', () => {
    it('should throw LobbyNotFoundError for invalid lobbyId', () => {
      expect(() => sessionManager.joinLobby('invalid-id', 'Player'))
        .toThrow(LobbyNotFoundError);
    });

    it('should add player to existing lobby', () => {
      const lobby = sessionManager.createLobby('Host', 'Lobby');
      const { player } = sessionManager.joinLobby(lobby.id, 'NewPlayer');

      expect(player.name).toBe('NewPlayer');
      expect(player.isHost).toBe(false);
      expect(sessionManager.getLobby(lobby.id)?.players).toHaveLength(2);
    });
  });

  describe('reconnection', () => {
    it('should generate and validate reconnect tokens', () => {
      const lobby = sessionManager.createLobby('Host', 'Lobby');
      const token = sessionManager.generateReconnectToken(
        lobby.hostId, lobby.id, 'Host'
      );

      const validated = sessionManager.validateReconnectToken(token);
      expect(validated).not.toBeNull();
      expect(validated?.playerId).toBe(lobby.hostId);
    });

    it('should reject expired tokens', async () => {
      // Override TOKEN_EXPIRY_TIME for testing
      const lobby = sessionManager.createLobby('Host', 'Lobby');
      const token = sessionManager.generateReconnectToken(
        lobby.hostId, lobby.id, 'Host'
      );

      // Fast-forward time (would need vi.useFakeTimers)
      vi.useFakeTimers();
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

      const validated = sessionManager.validateReconnectToken(token);
      expect(validated).toBeNull();

      vi.useRealTimers();
    });
  });
});
```

### Example 4: Client-Side Token Storage (Existing Pattern)
```typescript
// client/src/lib/stores/useWebSocket.tsx - Already implemented
// Token is stored in localStorage and used for auto-reconnection

const RECONNECT_TOKEN_KEY = 'scrum-monsters-reconnect-token';

const storeReconnectToken = (token: string) => {
  try {
    localStorage.setItem(RECONNECT_TOKEN_KEY, token);
  } catch (error) {
    console.warn('Failed to store reconnect token:', error);
  }
};

// On lobby_sync event, token is automatically stored
socket.on('lobby_sync', (lobbySync: LobbySync) => {
  storeReconnectToken(lobbySync.reconnectToken);
  // ...
});

// On connect, auto-attempt reconnection if token exists
socket.on('connect', () => {
  const storedToken = getStoredReconnectToken();
  if (storedToken && lastLobbySnapshot) {
    socket.emit('reconnect_with_token', { reconnectToken: storedToken });
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic GameStateManager | Domain-specific managers with EventBus | This refactor | Testability, maintainability, separation of concerns |
| Null returns for errors | Typed exception hierarchy | Industry standard | Clear error handling, better debugging |
| Immediate disconnect removal | Grace period with reconnection tokens | Already implemented | Better UX during network interruptions |
| First-joined host selection | Activity-based host transfer | CONTEXT.md decision | Rewards engaged players |

**Deprecated/outdated:**
- **Returning null for validation failures:** Use typed exceptions for clarity
- **Direct Socket.IO emission from domain managers:** Use EventBus for decoupling

## Open Questions

1. **Timer Ownership During Phase Transition**
   - What we know: ARCH-10 mentions "migrate timer ownership to respective domain managers"
   - What's unclear: Whether voting/discussion timers should stay with SessionManager or move to EstimationManager
   - Recommendation: SessionManager tracks phase, EstimationManager owns voting timer - clearer separation

2. **Player State Serialization for Disconnected Players**
   - What we know: `lastKnownCombatState` and `lastKnownPosition` are preserved
   - What's unclear: Whether to serialize full combat state or just reference IDs
   - Recommendation: Store snapshot (current approach works); CombatManager can provide fresh state on reconnect

3. **Lobby Settings Modification**
   - What we know: CONTEXT.md says "Host can modify lobby settings until game starts"
   - What's unclear: Which settings (max players, game mode) SessionManager should own vs delegate
   - Recommendation: SessionManager owns maxPlayers, gameMode; other settings (timer, estimation scale) owned by respective domains

4. **Cross-Device Reconnection**
   - What we know: CONTEXT.md lists this as Claude's discretion
   - What's unclear: Whether token should be transferable across devices
   - Recommendation: Current localStorage approach is single-device; could extend to URL-based if needed later

## Sources

### Primary (HIGH confidence)
- `server/gameState.ts` - Existing implementation (lines 1-2008), reference for extraction
- `server/events/eventTypes.ts` - Session event types already defined
- `server/events/ScopedEventBus.ts` - Memory leak prevention pattern from Phase 1
- `shared/gameEvents.ts` - TypeScript interfaces for Player, Lobby, ReconnectToken
- `client/src/lib/stores/useWebSocket.tsx` - Client-side reconnection implementation

### Secondary (MEDIUM confidence)
- `.planning/phases/02-sessionmanager/02-CONTEXT.md` - User decisions and constraints
- `.planning/phases/01-foundation/01-RESEARCH.md` - EventBus patterns and prior art
- Phase 1 decisions on event naming, scoped subscriptions, cleanup contracts

### Tertiary (LOW confidence)
- General TypeScript error handling patterns - validated against existing codebase style

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, no new dependencies
- Architecture: HIGH - Extraction from working code with clear patterns from Phase 1
- Pitfalls: HIGH - Based on actual code review of existing implementation
- Reconnection system: HIGH - Existing implementation meets requirements, needs minimal changes

**Research date:** 2026-02-01
**Valid until:** 2026-04-01 (60 days - extraction from existing code, patterns stable)
