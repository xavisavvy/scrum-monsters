# Codebase Structure

**Analysis Date:** 2026-02-01

## Directory Layout

```
ScrumQuest/
├── client/                      # React frontend (Vite + React Three Fiber)
│   ├── public/                  # Static assets
│   │   ├── fonts/               # Custom fonts
│   │   ├── images/              # Sprite sheets, boss assets, avatar images
│   │   ├── models/              # 3D models for Three.js
│   │   ├── sounds/              # Audio files (background music, SFX)
│   │   └── textures/            # Texture maps for 3D objects
│   ├── src/
│   │   ├── main.tsx             # React entry point
│   │   ├── App.tsx              # Root component with app state machine
│   │   ├── index.css            # Global styles
│   │   ├── components/          # React components by domain
│   │   │   ├── auth/            # OAuth login, user menu
│   │   │   ├── game/            # Game phase components
│   │   │   │   ├── phases/      # Phase-specific screens (battle, voting, discussion)
│   │   │   │   ├── BattleScreen.tsx
│   │   │   │   ├── Lobby.tsx
│   │   │   │   ├── AvatarSelection.tsx
│   │   │   │   └── ...
│   │   │   ├── marketing/       # Landing, About, Features pages
│   │   │   └── ui/              # Reusable UI (buttons, modals, overlays)
│   │   ├── lib/
│   │   │   ├── stores/          # Zustand state stores
│   │   │   │   ├── useGameState.tsx    # Game state (lobby, player, boss)
│   │   │   │   ├── useWebSocket.tsx    # Socket.IO connection & events
│   │   │   │   ├── useAudio.tsx        # Audio playback state
│   │   │   │   ├── useAuth.tsx         # User authentication state
│   │   │   │   └── useGame.tsx         # Game-specific helpers
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   └── utils/           # Utilities (UUID gen, storage, helpers)
│   │   ├── hooks/               # Additional custom hooks
│   │   ├── pages/               # Page components (not-found)
│   │   ├── styles/              # CSS modules and stylesheets
│   │   └── test/                # Test setup & fixtures
│   ├── vite.config.ts           # Vite build configuration
│   └── package.json             # Frontend dependencies
│
├── server/                      # Express backend (TypeScript)
│   ├── index.ts                 # Entry point: Express app setup
│   ├── routes.ts                # Route registration (auth, health checks)
│   ├── websocket.ts             # Socket.IO setup & event handlers
│   ├── gameState.ts             # Central game state manager (2000+ lines)
│   ├── socketHandlers.ts        # WebSocket event handlers (optional split)
│   ├── storage.ts               # Database abstraction layer
│   ├── redis.ts                 # Redis/Upstash connection & helpers
│   ├── vite.ts                  # Vite integration for dev/prod
│   ├── teamStatsManager.ts      # Team metrics calculation
│   ├── auth/
│   │   ├── passport.ts          # Passport.js OAuth configuration
│   │   ├── routes.ts            # Auth endpoints (login, logout, callback)
│   │   └── profileRoutes.ts     # User profile endpoints
│   └── package.json             # Backend dependencies (shared)
│
├── shared/                      # Shared types & contracts
│   ├── gameEvents.ts            # Type definitions for WebSocket events
│   │                            # - ClientToServerEvents interface
│   │                            # - ServerToClientEvents interface
│   │                            # - Game domain types (Lobby, Player, Boss, etc.)
│   │                            # - Enums (GamePhase, TeamType, AvatarClass)
│   └── schema.ts                # Drizzle ORM schema (database tables)
│                                # - users, oauthAccounts, userProfiles
│                                # - userStats, estimationHistory, sessions
│
├── .planning/
│   └── codebase/                # GSD codebase analysis documents
│       ├── ARCHITECTURE.md      # Architecture patterns & layers
│       ├── STRUCTURE.md         # This file
│       ├── STACK.md             # Technology stack
│       ├── INTEGRATIONS.md      # External services
│       ├── CONVENTIONS.md       # Code style & patterns
│       ├── TESTING.md           # Test structure & patterns
│       └── CONCERNS.md          # Tech debt & issues
│
├── docs/                        # User documentation
│   ├── contributing/
│   ├── deployment/
│   └── features/
│
├── .github/
│   ├── workflows/               # GitHub Actions CI/CD pipelines
│   ├── ISSUE_TEMPLATE/
│   └── DISCUSSION_TEMPLATE/
│
├── .husky/                      # Git hooks (commitlint, pre-commit)
├── package.json                 # Monorepo root (workspaces)
├── tsconfig.json                # Root TypeScript config
├── vite.config.ts               # Root Vite config (if shared)
├── CLAUDE.md                    # Project instructions for Claude
└── README.md                    # Project overview
```

## Directory Purposes

**client/src/components/auth:**
- Purpose: OAuth login flow, user profile menu, authentication UI
- Contains: UserMenu, OAuth provider buttons, logout handlers
- Key files: `UserMenu.tsx`, login components
- Pattern: Hooks into `useAuth` store for user state

**client/src/components/game:**
- Purpose: Game phase and gameplay screens
- Contains: Lobby social space, voting screens, boss battle UI, avatar selection
- Key files: `BattleScreen.tsx`, `Lobby.tsx`, `AvatarSelection.tsx`, phase-specific components
- Pattern: Subscribe to `useGameState` for lobby/player/boss state; emit socket events on user actions

**client/src/components/game/phases:**
- Purpose: Screens for each game phase (battle, scoring, reveal, discussion, victory)
- Contains: Phase-specific UI layouts and controls
- Pattern: One component per phase; manages phase-specific event handlers

**client/src/components/ui:**
- Purpose: Reusable UI primitives and overlays
- Contains: RetroButton, modals, error boundaries, connection indicators, reconnection dialog
- Pattern: Pure presentational; receive data via props, emit callbacks

**client/src/components/marketing:**
- Purpose: Public-facing pages (landing, features, pricing, support)
- Contains: Feature showcases, pricing table, contact links
- Pattern: Static or CMS-driven content

**client/src/lib/stores:**
- Purpose: Zustand state stores for client-side state management
- Contains: Game state, WebSocket connection, audio playback, authentication
- Key files:
  - `useGameState.tsx`: `{ currentLobby, currentPlayer, currentBoss, error, ...actions }`
  - `useWebSocket.tsx`: `{ socket, isConnected, reconnection, connect, disconnect }`
  - `useAudio.tsx`: `{ isMuted, playSound, fadeInMusic, ...audio controls }`
  - `useAuth.tsx`: `{ user, isAuthenticated, login, logout }`
- Pattern: `create()` with optional middleware (subscribeWithSelector); selectors for granular re-renders

**server:**
- Purpose: Game backend and real-time coordination
- Core files:
  - `gameState.ts`: GameStateManager singleton (2000+ lines)
    - Lobby management: create, join, remove
    - Game phase progression & state validation
    - Combat: boss attacks, player attacks, revival, healing
    - Voting & consensus: track scores, check completion, count-down
    - Reconnection: token generation, grace period tracking
  - `websocket.ts`: Socket.IO server setup and event handlers (~1000+ lines)
    - Event handlers for each client event
    - Room management and broadcasting
    - Disconnect handling with reconnection flow
  - `routes.ts`: Express route registration
  - `storage.ts`: Database abstraction (lobby caching, user stats)
  - `redis.ts`: Upstash Redis client (optional caching layer)
  - `teamStatsManager.ts`: Team metrics calculation

**server/auth:**
- Purpose: User authentication (OAuth + optional local accounts)
- Files:
  - `passport.ts`: Passport.js strategy configuration (Google, GitHub)
  - `routes.ts`: Login, logout, OAuth callback endpoints
  - `profileRoutes.ts`: User profile CRUD endpoints

**shared:**
- Purpose: Type contracts and data model definitions
- Files:
  - `gameEvents.ts`: Complete WebSocket event type definitions
    - ClientToServerEvents: all events client can send
    - ServerToClientEvents: all events server can broadcast
    - Domain types: Lobby, Player, Boss, GamePhase, TeamType, etc.
    - Estimation scales and character stats
  - `schema.ts`: Drizzle ORM database schema
    - User accounts, profiles, stats
    - OAuth account links
    - Session persistence table

## Key File Locations

**Entry Points:**
- `server/index.ts`: Server initialization, Express app setup, port 5000 listener
- `client/src/main.tsx`: React DOM root render
- `client/src/App.tsx`: App state machine and component routing
- `server/websocket.ts` (exported `setupWebSocket`): Socket.IO initialization

**Configuration:**
- `server/gameState.ts`: All game logic and state mutations
- `client/src/lib/stores/useGameState.tsx`: UI state store
- `shared/gameEvents.ts`: Type contracts for Socket.IO events
- `shared/schema.ts`: Drizzle ORM table definitions

**Core Logic:**
- `server/gameState.ts`: Game state manager (createLobby, submitScore, revealScores, etc.)
- `server/websocket.ts`: Socket.IO handlers (create_lobby, join_lobby, attack_boss, etc.)
- `client/src/components/game/BattleScreen.tsx`: Battle UI and combat interaction
- `client/src/components/game/Lobby.tsx`: Lobby social space

**Testing:**
- `client/src/test/setup.ts`: Vitest + happy-dom configuration
- Test files co-located: `**/*.test.ts`, `**/*.spec.ts`

## Naming Conventions

**Files:**
- Components: PascalCase (e.g., `BattleScreen.tsx`, `UserMenu.tsx`)
- Utilities: camelCase (e.g., `lastLobbyStorage.ts`, `validation.ts`)
- Hooks: `use` prefix, camelCase (e.g., `useGameState.tsx`, `useWebSocket.tsx`)
- Server handlers: `handlers.ts` or domain-named files
- Tests: `ComponentName.test.tsx` or `utility.test.ts`

**Directories:**
- Features: plural, lowercase (e.g., `components`, `stores`, `utils`, `hooks`)
- Domains: feature-based, plural (e.g., `auth`, `game`, `marketing`)
- Internal structure: follow feature, not file type

**Variables & Functions:**
- Constants: UPPER_SNAKE_CASE (e.g., `DISCONNECT_GRACE_PERIOD`, `TOKEN_EXPIRY_TIME`)
- Functions: camelCase (e.g., `createLobby`, `submitScore`)
- Callbacks: use descriptive names (e.g., `handleSubmitScore`, `onBossAttack`)
- Event handlers: `on` prefix (e.g., `onAttackBoss`, `onJoinLobby`)

## Where to Add New Code

**New Feature (e.g., Achievements System):**
- **Server Logic:**
  - Add achievement types to `shared/gameEvents.ts`
  - Add calculation methods to `server/teamStatsManager.ts`
  - Add DB schema to `shared/schema.ts` (if persistent)
  - Add mutation methods to `server/gameState.ts` (e.g., `checkAchievements()`)
  - Add socket event handler to `server/websocket.ts` (e.g., `socket.on('claim_achievement', ...)`)

- **Client UI:**
  - Add component: `client/src/components/game/Achievements.tsx`
  - Add hook if needed: `client/src/lib/hooks/useAchievements.tsx`
  - Wire to store: Update `useGameState.tsx` to track achievements
  - Wire socket listener: Add in `useWebSocket.tsx` or relevant component
  - Style: Add CSS to `client/src/styles/` or use inline with Tailwind

**New Game Component (e.g., Scoring Screen):**
- Location: `client/src/components/game/ScoringScreen.tsx`
- Steps:
  1. Import types from `shared/gameEvents.ts`
  2. Use `useGameState()` to access current lobby/player
  3. Use `useWebSocket()` to emit events (e.g., `socket.emit('submit_score', ...)`)
  4. Subscribe to relevant socket events in component or via store listener
  5. Add to App.tsx route logic (phase-based rendering)

**New Socket Event (e.g., Chat):**
- Type definition: Add to `shared/gameEvents.ts`
  - Add to `ClientToServerEvents` interface
  - Add to `ServerToClientEvents` interface
- Server handler: Add to `server/websocket.ts`
  - `socket.on('send_chat', ({ message }) => { ... io.to(lobbyId).emit('chat_received', ...) })`
- Server validation: Add permission check if needed (host-only, in-battle-only, etc.)
- Client emitter: Call `socket.emit('send_chat', { message })` from component
- Client listener: Add to `useWebSocket.tsx` socket event listeners

**New API Endpoint (e.g., GET /api/user/stats):**
- Location: Create `server/auth/statsRoutes.ts` or add to `server/auth/profileRoutes.ts`
- Steps:
  1. Import Express types and middleware
  2. Define route handler: `router.get('/stats', authMiddleware, (req, res) => { ... })`
  3. Register in `server/routes.ts`: `app.use('/api/stats', statsRoutes)`
  4. Query database via `storage.ts` abstraction
  5. Return JSON response

**New Shared Type:**
- Location: `shared/gameEvents.ts`
- Pattern:
  - Define TypeScript interface (e.g., `interface Achievement { id: string; name: string; ... }`)
  - Export so both client and server can import
  - If used in socket events, add to ClientToServerEvents or ServerToClientEvents

## Special Directories

**client/public:**
- Purpose: Static assets served directly (sprites, models, sounds, fonts)
- Generated: No (committed source files)
- Committed: Yes (images, models, sounds are versioned)
- Notes: Subdirs organize by asset type (images/bosses, sounds/sfx, textures/tavern)

**node_modules:**
- Purpose: Installed dependencies
- Generated: Yes (from package-lock.json or pnpm-lock.yaml)
- Committed: No (.gitignore)

**dist/ (or build/):**
- Purpose: Production build artifacts
- Generated: Yes (by `npm run build`)
- Committed: No (.gitignore)
- Build command: Vite bundles client + server

**.planning/codebase:**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by `/gsd:map-codebase` orchestrator)
- Committed: Yes (for CI/CD and team reference)
- Contents: ARCHITECTURE.md, STRUCTURE.md, STACK.md, TESTING.md, CONVENTIONS.md, CONCERNS.md, INTEGRATIONS.md

---

*Structure analysis: 2026-02-01*
