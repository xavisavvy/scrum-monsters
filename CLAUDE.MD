# CLAUDE.MD - Development Guide for ScrumQuest

## Project Overview

**ScrumQuest** (formerly "Multiplayer Scrum Poker RPG") is a real-time multiplayer estimation game that gamifies agile story point estimation through JRPG-style boss battles. Players join lobbies, select fantasy avatar classes, and estimate tickets by battling pixel art bosses together.

### Key Characteristics
- **Full-stack TypeScript** application with strict type checking
- **Real-time multiplayer** using Socket.IO for instant synchronization
- **3D graphics** powered by React Three Fiber
- **Retro JRPG aesthetic** with pixel art and nostalgic animations
- **Combat-based gameplay** with HP, damage, revival, and boss mechanics

## Technology Stack

### Frontend (`/client`)
- **React 18.3.1** - Component-based UI with hooks
- **TypeScript 5.6.3** - Strict type checking throughout
- **Vite 6.3.6** - Fast HMR and optimized builds
- **Tailwind CSS 3.4.14** - Utility-first styling with custom retro theme
- **React Three Fiber 8.18.0** - 3D avatar rendering and visual effects
- **Zustand 5.0.3** - Lightweight state management
- **Radix UI** - Accessible component primitives (dialogs, dropdowns, etc.)
- **Socket.IO Client 4.8.1** - Real-time bidirectional communication
- **Framer Motion 11.13.1** - Animation library
- **GSAP 3.12.5** - Advanced animations and tweening

### Backend (`/server`)
- **Express.js 4.21.2** - Web framework and REST API
- **Socket.IO 4.8.1** - WebSocket server for real-time events
- **TypeScript 5.6.3** - Server-side type safety
- **Drizzle ORM 0.39.1** - Type-safe database queries
- **PostgreSQL** via Neon serverless (@neondatabase/serverless 0.10.4)
- **Express Session 1.18.2** - Session management with PostgreSQL store
- **Passport 0.7.0** - Authentication middleware (local strategy)

### Database
- **PostgreSQL** - Primary database (optional, defaults to in-memory)
- **connect-pg-simple 10.0.0** - PostgreSQL session store
- **memorystore 1.6.7** - In-memory session fallback

### Shared (`/shared`)
- Type definitions and interfaces shared between client and server
- WebSocket event contracts
- Game constants and configuration

## Project Structure

```
ScrumQuest/
├── client/                         # Frontend React application
│   ├── public/                     # Static assets
│   │   ├── images/                 # Sprites, textures, UI elements
│   │   ├── sounds/                 # Audio files (SFX, music)
│   │   └── textures/               # Boss sprites and game textures
│   └── src/
│       ├── components/
│       │   ├── game/               # Game-specific components
│       │   │   ├── phases/         # Game phase components (lobby, battle, scoring, etc.)
│       │   │   ├── AvatarSelection.tsx
│       │   │   ├── BattleScreen.tsx
│       │   │   ├── BossDisplay.tsx
│       │   │   ├── Lobby.tsx
│       │   │   └── ...
│       │   └── ui/                 # Reusable UI components (buttons, cards, etc.)
│       ├── lib/
│       │   ├── stores/             # Zustand state stores
│       │   │   ├── useGameStore.tsx
│       │   │   ├── useAudio.tsx
│       │   │   └── ...
│       │   └── utils.ts            # Utility functions
│       ├── hooks/                  # Custom React hooks
│       ├── App.tsx                 # Root component
│       └── main.tsx                # Entry point
│
├── server/                         # Backend Express application
│   ├── index.ts                    # Server entry point, Express setup
│   ├── websocket.ts                # Socket.IO initialization and connection handling
│   ├── socketHandlers.ts           # WebSocket event handlers
│   ├── gameState.ts                # Core game logic and state management
│   ├── teamStatsManager.ts         # Team statistics and performance tracking
│   ├── storage.ts                  # Database/storage abstraction layer
│   ├── routes.ts                   # REST API endpoints
│   └── vite.ts                     # Vite middleware integration
│
├── shared/                         # Shared types and utilities
│   ├── gameEvents.ts               # TypeScript interfaces and WebSocket event definitions
│   └── schema.ts                   # Database schema (Drizzle)
│
├── docs/                           # Extended documentation
│   ├── features/                   # Feature-specific docs
│   ├── deployment/                 # Deployment guides
│   └── contributing/               # Contributor guides
│
├── attached_assets/                # Additional project assets
├── licenses/                       # Third-party licenses
├── commercial/                     # Commercial/proprietary components
│
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite build configuration
├── tailwind.config.ts              # Tailwind CSS configuration
├── drizzle.config.ts               # Drizzle ORM configuration
├── .env                            # Environment variables (gitignored)
├── .env.example                    # Example environment configuration
│
├── README.md                       # User-facing documentation
├── CONTRIBUTING.md                 # Contribution guidelines
├── LICENSE.md                      # License information (AGPL-3.0 + CC BY-NC-ND 4.0)
├── TRADEMARKS.md                   # Trademark information
└── NOTICES.md                      # Legal notices
```

## Core Architecture

### Game Flow

1. **Lobby Creation/Join** (`lobby` phase)
   - Host creates lobby with unique 6-character invite code
   - Players join using invite code
   - Players assigned to teams: Developers, QA, or Spectators

2. **Avatar Selection** (`avatar_selection` phase)
   - Players choose from 10 avatar classes (Warrior, Wizard, Rogue, etc.)
   - Each class has unique stats and specialties
   - 3D avatar preview with character details

3. **Battle Phase** (`battle` phase)
   - Boss spawns with health based on ticket complexity
   - Players attack boss by clicking/tapping
   - Spectators attack other players instead of boss
   - Combat includes: HP, damage, jumping (dodge), revival mechanics
   - Boss fires ring attacks periodically

4. **Scoring Phase** (`scoring` phase)
   - Players submit story point estimates
   - Supports multiple estimation scales: Fibonacci, Doubling, T-Shirt sizes
   - Optional timer for time-boxed estimation

5. **Reveal Phase** (`reveal` phase)
   - All scores revealed simultaneously
   - Consensus checking by team
   - Option to force reveal if not all voted

6. **Discussion Phase** (`discussion` phase)
   - Teams discuss estimates to reach consensus
   - Players can update votes
   - Countdown timer available

7. **Victory/Next Level** (`victory` or `next_level` phase)
   - Boss defeated, ticket completed
   - Team statistics updated
   - Proceed to next ticket or end game

8. **Game Over** (`game_over` phase)
   - All tickets completed or quest abandoned
   - Display team performance statistics
   - Option to restart or return to lobby

### Real-time Communication

**WebSocket Events** (defined in `shared/gameEvents.ts`):

**Client → Server:**
- `create_lobby` - Create new lobby
- `join_lobby` - Join existing lobby
- `select_avatar` - Choose character class
- `start_battle` - Begin battle phase
- `attack_boss` - Deal damage to boss
- `attack_player` - Spectator attacks player
- `player_jump` - Jumping state sync
- `submit_score` - Submit estimation
- `update_discussion_vote` - Change vote during discussion
- `proceed_next_level` - Move to next ticket
- `restart_game` - Start fresh game
- `abandon_quest` - End current game
- `force_reveal` - Reveal votes early
- `reconnect_with_token` - Reconnect after disconnect

**Server → Client:**
- `lobby_created` - Lobby successfully created
- `lobby_joined` - Successfully joined lobby
- `lobby_updated` - Lobby state changed
- `battle_started` - Battle phase began
- `boss_attacked` - Boss took damage
- `boss_ring_attack` - Boss AOE attack
- `player_attacked` - Player took damage
- `boss_defeated` - Boss killed
- `scores_revealed` - Estimation results
- `game_over` - Game ended
- `player_disconnected` - Player left
- `host_transferred` - New host assigned
- `lobby_sync` - Full state synchronization

### State Management

**Client-side (Zustand stores):**
- `useGameStore` - Main game state (lobby, player, phase)
- `useAudio` - Audio playback and settings
- Additional stores for specific features

**Server-side (In-memory):**
- `gameState.ts` - Central game state manager
  - Lobbies map: `Map<lobbyId, Lobby>`
  - Player-to-lobby mapping
  - Combat states, positions, timers
  - Boss management and health
- `teamStatsManager.ts` - Team performance metrics
- `storage.ts` - Database abstraction (PostgreSQL or in-memory)

### Combat System

**Player Combat:**
- Max HP: 100 (configurable)
- Damage: Variable based on class
- States: Active, Downed, Reviving
- Jump: Grants temporary invincibility
- Position tracking: X/Y coordinates
- Proximity-based revival (stand near downed player)

**Boss Combat:**
- Health scales with ticket story points
- Multiple phases (health thresholds)
- Ring attacks: Circular projectile patterns
- Defeated when health reaches 0

**Spectator Mechanics:**
- Cannot attack boss
- Attack nearby Developers/QA players
- Creates strategic interference

### Database Schema

Defined in `shared/schema.ts` using Drizzle ORM:
- Users table (authentication)
- Sessions table (express-session)
- Lobbies (optional persistence)
- Additional tables for statistics/tracking

**Note:** Database is optional. Game defaults to in-memory storage if no `DATABASE_URL` configured.

## Development Workflow

### Setup

```bash
# Install dependencies
npm install

# Environment setup (optional)
cp .env.example .env
# Edit .env with DATABASE_URL and SESSION_SECRET

# Database migrations (if using PostgreSQL)
npm run db:push

# Start development server
npm run dev
```

Server runs on `http://localhost:5000` by default.

### Available Scripts

```bash
npm run dev          # Start dev server with HMR
npm run build        # Production build (client + server)
npm run start        # Start production server
npm run check        # TypeScript type checking
npm run db:push      # Push schema changes to database
```

### Hot Module Replacement

- Vite provides instant HMR for client-side changes
- `tsx` provides automatic server restart on backend changes
- WebSocket connections persist across client HMR

### Testing Multiplayer

1. Start dev server: `npm run dev`
2. Open multiple browser windows/tabs
3. Create lobby in first window (copy invite code)
4. Join lobby from other windows using invite code
5. Test real-time synchronization and combat

## Key Concepts

### Avatar Classes

10 classes available (defined in `shared/gameEvents.ts`):
- **Ranger** - Swift archer (DEX/WIS focus)
- **Rogue** - Stealthy assassin (DEX/CHA focus)
- **Bard** - Musical support (CHA/INT focus)
- **Sorcerer** - Raw magic (INT/CHA focus)
- **Wizard** - Learned spells (INT/WIS focus)
- **Warrior** - Melee fighter (STR/CHA focus)
- **Paladin** - Holy knight (STR/CHA focus)
- **Cleric** - Divine healer (WIS/CHA focus)
- **Oathbreaker** - Fallen paladin (STR/CHA focus)
- **Monk** - Martial artist (DEX/WIS focus)

Each class has unique:
- Color theme
- Character stats (STR, DEX, CON, WIS, INT, CHA)
- Specialties
- Projectile emoji

### Estimation Scales

Three scale types supported:
1. **Fibonacci**: 1, 2, 3, 5, 8, 13, 21, 34, 55
2. **Doubling**: 1, 2, 4, 8, 16, 32, 64, 128, 256
3. **T-Shirt**: XS, S, M, L, XL (mapped to points)

### Team Roles

- **Developers**: Attack boss, estimate tickets
- **QA**: Attack boss, estimate tickets
- **Spectators**: Attack players, don't estimate

### Reconnection System

- Automatic reconnection on disconnect
- Grace period for returning players
- Reconnect tokens for session restoration
- State synchronization on reconnect
- Host migration if host disconnects

## Common Tasks

### Adding a New Avatar Class

1. Add class to `AvatarClass` type in `shared/gameEvents.ts`
2. Add class definition to `AVATAR_CLASSES` object
3. Create/add avatar 3D model assets
4. Update avatar selection UI in `client/src/components/game/AvatarSelection.tsx`
5. Add projectile emoji mapping in battle logic

### Adding a New Boss

1. Add boss sprite to `client/public/textures/`
2. Update boss spawning logic in `server/gameState.ts`
3. Configure boss stats (health, phases, sprite)
4. Implement custom attack patterns if needed

### Modifying Game Phases

1. Game phases defined in `shared/gameEvents.ts` as `GamePhase` type
2. Phase components in `client/src/components/game/phases/`
3. Phase transitions managed in `server/gameState.ts`
4. Add new phase: Update type, create component, add phase logic

### Customizing Audio

1. Add sound files to `client/public/sounds/`
2. Update `client/src/lib/stores/useAudio.tsx`
3. Reference sounds in game components
4. Configure playback triggers

### Adding WebSocket Events

1. Define event interface in `shared/gameEvents.ts`
2. Add to `ClientToServerEvents` or `ServerToClientEvents`
3. Implement handler in `server/socketHandlers.ts`
4. Emit event from client components
5. Listen for event in client components

## Debugging

### Debug Tools

- **Browser DevTools**: Network tab for WebSocket messages
- **Tab Key**: In-game debug overlay (player positions, states)
- **TypeScript Compiler**: `npm run check` for type errors
- **Console Logs**: Server logs in terminal, client logs in browser console

### Common Issues

**WebSocket disconnections:**
- Check network stability
- Verify Socket.IO connection in Network tab
- Review reconnection logic in `websocket.ts`

**State desynchronization:**
- Verify event handlers emit `lobby_updated`
- Check state mutations in `gameState.ts`
- Ensure all state changes broadcast to clients

**Combat bugs:**
- Review combat state in `playerCombatStates` map
- Check position updates in `playerPositions` map
- Verify damage calculations and HP updates

**Performance issues:**
- Profile with React DevTools
- Check Three.js rendering performance
- Review WebSocket event frequency

## Security & Best Practices

### Security Considerations

- **Input Validation**: All user inputs validated on server
- **Authentication**: Passport.js with local strategy
- **Session Management**: Express sessions with secure cookies
- **Database**: Parameterized queries via Drizzle ORM
- **Rate Limiting**: Consider adding for production
- **CORS**: Configure appropriately for production

### Code Style

- **TypeScript**: Strict mode enabled, all code fully typed
- **Formatting**: Follow existing patterns (2-space indentation)
- **Naming**: camelCase for variables/functions, PascalCase for types/components
- **Comments**: Document complex logic, avoid obvious comments
- **Error Handling**: Use try-catch blocks, emit error events to clients

### Performance Guidelines

- **Minimize Re-renders**: Use React.memo, useMemo, useCallback appropriately
- **Optimize WebSocket**: Batch updates when possible, throttle high-frequency events
- **Asset Loading**: Lazy load heavy assets, optimize images
- **State Management**: Keep stores focused, avoid unnecessary global state

## Licensing

**Dual-license structure:**

- **Code** (client, server, shared): **GNU AGPL-3.0-or-later**
  - Open source with copyleft
  - Network use = distribution

- **Assets** (sprites, sounds, images): **CC BY-NC-ND 4.0**
  - Attribution required
  - Non-commercial use only
  - No derivatives

- **Commercial Components**: **Proprietary EULA**
  - Boss packs, integrations, training materials

- **Trademarks**: "Scrum Monsters" and logos are protected

See `LICENSE.md` for complete details.

## Contributing

See `CONTRIBUTING.md` for detailed guidelines.

**Quick tips:**
- Follow TypeScript strict mode
- Test multiplayer functionality in multiple browser instances
- Maintain backward compatibility with existing lobbies/saves
- Document new features and APIs
- Write meaningful commit messages

## Recurring Meeting Rooms

ScrumQuest supports persistent, bookmarkable URLs for recurring scrum sessions. Teams can create custom room URLs that can be reused for daily standups, sprint planning, and other recurring meetings.

### Usage:
```
https://scrummonsters.com/room/daily-standup
https://scrummonsters.com/room/sprint-planning
https://scrummonsters.com/room/team-alpha-retro
```

### Key Features:
- **Bookmarkable URLs**: Same URL for every recurring meeting
- **Custom room IDs**: Memorable names like `daily-standup` or `team-alpha`
- **Automatic favorites**: Most recent rooms saved locally
- **Create or join**: First person creates, others join
- **No authentication**: Anyone with the URL can access

See `docs/features/RECURRING_ROOMS.md` for complete documentation, including implementation details and usage examples.

## Replit Deployment

This project is optimized for deployment on Replit with autoscale configuration. See `docs/deployment/REPLIT_DEPLOYMENT.md` for detailed information.

### Key Replit Features:
- **Adaptive timeouts**: Automatically increases timeouts when running on Replit (90s ping timeout vs 60s local)
- **Connection monitoring**: Logs connection stats every 5 minutes
- **Health checks**: `/api/health` and `/api/ws-health` endpoints
- **Enhanced reconnection**: 12 attempts with exponential backoff (handles container sleep/wake)
- **Transport fallback**: WebSocket with polling fallback for proxy compatibility

### Quick Replit Setup:
1. Fork project on Replit
2. Set Secrets: `SESSION_SECRET`, `ALLOWED_ORIGINS`
3. Deploy: Use "Deploy" button with autoscale target
4. Monitor: Check `/api/ws-health` endpoint

See `docs/deployment/REPLIT_DEPLOYMENT.md` for troubleshooting common issues like host timeouts, container sleep, and CORS errors.

## Resources

- **React Three Fiber**: https://docs.pmnd.rs/react-three-fiber
- **Socket.IO**: https://socket.io/docs/v4/
- **Drizzle ORM**: https://orm.drizzle.team/
- **Radix UI**: https://www.radix-ui.com/
- **Tailwind CSS**: https://tailwindcss.com/
- **Replit Deployments**: https://docs.replit.com/hosting/deployments/about-deployments

## Contact & Support

- **Issues**: Open GitHub issues for bugs/features
- **Security**: See `.github/SECURITY.md` for vulnerability reporting
- **Commercial Licensing**: licensing@scrummonsters.com
- **Documentation**: This file and `README.md`

---

**Last Updated**: 2026-01-17
**Version**: 1.0.0
**Maintainers**: ScrumQuest Development Team
