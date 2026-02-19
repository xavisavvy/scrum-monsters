# Project Research Summary

**Project:** ScrumQuest v3.0 — Hosting Optimization & PostgreSQL Production Setup
**Domain:** Real-time multiplayer application infrastructure upgrade
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

ScrumQuest is a production-ready real-time multiplayer estimation game with a solid architectural foundation. The v3.0 milestone focuses on infrastructure maturation: transitioning from development-only PostgreSQL setup to production-ready database operations, selecting optimal hosting platforms for cost/performance balance, and implementing resource profiling to prevent production issues.

The recommended approach leverages **existing infrastructure strengths** — ScrumQuest already has IStorage abstraction with both in-memory and PostgreSQL implementations, Drizzle ORM schema for 7 tables, Kubernetes manifests, and session persistence via connect-pg-simple. The migration to production PostgreSQL is **environment-variable driven, not code-driven**. For hosting, the research recommends **Render.com ($7/month) + Neon PostgreSQL (free tier with scale-to-zero)** for MVP testing ($7-14/month total), with a clear path to Kubernetes for high-traffic production. This balances operational simplicity with cost control while maintaining compatibility with the existing Kubernetes infrastructure.

Key risks center on **connection pool exhaustion** (prevent with proper sizing: `max: 10-20` connections based on CPU cores), **memory leaks** in long-running Node.js processes (detect with Clinic.js HeapProfiler), and **database migration failures** (mitigate with staging tests + advisory locks). The research provides clear prevention strategies, monitoring approaches, and mitigation paths for 11 identified pitfalls across critical/moderate/minor severity levels.

## Key Findings

### Recommended Stack

The hosting optimization research identified **managed platforms** as the optimal choice for v3.0 MVP launch, with a clear upgrade path to Kubernetes at scale.

**Core technologies:**
- **Render.com ($7/month)**: Primary hosting platform — native WebSocket support without timeouts, persistent connections, service-based scaling, managed databases with automatic backups. Best balance of simplicity and production features.
- **Neon PostgreSQL (free tier)**: Serverless database with scale-to-zero — 0.5GB storage, 100 CU-hours/month free, autoscaling, connection pooling built-in. Ideal for development/MVP with $0 cost when idle.
- **Clinic.js + autocannon**: Resource profiling suite — automated performance analysis identifying event loop delays, CPU bottlenecks, memory leaks with actionable recommendations. Use in staging before production deploys.
- **PM2**: Process management — memory limit auto-restart (`max_memory_restart: 500M`), cluster mode for multi-core utilization, zero-downtime reloads, real-time dashboard.
- **socket.io-prometheus**: Custom WebSocket metrics — tracks concurrent connections, room counts, event throughput. Integrates with existing Prometheus/Grafana monitoring stack.

**Version compatibility verified:**
- postgres@^3.4.8 with drizzle-orm@^0.45.1 (already installed)
- prom-client@^15.1.3 with socket.io@^4.8.3 (already installed)
- Clinic.js with Node.js 18+ (current: tsx@^4.21.0)

**Critical configuration:**
- PostgreSQL connection pooling: `max: 10` for serverless (Neon), `max: 20` for dedicated instances (Railway/Render)
- PM2 memory limits: `max_memory_restart: '500M'` prevents OOM crashes
- Socket.IO compression: `perMessageDeflate: { threshold: 1024 }` reduces bandwidth 60-80%

### Expected Features

Research identified **8 table stakes** features for production readiness and **7 differentiators** for operational excellence.

**Must have (table stakes):**
- **PostgreSQL Connection Pooling** — sized by formula: `(core_count * 2) + spindle_count` per instance. With 5 instances + 100-conn limit = 20 conns/instance max.
- **Session Persistence (PostgreSQL)** — users stay logged in across server restarts. Already implemented via connect-pg-simple with `createTableIfMissing: true`.
- **Database Migrations (Production)** — versioned migrations with `drizzle-kit generate` + `drizzle-orm migrate()` for audit trail and rollback. Migration job already exists in k8s/base/migration-job.yaml.
- **Graceful Shutdown** — listen for SIGTERM/SIGINT, close HTTP server, drain active connections (with timeout), close DB pool.
- **Memory Leak Detection** — run Clinic.js HeapProfiler in staging to identify leaks before production (constantly increasing Heap Used = leak).
- **Automated Database Backups** — daily backups minimum, 7 daily + 4 weekly retention, pg_dump with gzip compression.
- **Environment-Based Config** — validate required env vars on startup (DATABASE_URL, RECONNECT_TOKEN_SECRET), fail fast if missing.
- **Basic Health Checks** — enhancement to existing `/api/health`: add database connectivity check (`SELECT 1` query).

**Should have (competitive):**
- **Redis Adapter for Horizontal Scaling** — only needed above 10K concurrent connections. Uses Redis Pub/Sub to route messages between Socket.IO servers. Defer to Phase 4+.
- **Clinic.js Performance Suite** — four tools (Doctor, BubbleProf, Flame, HeapProfiler) for automated performance analysis. Run in CI/staging before production deploys.
- **V8 Garbage Collection Tuning** — reduce GC pauses 30-50% with `--max-semi-space-size=64` flag. Profile first with `--trace-gc`.
- **Database Query Optimization** — indexes on frequently queried columns (userId, lobbyId, createdAt) for 10x+ faster lookups.
- **WebSocket Compression** — built-in Socket.IO feature, enable with `perMessageDeflate: { threshold: 1024 }`.
- **Prometheus Custom Dashboards** — pre-built Grafana dashboards for WebSocket metrics (connections, messages/sec, room occupancy, battle phase distribution).
- **Automated Database Cleanup Jobs** — weekly cleanup: `DELETE FROM sessions WHERE expire < NOW()`, keep estimation_history last 90 days.

**Defer (v2+):**
- **Socket.IO State Recovery** — complements existing reconnection tokens. Server remembers room memberships + pending messages during disconnect. Already have reconnection system that works.
- **Connection Rate Limiting** — prevent abuse/DDoS. Add when abuse detected or before public launch.

**Anti-features (explicitly avoid):**
- Custom database connection manager (use postgres.js pooling)
- In-memory session store in production (catastrophic on restart/scale)
- Serverless/Lambda for WebSocket (cold starts on every reconnection >1s)
- Custom profiling tools (use mature Clinic.js suite)

### Architecture Approach

ScrumQuest has a **clear data persistence boundary** already implemented: ephemeral game state (lobbies, combat, votes) in memory Maps, permanent user data (profiles, stats, history, sessions) in PostgreSQL via IStorage abstraction. The migration from MemStorage to PgStorage is **environment-variable driven** (`DATABASE_URL` presence), not a code migration.

**Major components:**
1. **gameState.ts** — lobby lifecycle, player management, game phases. In-memory Map, ephemeral (cleared on restart).
2. **storage.ts** — user CRUD, stats, estimation history, OAuth accounts. PostgreSQL via IStorage interface, survives restarts.
3. **SessionManager** — authentication, session handling. PostgreSQL sessions table via connect-pg-simple when DATABASE_URL set.
4. **ProgressionManager** — XP, levels, class mastery. Persisted to PostgreSQL after battles via IStorage.
5. **Connection Pool (postgres.js)** — pooling configuration: size 10-20 based on instance type, idle timeout 30s, max lifetime 1 hour.

**Integration patterns:**
- **Game completion → persistence flow**: Add hooks in `completeConsensus()` to call `storage.recordEstimation()` for each player, then `ProgressionManager.awardXP()`. Requires player → userId mapping on join.
- **Connection pooling setup**: Add `{ max: 10, idle_timeout: 30, connect_timeout: 10 }` to postgres() call in storage.ts (currently missing explicit pool config).
- **Migration system**: Already production-ready with k8s migration-job.yaml (ArgoCD PreSync hook, wave 5 before app deployment).

**Hosting platform compatibility:**
- **Current Kubernetes**: 3 replicas (prod), 512Mi/1Gi resources, PostgreSQL StatefulSet with 5Gi PVC. Cost: $50-100/month cluster.
- **Alternative Render**: Web service ($7/month) + managed PostgreSQL ($7-20/month). Sticky sessions built-in for WebSocket. Cost: $14-27/month.
- **Migration path**: Start with Render for MVP (<1000 users), migrate to Kubernetes when traffic justifies cluster cost (1000+ concurrent users).

### Critical Pitfalls

Research identified 11 pitfalls across 3 severity levels. Top 5 by impact:

1. **Connection Pool Exhaustion (CRITICAL)** — all PostgreSQL connections in use, new queries timeout. **Prevention:** Size pool by formula `(core_count * 2) + spindle_count`, set `connect_timeout: 10000` to fail fast, monitor with Prometheus (alert when >90% utilization). **Detection:** "connection acquisition timeout" errors, `pool.totalCount === pool.max`, query latency spikes (p95 >200ms).

2. **Memory Leaks in Long-Running Processes (CRITICAL)** — Node.js accumulates unreleased objects over hours/days, heap grows until OOM crash. **Prevention:** Run Clinic.js HeapProfiler in staging (`clinic heapprofiler -- node dist/index.js`) for 30+ minutes, always call `socket.off()` in cleanup, set PM2 memory limit `max_memory_restart: '500M'`. **Detection:** Process RSS grows >100MB/hour continuously, constantly increasing heapUsed, Clinic.js flame graph shows accumulating allocations.

3. **Unhandled Promise Rejections (CRITICAL)** — async errors crash entire process in production. Database failures, network timeouts, validation errors all terminate server if not caught. **Prevention:** Global handler `process.on('unhandledRejection', (err) => { logger.error(err); })`, wrap all async operations in try/catch, test error paths (disconnect database during query). **Detection:** Process exits with code 1 unexpectedly, "UnhandledPromiseRejectionWarning" in logs, PM2 shows frequent restarts.

4. **Database Migration Failures (CRITICAL)** — schema changes fail mid-deployment, database left in inconsistent state. **Prevention:** Test ALL migrations in staging first, use Drizzle's migration tracking table (`__drizzle_migrations`), lock migration execution with PostgreSQL advisory locks, wrap in transactions. **Detection:** Deployment fails with SQL syntax errors, tables half-created, `__drizzle_migrations` shows partial application.

5. **Event Loop Blocking (MODERATE)** — synchronous operations block event loop, WebSocket message processing stops, players experience lag. **Prevention:** Use async file operations (`fs.promises` not `fs.readFileSync`), offload heavy computation to worker threads, monitor event loop lag with Prometheus (alert >100ms), parse JSON incrementally for payloads >1MB. **Detection:** `process_event_loop_lag_seconds` metric spikes, players report lag during voting/battle, Clinic.js Doctor shows "Event Loop" bottleneck.

**Phase-specific warnings:**
- **Phase 1 (Database Foundation)**: Watch for PIT-01 (Pool Exhaustion), PIT-04 (Migration Failures) — test migrations in staging, size pool based on CPU cores.
- **Phase 2 (Reliability)**: Watch for PIT-03 (Unhandled Rejections), PIT-07 (Backup Failure) — add global error handler, test restoration monthly.
- **Phase 3 (Performance)**: Watch for PIT-02 (Memory Leaks), PIT-05 (Event Loop Blocking) — run Clinic.js in staging, monitor event loop lag.

## Implications for Roadmap

Based on research, v3.0 milestone should be structured as **3 sequential phases** (Database Foundation → Reliability & Monitoring → Performance Optimization) with Phase 4+ deferred post-launch.

### Phase 1: Database Foundation (Week 1)
**Rationale:** Can't go to production without reliable database setup. These are blocking requirements that must complete before any deployment.
**Delivers:** Production-ready PostgreSQL with connection pooling, versioned migrations, persistent sessions, environment-specific configuration.
**Addresses:**
- PostgreSQL Connection Pooling (FEATURES.md table stakes)
- Database Migrations Production (FEATURES.md table stakes)
- Session Persistence PostgreSQL (FEATURES.md table stakes)
- Environment-Based Config (FEATURES.md table stakes)

**Avoids:**
- PIT-01 (Connection Pool Exhaustion) via proper pool sizing
- PIT-04 (Database Migration Failures) via staging tests + advisory locks
- PIT-10 (Dev/Prod Database Bleeding) via environment validation

**Implementation notes:**
- Add explicit pool config to storage.ts: `{ max: 10, idle_timeout: 30, connect_timeout: 10 }`
- Migration system already exists (k8s/base/migration-job.yaml), verify ArgoCD PreSync hook
- Session persistence already implemented (connect-pg-simple), just needs DATABASE_URL set
- Add startup validation for required env vars (DATABASE_URL, RECONNECT_TOKEN_SECRET, NODE_ENV)

### Phase 2: Reliability & Monitoring (Week 2)
**Rationale:** Production reliability essentials before accepting real users. Monitoring prevents issues, graceful shutdown prevents data loss, backups enable disaster recovery.
**Delivers:** Production-ready error handling, health checks with database connectivity, automated backups with restoration testing, graceful shutdown on deployments.
**Uses:**
- PM2 for process management (STACK.md)
- Prometheus + Grafana (existing k8s/infrastructure/monitoring/)
- pg_dump for backups (STACK.md)

**Implements:**
- Graceful Shutdown (FEATURES.md table stakes)
- Enhanced Health Checks with DB connectivity (FEATURES.md table stakes)
- CPU/Event Loop Monitoring (FEATURES.md table stakes)
- Automated Database Backups (FEATURES.md table stakes)

**Avoids:**
- PIT-03 (Unhandled Promise Rejections) via global error handler
- PIT-07 (Backup Failure Silent) via alerting + monthly restoration tests
- PIT-11 (Aggressive Health Check Timeouts) via generous 5-10s timeout

**Implementation notes:**
- Add global handler: `process.on('unhandledRejection', (err) => { logger.error(err); })`
- Enhance `/api/health`: add `await db.query('SELECT 1')` with try/catch
- Set up PM2 with `max_memory_restart: '500M'` in ecosystem.config.cjs
- Schedule backup job (node-schedule or cron): daily pg_dump, compress with gzip, 7 daily + 4 weekly retention

### Phase 3: Performance Optimization (Week 3)
**Rationale:** Performance improvements with high ROI and low complexity. Do these before scaling features to establish baselines and prevent issues at scale.
**Delivers:** Indexed database queries, reduced bandwidth via compression, optimized garbage collection, memory leak detection in staging environment.
**Uses:**
- Clinic.js for profiling (STACK.md)
- socket.io-prometheus for WebSocket metrics (STACK.md)
- V8 GC tuning flags (STACK.md)

**Implements:**
- Database Query Optimization (FEATURES.md differentiator)
- WebSocket Compression (FEATURES.md differentiator)
- V8 Garbage Collection Tuning (FEATURES.md differentiator)
- Memory Leak Detection (FEATURES.md table stakes)

**Avoids:**
- PIT-02 (Memory Leaks) via Clinic.js HeapProfiler in staging
- PIT-05 (Event Loop Blocking) via monitoring + async operations
- PIT-08 (Environment Variable Leakage) via sanitized error logging

**Implementation notes:**
- Add indexes to schema: `index('user_stats_user_id_idx').on(userStats.userId)`, similar for estimationHistory, sessions
- Enable Socket.IO compression: `perMessageDeflate: { threshold: 1024 }` in server/websocket.ts
- Add V8 flags to start script: `--max-semi-space-size=64` (profile first with `--trace-gc`)
- Run Clinic.js in staging: `clinic heapprofiler -- node dist/index.js` for 30+ minutes under load

### Phase 4+: Scaling (Post-Launch, Deferred)
**Rationale:** These features support scale beyond initial launch requirements (budget: $5-20/mo → likely <1000 users initially). Validate product-market fit first, then scale infrastructure.
**Deferred features:**
- Redis Adapter for Horizontal Scaling (FEATURES.md differentiator) — only needed above 10K concurrent connections
- Socket.IO State Recovery (FEATURES.md differentiator) — already have reconnection system that works
- Connection Rate Limiting (FEATURES.md differentiator) — add when abuse detected or before public launch
- Prometheus Custom Dashboards (FEATURES.md differentiator) — build incrementally as monitoring needs grow
- Automated Database Cleanup Jobs (FEATURES.md differentiator) — schedule after 1 month of production data

**Trigger for Phase 4:** Either (1) concurrent connections approaching 5K on single instance, or (2) hosting costs exceed $50/month, or (3) evidence of abuse requiring rate limiting.

### Phase Ordering Rationale

- **Sequential, not parallel**: Each phase builds on the previous. Can't optimize performance (Phase 3) without reliable monitoring (Phase 2). Can't monitor effectively without stable database (Phase 1).
- **Database first**: Connection pooling, migrations, sessions are foundational. Without these, app crashes or loses data on restart. Everything else depends on stable database.
- **Reliability before optimization**: Add error handling and monitoring (Phase 2) before performance tuning (Phase 3). Need monitoring baselines to measure optimization impact.
- **Defer scaling features**: Redis adapter, state recovery, rate limiting only matter above 1000 concurrent users. MVP target: <100 users. Don't pay complexity cost until needed.

**Critical path dependencies:**
```
Phase 1: Database Foundation
  ├─> Connection Pooling → Session Persistence
  └─> Database Migrations → Automated Backups (Phase 2)

Phase 2: Reliability & Monitoring
  ├─> Graceful Shutdown → Health Checks
  └─> Error Handling → Monitoring Setup
      └─> Performance Optimization (Phase 3)

Phase 3: Performance Optimization
  ├─> Query Optimization → Memory Leak Detection
  └─> GC Tuning → WebSocket Compression
```

### Research Flags

**Needs deeper research during planning:**
- **Phase 4+ (Horizontal Scaling)**: Redis adapter configuration for Socket.IO, sticky session setup on load balancers, pub/sub message routing patterns. Current research covers concepts but not implementation details. Use `/gsd:research-phase` when implementing.

**Standard patterns (skip research-phase):**
- **Phase 1 (Database Foundation)**: Well-documented patterns. Drizzle migrations already configured, connection pooling is standard postgres.js config, session persistence already implemented. Follow existing codebase patterns.
- **Phase 2 (Reliability & Monitoring)**: Prometheus/Grafana already set up (k8s/infrastructure/monitoring/), pg_dump is standard PostgreSQL tooling, PM2 has extensive documentation. No novel research needed.
- **Phase 3 (Performance Optimization)**: Clinic.js has official docs with clear usage, V8 GC tuning is well-documented, Socket.IO compression is single config flag. Straightforward implementation.

**Knowledge gaps to fill during execution:**
- **Hosting platform selection**: Research provides options (Render/Fly.io/Railway), but final decision needs budget clarity and traffic projections. Determine during Phase 1 planning.
- **Backup storage provider**: Research mentions S3 for backup uploads but doesn't specify Neon/Render managed backup capabilities. Investigate native backup features before implementing custom solution.
- **PM2 cluster mode compatibility**: Research mentions cluster mode but doesn't detail Socket.IO sticky session compatibility. Verify sticky sessions work with PM2 cluster before enabling.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All hosting platforms verified with 2026 pricing (Render, Railway, Fly.io, Neon). PostgreSQL services confirmed with current free tier limits. Profiling tools (Clinic.js, PM2) actively maintained with recent documentation. Version compatibility verified against existing package.json. |
| Features | HIGH | Feature categorization based on production Node.js/Socket.IO best practices from authoritative sources (Socket.IO official docs, Node.js guides, PostgreSQL documentation). Table stakes vs differentiators validated against multiple hosting platform incident reports and scaling case studies. |
| Architecture | HIGH | ScrumQuest codebase reviewed directly (storage.ts, gameState.ts, server/index.ts). IStorage abstraction already implemented with both MemStorage and PgStorage. Kubernetes manifests exist for PostgreSQL StatefulSet. Migration job configured in k8s/base/. Architecture patterns match industry-standard separation of ephemeral state (memory) vs persistent data (database). |
| Pitfalls | HIGH | Pitfalls sourced from production Node.js incident reports (memory leaks, connection exhaustion), PostgreSQL best practices (migration failures, pool sizing), and Socket.IO scaling documentation (sticky sessions, event loop blocking). All 11 pitfalls include detection methods and mitigation strategies verified against multiple sources. |

**Overall confidence:** HIGH

### Gaps to Address

**Budget and traffic projections:**
- Research provides 3 cost tiers ($5-10/mo, $15-20/mo, $20+/mo) but doesn't know actual budget or expected launch traffic.
- **Action during planning:** Determine budget constraints and initial user projections. If budget <$15/mo → use Neon free tier + Railway. If budget $15-30/mo → use Render + Neon. If existing cluster available → keep Kubernetes.

**Hosting platform migration strategy:**
- Research recommends Render for simplicity but ScrumQuest already has Kubernetes manifests.
- **Action during planning:** Decide whether to (1) migrate to managed platform for operational simplicity, or (2) keep Kubernetes deployment and apply database/monitoring improvements. Not a technical gap — a business decision between OpEx (managed) vs CapEx (Kubernetes).

**Multi-instance Socket.IO testing:**
- Research identifies need for Redis adapter and sticky sessions when scaling horizontally, but doesn't detail testing procedure.
- **Action during Phase 4 planning:** Set up staging environment with 2+ instances, verify reconnection works, monitor for "transport error" logs. Document sticky session requirements for each hosting platform (Fly.io: automatic, Render: best-effort, Railway: needs config).

**Backup restoration validation:**
- Research recommends monthly backup restoration tests but doesn't specify automation approach.
- **Action during Phase 2 execution:** Create staging restoration script: (1) download latest backup, (2) restore to temporary database, (3) run test queries to validate data integrity, (4) alert if restoration fails. Schedule via GitHub Actions or cron.

## Sources

### Primary (HIGH confidence)

**Hosting Platforms:**
- [Render.com Pricing](https://render.com/pricing) — 2026 pricing, WebSocket support
- [Render WebSocket Documentation](https://render.com/docs/websocket) — Persistent connection details
- [Railway Pricing 2026](https://railway.com/pricing) — $5/month Hobby tier
- [Fly.io Pricing](https://fly.io/pricing/) — Global deployment costs
- [AWS Lightsail Pricing](https://aws.amazon.com/lightsail/pricing/) — Node.js blueprint

**Managed PostgreSQL:**
- [Neon Pricing 2026](https://neon.com/pricing) — Free tier, scale-to-zero
- [Neon Plans Documentation](https://neon.com/docs/introduction/plans) — Connection limits
- [Neon Serverless Postgres Pricing Analysis](https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/) — 2025 pricing cuts
- [Supabase vs Neon Comparison](https://www.bytebase.com/blog/neon-vs-supabase/) — Feature comparison

**Resource Profiling:**
- [Clinic.js Official Site](https://clinicjs.org/) — Memory profiling suite
- [Clinic.js GitHub](https://github.com/clinicjs/node-clinic) — Documentation
- [Node.js Memory Profiling Guide](https://oneuptime.com/blog/post/2026-01-26-nodejs-memory-leak-profiling/view) — 2026 best practices
- [PM2 Monitoring Documentation](https://pm2.keymetrics.io/docs/usage/monitoring/) — Real-time dashboard

**Socket.IO & WebSocket:**
- [Socket.IO Performance Tuning](https://socket.io/docs/v4/performance-tuning/) — Official optimization guide
- [Socket.IO Multi-Node Scaling](https://socket.io/docs/v4/using-multiple-nodes/) — Redis adapter
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) — Configuration

**Database & ORM:**
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations) — Official docs
- [Drizzle PostgreSQL Best Practices](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) — Connection pooling
- [Node.js Connection Pooling Guide](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view) — Pool sizing
- [node-postgres Pooling](https://node-postgres.com/features/pooling) — postgres.js features

### Secondary (MEDIUM confidence)

**Platform Comparisons:**
- [Render vs Fly.io Comparison](https://render.com/articles/render-vs-fly-io) — Feature/cost analysis
- [Railway vs Render (2026)](https://northflank.com/blog/railway-vs-render) — Developer experience
- [Deployment Platforms Comparison](https://www.jasonsy.dev/blog/comparing-deployment-platforms-2025) — WebSocket support

**Performance & Monitoring:**
- [Node.js Application Monitoring Tools 2026](https://betterstack.com/community/comparisons/nodejs-application-monitoring-tools/) — Tool comparison
- [Profiling Node.js Applications](https://betterstack.com/community/guides/scaling-nodejs/profiling-nodejs-applications/) — Techniques
- [Prometheus, Loki, Grafana Integration 2026](https://johal.in/cloud-native-observability-stack-prometheus-grafana-loki-and-tempo-integration-for-full-stack-monitoring-2026-3/) — Full stack monitoring

**Load Testing:**
- [k6 WebSocket Documentation](https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/) — Native support
- [autocannon npm package](https://www.npmjs.com/package/autocannon) — HTTP benchmarking
- [Load Testing Node.js Apps](https://v-checha.medium.com/load-testing-tools-for-node-js-developers-98291ed75a4b) — Tool comparison

---
*Research completed: 2026-02-19*
*Ready for roadmap: YES*
