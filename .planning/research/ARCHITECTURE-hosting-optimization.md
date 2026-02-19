# Architecture Patterns: Hosting & Database Optimization

**Domain:** Full-stack TypeScript WebSocket application infrastructure
**Researched:** 2026-02-19

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Devices                             │
│  (Browser/Mobile) ──wss://──> Platform Load Balancer            │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Platform Layer (PaaS)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Render/Railway/Fly.io                                   │   │
│  │  - SSL/TLS termination (auto-cert)                       │   │
│  │  - WebSocket connection handling                         │   │
│  │  - Health check routing                                  │   │
│  │  - Auto-restart on failure                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Application Layer (Node.js)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PM2 (optional, production)                              │   │
│  │  ├─ Instance 1 (main)                                    │   │
│  │  ├─ Instance 2 (cluster, if >100 users)                  │   │
│  │  └─ Instance N                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Express Server (server/index.ts)                        │   │
│  │  ├─ Session middleware (express-session)                 │   │
│  │  ├─ Passport auth (OAuth + local)                        │   │
│  │  ├─ Socket.IO WebSocket server                           │   │
│  │  ├─ REST API routes (/api/*)                             │   │
│  │  ├─ Health endpoints (/api/health, /api/ws-health)       │   │
│  │  ├─ Prometheus metrics (/metrics)                        │   │
│  │  └─ Static file serving (Vite build)                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Game State Manager (server/gameState.ts)                │   │
│  │  ├─ In-memory lobbies Map<lobbyId, LobbyState>           │   │
│  │  ├─ Combat states per lobby                              │   │
│  │  └─ Boss management                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                    │                        │
                    │                        └─────────────┐
                    ▼                                      ▼
┌──────────────────────────────────┐    ┌─────────────────────────┐
│  Database Layer                  │    │  Monitoring/Logging      │
│  (Neon/Supabase/Railway)         │    │  (Prometheus + Grafana)  │
│                                  │    │                         │
│  ┌────────────────────────────┐  │    │  ┌───────────────────┐  │
│  │  PostgreSQL                │  │    │  │  prom-client      │  │
│  │  - Users & profiles        │  │    │  │  - CPU metrics    │  │
│  │  - User stats              │  │    │  │  - Memory usage   │  │
│  │  - Estimation history      │  │    │  │  - Event loop lag │  │
│  │  - Sessions (pg-simple)    │  │    │  │  - Socket.IO conn │  │
│  │  - OAuth accounts          │  │    │  └───────────────────┘  │
│  │  - Class mastery           │  │    │                         │
│  └────────────────────────────┘  │    │  ┌───────────────────┐  │
│                                  │    │  │  Pino Logger      │  │
│  Connection Pool (postgres.js)  │    │  │  - Structured JSON│  │
│  - max: 10-20 connections       │    │  │  - Log levels     │  │
│  - idle_timeout: 20-30s         │    │  │  → Loki (optional)│  │
│  - prepare: false (serverless)  │    │  └───────────────────┘  │
│                                  │    │                         │
│  Autoscaling (Neon only)        │    └─────────────────────────┘
│  - Scale to zero when idle      │
│  - Compute units on-demand      │
└──────────────────────────────────┘
```

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Platform Load Balancer** | SSL termination, health check routing, WebSocket upgrade, traffic distribution | Application instances |
| **PM2 Process Manager** | Process lifecycle, auto-restart on crash, cluster mode coordination, memory monitoring | Node.js instances, OS |
| **Express Server** | HTTP/WebSocket handling, middleware chain, static file serving, API routing | Socket.IO, Storage layer, Passport |
| **Socket.IO Server** | Real-time event handling, room management, connection tracking, broadcast | Game State, Storage (user lookup), Clients |
| **Game State Manager** | In-memory lobby state, combat calculations, boss HP tracking, phase transitions | Socket.IO (emit events), Storage (persist stats) |
| **Storage Abstraction** | CRUD operations for users/stats/sessions, connection pooling, query building | PostgreSQL, Drizzle ORM |
| **PostgreSQL Database** | Persistent data storage, session management, transactional queries | Storage abstraction via postgres.js |
| **Prometheus Exporter** | Metric collection, scrape endpoint exposure, custom metrics registration | prom-client library, Grafana |
| **Pino Logger** | Structured logging, log levels, JSON formatting, request tracing | All application components, Loki (optional) |

## Data Flow

### User Authentication Flow
```
Browser → POST /api/auth/login → Express
                                   ↓
                         Passport Local Strategy
                                   ↓
                         Storage.getUserByUsername()
                                   ↓
                         PostgreSQL (users table)
                                   ↓
                         bcrypt.compare(password)
                                   ↓
                         Session created (connect-pg-simple)
                                   ↓
                         PostgreSQL (sessions table)
                                   ↓
                         Response with Set-Cookie
                                   ↓
Browser ← Cookie stored
```

### WebSocket Game Event Flow
```
Client → socket.emit('submit_estimate') → Socket.IO Server
                                              ↓
                                    socketHandlers.ts
                                              ↓
                                    Validate user session
                                              ↓
                                    gameState.submitEstimate()
                                              ↓
                                    Update in-memory lobby state
                                              ↓
                                    Calculate consensus (if all voted)
                                              ↓
                      ┌─────────────────────┴─────────────────────┐
                      ▼                                           ▼
            io.to(lobbyId).emit(                        storage.recordEstimation()
              'lobby_updated', newState)                          ↓
                      ↓                                  PostgreSQL (estimation_history)
            All clients in lobby receive update                   ↓
                                                          storage.updateUserStats()
                                                                  ↓
                                                          PostgreSQL (user_stats)
```

### Database Connection Lifecycle
```
App Start → createStorage() → postgres(DATABASE_URL, poolConfig)
                                              ↓
                                   Connection pool initialized
                                   (max: 10-20 idle connections)
                                              ↓
Request → storage.getUser() → Pool acquires connection
                                              ↓
                                   Execute query (Drizzle)
                                              ↓
                                   Release connection to pool
                                              ↓
                         Connection idles (idle_timeout: 20-30s)
                                              ↓
                         Pool closes idle connection (if not needed)
                                              ↓
                         (Neon scales to zero after all connections closed)
```

## Patterns to Follow

### Pattern 1: Graceful Shutdown
**What:** Clean connection draining before process exit

**When:** SIGTERM received from platform (deployment, restart, scaling down)

**Example:**
```typescript
// server/index.ts
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('SIGTERM received, starting graceful shutdown...');

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Give Socket.IO connections time to finish
  io.close(() => {
    console.log('Socket.IO server closed');
  });

  // Close database connection pool
  if (process.env.DATABASE_URL) {
    await postgres.end();
    console.log('Database connections closed');
  }

  // Force exit after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000); // 30 seconds
});
```

### Pattern 2: Connection Pool Configuration
**What:** Tune pool size based on hosting platform limits

**When:** Database initialization (server/storage.ts)

**Example:**
```typescript
// Detect environment and adjust pool
const isProd = process.env.NODE_ENV === 'production';
const isNeon = process.env.DATABASE_URL?.includes('neon.tech');
const isRailway = process.env.RAILWAY_ENVIRONMENT;

const poolConfig = {
  // Neon free tier shares connections, keep low
  max: isNeon && !isProd ? 5 :
       isNeon && isProd ? 10 :
       isRailway ? 15 : 20,

  // Serverless platforms: disable prepared statements
  prepare: isNeon ? false : true,

  // Close idle connections faster on serverless
  idle_timeout: isNeon ? 20 : 30,

  // Fail fast on connection errors
  connect_timeout: 10,
};

const client = postgres(process.env.DATABASE_URL, poolConfig);
```

### Pattern 3: Health Check Implementation
**What:** Return 200 OK when app is ready, 503 when unhealthy

**When:** Platform needs to know if instance should receive traffic

**Example:**
```typescript
// server/routes.ts
app.get('/api/health', async (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }

  try {
    // Check database connectivity
    await storage.getUser(1); // Quick query

    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage().rss / 1024 / 1024, // MB
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.get('/api/ws-health', (req, res) => {
  const socketCount = io.engine.clientsCount;
  res.json({
    status: 'ok',
    connections: socketCount,
  });
});
```

### Pattern 4: Prometheus Metrics Export
**What:** Expose custom metrics for monitoring

**When:** Production deployment with observability needs

**Example:**
```typescript
// server/metrics.ts (already exists)
import { Registry, Counter, Gauge, Histogram } from 'prom-client';
import socketIOPrometheus from 'socket.io-prometheus';

const register = new Registry();

// Custom metrics
const websocketConnections = new Gauge({
  name: 'websocket_connections_total',
  help: 'Total number of active WebSocket connections',
  registers: [register],
});

const gamePhaseCounter = new Counter({
  name: 'game_phase_transitions_total',
  help: 'Total phase transitions',
  labelNames: ['from_phase', 'to_phase'],
  registers: [register],
});

// Apply to Socket.IO
socketIOPrometheus(io, {
  collectDefaultMetrics: true,
  checkForNewNamespaces: true,
  promClient: { register },
});

// Update on events
io.on('connection', (socket) => {
  websocketConnections.inc();
  socket.on('disconnect', () => websocketConnections.dec());
});

// Expose metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Unbounded Connection Pool
**What goes wrong:** Database "too many connections" errors, connection leaks

**Why bad:** Most managed PostgreSQL services have connection limits (Neon Free: shared, Railway: 97, Supabase: plan-dependent)

**Instead:**
```typescript
// DON'T: No max limit
const client = postgres(url);

// DO: Explicit max based on platform
const client = postgres(url, { max: 10 });
```

### Anti-Pattern 2: Synchronous Session Lookup on Every Socket Event
**What goes wrong:** Database query bottleneck, high latency on events

**Why bad:** Socket.IO emits can be hundreds per second during combat, session lookup on each = database overload

**Instead:**
```typescript
// DON'T: Query database on every event
socket.on('submit_estimate', async (data) => {
  const user = await storage.getUser(socket.userId); // DB query
  // handle event
});

// DO: Attach user to socket on connection
io.on('connection', async (socket) => {
  const session = socket.request.session;
  const user = await storage.getUser(session.userId);
  socket.user = user; // Cache on socket object

  socket.on('submit_estimate', (data) => {
    // Use socket.user (no DB query)
  });
});
```

### Anti-Pattern 3: No Idle Timeout on Connections
**What goes wrong:** Idle connections keep database from scaling to zero, wasted compute costs

**Why bad:** Neon charges for compute hours, idle connections prevent shutdown

**Instead:**
```typescript
// DON'T: Connections live forever
const client = postgres(url, { max: 10 });

// DO: Close idle connections
const client = postgres(url, {
  max: 10,
  idle_timeout: 20, // Close after 20s idle
  max_lifetime: 60 * 30, // Recycle after 30 min
});
```

### Anti-Pattern 4: Blocking Process Exit
**What goes wrong:** Platform force-kills process, WebSocket connections drop abruptly, users see errors

**Why bad:** Platforms (Render/Railway/Fly.io) send SIGTERM, wait 30s, then SIGKILL

**Instead:**
```typescript
// DON'T: Ignore SIGTERM
// (default behavior = immediate exit, dropped connections)

// DO: Graceful shutdown (see Pattern 1)
process.on('SIGTERM', gracefulShutdown);
```

## Scalability Considerations

| Concern | At 10 users | At 100 users | At 1000 users |
|---------|------------|--------------|---------------|
| **Application instances** | 1 instance (512MB RAM) | 1-2 instances (PM2 cluster or platform auto-scale) | 3+ instances + Redis for shared state |
| **Database connections** | 5-10 pool max | 10-15 pool max (distribute across instances) | 20+ pool max + PgBouncer connection pooler |
| **PostgreSQL plan** | Neon Free (scale-to-zero) | Neon Launch ($19/mo) or Railway | Neon Scale ($69/mo) or dedicated Postgres |
| **Session storage** | PostgreSQL (connect-pg-simple) | PostgreSQL | Redis session store (faster, distributed) |
| **WebSocket strategy** | Single instance, in-memory state | Sticky sessions (platform load balancer) | Redis adapter for Socket.IO (shared rooms) |
| **Static assets** | Served by Node.js | Served by Node.js | CDN (Cloudflare/Vercel) for Vite build |
| **Monitoring** | Platform dashboard + health checks | Prometheus + Grafana (existing k8s) | Prometheus + Grafana + Loki + alerts |
| **Cost estimate** | $5-10/month (Railway Hobby + Neon Free) | $15-25/month (Render + Neon Launch) | $50-100/month (multi-instance + Neon Scale + CDN) |

## Migration Path: Replit → PaaS

### Current State (Replit)
- Single always-on instance ($20/month Core)
- In-memory session store (data loss on restart)
- No PostgreSQL (in-memory storage fallback)
- No connection pooling configuration
- No graceful shutdown
- No observability beyond Replit dashboard

### Target State (Render + Neon)
- Render Web Service ($7/month)
- Neon PostgreSQL with scale-to-zero (likely <$10/month actual usage)
- PostgreSQL session persistence (connect-pg-simple)
- Connection pool tuned to Neon limits
- Graceful shutdown implemented
- Prometheus metrics + Grafana dashboard

### Migration Steps
1. **Database Setup** (no app changes yet)
   - Create Neon project, copy connection string
   - Run `npm run db:push` to create schema
   - Verify tables exist (users, sessions, etc.)

2. **Environment Configuration**
   - Add `DATABASE_URL` to .env
   - Add `SESSION_SECRET` (generate secure random string)
   - Test locally with PostgreSQL connection

3. **Code Changes** (minimal, mostly config)
   - Update server/storage.ts connection pool config
   - Add SIGTERM handler to server/index.ts
   - Verify health check endpoints return correct status

4. **Platform Deployment**
   - Create Render web service
   - Link GitHub repo (auto-deploy on push)
   - Set environment variables (DATABASE_URL, SESSION_SECRET)
   - Configure health check path: `/api/health`
   - Set start command: `npm run start` (production build)

5. **Validation**
   - Test health endpoint: `curl https://app.onrender.com/api/health`
   - Create test user, verify session persists after restart
   - Monitor Render logs for connection pool messages
   - Check Neon dashboard for connection count

6. **Monitoring Setup**
   - Install socket.io-prometheus
   - Configure Grafana to scrape `/metrics` endpoint
   - Create dashboard with CPU, memory, connections, event loop
   - Set up alerts (high memory, connection count >80% pool)

## Sources

- [Render Health Check Documentation](https://render.com/docs/health-checks) — Implementation patterns
- [Railway Deployment Guide](https://docs.railway.com/guides/deployments) — Environment variables, builds
- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling) — pgBouncer, connection limits
- [postgres.js Documentation](https://github.com/porsager/postgres) — Pool configuration options
- [Socket.IO Scaling Guide](https://socket.io/docs/v4/using-multiple-nodes/) — Redis adapter, sticky sessions
- [PM2 Graceful Shutdown](https://pm2.keymetrics.io/docs/usage/signals-clean-restart/) — SIGTERM handling
- [Express Session Best Practices](https://github.com/expressjs/session#compatible-session-stores) — Store options
- [Prometheus Node.js Metrics](https://github.com/siimon/prom-client#default-metrics) — Metric types

---
*Architecture research for: Hosting optimization and PostgreSQL setup*
*Researched: 2026-02-19*
