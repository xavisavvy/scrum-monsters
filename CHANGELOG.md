# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.0.0] - 2026-01-17

### Initial Release

First stable release of ScrumQuest - Multiplayer Scrum Poker RPG.

### Features

#### Core Gameplay
- **Multiplayer Lobbies**: Support for up to 32 players with unique codes
- **Recurring Meeting Rooms**: Bookmarkable URLs for daily standups
- **Avatar Classes**: Choose from Warrior, Wizard, Rogue, Paladin, and Archer
- **Boss Battles**: Fight pixel art bosses that scale with ticket complexity
- **Real-time Combat**: Live projectile attacks with visual effects and sound
- **Team-based Mechanics**: Developers, QA, and Spectators with different roles

#### Combat System
- **Spectator vs Team Combat**: Spectators attack developers/QA instead of bosses
- **Revival Mechanics**: Proximity-based player revival system
- **Jumping Dodge**: Invincibility frames during jump animations
- **Boss Ring Attacks**: Devastating area-of-effect attacks from bosses
- **Health & Damage**: Strategic combat with HP management

#### Quality of Life
- **Player Name Persistence**: Automatically saves and restores player names
- **Copy Lobby Code Button**: One-click copying of lobby codes
- **Quick Rejoin Last Lobby**: Fast access to recently used lobbies
- **Persistent Audio Preferences**: Mute settings saved across sessions
- **Favorite Rooms**: Track up to 10 most recent recurring rooms

#### Technical Features
- **Real-time Sync**: Socket.IO for instant multiplayer updates
- **Automatic Reconnection**: 12 attempts with exponential backoff
- **Replit Optimization**: Adaptive timeouts for Replit deployment
- **Health Check Endpoints**: `/api/health` and `/api/ws-health`
- **Cross-platform**: Works on desktop and mobile devices

### Documentation

- Comprehensive developer guide (CLAUDE.MD)
- Deployment guide for Replit (REPLIT_DEPLOYMENT.md)
- Recurring rooms documentation (RECURRING_ROOMS.md)
- QoL improvements documentation (QOL_IMPROVEMENTS.md)
- Audio persistence guide (AUDIO_PERSISTENCE.md)
- Contributing guidelines (CONTRIBUTING.md)
- Versioning guide (VERSIONING.md)

---

**Note**: This is the initial release. Future releases will be automatically versioned using [Conventional Commits](https://www.conventionalcommits.org/) and [Semantic Versioning](https://semver.org/).
