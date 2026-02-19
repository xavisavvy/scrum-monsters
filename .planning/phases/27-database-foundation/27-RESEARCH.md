# Phase 27: Database Foundation - Research

**Researched:** 2026-02-19
**Domain:** PostgreSQL production setup, connection pooling, session persistence, environment validation
**Confidence:** HIGH

## Summary

Phase 27 establishes production-ready PostgreSQL infrastructure with four critical requirements: persistent data storage, connection pooling, session persistence, and environment validation. The codebase already has the foundation (Drizzle ORM, IStorage interface, postgres.js driver, connect-pg-simple) — this phase makes it production-ready.

The key insight is that postgres.js (already installed) is a better fit than node-postgres (pg) for this stack. Postgres.js offers automatic prepared statement caching, simpler configuration (seconds vs milliseconds), and better serverless compatibility — critical for the planned Render.com deployment. The existing storage.ts already uses postgres.js via Drizzle, so there's no driver migration needed.

Connection pooling prevents exhaustion under load (requirement DB-02), PostgreSQL session store enables persistent logins across restarts (DB-03), and Zod-based environment validation fails fast on startup with clear error messages (DB-04). Together, these satisfy all success criteria: XP persists, sessions survive restarts, connections handle 200+ concurrent requests gracefully, and misconfigured DATABASE_URL crashes immediately with helpful errors.

**Primary recommendation:** Use Zod for environment validation, configure postgres.js connection pool with conservative limits (max: 10, idle_timeout: 60, connect_timeout: 10), enable connect-pg-simple with createTableIfMissing, add graceful shutdown handlers, and implement startup database health check.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| postgres.js | 3.4.8 (installed) | PostgreSQL driver | Already in use via Drizzle, automatic prepared statements, serverless-friendly, simpler config |
| drizzle-orm | 0.45.1 (installed) | TypeScript ORM | Type-safe queries, schema migrations, zero-runtime overhead |
| connect-pg-simple | 10.0.0 (installed) | PostgreSQL session store | Official express-session store, auto-pruning, battle-tested |
| zod | 4.3.6 (installed) | Schema validation | Already used for API validation, consistent pattern, excellent TypeScript inference |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-kit | 0.31.4 (installed) | Migration tooling | Use `db:push` for dev, `migrate` for production deployments |
| @neondatabase/serverless | 0.10.4 (installed) | Neon-specific driver | Only if using Neon PostgreSQL (alternative to generic postgres.js) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| postgres.js | node-postgres (pg) | pg has wider adoption but requires millisecond config, no auto-prepared statements, more verbose setup |
| Zod validation | envalid | envalid is purpose-built for env vars but adds dependency when Zod already installed |
| connect-pg-simple | ioredis + connect-redis | Redis faster but adds infrastructure cost ($5-15/mo) and complexity vs PostgreSQL-only stack |

**Installation:**
All packages already installed. No new dependencies needed.

## Architecture Patterns

### Recommended Project Structure
```
server/
├── config/
│   └── env.ts              # Zod environment validation (NEW)
├── storage.ts              # IStorage + PgStorage (EXISTS)
├── index.ts                # Session middleware setup (EXISTS)
└── db/
    └── health.ts           # Database health check (NEW)
```

### Pattern 1: Environment Validation with Zod

**What:** Validate environment variables at startup using Zod schemas with coercion
**When to use:** Always — fail-fast is critical for production deployments
**Example:**
```typescript
// server/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  // Required in production
  DATABASE_URL: z.string().url().optional().refine(
    (val) => process.env.NODE_ENV !== "production" || !!val,
    { message: "DATABASE_URL is required in production" }
  ),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  // Optional with defaults
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Connection pool limits
  DB_POOL_MAX: z.coerce.number().min(1).max(100).default(10),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().default(60),
  DB_POOL_CONNECT_TIMEOUT: z.coerce.number().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formatted = error.errors.map(
        (err) => `  - ${err.path.join(".")}: ${err.message}`
      ).join("\n");
      console.error("❌ Environment validation failed:\n" + formatted);
      process.exit(1);
    }
    throw error;
  }
}
```

### Pattern 2: Connection Pool Configuration

**What:** Configure postgres.js with appropriate limits and timeouts
**When to use:** Always when DATABASE_URL is set
**Example:**
```typescript
// server/storage.ts (modify PgStorage constructor)
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export class PgStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private sql: postgres.Sql;

  constructor(connectionString: string, options?: {
    max?: number;
    idle_timeout?: number;
    connect_timeout?: number;
  }) {
    // postgres.js uses SECONDS, not milliseconds
    this.sql = postgres(connectionString, {
      max: options?.max ?? 10,                    // Max connections
      idle_timeout: options?.idle_timeout ?? 60,  // Close idle after 60s
      connect_timeout: options?.connect_timeout ?? 10, // Connect timeout 10s
      onnotice: () => {}, // Suppress NOTICE messages
    });

    this.db = drizzle(this.sql);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 }); // 5 second graceful shutdown
  }
}
```

### Pattern 3: Session Store with Auto-Create

**What:** Configure connect-pg-simple to auto-create session table
**When to use:** Development and staging — production should use migrations
**Example:**
```typescript
// server/index.ts (modify existing session setup)
import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import postgres from "postgres";

let sessionStore: session.Store | undefined;
if (process.env.DATABASE_URL) {
  const PgSession = connectPgSimple(session);

  sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",
    createTableIfMissing: process.env.NODE_ENV !== "production", // Dev only
    pruneSessionInterval: 900, // 15 minutes (in seconds)
    ttl: 7 * 24 * 60 * 60,    // 7 days (in seconds)
  });

  console.log("🔐 Using PostgreSQL session store");
} else {
  console.log("🔐 Using in-memory session store (no DATABASE_URL set)");
}
```

### Pattern 4: Database Health Check

**What:** Verify database connectivity on startup with clear error messages
**When to use:** Always when DATABASE_URL is set
**Example:**
```typescript
// server/db/health.ts
import { storage } from "../storage";

export async function checkDatabaseHealth(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("📦 Skipping database health check (using in-memory storage)");
    return;
  }

  try {
    console.log("🏥 Checking database health...");

    // Simple query to verify connectivity
    if ("sql" in storage && typeof storage.sql === "object") {
      await storage.sql`SELECT 1 as health`;
    }

    console.log("✅ Database connection healthy");
  } catch (error) {
    console.error("❌ Database health check failed:");
    console.error(`   Connection string: ${maskConnectionString(process.env.DATABASE_URL)}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error("\nPossible causes:");
    console.error("  - Database is not running");
    console.error("  - Invalid credentials");
    console.error("  - Network connectivity issues");
    console.error("  - Firewall blocking connection");
    process.exit(1);
  }
}

function maskConnectionString(url: string): string {
  return url.replace(/:([^:@]+)@/, ":****@"); // Mask password
}
```

### Pattern 5: Graceful Shutdown

**What:** Close database connections before process exit
**When to use:** Production deployments (prevents connection leaks)
**Example:**
```typescript
// server/index.ts (add to existing gracefulShutdown)
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Existing cleanup
  if ((server as any).cleanupWebSocket) {
    (server as any).cleanupWebSocket();
  }
  await shutdownRedis();

  // NEW: Close database connections
  if (storage && typeof (storage as any).close === "function") {
    console.log("📦 Closing database connections...");
    await (storage as any).close();
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};
```

### Anti-Patterns to Avoid

- **Using pg instead of postgres.js when already installed:** Postgres.js is already in package.json and used by Drizzle — don't introduce node-postgres (pg) as it would require duplicate pool configuration
- **Millisecond confusion:** postgres.js uses SECONDS for timeouts, node-postgres uses MILLISECONDS — mixing them causes 1000x timeout errors
- **Forgetting to release connections:** With postgres.js tagged templates this is automatic, but if using transactions remember they must complete or rollback
- **Setting createTableIfMissing: true in production:** Auto-creating tables in production bypasses migration review — use drizzle-kit migrate instead
- **Hardcoding DATABASE_URL:** Always use environment variables to avoid committing credentials
- **Silent startup failures:** Database misconfiguration should crash with clear errors, not limp along with in-memory fallback

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Environment validation | Manual process.env checks with defaults | Zod schema with coercion | Already installed, type-safe, handles edge cases (undefined vs empty string), clear error messages |
| Connection pooling | Custom pool manager with queue | postgres.js built-in pooling | Handles backpressure, connection reuse, idle timeout, prepared statements automatically |
| Session pruning | Cron job to delete expired sessions | connect-pg-simple automatic pruning | Built-in with randomized intervals (50-150% of pruneSessionInterval) to spread load |
| Database URL parsing | Regex/split logic | postgres.js connection string | Handles special chars, multiple hosts, SSL params, query strings correctly |
| Migration diffing | Manual SQL comparison | drizzle-kit generate/push | Detects schema changes, generates SQL, handles column renames safely |

**Key insight:** Every item in this list has burned production teams with edge cases. Connection pools leak under load spikes, session tables bloat without pruning, URL parsing breaks on special characters in passwords, manual migrations miss indexes. Use battle-tested libraries.

## Common Pitfalls

### Pitfall 1: Connection Pool Exhaustion
**What goes wrong:** App crashes with "too many clients" or requests hang forever
**Why it happens:** Pool is sized for average load, not peak load, or connections leak because they're not released
**How to avoid:**
  - Use conservative max (10 for single instance, divide by instance count for multiple)
  - Monitor pool.waitingCount in Prometheus metrics
  - Set idle_timeout to release unused connections (60s reasonable)
  - With postgres.js tagged templates, connections auto-release — only manual transaction.execute needs explicit handling
**Warning signs:** Increasing response times, "Connection terminated unexpectedly" errors, waitingCount metric climbing

### Pitfall 2: Session Table Growth Without Pruning
**What goes wrong:** Sessions table grows to millions of rows, queries slow to crawl
**Why it happens:** Default connect-pg-simple doesn't auto-prune — must enable explicitly
**How to avoid:** Set pruneSessionInterval (900 seconds = 15 minutes default is good)
**Warning signs:** Sessions table size growing unbounded, slow session lookups, disk space alerts

### Pitfall 3: Environment Validation After Startup
**What goes wrong:** App starts successfully, then crashes when user tries OAuth (missing GOOGLE_CLIENT_ID)
**Why it happens:** Validation happens on first use, not at startup
**How to avoid:** Call validateEnv() at top of server/index.ts before any other imports
**Warning signs:** Production errors that should have been caught in staging, runtime crashes for missing env vars

### Pitfall 4: DATABASE_URL with Special Characters
**What goes wrong:** Connection fails with "authentication failed" despite correct password
**Why it happens:** Password contains @, :, or / which aren't URL-encoded
**How to avoid:** Use postgres.js connection object instead of URL string, or URL-encode password
**Warning signs:** Local works (no special chars) but production fails (generated password has symbols)

### Pitfall 5: Using db:push in Production
**What goes wrong:** Schema change drops data or breaks production without review
**Why it happens:** db:push bypasses migration files and applies changes directly
**How to avoid:** Use drizzle-kit generate + migrate in production, reserve push for local dev
**Warning signs:** Schema changes with no migration files in git, unexpected production data loss

### Pitfall 6: Mixing Milliseconds and Seconds
**What goes wrong:** Connections timeout immediately (1000ms set as 1000 seconds) or never timeout
**Why it happens:** postgres.js uses SECONDS, node-postgres uses MILLISECONDS
**How to avoid:** Always verify units in documentation before setting timeouts
**Warning signs:** Timeouts happening far too quickly or not at all

### Pitfall 7: Session Store Without Shared Connection Pool
**What goes wrong:** connect-pg-simple creates its own connection pool, doubling database connections
**Why it happens:** Passing conString instead of shared postgres instance
**How to avoid:** In future optimization, share pool between storage and session store
**Warning signs:** Database shows 2x expected connections (10 for storage + 10 for sessions)

## Code Examples

Verified patterns from official sources:

### Startup Initialization Sequence
```typescript
// server/index.ts (add at top)
import { validateEnv } from "./config/env";
import { checkDatabaseHealth } from "./db/health";

// FIRST: Validate environment (fail fast)
const env = validateEnv();

// LATER: Check database connectivity (after imports, before routes)
(async () => {
  await checkDatabaseHealth();

  // Continue with existing setup...
  const redisAvailable = await initializeRedis();
  const server = await registerRoutes(app);
  // ...
})();
```

### Connection Pool Monitoring
```typescript
// server/metrics.ts (add new metrics)
import { Gauge } from "prom-client";

export const dbPoolTotal = new Gauge({
  name: "db_pool_total_connections",
  help: "Total connections in pool",
});

export const dbPoolIdle = new Gauge({
  name: "db_pool_idle_connections",
  help: "Idle connections in pool",
});

export const dbPoolWaiting = new Gauge({
  name: "db_pool_waiting_requests",
  help: "Requests waiting for connection",
});

// In storage.ts after pool creation
setInterval(() => {
  if (storage && "sql" in storage) {
    // postgres.js doesn't expose pool stats directly
    // This would need instrumentation or pg driver
  }
}, 10000); // Every 10 seconds
```

### Session Configuration Complete Example
```typescript
// server/index.ts (replace existing session setup)
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const PgSession = connectPgSimple(session);

let sessionStore: session.Store | undefined;
if (process.env.DATABASE_URL) {
  sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",
    createTableIfMissing: process.env.NODE_ENV !== "production",
    pruneSessionInterval: 900,     // Prune every 15 min (in seconds)
    ttl: 7 * 24 * 60 * 60,        // 7 day session lifetime (in seconds)
    schemaName: "public",          // PostgreSQL schema
    errorLog: console.error,       // Log pruning errors
  });
  console.log("🔐 Using PostgreSQL session store");
} else {
  console.log("🔐 Using in-memory session store");
}

export const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (in milliseconds)
    sameSite: "lax",
  },
  name: "scrumquest.sid",
});
```

### Testing Database Persistence (for verification)
```typescript
// server/db/health.test.ts (verification test)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PgStorage } from "../storage";

describe("Database Persistence", () => {
  let storage: PgStorage;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL required for integration tests");
    }
    storage = new PgStorage(process.env.DATABASE_URL);
  });

  afterAll(async () => {
    await storage.close();
  });

  it("persists user XP across restarts", async () => {
    // Create user with XP
    const user = await storage.createUser({
      username: "test-xp-user",
      password: "test",
    });
    const profile = await storage.createUserProfile({
      userId: user.id,
      totalXP: 100,
    });

    // Simulate restart by creating new storage instance
    const storage2 = new PgStorage(process.env.DATABASE_URL!);

    const retrieved = await storage2.getUserProfile(user.id);
    expect(retrieved?.totalXP).toBe(100);

    await storage2.close();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual env var checks | Zod schema validation | Zod 3.x (2023) | Type-safe, coercion built-in, better errors |
| node-postgres (pg) | postgres.js | 2020+ | Auto-prepared statements, simpler config, faster |
| Migrations only | Push for dev, migrate for prod | Drizzle 0.20+ (2023) | Faster local iteration, safer production |
| MemoryStore sessions | PostgreSQL session store | Express-session 1.x | Sessions survive restarts, horizontal scaling ready |
| Hardcoded pool sizes | Environment-configurable | Always relevant | Different limits for dev/staging/prod |

**Deprecated/outdated:**
- **pg.Pool with pg-pool package:** postgres.js has pooling built-in, no separate package needed
- **Manual DATABASE_URL parsing:** Both postgres.js and node-postgres handle this, don't reinvent
- **Session store with separate connection:** Can share pool (optimization for Phase 28+)
- **process.env.VAR || 'default':** Use Zod defaults for type safety and validation

## Open Questions

1. **Should we share connection pool between storage and session store?**
   - What we know: Currently storage.ts and connect-pg-simple each create their own pool
   - What's unclear: Performance impact of 2x connections vs complexity of shared pool
   - Recommendation: Start separate, optimize in Phase 28 if connection count is issue

2. **What happens to in-flight queries during graceful shutdown?**
   - What we know: postgres.js sql.end({ timeout: 5 }) waits 5 seconds
   - What's unclear: Do Socket.IO game state updates complete or get rolled back?
   - Recommendation: Acceptable for Phase 27, add transaction handling in Phase 28

3. **Should DATABASE_URL be required in development?**
   - What we know: Current code falls back to MemStorage without DATABASE_URL
   - What's unclear: Does this hide database-specific bugs until production?
   - Recommendation: Optional for dev (docker-compose up is extra step), required for staging/prod

4. **How to test connection pool exhaustion scenario?**
   - What we know: Success criteria requires 200+ concurrent connections handled gracefully
   - What's unclear: How to simulate without production load testing
   - Recommendation: Use k6 load test (already in package.json) with max: 5 pool limit

5. **When does Neon serverless driver vs generic postgres.js matter?**
   - What we know: @neondatabase/serverless is installed, optimized for Neon
   - What's unclear: Does it provide meaningful benefit over generic postgres.js?
   - Recommendation: Use postgres.js (what Drizzle uses), switch to Neon driver if specific Neon features needed

## Sources

### Primary (HIGH confidence)
- [postgres.js GitHub Repository](https://github.com/porsager/postgres) - Driver documentation, configuration options
- [Drizzle ORM Documentation](https://orm.drizzle.team/) - Database setup, migrations, transactions
- [connect-pg-simple GitHub](https://github.com/voxpelli/node-connect-pg-simple) - Session store configuration, table schema
- [Zod Documentation](https://zod.dev/) - Schema validation, coercion, error handling
- [Node-postgres Pooling](https://node-postgres.com/features/pooling) - Pool configuration reference (for comparison)

### Secondary (MEDIUM confidence)
- [Connection Pooling in Node.js for PostgreSQL/MySQL](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view) - 2026 best practices guide
- [Drizzle Push vs Migrate Guide](https://www.oreateai.com/blog/drizzle-push-vs-migrate-navigating-database-management-with-drizzle-kit/c954c74d99e275ff4d3dceb64c18deed) - When to use each approach
- [Environment Variable Validation with Zod](https://jfranciscosousa.com/blog/validating-environment-variables-with-zod) - Practical patterns
- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling) - Serverless PostgreSQL specifics
- [PostgreSQL max_connections Best Practices](https://medium.com/@jramcloud1/postgresql-17-database-administration-mastering-max-connections-and-connection-management-a8c28db60aad) - Connection limit tuning

### Tertiary (LOW confidence)
- [3 Biggest Mistakes with Drizzle ORM](https://medium.com/@lior_amsalem/3-biggest-mistakes-with-drizzle-orm-1327e2531aff) - Community pitfalls
- [Diagnosing Connection Leaks in Node.js and Postgres](https://www.garysieling.com/blog/diagnosing-connection-leaks-in-node-js-and-postgres/) - Debugging patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages already installed, official documentation verified
- Architecture: HIGH - Patterns verified from postgres.js and connect-pg-simple official docs
- Pitfalls: MEDIUM-HIGH - Based on GitHub issues and community reports, cross-verified with official docs
- Connection pool config: MEDIUM - postgres.js docs light on details, cross-referenced with postgres.js source and community usage

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (30 days - stable ecosystem, no breaking changes expected)

## Implementation Checklist

Phase 27 tasks should cover:

- [ ] Create server/config/env.ts with Zod schema for DATABASE_URL, SESSION_SECRET, pool limits
- [ ] Modify server/storage.ts PgStorage constructor to accept pool options from env vars
- [ ] Add close() method to PgStorage for graceful shutdown
- [ ] Update server/index.ts session store configuration with pruneSessionInterval
- [ ] Create server/db/health.ts with database connectivity check
- [ ] Add database health check to startup sequence (after env validation, before server.listen)
- [ ] Add database close to gracefulShutdown handler
- [ ] Update .env.example with new environment variables (DB_POOL_MAX, etc.)
- [ ] Verify sessions table exists in shared/schema.ts (already present)
- [ ] Test success criteria: XP persistence, session persistence, connection pool limits, fail-fast validation
- [ ] Document failure modes and error messages in verification plan

**Not included in Phase 27:**
- Shared connection pool between storage and sessions (defer to optimization phase)
- Connection pool metrics instrumentation (defer to observability phase)
- Migration strategy for production (covered by existing drizzle-kit setup)
- Database backup/restore procedures (defer to hosting phase)
