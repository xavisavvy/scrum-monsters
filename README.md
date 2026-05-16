# 🎮 Multiplayer Scrum Poker RPG

[![Code License: AGPL-3.0](https://img.shields.io/badge/Code%20License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Assets License: CC BY-NC-ND 4.0](https://img.shields.io/badge/Assets%20License-CC%20BY--NC--ND%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-nd/4.0/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue.svg)](https://www.typescriptlang.org/)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)
[![Trademark](https://img.shields.io/badge/Trademark-Scrum%20Monsters%E2%84%A2-red.svg)](TRADEMARKS.md)

A multiplayer scrum poker estimation game with a nostalgic JRPG aesthetic that gamifies story point estimation. Players create or join lobbies, select fantasy avatar classes, and estimate tickets by "battling" pixel art bosses in real-time combat scenarios.

## 🌟 Features

### 🎯 Core Gameplay
- **Multiplayer Lobbies**: Support for up to 32 players with unique invite codes
- **Recurring Meeting Rooms**: Bookmarkable URLs for daily standups and recurring scrum sessions
- **Avatar Classes**: Choose from 10 classes — Ranger, Rogue, Bard, Sorcerer, Wizard, Warrior, Paladin, Cleric, Oathbreaker, and Monk
- **Boss Battles**: Fight pixel art bosses that scale with ticket complexity
- **Real-time Combat**: Live projectile attacks with visual effects and sound
- **Team-based Mechanics**: Developers, QA, and Spectators with different roles

### ⚔️ Combat System
- **Spectator vs Team Combat**: Spectators attack developers/QA instead of bosses
- **Revival Mechanics**: Proximity-based player revival system
- **Jumping Dodge**: Invincibility frames during jump animations
- **Boss Ring Attacks**: Devastating area-of-effect attacks from bosses
- **Health & Damage**: Strategic combat with HP management

### 🎨 Visual & Audio
- **Retro JRPG Aesthetic**: Pixel art style with nostalgic animations
- **3D Avatar Models**: React Three Fiber-powered character rendering
- **Dynamic Audio**: Background music, hit effects, and ambient sounds
- **Persistent Audio Preferences**: Mute settings automatically saved across sessions
- **Visual Effects**: Attack animations, damage numbers, and particle effects

### 🔧 Technical Features
- **Real-time Sync**: Socket.IO for instant multiplayer updates
- **Cross-platform**: Works on desktop and mobile devices
- **TypeScript**: Fully typed codebase with strict type checking
- **Hot Reload**: Development server with instant updates

## 🛠️ Technology Stack

### Frontend
- **React 18** - Modern UI framework with hooks and concurrent features
- **TypeScript** - Static type checking and enhanced developer experience
- **Vite** - Fast build tool with HMR and modern bundling
- **Tailwind CSS** - Utility-first CSS framework with custom retro theming
- **React Three Fiber** - 3D graphics and avatar rendering
- **Zustand** - Lightweight state management
- **Radix UI** - Accessible component primitives

### Backend
- **Express.js** - Web application framework
- **Socket.IO** - Real-time bidirectional communication
- **TypeScript** - Server-side type safety
- **Drizzle ORM** - Type-safe database queries and migrations

### Database & Storage
- **PostgreSQL** - Primary database (via postgres.js driver)
- **Session Store** - Express sessions with PostgreSQL backend
- **In-memory Cache** - Game state management for real-time performance

### Development Tools
- **ESBuild** - Fast JavaScript bundler for production
- **PostCSS** - CSS processing and optimization
- **Drizzle Kit** - Database schema management and migrations
- **ESLint** - Code linting with TypeScript and React rules
- **Vitest** - Unit and integration testing
- **Playwright** - End-to-end browser testing

### Infrastructure & DevOps
- **Kubernetes** - Container orchestration with Kustomize overlays
- **ArgoCD** - GitOps continuous deployment
- **Prometheus + Grafana** - Metrics and dashboards
- **Loki + Promtail** - Log aggregation
- **cert-manager** - Automatic TLS certificates
- **Sealed Secrets** - Encrypted secrets in Git
- **Pino** - Structured JSON logging

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn** package manager
- **PostgreSQL** database (optional — defaults to in-memory storage)

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd multiplayer-scrum-poker-rpg
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration (Optional)
Create a `.env` file in the root directory for database features:
```env
# Database Configuration (Optional - defaults to in-memory storage)
DATABASE_URL="postgresql://username:password@localhost:5432/scrum_poker"

# Session Configuration
SESSION_SECRET="your-super-secret-session-key"

# Server Configuration (optional)
PORT=5000
NODE_ENV=development
```

**Note**: The game works out-of-the-box with in-memory storage. PostgreSQL is only required for persistent sessions and user data.

### 4. Database Setup (Optional)
```bash
# Only needed if using PostgreSQL instead of in-memory storage
npm run db:push
```

### 5. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## 🎮 How to Play

### 1. Create or Join a Lobby
- **Host**: Create a new lobby and receive a unique invite code
- **Player**: Join using a 6-character lobby code
- **Teams**: Choose between Developer, QA, or Spectator roles

### 2. Avatar Selection
- Select your fantasy class — Ranger, Rogue, Bard, Sorcerer, Wizard, Warrior, Paladin, Cleric, Oathbreaker, or Monk
- Each class has unique projectile types and visual styles
- 3D avatar preview with character details

### 3. Battle Phase
- **Developers & QA**: Attack the boss by clicking/tapping
- **Spectators**: Attack nearby team members instead of the boss
- **Dodging**: Press Space to jump and gain invincibility frames
- **Revival**: Stand near downed teammates to revive them

### 4. Scoring & Estimation
- Submit story point estimates using Fibonacci sequence
- Teams must reach consensus to defeat the boss
- Progress through multiple tickets/levels

### 5. Boss Mechanics
- **Health Scaling**: Boss HP scales with ticket complexity
- **Ring Attacks**: Bosses occasionally fire circular projectile patterns
- **Phase System**: Multiple phases per boss encounter

## 🕹️ Controls

| Action | Control |
|--------|---------|
| Move | WASD or Arrow Keys |
| Attack | Left Click / Tap |
| Jump/Dodge | Spacebar |
| Keyboard Attack | Ctrl |
| Debug Info | Tab |
| Audio Toggle | In-game controls |

## 🏗️ Project Structure

```
├── client/                 # Frontend React application
│   ├── public/            # Static assets and textures
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── game/      # Game-specific components
│   │   │   └── ui/        # Reusable UI components
│   │   ├── lib/           # Utilities and stores
│   │   │   └── stores/    # Zustand state management
│   │   ├── hooks/         # Custom React hooks
│   │   └── styles/        # CSS and styling
├── server/                # Backend Express application
│   ├── gameState.ts       # Core game logic and state management
│   ├── websocket.ts       # Socket.IO event handlers
│   ├── routes.ts          # REST API endpoints
│   └── index.ts           # Server entry point
├── shared/                # Shared types and utilities
│   ├── gameEvents.ts      # WebSocket event definitions
│   └── schema.ts          # Database schema
└── package.json           # Project dependencies and scripts
```

## 🔧 API Documentation

### WebSocket Events

#### Client → Server
- `create_lobby` - Create a new game lobby
- `join_lobby` - Join existing lobby with code
- `select_avatar` - Choose character class
- `attack_boss` - Deal damage to boss
- `attack_player` - Spectator attacks on players
- `player_jump` - Jumping state synchronization
- `submit_score` - Submit story point estimate

#### Server → Client
- `session:*` - Fine-grained lobby/phase events (e.g. `session:phase_changed`, `session:tickets_updated`)
- `combat:*` - Boss/player combat events (e.g. `combat:boss_damaged`, `combat:player_damaged`)
- `estimation:*` - Voting and discussion events (e.g. `estimation:vote_cast`, `estimation:votes_revealed`)
- `boss_attacked` - Boss damage notifications
- `boss_ring_attack` - Boss area-of-effect attacks
- `player_attacked` - Player damage events
- `scores_revealed` - Estimation results

### REST Endpoints
- `GET /api/health` - Server health check
- `POST /api/lobbies` - Create lobby via REST
- `GET /api/lobbies/:id` - Get lobby information

## 🎨 Customization

### Adding New Avatar Classes
1. Add class definition to `shared/gameEvents.ts`
2. Create avatar assets in `client/public/images/` or `client/src/assets/`
3. Update avatar selection UI in `AvatarSelection.tsx`
4. Add projectile emoji mapping in `PlayerController.tsx`

### Creating New Boss Types
1. Add boss sprite to `client/public/textures/`
2. Update boss creation logic in `server/gameState.ts`
3. Implement custom attack patterns if needed

### Audio Customization
- Add sound files to `client/public/sounds/`
- Update audio store in `client/src/lib/stores/useAudio.tsx`
- Configure audio triggers in game components

## 🧪 Development

### Available Scripts
```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run check        # TypeScript type checking

# Testing
npm test             # Run unit/integration tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e     # Run Playwright E2E tests
npm run test:e2e:ui  # E2E tests with UI

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix auto-fixable issues

# Database
npm run db:push      # Update database schema

# Releases
npm run release      # Auto-determine version bump
npm run release:patch # Patch release (x.x.X)
npm run release:minor # Minor release (x.X.0)
npm run release:major # Major release (X.0.0)
```

### Development Tools
- **Hot Reload**: Automatic browser refresh on file changes
- **TypeScript**: Strict type checking with immediate feedback
- **Error Overlay**: Runtime error display in development
- **Debug Modal**: In-game debug information (Tab key)

### Testing
- **Unit/Integration**: `npm test` runs Vitest suite (700+ tests)
- **E2E**: `npm run test:e2e` runs Playwright browser tests
- **Coverage**: `npm run test:coverage` generates coverage report

### Testing the Game
1. Open multiple browser tabs/windows
2. Create a lobby in one tab (host)
3. Join with the invite code in other tabs
4. Test multiplayer interactions and combat

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for complete guidelines, including:
- Development setup and prerequisites
- Code style and commit conventions ([Conventional Commits](https://conventionalcommits.org))
- Pull request process
- Asset contribution guidelines
- Developer Certificate of Origin (DCO)

## 📝 License

**Scrum Monsters** uses a dual-licensing approach:

| Component | License |
|-----------|---------|
| **Code** (client, server, shared) | [GNU AGPL-3.0-or-later](licenses/AGPL-3.0-or-later.txt) |
| **Art & Media** (sprites, sounds, images) | [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) |
| **Commercial Add-ons** | Proprietary EULA |

See [LICENSE.md](LICENSE.md) for complete details, [TRADEMARKS.md](TRADEMARKS.md) for trademark information, and [NOTICES.md](NOTICES.md) for third-party attributions.

For commercial licensing inquiries: licensing@scrummonsters.com

## 🙏 Acknowledgments

- **Retro Gaming Community** - Inspiration for pixel art aesthetics
- **Agile Development Teams** - Real-world scrum poker insights
- **Open Source Libraries** - Amazing tools that made this possible

## 📞 Support

For questions, bug reports, or feature requests:
- Open an issue on GitHub
- Check existing documentation
- Review the troubleshooting guide

## 🚢 Kubernetes Deployment

Scrum Monsters includes full Kubernetes deployment support with environment overlays.

### Quick Start
```bash
# Deploy to development
kubectl apply -k k8s/overlays/dev

# Deploy to staging
kubectl apply -k k8s/overlays/staging

# Deploy to production
kubectl apply -k k8s/overlays/prod
```

### Infrastructure Components
```bash
# Install Sealed Secrets controller
kubectl apply -k k8s/infrastructure/sealed-secrets

# Install cert-manager for TLS
kubectl apply -k k8s/infrastructure/cert-manager

# Install monitoring stack (Prometheus, Grafana, Loki)
kubectl apply -k k8s/infrastructure/monitoring

# Install ArgoCD for GitOps
kubectl apply -k k8s/infrastructure/argocd
```

### Directory Structure
```
k8s/
  base/                    # Shared manifests
  overlays/
    dev/                   # Development (1 replica, debug logging)
    staging/               # Staging (2 replicas, TLS)
    prod/                  # Production (3+ replicas, full TLS)
  infrastructure/
    sealed-secrets/        # Bitnami Sealed Secrets
    cert-manager/          # Let's Encrypt certificates
    monitoring/            # Prometheus + Grafana + Loki
    argocd/                # GitOps deployment
  argocd-apps/             # ArgoCD Application manifests
```

See [k8s/README.md](k8s/README.md) for detailed deployment instructions.

## 📊 Observability

### Metrics Endpoint
The app exposes Prometheus metrics at `/metrics`:
- `scrumquest_active_lobbies` - Current lobby count
- `scrumquest_active_players` - Current player count
- `scrumquest_websocket_connections` - WebSocket connections
- `scrumquest_votes_submitted_total` - Vote submissions by team
- `http_request_duration_seconds` - Request latency histogram

### Structured Logging
Logs are JSON-formatted in production using Pino:
```json
{"level":"info","time":"2026-02-02T...","component":"game","lobbyCode":"ABC123","event":"player_joined"}
```

Set log level via `LOG_LEVEL` environment variable (trace, debug, info, warn, error).

---

**Made with ❤️ for agile teams who love games**