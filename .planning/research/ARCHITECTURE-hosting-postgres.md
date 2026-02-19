# Architecture Patterns: PostgreSQL & Hosting Integration

**Domain:** Real-time multiplayer estimation game with persistent user data
**Researched:** 2026-02-19
**Overall Confidence:** HIGH

---

## Executive Summary

ScrumQuest already has a **robust architecture foundation** for PostgreSQL integration:
- IStorage interface with both MemStorage (in-memory) and PgStorage (PostgreSQL) implementations
- Drizzle ORM schema defining 7 tables (users, oauth_accounts, user_profiles, user_stats, estimation_history, sessions, class_mastery_progress)
- Kubernetes manifests for PostgreSQL StatefulSet with persistent volumes
- Clear data persistence boundary: **ephemeral game state in memory**, **permanent user data in database**

**Key Integration Insight:** The migration from MemStorage to DatabaseStorage is **already implemented** — it's an environment variable switch (`DATABASE_URL`), not a code migration.

**Hosting Optimization Strategy:** Current architecture supports both **self-hosted Kubernetes** (current deployment) and **managed platform** alternatives (Render/Fly.io for simplicity). The choice affects how PostgreSQL and Redis are provisioned, not the application code.

---

## Recommended Architecture

### Data Persistence Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  (Express + Socket.IO + Domain Managers)                    │
└────────┬────────────────────────────────────────┬───────────┘
         │                                        │
         ▼                                        ▼
┌────────────────────┐              ┌────────────────────────┐
│  EPHEMERAL STATE   │              │   PERSISTENT STATE     │
│  (In-Memory)       │              │   (PostgreSQL)         │
├────────────────────┤              ├────────────────────────┤
│ • lobbies Map      │              │ • users                │
│ • playerPositions  │              │ • oauth_accounts       │
│ • combatStates     │              │ • user_profiles        │
│ • boss state       │              │ • user_stats           │
│ • votes (current)  │              │ • estimation_history   │
│ • timers/intervals │              │ • class_mastery        │
│ • reconnect tokens │              │ • sessions             │
└────────────────────┘              └────────────────────────┘
         │                                        │
         ▼ (Optional)                             ▼
┌────────────────────┐              ┌────────────────────────┐
│  CACHE LAYER       │              │  CONNECTION POOL       │
│  (Redis/Upstash)   │              │  (postgres.js)         │
├────────────────────┤              ├────────────────────────┤
│ • lobby snapshots  │              │ • Pool size: 10-20     │
│ • player sessions  │              │ • Idle timeout: 30s    │
│ • reconnect lookup │              │ • maxUses: 5000        │
└────────────────────┘              └────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Data Store | Notes |
|-----------|---------------|------------|-------|
| **gameState.ts** | Lobby lifecycle, player management, game phases | In-memory Map | Ephemeral; cleared on server restart |
| **storage.ts** | User CRUD, stats, history, OAuth | PostgreSQL (IStorage) | Survives server restarts |
| **SessionManager** | User authentication, session handling | PostgreSQL sessions table | Via connect-pg-simple when DATABASE_URL set |
| **ProgressionManager** | XP, levels, class mastery | PostgreSQL (via IStorage) | Persisted after battles |
| **EstimationManager** | Vote handling, consensus logic | Memory → DB on completion | Votes ephemeral; results persisted |
| **CombatManager** | Boss AI, damage, healing | In-memory | Game session only |
| **redis.ts** | Optional lobby/session cache | Upstash Redis (HTTP) | Performance optimization; app works without it |

---

## PostgreSQL Integration Points

### 1. Connection Setup (EXISTING)

**Current Implementation:**
```typescript
// server/storage.ts (line 376-379)
constructor(connectionString: string) {
  const client = postgres(connectionString);
  this.db = drizzle(client);
}

// server/storage.ts (line 619-628) - Factory pattern
function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    console.log("📦 Using PostgreSQL storage");
    return new PgStorage(process.env.DATABASE_URL);
  }
  console.log("📦 Using in-memory storage (no DATABASE_URL set)");
  return new MemStorage();
}
```

**Connection Pooling Configuration:**

According to [Drizzle ORM best practices](https://www.answeroverflow.com/m/1154016477381414932), the `postgres.js` driver used in ScrumQuest supports connection pooling with configuration like:

```typescript
const client = postgres(connectionString, {
  max: 10,                     // Max connections (adjust for multi-instance)
  idle_timeout: 30,            // Idle timeout (seconds)
  connect_timeout: 10,         // Connection timeout (seconds)
  max_lifetime: 3600,          // Max connection lifetime (1 hour)
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false
});
```

**Scaling Considerations:**

From [connection pooling production guide](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view):
- Formula: `connections = (core_count * 2) + 1` per instance
- For Kubernetes with 3 replicas: `max: 10` per pod = 30 total connections
- PostgreSQL default: 100 connections
- **Action Required:** Add `{ max: 10 }` to postgres() call in storage.ts

### 2. Schema Migration (EXISTING)

**Current Setup:**
- Schema defined: `shared/schema.ts` (7 tables)
- Drizzle config: `drizzle.config.ts` → migrations/ folder
- Migration job: `k8s/base/migration-job.yaml` (ArgoCD PreSync hook)
- Script: `npm run db:migrate` (runs drizzle-kit migrate)

**Migration Flow:**
```
1. Developer: npm run db:migrate:generate  → creates migration SQL
2. Commit migration to migrations/
3. Deploy triggers ArgoCD
4. ArgoCD runs migration-job (wave 5, before app deployment)
5. App pods start with migrated schema
```

**No changes needed** — migration system already production-ready.

### 3. Data Flow: Game Completion → Persistence

**Current Pattern (needs enhancement):**

```typescript
// CURRENT: Game state mutation in gameState.ts
completeConsensus(lobbyId: string): void {
  // ... consensus logic ...
  lobby.completedTickets.push(completedTicket); // Stored in memory only
}

// PROPOSED: Add persistence hooks
async completeConsensus(lobbyId: string): Promise<void> {
  // ... consensus logic ...

  // Persist estimation history for each player
  for (const player of participatingPlayers) {
    await storage.recordEstimation({
      userId: player.userId!, // Requires player.userId mapping
      lobbyId,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      estimatedPoints: player.currentScore,
      consensusPoints: consensusScore,
      wasInConsensus: player.currentScore === consensusScore
    });
  }

  // Update user stats (XP, accuracy, etc.)
  await ProgressionManager.awardXP(lobby);
}
```

**Integration Point:** Add player → user mapping when they join with authenticated session.

### 4. Session Store Integration (EXISTING)

**Current Implementation:**
```typescript
// server/index.ts (line 22-32)
if (process.env.DATABASE_URL) {
  const PgSession = connectPgSimple(session);
  sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",
    createTableIfMissing: true,
  });
}
```

**Already configured** — sessions persist to PostgreSQL when DATABASE_URL is set.

---

## Hosting Platform Integration

### Current Deployment: Kubernetes (Self-Hosted)

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                      Ingress (TLS)                           │
└─────────────────┬───────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────┐
│          Service (ClusterIP) - scrumquest:5000               │
└─────────────────┬───────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Deployment (3 replicas - prod)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Pod 1   │  │  Pod 2   │  │  Pod 3   │                  │
│  │ 512Mi/1G │  │ 512Mi/1G │  │ 512Mi/1G │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       │             │             │                          │
└───────┼─────────────┼─────────────┼──────────────────────────┘
        │             │             │
        └─────────────┼─────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL StatefulSet (1 replica, 5Gi PVC)                │
│  + Redis Deployment (1 replica, emptyDir)                   │
└─────────────────────────────────────────────────────────────┘
```

**Resource Allocation (k8s/overlays/prod):**
- App pods: 512Mi request / 1Gi limit, 200m CPU / 1000m limit
- PostgreSQL: 256Mi request / 512Mi limit
- Redis: 64Mi request / 128Mi limit
- HPA: scales 3-10 replicas based on CPU 70%

**Pros:**
- Full control over infrastructure
- Already configured and tested
- Cost-effective for steady workloads

**Cons:**
- Requires Kubernetes cluster management
- Fixed costs regardless of usage
- More operational overhead

### Alternative: Managed Platform (Render/Fly.io/Railway)

**Recommended Option: Render**

According to [Render vs Fly.io comparison](https://render.com/articles/render-vs-fly-io), Render balances simplicity with production features like autoscaling, managed databases, and private networking.

**Architecture on Render:**
```
┌─────────────────────────────────────────────────────────────┐
│  Web Service (scrumquest-app)                               │
│  - Docker deployment (multi-process: Express + Socket.IO)   │
│  - Health check: /api/health                                │
│  - Auto-deploy from main branch                             │
│  - Environment: NODE_ENV=production, DATABASE_URL, REDIS_URL│
│  - Instance: Standard (512MB RAM, 0.5 CPU)                  │
│  - Scaling: 1-5 instances                                   │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Managed PostgreSQL (Render Postgres)                       │
│  - Plan: Starter ($7/month) → Standard ($20/month)          │
│  - Automatic backups, point-in-time recovery                │
│  - Connection pooling built-in                              │
│  - Direct DATABASE_URL injection                            │
└─────────────────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Managed Redis (Render Redis) - OPTIONAL                    │
│  - Plan: Starter ($10/month) or use Upstash (current)       │
└─────────────────────────────────────────────────────────────┘
```

**Render Configuration:**
- render.yaml (infrastructure as code)
- Sticky sessions: Built-in for WebSocket support
- TLS: Automatic with custom domains
- Monitoring: Built-in metrics dashboard

**Cost Comparison (Monthly):**

| Component | Kubernetes (Self-Hosted) | Render (Managed) |
|-----------|-------------------------|------------------|
| Compute | Cluster cost (~$50-100/mo) | Web service: $7-25/mo per instance |
| PostgreSQL | Included in cluster | $7 (Starter) - $20 (Standard) |
| Redis | Included in cluster | Upstash free tier (current) |
| **Total** | $50-100 | $14-45 (1-2 instances) |

**When to Use Each:**

| Scenario | Recommendation | Reason |
|----------|---------------|--------|
| **Development/Staging** | Render or Railway | Fast iteration, no infrastructure management |
| **MVP/Low Traffic** | Render | Cost-effective, easy scaling |
| **High Traffic (1000+ CCU)** | Kubernetes | Better cost per user at scale |
| **Enterprise** | Kubernetes | Full control, compliance requirements |

### WebSocket Considerations

**Sticky Sessions Required:**

From [Socket.IO multi-node docs](https://socket.io/docs/v3/using-multiple-nodes/), when scaling horizontally:
1. **Enable sticky sessions** (route client to same server)
2. **Use Redis adapter** for pub-sub across instances

**Current Implementation (server/websocket.ts — needs verification):**
- Check if Redis adapter is configured for multi-instance Socket.IO
- ScrumQuest currently uses Upstash Redis for caching, not Socket.IO adapter

**Required Addition for Multi-Instance:**
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

**Platform Support:**

According to [hosting platform comparison](https://www.jasonsy.dev/blog/comparing-deployment-platforms-2025):
- **Fly.io:** First-class WebSocket support, edge deployment
- **Render:** WebSocket supported, best-effort sticky sessions
- **Railway:** WebSocket supported, simple service linking
- **Replit:** WebSocket supported (current deployment target)

**Recommendation:** If moving to managed platform, use **Fly.io** for optimal WebSocket performance or **Render** for balance of features and simplicity.

---

## Managed Database Providers

### Option 1: Neon (Serverless PostgreSQL)

**Architecture:**
- Separates storage and compute
- Scales to zero when idle
- Connection pooling via Neon proxy

**Pricing:**
- Free tier: 0.5GB storage, scale-to-zero
- Paid: Usage-based (CU-hours + storage)

**Best For:**
- Development/staging (free scale-to-zero)
- Bursty workloads

**Connection String:**
```
postgres://user:pass@ep-xxx.neon.tech/scrumquest?sslmode=require
```

**Source:** [Neon vs Supabase comparison](https://www.bytebase.com/blog/neon-vs-supabase/)

### Option 2: Supabase (Backend-as-a-Service)

**Architecture:**
- PostgreSQL + Auth + Real-time subscriptions
- REST API auto-generated from schema

**Pricing:**
- Free tier: 500MB database, 2GB bandwidth
- Pro: $25/month (8GB database, 50GB bandwidth)

**Best For:**
- Need authentication (already have OAuth)
- Want real-time DB subscriptions (alternative to Socket.IO for some features)

**Not Ideal Because:**
- ScrumQuest already has auth (Passport.js + OAuth)
- Real-time via Socket.IO (don't need Supabase real-time)

**Source:** [Supabase vs Neon comparison](https://bertomill.medium.com/supabase-vs-neon-the-battle-of-postgresql-titans-418044159d1f)

### Option 3: Render Managed PostgreSQL

**Architecture:**
- Managed PostgreSQL with automatic backups
- Integrated with Render app services
- Built-in connection pooling (PgBouncer)

**Pricing:**
- Starter: $7/month (256MB RAM, 1GB storage)
- Standard: $20/month (2GB RAM, 10GB storage)

**Best For:**
- Using Render for app hosting (same ecosystem)
- Simple pricing, no surprises

**Source:** [Render PostgreSQL docs](https://render.com/articles/render-vs-fly-io)

### Option 4: Self-Hosted in Kubernetes (Current)

**Already Implemented:**
- StatefulSet with 5Gi PVC
- PostgreSQL 16 Alpine
- Automated migration job

**Best For:**
- Production workloads
- Cost control at scale
- Existing Kubernetes infrastructure

### Recommendation Matrix

| Environment | Database Provider | Reason |
|-------------|------------------|--------|
| **Local Dev** | Docker Compose PostgreSQL | Already configured (npm run up) |
| **Hosted Dev** | Neon Free Tier | Scale-to-zero, no cost when idle |
| **Staging** | Render Starter ($7) or Neon | Matches hosting platform |
| **Production** | Kubernetes StatefulSet (current) | Cost-effective, already configured |

---

## Sources

### PostgreSQL & Drizzle ORM
- [Drizzle ORM Best Practices](https://www.answeroverflow.com/m/1154016477381414932)
- [Node.js Connection Pooling Guide](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view)
- [Node-postgres Pool API](https://node-postgres.com/apis/pool)

### Hosting Platforms
- [Render vs Fly.io Comparison](https://render.com/articles/render-vs-fly-io)
- [Railway vs Render (2026)](https://northflank.com/blog/railway-vs-render)
- [Deployment Platforms Comparison](https://www.jasonsy.dev/blog/comparing-deployment-platforms-2025)

### Managed Databases
- [PostgreSQL Hosting Providers (2026)](https://northflank.com/blog/best-postgresql-hosting-providers)
- [Neon vs Supabase Comparison](https://www.bytebase.com/blog/neon-vs-supabase/)
- [PostgreSQL Hosting Pricing Comparison](https://www.bytebase.com/blog/postgres-hosting-options-pricing-comparison/)

### Redis & Session Management
- [Redis Session Storage with Express](https://redis.io/learn/develop/node/nodecrashcourse/sessionstorage)
- [Socket.IO Multi-Node Scaling](https://socket.io/docs/v3/using-multiple-nodes/)
- [ElastiCache Redis for Sessions (2026)](https://oneuptime.com/blog/post/2026-02-12-elasticache-redis-for-session-caching/view)
