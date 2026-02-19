# Research Summary: PostgreSQL Database & Hosting Optimization

**Domain:** Real-time multiplayer estimation game with persistent user data
**Researched:** 2026-02-19
**Overall confidence:** HIGH

## Executive Summary

ScrumQuest's architecture is **already prepared for PostgreSQL integration** — the hard work is done. The codebase has:

1. **Complete IStorage abstraction** with both MemStorage and PgStorage implementations
2. **Production-ready schema** (7 tables via Drizzle ORM)
3. **Kubernetes deployment manifests** for PostgreSQL StatefulSet
4. **Automated migration system** (ArgoCD PreSync hooks)

**The "migration" is a 5-minute environment variable configuration, not a code rewrite.**

The hosting optimization decision is about **operational trade-offs**, not technical capability:
- **Keep Kubernetes** → Best cost per user at scale, full control
- **Switch to Render/Fly.io** → Lower operational overhead, faster iteration

Both paths work with the existing codebase. The architecture supports both self-hosted and managed infrastructure.

---

## Key Findings

### Stack: Already PostgreSQL-Ready

**Existing Implementation (server/storage.ts):**
- `IStorage` interface defines contract for all data operations
- `MemStorage` class implements in-memory fallback (no DATABASE_URL)
- `PgStorage` class implements PostgreSQL via Drizzle ORM + postgres.js driver
- Factory pattern: `createStorage()` chooses implementation based on env var

**What's Missing:**
- Connection pool configuration (add `{ max: 10 }` to postgres() call)
- Player → User mapping (add `userId?` to Player interface)
- Persistence hooks in game completion logic

**Confidence:** HIGH — The foundation exists, only optimization and integration needed.

### Architecture: Clear Data Boundaries

**Ephemeral (In-Memory):**
- Active lobbies, player positions, combat states
- Current votes, timers, boss AI state
- Reconnect tokens (10-minute grace period)

**Persistent (PostgreSQL):**
- User accounts, OAuth linkage
- User profiles (preferences, XP, level)
- User stats (games played, accuracy, bosses defeated)
- Estimation history (per-ticket voting records)
- Class mastery progress
- Sessions (when DATABASE_URL set)

**Integration Point:** Game completion triggers persistence (record estimation history, update stats, award XP).

**Confidence:** HIGH — Separation of concerns already enforced by existing architecture.

### Features: Hosting Platform Options

**Current: Kubernetes (Self-Hosted)**
- Pros: Cost-effective at scale, full control, already configured
- Cons: Operational overhead, fixed costs, requires DevOps expertise

**Alternative 1: Render (Recommended for MVP)**
- Pros: Simple, automatic scaling, managed PostgreSQL, WebSocket support
- Cons: Higher per-instance cost, less infrastructure control
- Cost: $14-45/month (1-2 instances + Starter PostgreSQL)

**Alternative 2: Fly.io (Recommended for WebSocket Performance)**
- Pros: Edge deployment, first-class WebSocket support, global low-latency
- Cons: Slightly more complex than Render, usage-based pricing
- Cost: $10-80/month depending on traffic

**Alternative 3: Neon (For Development/Staging)**
- Pros: Scale-to-zero (free when idle), serverless PostgreSQL
- Cons: Not ideal for production (predictable costs better with Render/Kubernetes)
- Cost: Free tier for dev, usage-based for production

**Decision Matrix:**
- Team <5 engineers → Render
- Global audience, low-latency critical → Fly.io
- Steady high traffic (>500 CCU) → Kubernetes (current)
- Dev/staging environments → Neon

**Confidence:** HIGH — Hosting platform research from [Render vs Fly.io comparison](https://render.com/articles/render-vs-fly-io) and [deployment platforms 2025 comparison](https://www.jasonsy.dev/blog/comparing-deployment-platforms-2025).

### Critical Pitfall: Multi-Instance WebSocket Without Redis Adapter

**Problem:** Scaling to 2+ app instances without Socket.IO Redis adapter causes:
- Clients on different instances can't see each other's events
- Votes/attacks/chat only broadcast within single instance
- Silent data loss (no errors, just missing events)

**Solution (Required Before Scaling):**
```typescript
// Add to server/websocket.ts
import { createAdapter } from '@socket.io/redis-adapter';
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

**Redis Options:**
- Kubernetes: Use existing redis-service:6379 (already deployed)
- Render: Provision Render Redis or use Upstash
- Fly.io: Fly.io Redis (native protocol support)

**Note:** Current Upstash Redis (HTTP) is for caching only, not Socket.IO pub-sub.

**Confidence:** HIGH — From [Socket.IO multi-node scaling docs](https://socket.io/docs/v3/using-multiple-nodes/).

---

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: PostgreSQL Connection Optimization (Week 1 — 4 hours)**

**What:** Add connection pool config, set DATABASE_URL in staging
**Why First:** Foundation for all persistence features; minimal risk
**Addresses Features:** Database persistence (from FEATURES.md)
**Avoids Pitfall:** Connection pool exhaustion under load
**Research Flag:** None — straightforward implementation

**Code Changes:**
```typescript
// server/storage.ts
const client = postgres(connectionString, {
  max: 10,              // 10 connections per instance
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 3600
});
```

**Phase 2: Multi-Instance WebSocket Support (Week 2 — 1 day)**

**What:** Add Socket.IO Redis adapter for pub-sub across instances
**Why Second:** Required before scaling horizontally (2+ instances)
**Addresses Features:** Horizontal scaling, load balancing
**Avoids Pitfall:** Silent event loss in multi-instance deployment
**Research Flag:** Test cross-instance event propagation thoroughly

**Code Changes:**
```typescript
// server/websocket.ts
if (process.env.REDIS_URL) {
  io.adapter(createAdapter(pubClient, subClient));
}
```

**Phase 3: Player → User Mapping (Week 2-3 — 1 day)**

**What:** Add `userId?` to Player interface, link authenticated sessions
**Why Third:** Enables stats/XP persistence for authenticated users
**Addresses Features:** User progression, stats tracking
**Avoids Pitfall:** Guests continue to work (userId optional)
**Research Flag:** None — backward compatible addition

**Code Changes:**
```typescript
// shared/gameEvents.ts
export interface Player {
  id: string;
  userId?: number;  // Link to users table
  // ... existing fields
}
```

**Phase 4: Stats Persistence Hooks (Week 3-4 — 2 days)**

**What:** Add DB writes to game completion events (consensus, boss defeat)
**Why Fourth:** Builds on Phase 3 userId mapping
**Addresses Features:** Estimation history, XP awards, achievement tracking
**Avoids Pitfall:** Async persistence (don't block WebSocket events)
**Research Flag:** Load test DB write impact on throughput

**Code Changes:**
```typescript
// server/gameState.ts completeConsensus()
for (const player of activePlayers) {
  if (player.userId) {
    await storage.recordEstimation({ userId, lobbyId, ... });
    await storage.incrementUserStat(userId, 'ticketsEstimated');
  }
}
```

**Phase 5: Enhanced Monitoring (Month 2 — 1 day)**

**What:** Add DB pool metrics, query duration histograms to Prometheus
**Why Fifth:** Operational visibility after features deployed
**Addresses Features:** Performance monitoring, cost optimization
**Avoids Pitfall:** Instrument before scaling to production
**Research Flag:** Standard; unlikely to need deeper research

**Code Changes:**
```typescript
// server/metrics.ts
export const dbConnectionPoolSize = new Gauge({ ... });
export const dbQueryDuration = new Histogram({ ... });
```

**Phase 6: Hosting Platform Migration (Optional — Month 3+)**

**What:** Migrate from Kubernetes to Render/Fly.io (if desired)
**Why Last:** No user-facing changes, purely operational
**Addresses Features:** Cost optimization, operational simplicity
**Avoids Pitfall:** No code changes required (environment variables only)
**Research Flag:** Data migration testing (pg_dump/restore)

**Migration Steps:**
1. Create render.yaml or fly.toml
2. Provision managed PostgreSQL
3. Migrate data: `pg_dump $OLD | psql $NEW`
4. Update DNS
5. Monitor for 1 week before decommissioning old infrastructure

---

## Phase Ordering Rationale

**Why Connection Pool First:**
- Foundational for all database operations
- No user-facing changes (optimization only)
- Prevents resource exhaustion in testing

**Why Redis Adapter Before Scaling:**
- Silent failure mode (events dropped, no errors)
- Must test multi-instance behavior before production
- Blocks horizontal scaling if missing

**Why User Mapping Before Persistence:**
- Persistence hooks depend on userId field
- Backward compatible (guests still work)
- Enables incremental rollout (some users authenticated, some guests)

**Why Monitoring After Features:**
- Need features deployed to have meaningful metrics
- Can instrument existing code without blocking feature work
- Grafana dashboards built after data flows exist

**Why Hosting Migration Last:**
- Zero code changes (operational only)
- Can revert easily if issues arise
- Not blocking any features

---

## Research Flags for Phases

| Phase | Research Needed? | Complexity | Notes |
|-------|-----------------|------------|-------|
| **Phase 1: Connection Pool** | No | Low | Standard postgres.js configuration |
| **Phase 2: Redis Adapter** | No | Medium | Standard Socket.IO pattern, test cross-instance |
| **Phase 3: User Mapping** | No | Low | Straightforward field addition |
| **Phase 4: Persistence Hooks** | Minor | Medium | Load test DB write impact on game latency |
| **Phase 5: Monitoring** | No | Low | Standard Prometheus patterns |
| **Phase 6: Hosting Migration** | Minor | High | Platform-specific (Render vs Fly.io docs) |

**Deep Research Only Needed For:**
- Phase 4: Measuring database write latency under load (k6 tests)
- Phase 6: Platform migration guides (if switching from Kubernetes)

**Standard Patterns (No Research):**
- Phases 1-3, 5: Well-documented patterns, existing implementations in codebase

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Drizzle ORM + postgres.js well-documented; [connection pooling best practices](https://www.answeroverflow.com/m/1154016477381414932) verified |
| **Features** | HIGH | Hosting platform comparisons from [Render vs Fly.io](https://render.com/articles/render-vs-fly-io) and [2025 deployment platforms](https://www.jasonsy.dev/blog/comparing-deployment-platforms-2025) |
| **Architecture** | HIGH | Existing codebase analysis confirms IStorage abstraction complete |
| **Pitfalls** | HIGH | Multi-instance WebSocket issue well-documented in [Socket.IO scaling docs](https://socket.io/docs/v3/using-multiple-nodes/) |

**Overall Confidence: HIGH** — No major unknowns. Implementation is straightforward optimization and integration work.

---

## Gaps to Address

### Gaps from Research

**1. Load Testing Database Write Latency (Phase 4)**
- **Gap:** Unknown impact of persistence hooks on WebSocket event latency
- **Resolution:** Run k6 load tests comparing:
  - Current (no DB writes)
  - With persistence (write estimation history on consensus)
- **Target:** Maintain <100ms WebSocket event delivery
- **Action:** Create `tests/load/db/persistence-impact.test.js`

**2. Platform-Specific Migration Guides (Phase 6 — If Switching)**
- **Gap:** Render vs Fly.io specific deployment steps
- **Resolution:** Choose platform → follow official quick start
  - Render: render.yaml blueprint
  - Fly.io: fly.toml configuration
- **Action:** Document chosen platform's deployment process

### Gaps Not Addressed (Out of Scope)

**1. Multi-Region Database Replication**
- Not needed for MVP (single-region PostgreSQL sufficient)
- Defer until >1000 CCU across multiple continents

**2. Real-Time Database Subscriptions (Supabase)**
- Not needed (Socket.IO already handles real-time)
- Supabase real-time would duplicate existing functionality

**3. Advanced Caching Strategies (Redis Read-Through)**
- Current Upstash caching is adequate
- Defer optimization until load testing shows bottleneck

---

## Next Steps

### Immediate Actions (This Week)

1. **Add connection pool config** to server/storage.ts (10 lines)
2. **Set DATABASE_URL** in .env (local) and staging environment
3. **Run migrations**: `npm run db:migrate` (verify schema applied)
4. **Test persistence**: Login → check sessions table populated

### This Sprint (Week 1-2)

1. **Phase 1**: Optimize connection pooling
2. **Phase 2**: Add Socket.IO Redis adapter
3. **Test multi-instance**: Deploy 2 replicas, verify cross-instance events

### Next Sprint (Week 3-4)

1. **Phase 3**: Add userId to Player interface
2. **Phase 4**: Implement persistence hooks
3. **Load test**: Measure DB write impact on latency

### Month 2+

1. **Phase 5**: Enhanced monitoring (Grafana dashboards)
2. **Phase 6** (Optional): Hosting platform migration
3. **Production scale**: Horizontal scaling testing (3-10 replicas)

---

## Open Questions (None)

All research questions answered with high confidence. No blocking unknowns.

**Hosting Decision (Optional):**
- Keep Kubernetes? → No action needed (already configured)
- Switch to Render? → Follow Phase 6 migration steps
- Switch to Fly.io? → Follow Phase 6 migration steps

**Technical Decision:**
- Use Neon for staging? → Recommended (free scale-to-zero)
- Use Render Postgres for production? → If using Render hosting
- Keep Kubernetes StatefulSet? → If using Kubernetes hosting

Both paths are **equally valid** — choose based on team operations preference.

---

## Sources Summary

### Primary Sources (HIGH confidence)

**PostgreSQL & Drizzle ORM:**
- [Drizzle ORM Best Practices](https://www.answeroverflow.com/m/1154016477381414932)
- [Node.js Connection Pooling Guide](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view)
- [Node-postgres Pool API](https://node-postgres.com/apis/pool)

**Hosting Platforms:**
- [Render vs Fly.io Comparison](https://render.com/articles/render-vs-fly-io)
- [Railway vs Render (2026)](https://northflank.com/blog/railway-vs-render)
- [Deployment Platforms Comparison 2025](https://www.jasonsy.dev/blog/comparing-deployment-platforms-2025)

**Managed Databases:**
- [PostgreSQL Hosting Providers (2026)](https://northflank.com/blog/best-postgresql-hosting-providers)
- [Neon vs Supabase Comparison](https://www.bytebase.com/blog/neon-vs-supabase/)
- [PostgreSQL Pricing Comparison](https://www.bytebase.com/blog/postgres-hosting-options-pricing-comparison/)

**Redis & Session Management:**
- [Redis Session Storage with Express](https://redis.io/learn/develop/node/nodecrashcourse/sessionstorage)
- [Socket.IO Multi-Node Scaling](https://socket.io/docs/v3/using-multiple-nodes/)
- [ElastiCache Redis for Sessions (2026)](https://oneuptime.com/blog/post/2026-02-12-elasticache-redis-for-session-caching/view)

### Secondary Sources (Context only)

**Supabase Analysis:**
- [Supabase vs PlanetScale](https://www.leanware.co/insights/supabase-vs-planetscale)
- Conclusion: Not ideal for ScrumQuest (already has auth + Socket.IO)

**WebSocket Hosting:**
- [Render WebSocket Support](https://render.com/articles/alternatives-to-fly-io)
- [Fly.io WebSocket Performance](https://docs.railway.com/platform/compare-to-fly)

All sources verified February 2026 or later (current year-appropriate).
