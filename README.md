# 🎮 Multiplayer Scrum Poker RPG

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue.svg)](https://www.typescriptlang.org/)

A multiplayer scrum poker estimation game with a nostalgic JRPG aesthetic that gamifies story point estimation. Players create or join lobbies, select fantasy avatar classes, and estimate Jira tickets by "battling" pixel art bosses in real-time combat scenarios.

## 🌟 Features

### 🎯 Core Gameplay
- **Multiplayer Lobbies**: Support for up to 32 players with unique invite codes
- **Avatar Classes**: Choose from Warrior, Wizard, Rogue, Paladin, and Archer classes
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
- **PostgreSQL** - Primary database (Neon serverless)
- **Session Store** - Express sessions with PostgreSQL backend
- **In-memory Cache** - Game state management for real-time performance

### Development Tools
- **ESBuild** - Fast JavaScript bundler for production
- **PostCSS** - CSS processing and optimization
- **Drizzle Kit** - Database schema management and migrations

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn** package manager
- **PostgreSQL** database (or use Neon serverless)

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
- Select your fantasy class (Warrior, Wizard, Rogue, Paladin, Archer)
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
- `lobby_updated` - Real-time lobby state changes
- `boss_attacked` - Boss damage notifications
- `boss_ring_attack` - Boss area-of-effect attacks
- `player_attacked` - Player damage events
- `game_phase_changed` - State transitions
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
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run check        # TypeScript type checking
npm run db:push      # Update database schema
```

### Development Tools
- **Hot Reload**: Automatic browser refresh on file changes
- **TypeScript**: Strict type checking with immediate feedback
- **Error Overlay**: Runtime error display in development
- **Debug Modal**: In-game debug information (Tab key)

### Testing the Game
1. Open multiple browser tabs/windows
2. Create a lobby in one tab (host)
3. Join with the invite code in other tabs
4. Test multiplayer interactions and combat

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Guidelines
- Follow TypeScript strict mode conventions
- Use meaningful commit messages
- Test multiplayer functionality thoroughly
- Maintain compatibility with existing save data
- Document new features and API changes

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Retro Gaming Community** - Inspiration for pixel art aesthetics
- **Agile Development Teams** - Real-world scrum poker insights
- **Open Source Libraries** - Amazing tools that made this possible

## 📞 Support

For questions, bug reports, or feature requests:
- Open an issue on GitHub
- Check existing documentation
- Review the troubleshooting guide

---

**Made with ❤️ for agile teams who love games**