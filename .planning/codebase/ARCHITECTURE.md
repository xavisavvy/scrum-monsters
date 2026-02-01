# Architecture

**Analysis Date:** 2026-02-01

## Pattern Overview

**Overall:** Client-Server Real-Time Game Architecture with Three Layers

**Key Characteristics:**
- Full-stack TypeScript ensures type safety across client and server
- Socket.IO-driven real-time multiplayer synchronization
- Centralized game state management on server with in-memory + Redis caching
- Zustand stores on client for UI-driven state
- React Three Fiber for 3D graphics and battle visualization
- Vite-powered development with React 18

## Layers

**Presentation Layer (Client):**
- Purpose: React UI components with Zustand state management and WebSocket event listening
- Location: `client/src/components`, `client/src/lib/stores`
- Contains: Phase-specific screens, UI components, input handlers, animations
- Depends on: Shared types (`shared/gameEvents.ts`), Socket.IO events
- Used by: Browser users via Vite dev server or built static assets

**Business Logic / Game State Layer (Server):**
- Purpose: Centralized game state machine, validation, and turn-based coordination
- Location: `server/gameState.ts` (singleton GameStateManager)
- Contains: Lobby creation/joining, phase progression, combat resolution, consensus calculation, revival mechanics
- Depends on: Socket.IO for event emission, Redis for caching, storage abstraction
- Used by: WebSocket handlers in `server/websocket.ts`

**Real-Time Communication Layer (Socket.IO):**
- Purpose: Event-driven messaging between client and server
- Location: `server/websocket.ts`
- Contains: Socket event handlers, lobby room management, state broadcasts
- Depends on: GameState, Express session middleware
- Used by: Client listeners in stores and components

**Data Persistence Layer:**
- Purpose: Optional database and caching
- Location: `server/storage.ts` (abstraction), `server/redis.ts` (Upstash Redis), `shared/schema.ts` (Drizzle ORM)
- Contains: User profiles, authentication, gameplay stats, estimation history
- Depends on: PostgreSQL (optional), Upstash Redis (optional)
- Used by: Auth routes, session store

## Data Flow

**Lobby Creation & Join Flow:**

1. Client: User clicks "Create Lobby" → sends `create_lobby` event
2. Server: `gameState.createLobby()` creates Lobby instance, stores in Map<string, Lobby>
3. Server: Emit `lobby_created` event with invite link
4. Client: Navigate to lobby view, establish player-socket mapping
5. Server: `io.to(lobbyId)` rooms allow selective broadcasting

**Battle Phase Flow:**

1. Client: Player votes on story points during `battle` phase, sends `submit_score` event
2. Server: `gameState.submitScore()` updates player.currentScore, checks voting completion via `checkVotingCompletion()`
3. Server: When threshold met (all submitted OR 75% after 30s), auto-advance to `reveal` phase
4. Server: `gameState.revealScores()` calculates team consensus and emits `scores_revealed`
5. Client: Display consensus on voting reveal screen; allow discussion phase votes
6. Server: Monitor `update_discussion_vote` events; when teams agree on same score, start consensus countdown
7. Server: After 5-second countdown, `completeConsensus()` damages boss, progresses to next ticket or victory

**Combat Resolution (Boss Damage):**

1. Client: Player clicks attack button, sends `attack_boss` event with damage amount
2. Server: `gameState.attackBoss()` calculates:
   - Developers/QA deal 15 - (modifier) damage (min 1)
   - Spectators heal boss for 1 + (modifier) HP
   - Modifier increases every 10 seconds into battle
3. Server: Check if boss health ≤ 0, trigger ring attack (15% or when health < 30%)
4. Server: Emit `boss_attacked` or `boss_healed`, `modifier_updated`, `boss_ring_attack`, `lobby_updated`
5. Client: Animate projectiles, update health bars, sync modifier display

**Reconnection Flow:**

1. Client disconnect: Server detects via socket disconnect event
2. Server: `handlePlayerDisconnect()` stores DisconnectedPlayer record, generates reconnect token (signed JWT-like token in base64)
3. Server: Grace period = 10 minutes; if host disconnects, immediately promote new host
4. Client (on reconnect): Send `reconnect_with_token` event
5. Server: `attemptPlayerReconnect()` validates token signature, restores player state, position, combat state
6. Server: Return `reconnect_response` with fresh LobbySync and new token for next potential disconnect

**State Sync Strategy:**

- Server-side: After every mutation, emit `lobby_updated` to room (all players in same lobby see consistent state)
- Client-side: Zustand stores (`useGameState`, `useWebSocket`) subscribe to `lobby_updated` events
- Caching: If Redis available, `cacheLobby()` persists lobby snapshot (for potential multi-server future)
- Fallback: In-memory Map storage if no database or Redis

## Key Abstractions

**GameStateManager (Singleton):**
- Purpose: Single source of truth for all lobby and game states
- Examples: `server/gameState.ts` exported singleton `gameState`
- Pattern: In-memory state store with time-based watchdogs for cleanup (revival, disconnect grace periods, voting timeouts)
- Methods: `createLobby()`, `joinLobby()`, `submitScore()`, `revealScores()`, `checkDiscussionConsensus()`, `attackBoss()`, etc.

**Lobby (Type Definition):**
- Purpose: Encapsulates all state for a single game session
- Examples: `shared/gameEvents.ts` interface Lobby
- Pattern: Immutable contract between client and server; both refer to same interface
- Fields: players array, teams object, gamePhase state machine, boss combat state, completed tickets, player positions, consensus countdown

**WebSocket Room Grouping:**
- Purpose: Socket.IO rooms enable efficient broadcasting within lobbies
- Examples: `socket.join(lobby.id)` and `io.to(lobby.id).emit(...)`
- Pattern: Each lobby ID becomes a socket.io room name; only players in that lobby receive events for that lobby

**TeamStatsManager:**
- Purpose: Calculate and update team competition metrics
- Location: `server/teamStatsManager.ts`
- Pattern: Tracks story points, consensus rate, accuracy, achievements per team per lobby

**Zustand Stores (Client):**
- Purpose: React state management with selector-based subscription
- Examples: `useGameState`, `useWebSocket`, `useAudio`, `useAuth`
- Pattern: SubscribeWithSelector middleware allows components to re-render only on relevant state changes

## Entry Points

**Server Entry Point:**
- Location: `server/index.ts`
- Triggers: `npm run dev` starts on port 5000
- Responsibilities:
  1. Initialize Express app with session middleware
  2. Configure Passport OAuth (optional auth)
  3. Initialize Redis connection (optional caching)
  4. Register routes (`registerRoutes()` sets up HTTP handlers and WebSocket)
  5. Set up Vite in development mode
  6. Start HTTP server with graceful shutdown handling

**WebSocket Setup:**
- Location: `server/websocket.ts` (`setupWebSocket()` function)
- Triggers: Called by `registerRoutes()`
- Responsibilities:
  1. Initialize Socket.IO with Replit-optimized timeouts
  2. Share Express session middleware with Socket.IO for authenticated user detection
  3. Attach GameState singleton to IO for event emission
  4. Listen for all client events (create_lobby, join_lobby, submit_score, etc.)
  5. Emit state updates and game events back to clients

**Client Entry Point:**
- Location: `client/src/main.tsx`
- Triggers: Vite dev server or production build
- Responsibilities:
  1. Render React root to #root element
  2. Mount App component which manages global state and page navigation

**App Component:**
- Location: `client/src/App.tsx`
- Triggers: Renders on mount
- Responsibilities:
  1. Manage app state (landing, lobby, battle, avatar selection, etc.)
  2. Initialize WebSocket connection via `useWebSocket()`
  3. Handle phase transitions and route state to appropriate component
  4. Manage audio, authentication, and UI overlays (reconnection dialog, error notifications)

## Error Handling

**Strategy:** Server validates all state transitions; client displays errors via toast notifications

**Patterns:**

- **Invalid State Transition**: Server returns null if operation not allowed (e.g., submitting score outside battle phase)
  - Example: `submitScore()` checks `if (!lobby || lobby.gamePhase !== 'battle') return null`
  - Client: Displays toast error if operation fails

- **Network Errors**: WebSocket auto-reconnects with exponential backoff
  - Location: `client/src/lib/stores/useWebSocket.tsx`
  - Emits `connection_lost` event; client shows reconnection UI

- **Invalid Reconnect Token**: Server validates token signature and expiry
  - Returns `ReconnectResponse` with result code (invalid_token, grace_expired, etc.)
  - Client: Displays appropriate error message

- **Boss Defeat State**: Consensus phase validates both teams exist and agree
  - If consensus reached: `completeConsensus()` sets boss health to 0
  - Triggers `boss_defeated` event or auto-progression to next level

## Cross-Cutting Concerns

**Logging:**
- Server: Console logs with emoji prefixes (🎮, ✅, ❌, 👁️, ⚔️, 💫, 💀, etc.)
- Client: Browser DevTools console via Zustand + socket event handlers
- Health check: `/api/health` and `/api/ws-health` endpoints

**Validation:**
- Server: Type checking via TypeScript + runtime guards (null checks, team validation)
- Client: Zustand state as single source of truth for UI consistency
- Shared: TypeScript interfaces in `shared/gameEvents.ts` ensure contract compliance

**Authentication:**
- Passport.js with OAuth (Google, GitHub) + optional local accounts
- Session stored in PostgreSQL (with fallback to in-memory)
- Socket.IO extracts user from session middleware for authenticated user detection

**Performance Optimization:**
- Replit-specific timeout tuning (90s ping timeout vs 60s local)
- Redis caching for lobbies (optional; in-memory fallback)
- Socket.IO transports: WebSocket preferred, polling fallback
- Throttled player position broadcasts (client-driven)

---

*Architecture analysis: 2026-02-01*
