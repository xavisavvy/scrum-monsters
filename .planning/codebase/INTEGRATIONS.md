# External Integrations

**Analysis Date:** 2026-02-01

## APIs & External Services

**OpenAI:**
- Package: `openai` (5.19.1)
- Purpose: AI-powered features (specific usage not determined from codebase scan)
- Auth: Via `openai` package API key (injected at runtime)
- Configuration: No environment variables detected in `.env.example` - likely passed to package constructor

**Authentication Providers:**
- **Google OAuth 2.0**
  - SDK: `passport-google-oauth20` (2.0.0)
  - Auth method: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables
  - Callback: Passport strategy configured in `server/auth/passport.ts`
  - Implementation: `GoogleStrategy` from passport-google-oauth20

- **GitHub OAuth**
  - SDK: `passport-github2` (0.1.12)
  - Auth method: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` environment variables
  - Callback: Passport strategy configured in `server/auth/passport.ts`
  - Implementation: `GitHubStrategy` from passport-github2

## Data Storage

**Primary Database:**
- **PostgreSQL** (serverless optional)
  - Connection: `DATABASE_URL` environment variable
  - Client: `postgres` package (3.4.8) - Native protocol implementation
  - Alternative: `@neondatabase/serverless` (0.10.4) - For serverless environments (Vercel, Edge Runtime)
  - ORM: Drizzle ORM (0.39.1)
  - Schema: `shared/schema.ts` (users, oauth_accounts, user_profiles, user_stats, estimation_history, sessions tables)
  - Dialect: PostgreSQL configured in `drizzle.config.ts`

**Fallback Storage:**
- **In-Memory Storage** (when `DATABASE_URL` not set)
  - Location: `server/storage.ts` - `MemStorage` class
  - Scope: Game lobbies and session state
  - Persistence: Lost on server restart (development/demo only)

**Session Storage:**
- **PostgreSQL Sessions** (when database connected)
  - Store: `connect-pg-simple` (10.0.0)
  - Table: `sessions` in Drizzle schema
  - Automatic initialization: `createTableIfMissing: true`
- **In-Memory Sessions** (fallback)
  - Store: `memorystore` (1.6.7)
  - Used when no `DATABASE_URL`

## Caching & State

**Cloud Caching:**
- **Upstash Redis** (serverless)
  - Purpose: Optional distributed caching for lobbies, game state, player sessions
  - SDK: `@upstash/redis` (1.36.1) - REST API client
  - Auth: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables
  - Cache keys: `lobby:{id}`, `player:{id}`, `game:{id}`, `token:{reconnectToken}`
  - TTLs: Lobby 3600s, Player Session 7200s, Game State 1800s
  - Graceful degradation: App works without Redis (no caching)
  - Implementation: `server/redis.ts`

**Traditional Redis** (optional alternative)
- **ioredis** (5.9.2) - Not actively configured, available for alternative usage

## Authentication & Identity

**Auth Provider:**
- **Passport.js** (0.7.0) - Authentication middleware
- **Three strategies:**
  1. Local Strategy: Username/email + password with bcrypt hashing
  2. Google OAuth 2.0: Social login via Google accounts
  3. GitHub OAuth: Social login via GitHub accounts

**Authorization:**
- Session-based with express-session (1.18.2)
- Session store: PostgreSQL or in-memory
- Session middleware: Shared with Socket.IO for authenticated WebSocket connections
- Location: `server/auth/passport.ts` and `server/index.ts`

**Password Security:**
- **bcryptjs** (3.0.3) - Password hashing and verification
- Salting: Implicit in bcryptjs.compare()
- Local users only: OAuth users don't have password field

**User Data Model:**
- Location: `shared/schema.ts`
- Tables: `users`, `oauthAccounts`, `userProfiles`, `userStats`, `estimationHistory`
- OAuth linking: One-to-many relationship (users → oauthAccounts)

## Real-Time Communication

**WebSocket:**
- **Socket.IO** 4.8.1 (server) and `socket.io-client` 4.8.1 (client)
- Location: `server/websocket.ts` for server setup, client Socket.IO integration in components
- Events: Typed interfaces in `shared/gameEvents.ts`
- CORS: Configurable via `ALLOWED_ORIGINS` environment variable
- Transports: WebSocket primary, polling fallback
- Replit optimization: Special timeout configs (90s ping timeout, 30s ping interval)
- Session Integration: Socket.IO engine uses express-session middleware for authentication

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, Rollbar, or similar service integration

**Logging:**
- **Console-based** - Uses `console.log()`, `console.error()`
- Server logging: HTTP requests, Redis status, WebSocket connection stats
- Client logging: Browser DevTools console
- Health endpoints: `/api/health`, `/api/ws-health`

**Performance Monitoring:**
- **r3f-perf** (7.2.3) - Three.js performance profiler for client-side 3D rendering
- Development tools: Browser DevTools Network tab for WebSocket inspection

## CI/CD & Deployment

**Hosting Platforms:**
- **Replit** (special support via `REPLIT_DEPLOYMENT` env var)
  - Special configurations: Extended timeouts (95s keep-alive), proxy header handling
  - Auto-detection via `REPLIT_DEPLOYMENT=1`
- **Standard Node.js hosts** (AWS, GCP, Azure, DigitalOcean, etc.)
- **Docker** support (inferred from recent commits)
- **Kubernetes** support (inferred from recent commits)

**CI Pipeline:**
- **GitHub Actions** (inferred from recent commits mentioning CI/CD pipelines)
- No Jenkins, GitLab CI, or other CI detected

**Build Pipeline:**
- Frontend: Vite build → `dist/public`
- Backend: esbuild for Node.js bundling → `dist/index.js`
- Release: `standard-version` for semantic versioning

## Environment Configuration

**Required Environment Variables (Core):**
- `SESSION_SECRET` - Session encryption key
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment mode (development/production)

**Optional Environment Variables (Features):**
- `DATABASE_URL` - PostgreSQL connection (defaults to in-memory)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - Serverless Redis
- `ALLOWED_ORIGINS` - CORS whitelist (default: all in dev, restricted in prod)
- `REPLIT_DEPLOYMENT` - Replit platform indicator

**Secrets Management:**
- Location: `.env` file (not committed, listed in `.env.example`)
- Access: Environment variables via `process.env`
- Production: Use platform-specific secret management (GitHub Secrets, Replit Secrets, etc.)

## Webhooks & Callbacks

**Incoming Webhooks:**
- Not detected - No webhook endpoints found

**Outgoing Webhooks:**
- Not detected - No outbound webhook calls found

**OAuth Callbacks:**
- Google: Handled by `passport-google-oauth20` - auto-redirects to `/auth/google/callback`
- GitHub: Handled by `passport-github2` - auto-redirects to `/auth/github/callback`
- Implementations in `server/routes/` (specific files not analyzed)

## Data Synchronization

**Real-Time Sync:**
- Socket.IO events push game state changes to all connected clients
- Event: `lobby_updated` emitted on state mutations in `server/gameState.ts`
- Typed contract: `ClientToServerEvents` and `ServerToClientEvents` in `shared/gameEvents.ts`

**API-Based Sync:**
- REST endpoints for user profile, stats, preferences
- React Query handles caching and refetching
- Client: `client/src/lib/queryClient.ts` with `apiRequest()` helper
- Credentials: Cookie-based (credentials: "include")

---

*Integration audit: 2026-02-01*
