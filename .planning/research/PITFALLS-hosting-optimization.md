# Domain Pitfalls: Hosting & PostgreSQL Optimization

**Domain:** Real-time multiplayer game with Socket.IO
**Context:** Adding PostgreSQL persistence, hosting optimization, and resource profiling to existing ScrumQuest
**Researched:** 2026-02-19

---

## Critical Pitfalls

These mistakes cause rewrites, data loss, or major production outages.

---

### Pitfall 1: Creating Database Connection Pool Per Socket.IO Connection

**What goes wrong:** Each WebSocket connection creates its own database connection pool instead of sharing a singleton pool. With 100 concurrent players, this creates 100 connection pools (each with 10-20 connections), exhausting PostgreSQL's connection limit (typically 100-400).

**Why it happens:**
- Developers initialize database client in Socket.IO connection handler
- Passing pool instance to event handlers without realizing it creates new pools
- Not understanding connection pooling vs connection reuse

**Consequences:**
- Database rejects connections with "FATAL: sorry, too many clients already"
- App crashes under moderate load (50+ users)
- Cascading failures as clients reconnect and create more pools
- $500+ monthly PgBouncer costs to bandaid the issue

**Prevention:**
1. Create ONE connection pool at server startup, store in singleton
2. Pass pool reference (not constructor) to Socket.IO handlers
3. Size pool for total server instances: if 5 Node instances and 100 DB connection limit, use max 20 connections per instance
4. Monitor `pg_stat_activity` to verify connection count stays below limit
5. Use PgBouncer in transaction mode for connection pooling if needed

**Detection:**
- `SELECT count(*) FROM pg_stat_activity` shows connections = socket_count * pool_size
- Database logs show "too many clients" errors
- Pool exhaustion errors appear intermittently under load

**Reference sources:**
- [How to Implement Connection Pooling in Node.js for PostgreSQL/MySQL](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view)
- [Node.js + PostgreSQL: The Simple Trick to Effortlessly Scale 10,000+ Connections](https://medium.com/@rajat29gupta/node-js-postgresql-the-simple-trick-to-effortlessly-scale-10-000-connections-312c3079d362)

**Confidence:** HIGH (documented pattern, verified with official sources)

---

### Pitfall 2: Migrating to PostgreSQL Without Data Migration Strategy

**What goes wrong:** Switching from in-memory storage to PostgreSQL loses all active game sessions, player progress, and lobby state. Users mid-game get disconnected and lose data.

**Why it happens:**
- Treating migration as "flip a switch" instead of gradual transition
- Not planning for in-flight data during cutover
- Assuming "no DATABASE_URL" means "no data to preserve"

**Consequences:**
- All lobbies deleted on deployment
- Players lose XP, stats, class mastery progress
- Negative reviews: "game reset my progress"
- Community trust damage

**Prevention:**
1. **Dual-write period:** Write to both in-memory AND PostgreSQL for 1-2 weeks
2. **Export before migration:** Serialize in-memory maps to JSON, bulk insert to PostgreSQL
3. **Feature flag cutover:** Use environment variable to switch read source (memory → DB)
4. **Graceful session handling:**
   - Notify users of maintenance window
   - Save lobby state to Redis/PostgreSQL before restart
   - Implement connection state recovery with offset tracking
5. **Verify migration:** Compare in-memory vs PostgreSQL data counts before final cutover

**Detection:**
- User reports of lost progress
- Empty tables after deployment
- Spike in "create new account" actions

**Reference sources:**
- [How I Achieved Zero Downtime in Advanced SQL Data Migrations](https://medium.com/learning-sql/how-i-achieved-zero-downtime-in-advanced-sql-data-migrations-using-postgresql-and-python-168650e8cfe5)
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)

**Confidence:** MEDIUM (WebSearch verified with official docs, real-world examples)

---

### Pitfall 3: Not Handling WebSocket Reconnection After Database Failure

**What goes wrong:** Database query fails during Socket.IO event handler. Exception crashes handler, Socket.IO doesn't emit error to client, client waits indefinitely for response. Reconnection restores socket but game state is desynchronized.

**Why it happens:**
- No try-catch around database operations in socket handlers
- Socket.IO's connection state recovery doesn't replay failed DB transactions
- Client assumes all emitted events succeed

**Consequences:**
- Players see "frozen" game state
- Vote submissions disappear
- Boss HP desyncs (client thinks boss is dead, server says alive)
- Players forced to refresh, losing lobby connection

**Prevention:**
1. **Wrap all DB operations in try-catch:**
   ```typescript
   socket.on('submit_vote', async (data) => {
     try {
       await db.insert(votes).values(data);
       socket.emit('vote_recorded', { success: true });
     } catch (err) {
       logger.error({ err, playerId: socket.id }, 'Failed to record vote');
       socket.emit('vote_recorded', { success: false, error: 'Database error' });
     }
   });
   ```

2. **Implement idempotent operations:** Use `ON CONFLICT` clauses to prevent duplicate inserts on retry

3. **Enable Socket.IO connection state recovery:**
   ```typescript
   io.on('connection', (socket) => {
     if (socket.recovered) {
       // Don't resend lobby_updated, client already has state
     } else {
       // Send full state snapshot
     }
   });
   ```

4. **Client-side retry logic:** If server doesn't ACK within 5s, show error and allow manual retry

5. **State reconciliation endpoint:** `/api/lobby/:id/state` that clients can poll to verify state

**Detection:**
- Client logs show "waiting for response" timeouts
- Server logs show unhandled promise rejections
- User reports "my vote didn't count"

**Reference sources:**
- [Connection state recovery | Socket.IO](https://socket.io/docs/v4/connection-state-recovery)
- [Chat Using Socket.io With Best Practices](https://medium.com/@tabid434/chat-using-socket-io-with-best-practices-socket-real-time-db-5ed5c7933cf1)

**Confidence:** HIGH (Socket.IO official docs, real-time database patterns)

---

### Pitfall 4: Replit Sleep Cycles Killing Active Game Sessions

**What goes wrong:** On Replit free tier, app sleeps after 5 minutes of inactivity. Mid-game, server goes to sleep, all WebSocket connections drop, lobbies are destroyed from memory, players can't reconnect.

**Why it happens:**
- Replit considers WebSocket connections as "inactive" if no HTTP requests
- In-memory game state (lobbies Map) lost when container restarts
- Free tier doesn't support Always-on ($20/month required)

**Consequences:**
- Games interrupted every 5-10 minutes
- "Server disconnected" errors during estimation rounds
- Players lose voting progress and boss battle state
- 10-30 second cold start delay when reconnecting

**Prevention:**
1. **Immediate solution:** Migrate off Replit to Fly.io, Railway, or Render (all ~$5-15/month with always-on)
2. **If staying on Replit:**
   - Upgrade to Replit Core ($20/month) for Always-on
   - Reduce pingInterval in Socket.IO config to 15s to keep connections "active"
   - Persist lobby state to external Redis/PostgreSQL every 30s
3. **Implement state persistence:**
   - Save lobbies Map to Redis on every state change
   - Restore lobbies from Redis on server startup
   - Store reconnection tokens with 15-minute expiry
4. **Client-side keepalive:** Emit heartbeat every 20s to prevent "inactivity"

**Detection:**
- Logs show container restarts every 5-10 minutes
- "Container went to sleep" messages in Replit console
- Players report frequent disconnections
- Database shows lobby_created events without corresponding lobby_ended events

**Reference sources:**
- [Replit Free Tier Limits: Sleep Time, Performance & What to Know](https://www.p0stman.com/guides/replit-limitations/)
- [Replit — Hosting Apps with Always On](https://blog.replit.com/alwayson)

**Confidence:** HIGH (Replit official docs, community reports)

---

### Pitfall 5: PostgreSQL Table Bloat from Frequent Game Event Writes

**What goes wrong:** Game events (votes, damage, healing) generate 100+ small writes per minute. PostgreSQL creates dead tuples on every UPDATE/DELETE. Without proper autovacuum tuning, tables bloat to 10x actual data size, slowing queries by 500%.

**Why it happens:**
- Default autovacuum settings designed for OLTP workloads (infrequent writes)
- Real-time game events trigger autovacuum threshold too slowly
- No partitioning strategy for time-series event data

**Consequences:**
- Query times increase from 5ms to 2500ms
- Disk space grows 10x faster than expected
- Index scans become table scans
- $100+ monthly storage costs for 1GB of actual data

**Prevention:**
1. **Aggressive autovacuum tuning:**
   ```sql
   ALTER TABLE estimation_history SET (
     autovacuum_vacuum_scale_factor = 0.01,  -- Trigger at 1% dead tuples
     autovacuum_vacuum_threshold = 50,       -- Minimum 50 dead tuples
     autovacuum_analyze_scale_factor = 0.05
   );
   ```

2. **Table partitioning for event history:**
   - Partition estimation_history by month: `estimation_history_2026_02`
   - Each partition auto-vacuums independently
   - Drop old partitions instead of DELETE (no bloat)

3. **Batch inserts instead of individual writes:**
   - Collect 10-50 events in memory, insert in single transaction
   - Reduces WAL (Write-Ahead Log) generation by 80%

4. **Monitor bloat percentage:**
   ```sql
   SELECT schemaname, tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
          n_dead_tup, n_live_tup,
          round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
   FROM pg_stat_user_tables
   WHERE n_live_tup > 0
   ORDER BY n_dead_tup DESC;
   ```

5. **Use UNLOGGED tables for ephemeral data:**
   - Lobby state that's reconstructed from Redis on restart
   - 2x faster writes, no WAL overhead

**Detection:**
- `pg_stat_user_tables` shows `n_dead_tup > n_live_tup`
- Table size grows but row count stays flat
- `EXPLAIN ANALYZE` shows "Seq Scan" instead of "Index Scan"

**Reference sources:**
- [How to Reduce Bloat in Large PostgreSQL Tables](https://www.tigerdata.com/learn/how-to-reduce-bloat-in-large-postgresql-tables)
- [Table partitioning in PostgreSQL: performance and index bloat](https://medium.com/cubbit/table-partitioning-in-postgresql-performance-bloat-7c248dd2d604)
- [Tuning PostgreSQL for Write Heavy Workloads](https://www.cloudraft.io/blog/tuning-postgresql-for-write-heavy-workloads)

**Confidence:** HIGH (PostgreSQL official docs, production case studies)

---

## Moderate Pitfalls

These cause performance issues or user frustration, but don't break the system.

---

### Pitfall 6: Memory Leaks from Unremoved Socket.IO Event Listeners

**What goes wrong:** Every reconnection adds new event listeners without removing old ones. After 100 reconnects, same event has 100 handlers, all firing simultaneously. Memory usage grows unbounded, crashes with "JavaScript heap out of memory."

**Why it happens:**
- `socket.on()` called on reconnect without `socket.off()` on disconnect
- Assuming Socket.IO auto-removes listeners (it doesn't for custom events)
- Revival session timeouts stored in Map but never cleared

**Consequences:**
- Server crashes after 6-24 hours (depends on reconnection rate)
- Each action triggers 50+ redundant database writes
- Event processing slows from 1ms to 500ms
- Heap snapshots show listener arrays consuming 2GB+ memory

**Prevention:**
1. **Remove listeners on disconnect:**
   ```typescript
   socket.on('disconnect', () => {
     socket.removeAllListeners('submit_vote');
     socket.removeAllListeners('deal_damage');
     // OR remove all custom listeners
     socket.removeAllListeners();
   });
   ```

2. **Use `socket.once()` for single-use handlers:**
   ```typescript
   socket.once('avatar_selected', handleAvatarSelection);
   ```

3. **Clear timeouts and intervals on disconnect:**
   ```typescript
   const revivalKey = `${reviverId}:${targetId}`;
   const session = this.revivalSessions.get(revivalKey);
   if (session?.timeoutHandle) {
     clearTimeout(session.timeoutHandle);
   }
   this.revivalSessions.delete(revivalKey);
   ```

4. **Monitor listener count:**
   ```typescript
   const listenerCount = socket.listenerCount('submit_vote');
   if (listenerCount > 1) {
     logger.warn({ event: 'submit_vote', count: listenerCount }, 'Duplicate listeners detected');
   }
   ```

5. **Weekly heap snapshot comparison:**
   - Take snapshots at same time each week
   - Compare retained size of listener arrays
   - Alert if growth > 20%

**Detection:**
- Node.js warning: "MaxListenersExceededWarning: Possible EventEmitter memory leak detected"
- Heap snapshots show growing arrays of listeners
- Memory usage increases linearly with uptime
- Duplicate database writes for single user action

**Reference sources:**
- [Memory leak · Issue #3477 · socketio/socket.io](https://github.com/socketio/socket.io/issues/3477)
- [How to Fix 'Memory Leak' Detection](https://oneuptime.com/blog/post/2026-01-24-memory-leak-detection/view)
- [Debugging memory leaks in Node.js](https://www.yld.io/blog/debugging-memory-leaks-in-node-js-a-walkthrough)

**Confidence:** HIGH (Socket.IO GitHub issues, Node.js debugging guides)

---

### Pitfall 7: Google Cloud Run 5-Minute WebSocket Timeout

**What goes wrong:** Hosting on Google Cloud Run with default settings causes WebSocket connections to close after 5 minutes (300s request timeout). Active game sessions disconnect mid-battle, forcing players to reconnect every 5 minutes.

**Why it happens:**
- Cloud Run treats WebSocket as HTTP request with default 5-minute timeout
- Developers assume "long-lived connection support" means unlimited duration
- Not implementing application-level keepalive (Socket.IO ping/pong)

**Consequences:**
- Players disconnected during 10+ minute boss battles
- Lobby state desynced after timeout
- User complaints: "keeps kicking me out"
- Poor user experience

**Prevention:**
1. **Increase Cloud Run request timeout to 60 minutes:**
   ```yaml
   apiVersion: serving.knative.dev/v1
   kind: Service
   spec:
     template:
       spec:
         timeoutSeconds: 3600  # 60 minutes
   ```

2. **Implement Socket.IO keepalive:**
   ```typescript
   const io = new Server(server, {
     pingInterval: 20000,  // Send ping every 20s
     pingTimeout: 20000,   // Wait 20s for pong before disconnect
   });
   ```

3. **Alternative platforms for WebSockets:**
   - Fly.io: No hard timeout, usage-based pricing (~$15/month)
   - Railway: WebSocket-friendly, $5-20/month
   - Render: Persistent containers, $7/month starter

4. **Client-side reconnection logic:**
   - Exponential backoff: 1s, 2s, 4s, 8s (max 30s)
   - Show "Reconnecting..." UI overlay
   - Request state sync on reconnection

**Detection:**
- WebSocket connections close exactly at 5-minute mark
- Cloud Run logs show request timeout errors
- Pattern of disconnections every 300 seconds

**Reference sources:**
- [Using WebSockets | Cloud Run | Google Cloud](https://docs.cloud.google.com/run/docs/triggering/websockets)
- [How to Fix 'Connection Timeout' WebSocket Errors](https://oneuptime.com/blog/post/2026-01-24-websocket-connection-timeout/view)

**Confidence:** HIGH (Google Cloud official docs)

---

### Pitfall 8: Drizzle/Zod TypeScript Compatibility Issues in Existing Schema

**What goes wrong:** Existing `shared/schema.ts` uses `drizzle-zod` with Zod v3.23. Upgrading to Zod v4 or Drizzle ORM's new first-class schema generation causes TypeScript errors: "Type 'ZodObject<...>' is not assignable to type 'ZodTypeAny'."

**Why it happens:**
- Drizzle deprecated `drizzle-zod` package in favor of built-in `createInsertSchema`
- Zod v4 changed internal type definitions
- Mixing old `drizzle-zod` with new Drizzle ORM versions

**Consequences:**
- Build fails with TypeScript errors
- Can't upgrade dependencies
- Stuck on outdated Drizzle version with security vulnerabilities
- Validation schemas don't match database schema

**Prevention:**
1. **Migrate from `drizzle-zod` to first-class Drizzle support:**
   ```typescript
   // OLD (drizzle-zod)
   import { createInsertSchema } from 'drizzle-zod';

   // NEW (built-in)
   import { createInsertSchema } from 'drizzle-orm/zod';
   ```

2. **Update to Zod v3.25.1+ (or v4):**
   ```bash
   npm install zod@latest drizzle-orm@latest
   npm uninstall drizzle-zod
   ```

3. **Fix type errors with explicit generic:**
   ```typescript
   export const insertUserSchema = createInsertSchema(users, {
     email: (schema) => schema.email.email(),
     password: (schema) => schema.password.min(8),
   });
   ```

4. **Test validation schemas after migration:**
   - Verify all `.pick()` operations still work
   - Check `.refine()` custom validators
   - Run full test suite with real data

**Detection:**
- TypeScript compilation errors in `shared/schema.ts`
- Build fails on CI/CD pipeline
- Type inference broken in API handlers

**Reference sources:**
- [Drizzle ORM - zod](https://orm.drizzle.team/docs/zod)
- [Contract-Driven Development with Drizzle, NextJS and Zod](https://medium.com/@tonyvantur/type-safe-validation-with-drizzle-and-orpc-c7e4cba6ffd8)

**Confidence:** MEDIUM (Drizzle docs, community reports)

---

### Pitfall 9: Not Profiling Actual WebSocket Memory Usage Before Scaling

**What goes wrong:** Team assumes "10,000 concurrent connections is fine" based on blog posts, deploys to production, crashes at 500 users. Each Socket.IO connection actually uses 50KB (buffers, state, listeners), not the assumed 5KB.

**Why it happens:**
- Using theoretical calculations instead of profiling actual app
- Not accounting for game state stored per connection (player, lobby, boss)
- Ignoring framework overhead (Socket.IO, Express)

**Consequences:**
- OOM (Out of Memory) crashes during peak usage
- Emergency downtime to add memory
- Wasted money on over-provisioned instances

**Prevention:**
1. **Load test with realistic game sessions:**
   ```bash
   npx artillery quick --count 100 --num 50 wss://localhost:5000/socket.io/
   ```

2. **Take heap snapshots at different connection counts:**
   - 10 connections: snapshot A
   - 100 connections: snapshot B
   - Calculate: (B - A) / 90 = memory per connection

3. **Profile in production-like environment:**
   - Same Node.js version
   - Same environment variables
   - Same database connection pool size

4. **Monitor actual memory usage:**
   ```typescript
   setInterval(() => {
     const usage = process.memoryUsage();
     logger.info({
       rss: Math.round(usage.rss / 1024 / 1024),
       heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
       connections: io.engine.clientsCount,
     }, 'Memory usage');
   }, 60000);
   ```

5. **Calculate actual capacity:**
   - Measure: 500MB heap used for 100 connections
   - Per connection: 5MB
   - Max connections: (Available RAM - OS overhead) / 5MB

**Detection:**
- Server crashes with "JavaScript heap out of memory"
- Memory usage grows faster than expected with connections
- CloudWatch/monitoring shows sawtooth pattern (OOM → restart)

**Reference sources:**
- [Node.js Memory Leaks: Detection & Debugging | Toptal](https://www.toptal.com/nodejs/debugging-memory-leaks-node-js-applications)
- [How to Scale WebSocket Connections](https://oneuptime.com/blog/post/2026-01-26-websocket-scaling/view)

**Confidence:** MEDIUM (Real-world examples, profiling guides)

---

## Minor Pitfalls

These cause inconvenience but are easily fixed.

---

### Pitfall 10: Postgres Adapter for Socket.IO Doesn't Prevent Split-Brain

**What goes wrong:** Team uses `@socket.io/postgres-adapter` to scale across multiple server instances. Database connection drops briefly, adapter fails to relay events, instances continue operating independently with divergent lobby state.

**Why it happens:**
- Assuming adapter guarantees consistency
- Not implementing state reconciliation logic
- No health checks for adapter connectivity

**Consequences:**
- Two players in same lobby see different boss HP
- Vote counts don't match across instances
- Lobby phase desyncs (one instance in "battle", other in "scoring")

**Prevention:**
1. **Monitor adapter connectivity:**
   ```typescript
   adapter.on('error', (err) => {
     logger.error({ err }, 'Postgres adapter error - potential split brain');
     // Implement circuit breaker or failover
   });
   ```

2. **Use Redis adapter instead (more battle-tested):**
   - Redis has better connection pooling for pub/sub
   - Lower latency than PostgreSQL LISTEN/NOTIFY

3. **Implement state reconciliation:**
   - Periodic state sync: every 30s, instances compare lobby state hashes
   - If mismatch, designate primary instance (lowest server ID)
   - Secondary instances pull state from primary

4. **Health check adapter connectivity:**
   - Test PUBLISH/SUBSCRIBE roundtrip every 10s
   - If latency > 1000ms, alert and disable instance from load balancer

**Detection:**
- User reports "votes not showing up for others"
- Server logs show adapter connection errors
- Different instances emit different `lobby_updated` states

**Reference sources:**
- [Postgres adapter | Socket.IO](https://socket.io/docs/v4/postgres-adapter/)

**Confidence:** MEDIUM (Socket.IO docs, distributed systems patterns)

---

### Pitfall 11: Not Setting Up Drizzle Migrations Before First Deploy

**What goes wrong:** Team runs `drizzle-kit push` in development, deploys to production, realizes push doesn't work in read-only filesystems or without migration history. Must hand-write SQL to match existing schema.

**Why it happens:**
- Using `push` (dev-only convenience) instead of `generate` + `migrate` (production workflow)
- Not understanding difference between schema-first and migration-first workflows
- Deleting migration history assuming it's regeneratable

**Consequences:**
- Production schema diverges from TypeScript schema
- Manual SQL migrations introduce human errors
- Can't rollback schema changes
- CI/CD deploys fail with "relation does not exist"

**Prevention:**
1. **Use generate/migrate workflow from day one:**
   ```bash
   npx drizzle-kit generate    # Creates migration SQL files
   npx drizzle-kit migrate     # Applies migrations to database
   ```

2. **Commit migration files to Git:**
   - `drizzle/migrations/*.sql` should be versioned
   - Migration history is source of truth

3. **Run migrations in CI/CD:**
   ```yaml
   # In deployment script
   - name: Run database migrations
     run: npx drizzle-kit migrate
   ```

4. **NEVER manually modify migration history:**
   - Deleting migrations causes Drizzle to lose track of schema version
   - Always generate new migration for changes

5. **Test migrations on staging first:**
   - Apply migrations to staging database
   - Verify schema matches `drizzle-kit introspect` output

**Detection:**
- Production deploy fails with "column does not exist"
- `drizzle-kit push` works in dev but fails in prod
- Schema drift between environments

**Reference sources:**
- [3 Biggest Mistakes with Drizzle ORM](https://medium.com/@lior_amsalem/3-biggest-mistakes-with-drizzle-orm-1327e2531aff)
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)

**Confidence:** HIGH (Drizzle official docs, community mistakes)

---

### Pitfall 12: Replit WebSocket Rate Limiting Not Documented

**What goes wrong:** Game works perfectly in development with 5 users. Deploy to Replit, hit 50+ users, WebSocket connections randomly close with no error message. Replit's undocumented rate limits kick in.

**Why it happens:**
- Replit doesn't publish specific WebSocket connection limits
- Ping interval too frequent (Socket.IO default: 25s)
- Outbound data transfer limits (1GB/month free tier)

**Consequences:**
- Intermittent disconnections under load
- No clear error messages in logs
- Users blame game, not infrastructure

**Prevention:**
1. **Increase Socket.IO ping interval to reduce network requests:**
   ```typescript
   const io = new Server(server, {
     pingInterval: 60000,  // Reduce from 25s to 60s
     pingTimeout: 30000,
   });
   ```

2. **Monitor outbound data usage:**
   - Socket.IO payloads should be minimal (JSON, no images)
   - Disable unnecessary debug logging in production

3. **Migrate to platform with clear limits:**
   - Fly.io: Documented WebSocket support, no hidden limits
   - Railway: Clear usage metrics dashboard
   - Render: Transparent pricing, no rate limit surprises

4. **Implement graceful degradation:**
   - If connection drops, show "Limited connectivity" warning
   - Queue actions locally, sync on reconnect

**Detection:**
- Random WebSocket disconnects at specific user counts (e.g., always at 47-53 users)
- No correlation with server CPU/memory
- Replit dashboard shows "rate limited" (if visible)

**Reference sources:**
- [Replit — Distributed Websocket Rate Limiting](https://blog.replit.com/websocket-rate-limiting)
- [Replit Free Tier Limits](https://www.p0stman.com/guides/replit-limitations/)

**Confidence:** MEDIUM (Replit blog, community experiences)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Database Migration (Phase 1)** | Connection pool per socket (Critical #1) | Create singleton pool at startup, pass reference to handlers |
| **Database Migration (Phase 1)** | Data loss during cutover (Critical #2) | Implement dual-write period, export in-memory state before migration |
| **Database Migration (Phase 1)** | Drizzle/Zod compatibility (Moderate #8) | Migrate to built-in `createInsertSchema`, upgrade Zod to v3.25.1+ |
| **Database Migration (Phase 1)** | Missing migration history (Minor #11) | Use `generate` + `migrate` workflow, commit migration files to Git |
| **Hosting Migration (Phase 2)** | Replit sleep cycles (Critical #4) | Migrate to Fly.io/Railway/Render ($5-15/month), implement state persistence |
| **Hosting Migration (Phase 2)** | Cloud Run timeout (Moderate #7) | Set `timeoutSeconds: 3600`, or choose WebSocket-friendly platform |
| **Hosting Migration (Phase 2)** | Replit rate limits (Minor #12) | Increase ping interval, migrate to platform with clear limits |
| **Database Optimization (Phase 3)** | Table bloat from events (Critical #5) | Aggressive autovacuum tuning, partition by month, batch inserts |
| **WebSocket Reliability (Phase 4)** | No reconnection after DB failure (Critical #3) | Try-catch all DB ops, enable connection state recovery, implement retry logic |
| **WebSocket Reliability (Phase 4)** | Memory leaks from listeners (Moderate #6) | Remove listeners on disconnect, use `socket.once()`, clear timeouts |
| **WebSocket Reliability (Phase 4)** | Postgres adapter split-brain (Minor #10) | Monitor adapter errors, use Redis adapter, implement state reconciliation |
| **Resource Profiling (Phase 5)** | Inaccurate capacity planning (Moderate #9) | Load test with realistic sessions, heap snapshot analysis, monitor production |

---

## Hosting Platform Decision Matrix

Based on research, here are recommended platforms for $5-20/month budget:

| Platform | Cost | WebSocket Support | PostgreSQL | Pros | Cons |
|----------|------|-------------------|------------|------|------|
| **Fly.io** | ~$15/month | Excellent, no timeout | Built-in (~$5/month) | Usage-based, Redis support, clear docs | Slightly higher cost |
| **Railway** | $5-20/month | Good, WebSocket-friendly | Built-in (usage-based) | Simple deployment, $5 starter plan | Variable monthly cost |
| **Render** | $7/month starter | Good, persistent containers | Managed ($7/month) | Flat pricing, predictable | Less flexible than Fly.io |
| **Replit** | $0-20/month | Poor (sleep, rate limits) | External required | Good for development | NOT recommended for production |

**Recommendation for ScrumQuest:** **Railway** ($5-15/month expected) or **Fly.io** ($10-20/month expected)
- Both support long-lived WebSocket connections
- Built-in PostgreSQL (no separate provider needed)
- Clear usage metrics and pricing
- No sleep cycles or hidden rate limits

---

## Summary by Severity

**CRITICAL (address immediately):**
1. Connection pool per socket → Database exhaustion
2. No migration strategy → Data loss
3. Unhandled DB failures → Game state desync
4. Replit sleep cycles → Session interruption
5. Table bloat → 500% query slowdown

**MODERATE (address during development):**
6. Memory leaks → Crashes after 24 hours
7. Cloud Run timeout → 5-minute disconnects
8. Drizzle/Zod compatibility → Build failures
9. No profiling → OOM under load

**MINOR (quality of life):**
10. Postgres adapter issues → Split-brain edge case
11. Missing migrations → Deployment friction
12. Replit rate limits → Intermittent disconnects

---

## Sources

**Connection Pooling & Database:**
- [How to Implement Connection Pooling in Node.js for PostgreSQL/MySQL](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view)
- [Node.js + PostgreSQL: The Simple Trick to Effortlessly Scale 10,000+ Connections](https://medium.com/@rajat29gupta/node-js-postgresql-the-simple-trick-to-effortlessly-scale-10-000-connections-312c3079d362)
- [How to Reduce Bloat in Large PostgreSQL Tables](https://www.tigerdata.com/learn/how-to-reduce-bloat-in-large-postgresql-tables)
- [Table partitioning in PostgreSQL: performance and index bloat](https://medium.com/cubbit/table-partitioning-in-postgresql-performance-bloat-7c248dd2d604)
- [Tuning PostgreSQL for Write Heavy Workloads](https://www.cloudraft.io/blog/tuning-postgresql-for-write-heavy-workloads)

**Migrations & Schema:**
- [How I Achieved Zero Downtime in Advanced SQL Data Migrations](https://medium.com/learning-sql/how-i-achieved-zero-downtime-in-advanced-sql-data-migrations-using-postgresql-and-python-168650e8cfe5)
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)
- [3 Biggest Mistakes with Drizzle ORM](https://medium.com/@lior_amsalem/3-biggest-mistakes-with-drizzle-orm-1327e2531aff)
- [Drizzle ORM - zod](https://orm.drizzle.team/docs/zod)
- [Contract-Driven Development with Drizzle, NextJS and Zod](https://medium.com/@tonyvantur/type-safe-validation-with-drizzle-and-orpc-c7e4cba6ffd8)

**Socket.IO & WebSockets:**
- [Connection state recovery | Socket.IO](https://socket.io/docs/v4/connection-state-recovery)
- [Chat Using Socket.io With Best Practices](https://medium.com/@tabid434/chat-using-socket-io-with-best-practices-socket-real-time-db-5ed5c7933cf1)
- [Postgres adapter | Socket.IO](https://socket.io/docs/v4/postgres-adapter/)
- [Memory leak · Issue #3477 · socketio/socket.io](https://github.com/socketio/socket.io/issues/3477)

**Memory & Profiling:**
- [How to Fix 'Memory Leak' Detection](https://oneuptime.com/blog/post/2026-01-24-memory-leak-detection/view)
- [Debugging memory leaks in Node.js](https://www.yld.io/blog/debugging-memory-leaks-in-node-js-a-walkthrough)
- [Node.js Memory Leaks: Detection & Debugging | Toptal](https://www.toptal.com/nodejs/debugging-memory-leaks-node-js-applications)
- [How to Scale WebSocket Connections](https://oneuptime.com/blog/post/2026-01-26-websocket-scaling/view)

**Hosting Platforms:**
- [Replit Free Tier Limits: Sleep Time, Performance & What to Know](https://www.p0stman.com/guides/replit-limitations/)
- [Replit — Hosting Apps with Always On](https://blog.replit.com/alwayson)
- [Replit — Distributed Websocket Rate Limiting](https://blog.replit.com/websocket-rate-limiting)
- [Using WebSockets | Cloud Run | Google Cloud](https://docs.cloud.google.com/run/docs/triggering/websockets)
- [How to Fix 'Connection Timeout' WebSocket Errors](https://oneuptime.com/blog/post/2026-01-24-websocket-connection-timeout/view)
- [Railway vs. Fly | Railway Docs](https://docs.railway.com/platform/compare-to-fly)
- [Railway vs Fly.io vs Render: Which Cloud Gives You the Best ROI?](https://medium.com/ai-disruption/railway-vs-fly-io-vs-render-which-cloud-gives-you-the-best-roi-2e3305399e5b)
