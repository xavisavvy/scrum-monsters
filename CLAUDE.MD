# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ScrumQuest** is a real-time multiplayer scrum poker estimation game with JRPG-style boss battles. Full-stack TypeScript with Socket.IO for real-time sync and React Three Fiber for 3D graphics.

## Development Commands

```bash
npm run dev          # Start dev server (http://localhost:5000)
npm run build        # Production build (client + server)
npm run start        # Start production server
npm run check        # TypeScript type checking
npm run db:push      # Push Drizzle schema changes to database

# Testing (Vitest)
npm test             # Run all tests once
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report

# Run a single test file
npx vitest run path/to/file.test.ts

# E2E Testing (Playwright)
npm run test:e2e     # Run E2E tests
npm run test:e2e:ui  # E2E tests with interactive UI

# Linting (ESLint)
npm run lint         # Check for issues
npm run lint:fix     # Auto-fix issues

# Releases (standard-version)
npm run release          # Auto-determine version bump
npm run release:patch    # Patch release (x.x.X)
npm run release:minor    # Minor release (x.X.0)
npm run release:major    # Major release (X.0.0)

# Kubernetes Deployment
kubectl apply -k k8s/overlays/dev      # Deploy to dev
kubectl apply -k k8s/overlays/staging  # Deploy to staging
kubectl apply -k k8s/overlays/prod     # Deploy to production
```

## Architecture

### Three-Layer Structure
- **`/client`** - React frontend with Vite, Zustand state, React Three Fiber
- **`/server`** - Express backend with Socket.IO, Drizzle ORM
- **`/shared`** - TypeScript types and WebSocket event contracts shared between client/server

### Key Server Files
- `server/gameState.ts` - Central game state: lobbies map, combat states, boss management
- `server/socketHandlers.ts` - All WebSocket event handlers
- `server/websocket.ts` - Socket.IO initialization and connection handling
- `server/storage.ts` - Database abstraction (PostgreSQL or in-memory fallback)
- `server/logger.ts` - Pino structured logging (httpLogger, socketLogger, gameLogger, dbLogger)
- `server/metrics.ts` - Prometheus metrics (activeLobbies, activePlayers, websocketConnections, etc.)

### Key Client Files
- `client/src/lib/stores/useGameStore.tsx` - Main Zustand store for game state
- `client/src/components/game/phases/` - Phase-specific UI components
- `shared/gameEvents.ts` - TypeScript interfaces and all WebSocket event definitions

### Game Flow (Phases)
`lobby` → `avatar_selection` → `battle` → `scoring` → `reveal` → `discussion` → `victory`/`next_level` → `game_over`

Phases are defined as `GamePhase` type in `shared/gameEvents.ts` and managed in `server/gameState.ts`.

### Real-time Events
All WebSocket events defined in `shared/gameEvents.ts` under `ClientToServerEvents` and `ServerToClientEvents` interfaces. When adding events:
1. Define interface in `shared/gameEvents.ts`
2. Add handler in `server/socketHandlers.ts`
3. Emit/listen in client components

### State Sync
Server emits `lobby_updated` event whenever game state changes. All state mutations in `gameState.ts` should broadcast to clients.

## Testing
Tests use Vitest with happy-dom. Test files located alongside source with `.test.ts`/`.spec.ts` suffix:
- `client/src/**/*.{test,spec}.{ts,tsx}`
- `server/**/*.{test,spec}.ts`
- `shared/**/*.{test,spec}.ts`

Setup file: `client/src/test/setup.ts`

Path aliases available: `@` (client/src), `@shared` (shared)

## Debugging
- **Tab key** in-game shows debug overlay (player positions, states)
- **Browser DevTools Network tab** for WebSocket message inspection
- Health endpoints: `/api/health`, `/api/ws-health`

## Path Aliases
```typescript
import { something } from "@/components/ui/button"  // client/src/...
import { GamePhase } from "@shared/gameEvents"       // shared/...
```

## Database
PostgreSQL optional - defaults to in-memory storage. If using database:
- Schema in `shared/schema.ts` (Drizzle ORM)
- Run `npm run db:push` after schema changes
- Set `DATABASE_URL` and `SESSION_SECRET` in `.env`

## Commits
Uses Conventional Commits enforced by commitlint/husky. Format: `type(scope): description`

## CI/CD Infrastructure

### GitHub Actions Workflows
- `.github/workflows/ci.yml` - Lint, type check, test, build
- `.github/workflows/e2e.yml` - Playwright E2E tests
- `.github/workflows/deploy.yml` - ArgoCD deployment triggers

### Kubernetes Structure
```
k8s/
  base/           # Shared manifests
  overlays/
    dev/          # Development (1 replica, debug logs)
    staging/      # Staging (2 replicas, staging TLS)
    prod/         # Production (3+ replicas, prod TLS)
  infrastructure/
    sealed-secrets/  # Bitnami Sealed Secrets
    cert-manager/    # Let's Encrypt TLS
    monitoring/      # Prometheus + Grafana + Loki
    argocd/          # GitOps deployment
  argocd-apps/    # Application CRDs
```

### Observability
- **Metrics**: `/metrics` endpoint (Prometheus format)
- **Logging**: Pino JSON logs, set `LOG_LEVEL` env var (trace/debug/info/warn/error)
- **Dashboards**: Grafana at `kubectl port-forward svc/grafana 3000:80 -n monitoring`
