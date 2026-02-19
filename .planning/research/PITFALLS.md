# Domain Pitfalls: Hosting Optimization & PostgreSQL Setup

**Domain:** Production infrastructure — hosting platform selection, PostgreSQL database setup, resource profiling for Node.js + Socket.IO real-time application
**Researched:** 2026-02-19
**Confidence:** HIGH

---

## Critical Pitfalls

### PIT-01: Connection Pool Exhaustion
**Risk:** HIGH | **Phase:** Database Foundation
**Problem:** All PostgreSQL connections in use, new queries queue or timeout. Causes: slow queries holding connections too long, connection leaks (not releasing after use), undersized pool for actual load. Results in user-facing errors like "connection acquisition timeout" and cascading failures across the application.

**Prevention:**
- Size pool based on formula: `connections = (core_count * 2) + effective_spindle_count` per application instance
- For 256MB Fly.io instance (shared CPU), use `max: 20` connections
- Set connection timeout (`connect_timeout: 10000`) to fail fast vs indefinite queue
- Monitor pool utilization with custom Prometheus metric (alert when >90%)
- Use `EXPLAIN ANALYZE` to find slow queries, add indexes where needed

**Detection:**
- `connection acquisition timeout` errors in logs
- `pool.totalCount === pool.max` indicates pool saturation
- Query latency spikes in Prometheus (p95 >200ms)
- Database CPU usage high but query throughput low

**Mitigation:**
- Add database indexes on frequently queried columns (userId, lobbyId, createdAt)
- Review slow query log, optimize N+1 queries
- Increase pool size if legitimate traffic exceeds capacity
- Implement connection pooler (PgBouncer) if running multiple application instances

---

### PIT-02: Memory Leaks in Long-Running Processes
**Risk:** HIGH | **Phase:** Performance Optimization
**Problem:** Node.js process accumulates unreleased objects over hours/days. Heap grows until out-of-memory crash. Causes: event listener leaks (on() without off()), closure references keeping objects alive, global variables accumulating, WebSocket connection metadata not cleaned up on disconnect. Results in process crashes during peak usage, degraded performance as GC struggles.

**Prevention:**
- Run Clinic.js HeapProfiler in staging: `clinic heapprofiler -- node dist/index.js`
- Load test for 30+ minutes, look for constantly increasing "Heap Used" line
- Always call `socket.off()` or `removeListener()` in cleanup functions
- Clear disconnected player data from Maps/Sets (use WeakMap where possible)
- Set memory limit with PM2: `max_memory_restart: '500M'` for auto-restart

**Detection:**
- Process RSS (resident set size) grows >100MB/hour continuously
- Heap snapshots show climbing retained object counts
- `process.memoryUsage().heapUsed` increases without corresponding traffic increase
- Clinic.js HeapProfiler flame graph shows accumulating object allocations

**Mitigation:**
- Take heap snapshot, compare with baseline to identify leak source
- Add aggressive cleanup in disconnect handlers
- Restart process regularly as temporary mitigation (PM2 cron restart)
- Profile in production with throttling (`--max-old-space-size` set appropriately)

---

### PIT-03: Unhandled Promise Rejections
**Risk:** HIGH | **Phase:** Database Foundation
**Problem:** Async errors not caught crash entire Node.js process in production. Database query failures, network timeouts, validation errors in async functions all terminate the server if not handled. Results in complete service outage, lost WebSocket connections, unfinished transactions.

**Prevention:**
- Global handler: `process.on('unhandledRejection', (err) => { logger.error(err); })`
- Wrap all async operations in try/catch blocks
- Use promise rejection handling in database operations:
  ```typescript
  try {
    await db.query(...);
  } catch (error) {
    logger.error('DB query failed', { error });
    throw new AppError('Database unavailable');
  }
  ```
- Test error paths (disconnect database, kill connection during query)

**Detection:**
- Process exits with code 1 unexpectedly
- Logs show "UnhandledPromiseRejectionWarning" before crash
- PM2 shows frequent restarts with exit code 1
- User reports of sudden disconnections

**Mitigation:**
- Add comprehensive error handling to all async functions
- Implement circuit breaker pattern for external dependencies (database, Redis)
- Use PM2 auto-restart to recover from crashes while fixing root cause
- Set up alerting for process restarts (indicates frequent crashes)

---

### PIT-04: Database Migration Failures
**Risk:** HIGH | **Phase:** Database Foundation
**Problem:** Schema changes fail mid-deployment, leaving database in inconsistent state. Causes: syntax errors in generated SQL, foreign key constraint violations, migrations running out of order, concurrent migrations from multiple deployments. Results in broken production database, unable to roll forward or back, requires manual intervention.

**Prevention:**
- Test ALL migrations in staging environment first (never deploy untested migrations)
- Use Drizzle's migration tracking table (`__drizzle_migrations`) to prevent duplicates
- Wrap migrations in transactions where possible (PostgreSQL supports DDL transactions)
- Lock migration execution (single process only):
  ```typescript
  await db.query('SELECT pg_advisory_lock(12345)');
  try {
    await migrate(db, { migrationsFolder: './migrations' });
  } finally {
    await db.query('SELECT pg_advisory_unlock(12345)');
  }
  ```
- Name migrations sequentially: `20260219_001_add_sessions_table.sql`

**Detection:**
- Deployment fails with SQL syntax errors or constraint violations
- Tables half-created (some columns exist, others missing)
- `__drizzle_migrations` table shows partial application
- Application throws errors about missing columns/tables

**Mitigation:**
- Manual rollback using previous migration backup
- Fix migration SQL, re-run with force flag if safe
- For production disasters: restore from backup, replay migrations
- Document rollback procedure for each migration

---

## Moderate Pitfalls

### PIT-05: Event Loop Blocking
**Risk:** MEDIUM | **Phase:** Performance Optimization
**Problem:** Synchronous operations (heavy computation, large JSON.parse, sync file I/O) block the event loop. WebSocket message processing stops, votes appear laggy, players experience delays. Single-threaded Node.js means blocking operation affects ALL connected users.

**Prevention:**
- Use async file operations: `fs.promises.readFile()` not `fs.readFileSync()`
- Offload heavy computation to worker threads (`worker_threads` module)
- Parse JSON incrementally for payloads >1MB (streaming parser)
- Monitor event loop lag with Prometheus: `process_event_loop_lag_seconds`
- Set alert threshold: event_loop_lag > 100ms sustained for >1 minute

**Detection:**
- `process_event_loop_lag_seconds` metric spikes during load
- Players report lag during voting or battle actions
- Clinic.js Doctor shows "Event Loop" issue as primary bottleneck
- HTTP request latency increases even for simple endpoints

**Mitigation:**
- Profile with Clinic.js Doctor to identify blocking operations
- Move computation to worker threads or separate process
- Cache expensive computations (boss health calculations, consensus checks)
- Use non-blocking alternatives (async crypto, streaming JSON)

---

### PIT-06: WebSocket Sticky Session Issues
**Risk:** MEDIUM | **Phase:** Horizontal Scaling (Deferred)
**Problem:** Load balancer sends WebSocket frames to different server instance than handshake. Connection fails because server doesn't have session state. Causes: load balancer not configured for sticky sessions, session affinity based on wrong attribute (IP vs connection ID).

**Prevention:**
- Fly.io uses sticky IPs automatically (no config needed)
- Railway/Render require load balancer configuration (check docs)
- Test with multiple instances: verify reconnection always hits same server
- Use Redis adapter for Socket.IO when horizontal scaling (shares state across instances)

**Detection:**
- WebSocket upgrade fails intermittently (succeeds some attempts, fails others)
- Logs show "connection refused" after successful handshake
- Players report inconsistent connection behavior
- Socket.IO shows "transport error" in client logs

**Mitigation:**
- Configure load balancer for sticky sessions (IP hash or connection ID)
- Implement Redis adapter to share state across instances
- Fall back to single instance until sticky sessions working
- Document sticky session requirements in deployment guide

---

### PIT-07: Backup Failure Silent
**Risk:** MEDIUM | **Phase:** Reliability & Monitoring
**Problem:** Automated backup job fails but no alert sent. Discover during disaster recovery that backups are missing or corrupt. Causes: S3 upload timeout, pg_dump failure, insufficient disk space, permission errors. Results in data loss when needed most.

**Prevention:**
- Log backup success/failure to structured logger (Pino)
- Send alert on backup failure (email, Slack webhook, PagerDuty)
- Monitor backup file size: alert if <1MB (indicates empty dump)
- Test restore monthly in staging environment (validate backup integrity)
- Retention policy automated: S3 lifecycle rules delete old backups

**Detection:**
- Backup job runs but no file uploaded to S3
- Backup files show 0 bytes or suspiciously small size
- Restore test fails (backup corrupt or incomplete)
- S3 bucket missing expected daily backups

**Mitigation:**
- Add comprehensive error handling to backup script
- Retry logic for transient failures (network timeouts)
- Validate pg_dump exit code (0 = success, non-zero = failure)
- Manual backup immediately if automated backup fails

---

### PIT-08: Environment Variable Leakage
**Risk:** MEDIUM | **Phase:** Database Foundation
**Problem:** Secrets (DATABASE_URL containing password, session secret) logged or exposed in error messages. Causes: logging full error objects (includes env vars), error pages showing stack traces in production, env vars in client-side bundles. Results in credential exposure, potential database compromise.

**Prevention:**
- Sanitize error logs: redact DATABASE_URL before logging
  ```typescript
  logger.error('DB error', {
    error: error.message, // NOT error.toString() which may include connection string
    code: error.code
  });
  ```
- Disable stack traces in production (`NODE_ENV=production`)
- Validate env vars at startup, fail if missing (prevents undefined leakage)
- Never use `process.env` on client side (Vite won't bundle server env vars anyway)

**Detection:**
- Logs show `postgresql://user:password@host:5432/db`
- Error pages display full connection strings to users
- Browser console shows environment variables
- Source maps expose server-side code

**Mitigation:**
- Rotate compromised credentials immediately (DATABASE_URL, session secret)
- Audit logs for leaked credentials, determine exposure scope
- Implement log sanitization middleware
- Review error handling to prevent future leaks

---

## Minor Pitfalls

### PIT-09: Database Timezone Confusion
**Risk:** LOW | **Phase:** Database Foundation
**Problem:** Timestamps stored in local time vs UTC. Query results show wrong times for users in different timezones. Session expiry calculations off by hours.

**Prevention:**
- Always use UTC for database timestamps (PostgreSQL default)
- Store as `timestamp with time zone` not `timestamp without time zone`
- Convert to local time on client side only (browser handles automatically for `Date` objects)
- Set `timezone = 'UTC'` in PostgreSQL connection string for consistency

**Detection:**
- Session expiry times don't match expected durations
- Timestamps in database show unexpected hours
- Users in different timezones report inconsistent behavior

**Mitigation:**
- Migrate existing timestamps to UTC if needed
- Standardize on UTC storage, client-side conversion

---

### PIT-10: Development Database Bleeding into Production
**Risk:** LOW | **Phase:** Environment Configuration
**Problem:** Using development database URL in production by mistake. Overwrites production data with test data, or vice versa. Causes: copy/paste error in .env, missing environment validation.

**Prevention:**
- Validate `NODE_ENV` matches `DATABASE_URL` pattern:
  ```typescript
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('prod')) {
    throw new Error('Production must use production database');
  }
  ```
- Use different database names: `scrumquest_dev`, `scrumquest_prod`
- Railway/Render provide separate database URLs per environment automatically
- Never commit .env files (already in .gitignore)

**Detection:**
- Production data suddenly missing or filled with test data
- Database size dramatically different than expected
- User reports of reset data or missing history

**Mitigation:**
- Restore from backup immediately
- Fix environment variable configuration
- Add validation to prevent future cross-contamination

---

### PIT-11: Overly Aggressive Health Check Timeouts
**Risk:** LOW | **Phase:** Reliability & Monitoring
**Problem:** Health check endpoint times out during normal operation (slow database query, GC pause). Load balancer marks instance unhealthy, removes from rotation. Causes cascading failures as load shifts to fewer instances.

**Prevention:**
- Set health check timeout generously: 5-10 seconds (not 1-2 seconds)
- Health check should test minimal functionality:
  ```typescript
  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1'); // Simple query, <100ms typically
      res.json({ status: 'ok', timestamp: Date.now() });
    } catch (error) {
      res.status(503).json({ status: 'error', message: 'DB unavailable' });
    }
  });
  ```
- Don't run heavy operations in health checks (full table scans, complex joins)
- Configure load balancer: 2-3 consecutive failures before marking unhealthy

**Detection:**
- Instances marked unhealthy despite serving traffic successfully
- Logs show health check timeouts during normal operation
- Load balancer removes healthy instances intermittently

**Mitigation:**
- Increase health check timeout in load balancer config
- Simplify health check endpoint (remove slow operations)
- Monitor health check latency separately

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| **Phase 1: Database Foundation** | PIT-01 (Pool Exhaustion), PIT-04 (Migration Failures) | Test migrations in staging, size pool based on CPU cores, monitor utilization |
| **Phase 2: Reliability & Monitoring** | PIT-03 (Unhandled Rejections), PIT-07 (Backup Failure) | Add global error handler, test backup restoration monthly |
| **Phase 3: Performance Optimization** | PIT-02 (Memory Leaks), PIT-05 (Event Loop Blocking) | Run Clinic.js in staging, monitor event loop lag in production |
| **Phase 4+: Scaling** | PIT-06 (Sticky Sessions) | Test multi-instance deploy in staging first, configure load balancer |

## Summary

| Severity | Count | Key Theme |
|----------|-------|-----------|
| Critical | 4 | Connection management, memory leaks, error handling, schema changes |
| Moderate | 4 | Performance monitoring, load balancing, backups, secret management |
| Minor | 3 | Timezone handling, environment isolation, health checks |

**Most impactful prevention:**
1. Test migrations in staging before production (prevents PIT-04)
2. Monitor memory usage with Clinic.js (prevents PIT-02)
3. Size connection pool correctly + monitor utilization (prevents PIT-01)
4. Add global error handlers for promises (prevents PIT-03)

**Quick wins:**
- Add global `unhandledRejection` handler (5 min, prevents crashes)
- Set up Prometheus alerts for event loop lag >100ms (15 min, early warning)
- Validate environment variables on startup (10 min, prevents misconfig)
- Test backup restoration once (30 min, validates disaster recovery)

---

## Sources

**Connection Pooling & Database:**
- [How to Implement Connection Pooling in Node.js for PostgreSQL/MySQL](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view)
- [Pooling – node-postgres](https://node-postgres.com/features/pooling)
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle migrations to postgres in production](https://budivoogt.com/blog/drizzle-migrations)

**Memory Profiling & Leak Detection:**
- [Clinic.js - An Open Source Node.js performance profiling suite](https://clinicjs.org/)
- [How to Profile Node.js Applications for Memory Leaks](https://oneuptime.com/blog/post/2026-01-26-nodejs-memory-leak-profiling/view)
- [Profiling Node.js Applications](https://betterstack.com/community/guides/scaling-nodejs/profiling-nodejs-applications/)

**WebSocket & Load Balancing:**
- [How to Configure WebSocket with Load Balancers](https://oneuptime.com/blog/post/2026-01-24-websocket-load-balancer-configuration/view)
- [Using multiple nodes | Socket.IO](https://socket.io/docs/v4/using-multiple-nodes/)
- [Redis adapter | Socket.IO](https://socket.io/docs/v4/redis-adapter/)

**Performance & Monitoring:**
- [Node.js Performance Monitoring with Prometheus](https://blog.risingstack.com/node-js-performance-monitoring-with-prometheus/)
- [Best Node.js Application Monitoring Tools in 2026](https://betterstack.com/community/comparisons/nodejs-application-monitoring-tools/)
- [Boost Node.js with V8 GC Optimization](https://blog.platformatic.dev/optimizing-nodejs-performance-v8-memory-management-and-gc-tuning)

---
*Researched: 2026-02-19*
*Confidence: HIGH — Pitfalls sourced from production Node.js incident reports, PostgreSQL best practices, and Socket.IO scaling documentation*
