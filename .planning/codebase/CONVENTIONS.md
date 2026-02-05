# Coding Conventions

**Analysis Date:** 2026-02-01

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `BattleScreen.tsx`, `RetroButton.tsx`, `LobbyCreation.tsx`)
- Utilities: camelCase (e.g., `utils.ts`, `useWebSocket.tsx`, `lastLobbyStorage.ts`)
- Stores: camelCase with `use` prefix for hooks (e.g., `useGameState.tsx`, `useWebSocket.tsx`, `useAuth.tsx`)
- Configuration: camelCase or kebab-case (e.g., `vitest.config.ts`, `tsconfig.json`)

**Functions:**
- Handlers: camelCase (e.g., `handleCreateLobby`, `renderCollapsibleSidebar`)
- Store actions: camelCase (e.g., `setLobby`, `addAttackAnimation`, `removeAttackAnimation`)
- Static methods: camelCase (e.g., `updateTeamCompetitionStats`, `calculateTeamScore`)
- Async operations: camelCase (e.g., `attemptReconnection`, `manualRetry`)

**Variables:**
- State variables: camelCase (e.g., `currentLobby`, `isCreating`, `sidebarExpanded`)
- Constants: UPPER_SNAKE_CASE for module-level constants (e.g., `RECONNECT_TOKEN_KEY`, `LOBBY_SNAPSHOT_KEY`, `DISCONNECT_GRACE_PERIOD`)
- Refs: camelCase with `Ref` suffix (e.g., `timeoutRefs`, `isMountedRef`)
- Boolean prefixes: `is`, `has`, `should` (e.g., `isConnected`, `hasSubmittedScore`, `isBattleUnmounting`)

**Types:**
- Interfaces: PascalCase (e.g., `RetroButtonProps`, `GameState`, `WebSocketState`)
- Union types: PascalCase (e.g., `GamePhase`, `ConnectionStatus`, `AvatarClass`)
- Generic types: PascalCase (e.g., `T`, `K`, `InterServerEvents`)

## Code Style

**Formatting:**
- No explicit linter/formatter configured in project root
- Uses TypeScript 5.6.3 with strict mode enabled
- Imports use ES modules syntax with `.js` extensions in imports (e.g., `from './gameState.js'`)
- Arrow functions preferred for callbacks and small functions
- Multiline JSX indentation: consistent 2-space indentation

**Key TypeScript Settings:**
- `strict: true` - All strict type checks enabled
- `noEmit: true` - TypeScript checks only, no output
- `target: es2015` - Modern JavaScript target
- `module: ESNext` - Modern module syntax
- `jsx: preserve` - For React/Vite processing

**Spacing:**
- 2-space indentation throughout
- Single newline between class/interface members
- Single blank line between logical sections in functions

## Import Organization

**Order:**
1. External libraries/packages (e.g., `import React`, `import { create } from 'zustand'`)
2. Socket.IO and socket-related imports
3. Shared types and interfaces (e.g., `from '@shared/gameEvents'`)
4. Local utilities and stores (e.g., `from '@/lib/stores/useWebSocket'`)
5. Local components (e.g., `from '@/components/ui/Button'`)
6. Styles (CSS imports)

**Path Aliases:**
- `@/*` → `./client/src/*` (client-side code)
- `@shared/*` → `./shared/*` (shared types and contracts)
- Example usage: `import { cn } from "@/lib/utils"` and `import { GamePhase } from "@shared/gameEvents"`

**Import Style:**
- Named imports for specific exports
- Default imports for components and larger modules
- Import full modules when using multiple exports from same location

## Error Handling

**Patterns:**
- try-catch blocks for operations that might throw
- Error logging with `console.error()` including context message
- Graceful fallbacks with `.catch(() => {})` for non-critical async operations
- Socket.IO error events: `socket.emit('game_error', { message: '...' })`

**Examples from codebase:**
```typescript
// Suppress non-critical errors
cacheLobby(lobby.id, lobby).catch(() => {});

// Log and emit socket error
try {
  // operation
} catch (error) {
  console.error('Error handling player_performance:', error);
  socket.emit('game_error', { message: 'Failed to track performance data' });
}

// Stored async operations with try-catch
try {
  localStorage.setItem(RECONNECT_TOKEN_KEY, token);
} catch (error) {
  console.warn('Failed to store reconnect token:', error);
}
```

## Logging

**Framework:** `console` object (no dedicated logging library)

**Patterns:**
- Info level: `console.log()` with emoji prefixes for organization (e.g., `🔌`, `✅`, `🔐`, `📊`)
- Error level: `console.error()` with descriptive message prefix
- Warning level: `console.warn()` for non-critical issues
- Structured logs: Include context data (e.g., `${req.method} ${path} ${res.statusCode} in ${duration}ms`)

**Socket.IO Connection Logging:**
```typescript
console.log(`✅ Player connected: ${socket.id}`);
console.log(`   - Transport: ${transport}`);
console.log(`   - IP: ${forwardedFor}`);
```

## Comments

**When to Comment:**
- Complex business logic or algorithms (e.g., team scoring calculations)
- Non-obvious state management patterns
- Workarounds or temporary fixes (e.g., `// Reverted to original approach for simpler fix`)
- Integration points and architectural decisions

**JSDoc/TSDoc:**
- Function parameters documented in interface definitions
- Type annotations used instead of JSDoc for most code
- Minimal inline JSDoc; types serve as documentation

**TODO/FIXME Pattern:**
- Marked inline with comment: `// TODO: sync jumping state`
- Used sparingly; indicates intentional incomplete implementation
- Found in `PlayerController.tsx`, `CheatMenu.tsx`, and `gameState.ts`

## Function Design

**Size:** Small, focused functions (under 50 lines typically)

**Parameters:**
- Destructured where appropriate (e.g., `{ currentLobby, currentPlayer, error } = useGameState()`)
- TypeScript interfaces for complex parameter objects
- Callback functions as final parameters

**Return Values:**
- Explicit return types on functions (TypeScript enforces this)
- Methods in stores use functional updates with `set()` and `get()`
- No implicit returns of objects without braces in arrow functions with business logic

**Examples:**
```typescript
// Zustand store action
setLobby: (lobby) => set({ currentLobby: lobby })

// Component function
export function BattleScreen() { ... }

// Static method
private static calculateTeamScore(stats: TeamStats): number { ... }

// Handler with destructuring
const handleCreateLobby = ({ lobbyName, hostName, initialSettings }) => { ... }
```

## Module Design

**Exports:**
- Named exports for utilities and components
- Default exports for component files sometimes used
- Store pattern: `export const useWebSocket = create<WebSocketState>(...)` (named export)

**Barrel Files:**
- Not extensively used; direct imports preferred
- Example: `import { BattleScreen } from './BattleScreen'` not `from './components/game'`

**Store Pattern (Zustand):**
```typescript
export const useWebSocket = create<WebSocketState>((set, get) => ({
  // State
  socket: null,
  isConnected: false,

  // Methods
  connect: () => { ... },
  disconnect: () => { ... }
}));
```

**Manager/Utility Classes:**
- Static methods preferred (e.g., `TeamStatsManager`)
- Example: `TeamStatsManager.updateTeamCompetitionStats()`

## Commit Message Format

**Convention:** Conventional Commits (enforced via commitlint)

**Format:** `type(scope): description`

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style
- `refactor` - Code refactoring
- `perf` - Performance improvement
- `test` - Test additions/changes
- `build` - Build system changes
- `ci` - CI/CD pipeline changes
- `chore` - Miscellaneous changes
- `revert` - Revert previous commit

**Rules:**
- Subject must be lowercase
- No period at end of subject
- Max 100 characters for header
- No uppercase letters in subject

**Example:** `feat(websocket): add reconnection grace period`

---

*Convention analysis: 2026-02-01*
