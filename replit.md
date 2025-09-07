# Overview

This is a multiplayer scrum poker game with a retro JRPG aesthetic that gamifies story point estimation. Players create or join lobbies, select fantasy avatar classes (warrior, wizard, etc.), and estimate Jira tickets by "battling" pixel art bosses. The game combines traditional scrum poker mechanics with engaging visual elements and real-time multiplayer interactions.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development
- **Styling**: Tailwind CSS with custom retro/pixel art CSS variables and animations
- **UI Components**: Radix UI primitives with custom retro-styled wrapper components
- **3D Graphics**: React Three Fiber with Drei for 3D avatar models and effects
- **State Management**: Zustand stores for game state, WebSocket connections, and audio
- **Real-time Communication**: Socket.IO client for multiplayer lobby management

## Backend Architecture
- **Server**: Express.js with TypeScript running in ESM mode
- **WebSocket**: Socket.IO server for real-time game events and lobby synchronization
- **Game Logic**: In-memory game state manager handling lobby creation, player management, and boss battles
- **Storage**: Configurable storage interface with in-memory implementation (ready for database integration)

## Data Storage
- **Database ORM**: Drizzle ORM configured for PostgreSQL with schema migrations
- **Current Implementation**: In-memory storage for development with user management schema
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)

## Game State Management
- **Lobby System**: Dynamic lobby creation with unique invite codes and host privileges
- **Player Management**: Team assignment (developers, QA, spectators) with avatar class selection
- **Game Phases**: State machine handling lobby → avatar selection → battle → scoring → reveal cycles
- **Ticket Management**: Jira-style ticket estimation with Fibonacci scoring system

## Real-time Features
- **WebSocket Events**: Typed event system for lobby management, player actions, and game progression
- **Attack Animations**: Visual feedback system for player interactions with boss battles
- **Live Updates**: Real-time synchronization of player scores, game phases, and lobby state

## Audio System
- **Sound Management**: Zustand-based audio store with mute/unmute functionality
- **Game Audio**: Background music, hit effects, and success sounds with overlap support
- **User Control**: Client-side audio control with persistent mute preferences

## Development Tools
- **Build System**: Vite with React plugin, TypeScript checking, and ESBuild for production
- **Asset Support**: GLSL shaders, 3D models (GLTF/GLB), and audio files
- **Development Server**: Hot reload with runtime error overlay and request logging
- **Path Aliases**: Clean imports using @ for client code and @shared for common types

# External Dependencies

- **Database**: Neon PostgreSQL (serverless) via @neondatabase/serverless
- **WebSocket**: Socket.IO for real-time multiplayer communication
- **UI Framework**: Radix UI component primitives for accessible interface elements
- **3D Rendering**: React Three Fiber ecosystem for 3D graphics and animations
- **State Management**: Zustand for client-side state management
- **Styling**: Tailwind CSS with PostCSS for utility-first styling
- **Fonts**: Inter font family via @fontsource for consistent typography
- **Development**: Vite runtime error modal for enhanced debugging experience

# Licensing Structure

The project uses a comprehensive dual-licensing approach to protect intellectual property while maintaining open source principles:

## Core Licenses
- **Code**: GNU AGPL-3.0-or-later for all game logic, server, and client code
- **Assets**: Creative Commons CC BY-NC-ND 4.0 for all art, sprites, sounds, and media
- **Commercial**: Proprietary EULA for paid integrations and premium features
- **Trademarks**: "Scrum Monsters" name and branding protected as trademarks

## License Files Structure
- `LICENSE.md` - Main licensing summary and guide
- `licenses/AGPL-3.0-or-later.txt` - Full copyleft license text
- `licenses/CC-BY-NC-ND-4.0.txt` - Full Creative Commons license text  
- `licenses/Apache-2.0.txt` - Alternative permissive license text
- `commercial/EULA.txt` - Commercial end user license agreement
- `TRADEMARKS.md` - Trademark protection and usage guidelines
- `NOTICES.md` - Third-party software attributions
- `CONTRIBUTING.md` - Updated with DCO requirements for contributors