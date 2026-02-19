# Phase 28: Production Reliability - Research

**Researched:** 2026-02-19
**Domain:** Production error handling, graceful shutdown, health monitoring
**Confidence:** HIGH

## Summary

Phase 28 focuses on production-ready reliability patterns for Node.js servers running Socket.IO with PostgreSQL. The research reveals that modern production reliability requires three critical pillars: **global error handlers** for unhandled rejections/exceptions (log and exit, not suppress), **graceful shutdown with connection draining** (notify clients, close pools, exit cleanly), and **comprehensive health checks** (readiness vs liveness separation). The existing codebase already has partial implementations (SIGTERM/SIGINT handlers, database pool shutdown, health endpoint) but is missing client notification during shutdown, global error handlers, and database connectivity checks in health endpoints.

**Primary recommendation:** Implement global error handlers first (safety net for crashes), enhance graceful shutdown to notify WebSocket clients 30s before disconnect, and extend health check endpoint with database connectivity verification for Kubernetes readiness probes.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pino | ^9.6.0 | Structured logging | Industry standard for Node.js production logging, supports JSON output, log levels, redaction |
| postgres | ^3.4.8 | PostgreSQL driver | Existing in codebase, supports connection pooling with `.end()` method for graceful shutdown |
| socket.io | ^4.8.3 | WebSocket server | Existing in codebase, provides `io.close()` and `io.disconnectSockets()` for graceful shutdown |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| http-graceful-shutdown | ^3.x | Graceful shutdown helper | Optional - simplifies shutdown logic but codebase already has custom implementation |
| lightship | ^6.x | Kubernetes health checks | Optional - abstracts readiness/liveness but adds dependency for simple endpoints |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom error handlers | @sentry/node | Adds external dependency + cost, but provides better error aggregation and alerting |
| Custom health checks | @godaddy/terminus | More comprehensive but heavier than simple Express endpoints |
| Pino logging | winston | More popular but Pino is faster and already integrated |

**Installation:**
```bash
# No new packages required - use existing stack
# Optional enhancements:
npm install http-graceful-shutdown  # If replacing custom shutdown logic
npm install @sentry/node            # If adding error monitoring service
```

## Architecture Patterns

### Recommended Error Handler Structure
```
server/
├── index.ts              # Global error handlers at top level
├── shutdown.ts           # Graceful shutdown orchestration
├── health.ts             # Health check endpoints
└── logger.ts             # Already exists - Pino configuration
```

### Pattern 1: Global Error Handlers (Safety Net)
**What:** Process-level handlers for unhandled rejections and uncaught exceptions
**When to use:** Always in production - last resort before crash
**Example:**
```typescript
// Source: https://oneuptime.com/blog/post/2026-01-25-fix-unhandled-promise-rejection-warning/
// Place at TOP of server/index.ts BEFORE any other code

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log to monitoring service (Sentry, etc) here
  process.exit(1); // Exit immediately - process may be corrupted
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // Log to monitoring service
  process.exit(1); // Exit immediately
});

// CRITICAL: These are SAFETY NETS, not primary error handling
// Still use try-catch and .catch() everywhere
```

### Pattern 2: WebSocket Graceful Shutdown with Client Notification
**What:** Notify clients before disconnecting, drain connections, close server
**When to use:** SIGTERM/SIGINT handlers in production deployments
**Example:**
```typescript
// Source: https://oneuptime.com/blog/post/2026-02-02-websocket-graceful-shutdown/
async function gracefulShutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);

  // 1. Notify all connected clients (30s warning)
  io.emit('server_shutdown', {
    message: 'Server shutting down for maintenance',
    reconnectDelayMs: 30000
  });

  // 2. Wait for clients to receive notification
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 3. Stop accepting new connections
  io.close();

  // 4. Clean up intervals/timers
  if (server.cleanupWebSocket) {
    server.cleanupWebSocket();
  }

  // 5. Close database connections
  if (storage instanceof PgStorage) {
    console.log("Closing database connections...");
    await storage.close(); // postgres.js .end() method
    console.log("Database connections closed");
  }

  // 6. Close HTTP server (waits for active requests)
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // 7. Force exit if shutdown takes too long (30s timeout)
  setTimeout(() => {
    console.error('Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);
}
```

### Pattern 3: Kubernetes-Ready Health Checks
**What:** Separate liveness (is it alive?) and readiness (can it serve traffic?) endpoints
**When to use:** All Kubernetes/container deployments
**Example:**
```typescript
// Source: https://github.com/nodeshift/nodejs-reference-architecture/blob/main/docs/operations/healthchecks.md

// Liveness - simple "heartbeat" check, DO NOT check database
// Failure = restart container
app.get('/api/health/livez', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness - comprehensive checks including database
// Failure = stop sending traffic
app.get('/api/health/readyz', async (req, res) => {
  const checks = {
    database: await checkDatabaseHealth(),
    // Add other dependencies: redis, external APIs, etc.
  };

  const isReady = Object.values(checks).every(check => check.healthy);
  const status = isReady ? 200 : 503;

  res.status(status).json({
    status: isReady ? 'ok' : 'not_ready',
    checks,
    timestamp: new Date().toISOString()
  });
});

async function checkDatabaseHealth(): Promise<{ healthy: boolean; message?: string }> {
  if (!(storage instanceof PgStorage)) {
    return { healthy: true, message: 'in-memory storage' };
  }

  try {
    const sql = storage.getSql();
    await Promise.race([
      sql`SELECT 1 as health`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      )
    ]);
    return { healthy: true };
  } catch (error) {
    return {
      healthy: false,
      message: error instanceof Error ? error.message : 'unknown error'
    };
  }
}
```

### Pattern 4: Startup Configuration Logging
**What:** Log critical configuration on startup for operational visibility
**When to use:** Always - helps operators debug production issues
**Example:**
```typescript
// Source: https://forwardemail.net/en/blog/docs/best-practices-for-node-js-logging
console.log('🚀 ScrumQuest Server Starting...');
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   Node version: ${process.version}`);
console.log(`   Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'In-Memory'}`);
if (storage instanceof PgStorage) {
  console.log(`   DB Pool Size: ${process.env.DB_POOL_MAX || 10} connections`);
  console.log(`   DB Idle Timeout: ${process.env.DB_POOL_IDLE_TIMEOUT || 60}s`);
}
console.log(`   Port: ${port}`);
console.log(`   Session Store: ${sessionStore ? 'PostgreSQL' : 'In-Memory'}`);
```

### Anti-Patterns to Avoid
- **Don't suppress errors:** Global error handlers should log and exit, never `process.exit(0)` or continue execution
- **Don't check database in liveness:** Liveness should be simple heartbeat only - database outage shouldn't restart healthy containers
- **Don't use console.log in production:** Use structured logger (Pino) for all operational logs - console.log is acceptable ONLY during startup for visibility
- **Don't trust server.close() alone:** Add timeout to force exit if graceful shutdown hangs

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection draining | Manual socket tracking | `io.disconnectSockets()` + timeout | Socket.IO provides built-in methods, edge cases with reconnection logic |
| Database health checks | Custom SQL queries | Simple `SELECT 1` with timeout | Standard pattern, avoids load on database |
| Shutdown timeout | Custom timer logic | `Promise.race()` with setTimeout | Cleaner async/await pattern, easier to test |
| Process managers | Custom restart logic | PM2, Docker, Kubernetes | Production-grade restart policies, health checks, zero-downtime deploys |

**Key insight:** Graceful shutdown is deceptively complex - connection draining, timeout handling, and state cleanup have many edge cases. Use proven patterns and libraries instead of custom implementations.

## Common Pitfalls

### Pitfall 1: Unhandled Rejection Crashes in Production
**What goes wrong:** Promise rejection without `.catch()` crashes entire server (Node.js 15+)
**Why it happens:** Async/await code without try-catch, forgotten `.catch()` on promises
**How to avoid:**
- Add global `process.on('unhandledRejection')` handler as safety net
- Use ESLint rule `no-floating-promises` to catch missing `.catch()`
- Always wrap async route handlers in try-catch
**Warning signs:** Server randomly crashes with "UnhandledPromiseRejectionWarning"

### Pitfall 2: Database Connections Leak on Shutdown
**What goes wrong:** Database pool not closed, connections remain open, deployment hangs
**Why it happens:** Forgetting to call `pool.end()` or `sql.end()` in shutdown handler
**How to avoid:**
- Always call `storage.close()` in graceful shutdown
- Add shutdown timeout (30s) to force exit if pool.end() hangs
- Monitor active connections in health check
**Warning signs:** Deployment takes >60s, database shows orphaned connections

### Pitfall 3: Health Check Returns 200 When Database is Down
**What goes wrong:** Kubernetes sends traffic to unhealthy pods, requests fail
**Why it happens:** Health endpoint doesn't actually check database connectivity
**How to avoid:**
- Separate `/livez` (simple heartbeat) from `/readyz` (checks dependencies)
- Add timeout (3s) to database health check to prevent hanging
- Return 503 status code when database is unreachable
**Warning signs:** Pods show "Ready 1/1" but all requests fail with DB errors

### Pitfall 4: Clients Disconnect Abruptly on Deploy
**What goes wrong:** WebSocket clients disconnected without warning, users lose state
**Why it happens:** SIGTERM kills connections before clients can save state
**How to avoid:**
- Emit `server_shutdown` event to all clients before `io.close()`
- Wait 2-3 seconds for clients to receive notification
- Set shutdown timeout to allow client-side cleanup
**Warning signs:** User complaints about "lost work" during deployments

### Pitfall 5: Shutdown Takes Forever (Timeout)
**What goes wrong:** Graceful shutdown hangs indefinitely, process never exits
**Why it happens:** Pending timers (setInterval), open connections, database pool not closing
**How to avoid:**
- Clear all intervals in cleanup function
- Use `.unref()` on non-critical timers
- Add forced exit timeout (30s max)
- Log what's preventing shutdown
**Warning signs:** Deployments timeout, process hangs on `server.close()`

## Code Examples

Verified patterns from official sources:

### Graceful Shutdown with Timeout
```typescript
// Source: https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);

  // Set timeout to force exit
  const forceExitTimeout = setTimeout(() => {
    console.error('Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    // Notify clients
    io.emit('server_shutdown', { reconnectDelayMs: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close connections
    io.close();
    if (server.cleanupWebSocket) server.cleanupWebSocket();

    // Close database
    if (storage instanceof PgStorage) {
      await storage.close();
    }

    // Close HTTP server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};
```

### Database Health Check with Timeout
```typescript
// Source: https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/
async function checkDatabaseHealth(): Promise<boolean> {
  if (!(storage instanceof PgStorage)) {
    return true; // In-memory storage is always "healthy"
  }

  try {
    const sql = storage.getSql();
    // Race timeout vs query
    await Promise.race([
      sql`SELECT 1 as health`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), 3000)
      )
    ]);
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
```

### Client-Side Shutdown Handler (React)
```typescript
// Source: https://socket.io/docs/v4/tutorial/handling-disconnections
useEffect(() => {
  socket.on('server_shutdown', ({ message, reconnectDelayMs }) => {
    // Save any pending state
    localStorage.setItem('pendingData', JSON.stringify(state));

    // Show user notification
    toast.info(message, { duration: reconnectDelayMs });

    // Auto-reconnect after delay
    setTimeout(() => {
      socket.connect();
    }, reconnectDelayMs);
  });

  return () => socket.off('server_shutdown');
}, [socket]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Suppress unhandled rejections | Log and exit process | Node.js 15 (2020) | Forced better error handling, exposed hidden bugs |
| Single /health endpoint | Separate /livez and /readyz | K8s best practices (2021+) | Better container orchestration, avoids restart loops |
| Manual connection tracking | `io.disconnectSockets()` | Socket.IO v4 (2021) | Simpler shutdown logic, fewer bugs |
| Log to files | Structured JSON logs | Modern observability (2023+) | Better integration with Prometheus/Grafana/Loki |

**Deprecated/outdated:**
- `process.on('unhandledRejection')` with no action (deprecated in Node 15+) - now crashes by default
- Checking database in liveness probe (K8s anti-pattern) - causes restart loops instead of traffic draining
- Using `console.log` for operational logs (2020s) - structured logging (Pino/Winston) is standard

## Open Questions

1. **Shutdown Notification Event Name**
   - What we know: Socket.IO supports custom events, no standard "shutdown" event
   - What's unclear: Best practice naming convention (`server_shutdown` vs `maintenance_mode`)
   - Recommendation: Use `server_shutdown` (clear intent, matches other system events)

2. **Health Check Frequency**
   - What we know: Kubernetes defaults to 10s interval, 3 failure threshold
   - What's unclear: Optimal timeout for database health check (3s? 5s?)
   - Recommendation: 3s timeout (fast enough to avoid blocking health checks, long enough for network latency)

3. **Shutdown Timeout Duration**
   - What we know: Kubernetes sends SIGTERM, waits 30s, then SIGKILL
   - What's unclear: How long to wait for client notification (2s? 5s?)
   - Recommendation: 2s notification wait + 28s max shutdown (fits within K8s 30s grace period)

## Sources

### Primary (HIGH confidence)
- [How to Fix 'UnhandledPromiseRejectionWarning' in Node.js](https://oneuptime.com/blog/post/2026-01-25-fix-unhandled-promise-rejection-warning/view) - January 2026
- [How to Handle Graceful Shutdown for WebSocket Servers](https://oneuptime.com/blog/post/2026-02-02-websocket-graceful-shutdown/view) - February 2026
- [How to Implement Connection Pooling in Node.js for PostgreSQL/MySQL](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view) - January 2026
- [Node.js Reference Architecture - Health Checks](https://github.com/nodeshift/nodejs-reference-architecture/blob/main/docs/operations/healthchecks.md) - Official Node.js guidelines
- [Socket.IO Official Documentation - How it works](https://socket.io/docs/v4/how-it-works/) - v4.8.3 (current)
- [PostgreSQL connection pool graceful shutdown](https://node-postgres.com/apis/pool) - node-postgres official docs
- [Best Practices for Node.js Logging - Tutorial 2026](https://forwardemail.net/en/blog/docs/best-practices-for-node-js-logging) - 2026
- [Kubernetes Health Checks and Probes](https://betterstack.com/community/guides/monitoring/kubernetes-health-checks/) - Current best practices

### Secondary (MEDIUM confidence)
- [Graceful shutdown with Node.js and Kubernetes](https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/) - RisingStack Engineering
- [How to implement graceful shutdown of server with automatic client reconnection](https://github.com/socketio/socket.io/discussions/5030) - Socket.IO GitHub
- [Health Checks | Node.JS Reference Architecture](https://nodeshift.dev/nodejs-reference-architecture/operations/healthchecks/) - Nodeshift guidelines
- [11 Best Practices for Logging in Node.js](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/) - Better Stack

### Tertiary (LOW confidence)
- Various Stack Overflow discussions on unhandled rejections - use for patterns only, verify against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in codebase (package.json verified)
- Architecture: HIGH - Patterns verified against official docs and recent (2026) tutorials
- Pitfalls: HIGH - Based on production experience articles and official Node.js/K8s docs

**Research date:** 2026-02-19
**Valid until:** ~60 days (stable technologies, Node.js LTS, Socket.IO v4 stable)
