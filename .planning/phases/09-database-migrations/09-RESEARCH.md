# Phase 9: Database Migrations - Research

**Researched:** 2026-02-02
**Domain:** Database migrations with Drizzle ORM, CI validation, Kubernetes deployment
**Confidence:** HIGH

## Summary

Database migrations with Drizzle ORM follow a code-first approach where TypeScript schema is source of truth. The drizzle-kit CLI generates timestamped SQL migration files by comparing schema snapshots. This phase replaces the current `db:push` development workflow with proper versioned migrations, adds CI validation to prevent schema drift, and integrates migration execution into ArgoCD deployment pipelines.

Drizzle uses forward-only migrations without built-in rollback support. The migration system tracks applied migrations in a `__drizzle_migrations` table and generates SQL files by comparing JSON snapshots of schema state. For Kubernetes deployments, ArgoCD PreSync hooks are the recommended approach for running migrations before application deployment.

**Primary recommendation:** Use drizzle-kit generate for migration creation, implement CI validation with PostgreSQL service container testing, deploy with ArgoCD PreSync Job hook (not init container due to multi-replica issues), and adopt forward-only migration discipline with multi-step deployment pattern for destructive changes.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-kit | 0.31.4 (current) | Migration generation and execution | Official CLI tool from Drizzle ORM team, handles snapshot-based diffing |
| drizzle-orm | 0.39.1 (current) | ORM with programmatic migration API | Already in use, provides migrate() function for runtime execution |
| PostgreSQL | 16+ | Database with service container | Already deployed, GitHub Actions has official postgres Docker image |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | 4.19.1 (current) | TypeScript execution for migration scripts | Running migrations locally or in container without build step |
| pg_isready | Built into postgres image | Health check utility | Ensuring PostgreSQL is ready before migration execution |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ArgoCD PreSync Hook | Init container | Init containers fail with multiple replicas due to concurrent migration attempts |
| drizzle-kit migrate | drizzle-orm migrate() | drizzle-kit is simpler for Kubernetes Job, drizzle-orm requires app code |
| Forward-only migrations | @drepkovsky/drizzle-migrations (up/down) | Third-party package adds rollback, but not officially supported |

**Installation:**
Already installed. Migration workflow requires npm scripts only:
```bash
# Already have: drizzle-kit@0.31.4, drizzle-orm@0.39.1
# No new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure
```
drizzle/                    # Migration directory (user chose this over default)
├── 0000_init_schema.sql    # First migration
├── meta/
│   ├── 0000_snapshot.json  # Schema snapshot
│   └── _journal.json       # Migration metadata
└── 20260202143052_add_preferences.sql  # Subsequent migrations
shared/
└── schema.ts               # Drizzle schema (source of truth)
```

### Pattern 1: Migration Generation (Developer Workflow)
**What:** Generating migrations from schema changes
**When to use:** After modifying shared/schema.ts
**Example:**
```typescript
// shared/schema.ts - Developer modifies schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  timezone: text("timezone"), // NEW FIELD ADDED
});

// Terminal - Generate migration
// $ npm run db:migrate:generate
// Drizzle Kit compares current schema.ts to latest snapshot.json
// Generates: drizzle/20260202143052_add_timezone.sql

// drizzle/20260202143052_add_timezone.sql
ALTER TABLE "users" ADD COLUMN "timezone" text;
```
**Source:** [Drizzle ORM - Generate](https://orm.drizzle.team/docs/drizzle-kit-generate)

### Pattern 2: CI Validation (Detect Missing Migrations)
**What:** Fail CI if schema.ts changed without generating migration
**When to use:** On every pull request
**Example:**
```yaml
# .github/workflows/ci.yml
validate-migrations:
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_PASSWORD: postgres
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  steps:
    - name: Apply all migrations to fresh DB
      run: |
        export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test"
        npm run db:migrate

    - name: Check for drift (would generate fail?)
      run: |
        npx drizzle-kit generate --config=drizzle.config.ts

        # Check if any new files were generated
        if [ -n "$(git status --porcelain drizzle/)" ]; then
          echo "ERROR: Schema changed but migration not generated"
          echo "Run: npm run db:migrate:generate"
          git status drizzle/
          exit 1
        fi
```
**Source:** [Detect Migrations Drift in CI | Atlas](https://atlasgo.io/faq/desired-state-drift)

### Pattern 3: ArgoCD PreSync Hook Deployment
**What:** Run migrations before deploying new application version
**When to use:** Production/staging deployments via ArgoCD
**Example:**
```yaml
# k8s/base/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: scrumquest-migration
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
    argocd.argoproj.io/sync-wave: "1"
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: scrumquest:latest  # Same image as app
          command: ["npm", "run", "db:migrate"]
          envFrom:
            - secretRef:
                name: scrumquest-secrets  # DATABASE_URL
      securityContext:
        fsGroup: 1001
        runAsNonRoot: true
```
**Why PreSync Job, not init container:**
- Init containers run in EVERY pod replica
- Multiple concurrent migrations cause conflicts and failures
- PreSync hook runs once before any pods deploy
- If migration fails, ArgoCD blocks deployment

**Source:** [Managing migration jobs with ArgoCD | PolitePixels](https://politepixels.io/articles/managing-migration-jobs-with-argocd)

### Pattern 4: Forward-Only Migrations (Destructive Changes)
**What:** Multi-step deployment for removing columns/tables
**When to use:** Any schema removal or breaking change
**Example:**
```typescript
// Step 1: Deploy code that doesn't use old column
// Migration 1: Make column nullable (if NOT NULL)
ALTER TABLE "users" ALTER COLUMN "old_field" DROP NOT NULL;

// Deploy code that doesn't read/write old_field
// Wait for deployment to complete

// Step 2: Remove column in next release
// Migration 2: Drop column
ALTER TABLE "users" DROP COLUMN "old_field";
```
**Why:** Drizzle has no automatic rollback. If deployment fails, app code still references removed column, causing errors. Multi-step ensures backward compatibility.

**Source:** [Zero-Downtime Database Migrations: Essential Patterns](https://drcodes.com/posts/zero-downtime-database-migrations-essential-patterns)

### Anti-Patterns to Avoid

- **Running db:push in production:** Push bypasses migration history and doesn't track changes. Always use generate + migrate.
- **Editing applied migrations:** Never modify migration files after they've run in any environment. Create new forward migration instead.
- **Large migrations in single transaction:** PostgreSQL acquires exclusive locks during DDL. Break into small migrations with short lock windows.
- **Concurrent index creation in transaction:** CREATE INDEX CONCURRENTLY cannot run in transaction block and needs separate migration.
- **Manual snapshot.json editing:** Drizzle generates snapshots automatically. Manual edits break diffing logic.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration tracking | Custom migrations table | drizzle-kit migrate (uses __drizzle_migrations) | Handles concurrent execution, prevents double-apply, tracks metadata |
| Schema drift detection | git diff + custom script | drizzle-kit generate in CI (fails if would produce output) | Official tool compares snapshot.json accurately, handles type changes |
| Migration ordering | Timestamp in filename | drizzle-kit's built-in naming | Sortable format 20260202143052_name.sql prevents conflicts across branches |
| Rollback migrations | Custom down migrations | Forward-only + multi-step deployment | Safer than rollback: test forward migrations thoroughly, fix with new forward migration |
| Kubernetes migration runner | Custom pod watcher | ArgoCD PreSync hook | Native ArgoCD feature, blocks deployment on failure, automatic cleanup |
| Database provisioning in tests | Fixtures/seeds | Apply migrations to fresh PostgreSQL service container | Tests real migrations, catches SQL errors, matches production |

**Key insight:** Drizzle's snapshot-based diffing is complex (handles renames, type changes, constraint modifications). Replicating this logic is error-prone. The ecosystem provides all necessary tooling.

## Common Pitfalls

### Pitfall 1: Concurrent Migration Execution
**What goes wrong:** Using init containers with multiple replicas causes all pods to run migrations simultaneously, leading to conflicts, race conditions, and failed deployments.
**Why it happens:** Init containers are designed for per-pod initialization, not cluster-wide tasks. Each pod spawns its own init container.
**How to avoid:** Use Kubernetes Job with ArgoCD PreSync hook annotation. Job runs once per sync, not per replica. Drizzle's tracking table prevents double-apply if retried.
**Warning signs:** Multiple pods in CrashLoopBackOff, logs show "relation already exists" or "duplicate key" errors in __drizzle_migrations table.

**Source:** [Database (Schema) migration to Kubernetes - initContainers vs k8s jobs](https://dev.to/ahmeddrawy/database-schema-migration-to-kubernetes-initcontainers-vs-k8s-jobs-4a4f)

### Pitfall 2: PostgreSQL Lock Queue Deadlocks
**What goes wrong:** DDL statements (ALTER TABLE, CREATE INDEX) acquire exclusive locks. If application has long-running transactions, migration blocks all queries, causing application downtime and timeouts.
**Why it happens:** PostgreSQL lock queue is FIFO. DDL waits for existing transactions, then blocks all subsequent queries until DDL completes.
**How to avoid:**
- Set `lock_timeout` and `statement_timeout` in migration session (2-5 seconds recommended)
- Use `CREATE INDEX CONCURRENTLY` for indexes (separate migration, outside transaction)
- Add foreign keys with `NOT VALID`, then `VALIDATE CONSTRAINT` in second step
- Keep transactions short - batch updates in small chunks
**Warning signs:** Application 500 errors during deployment, `idle in transaction` processes in pg_stat_activity, timeout errors in migration logs.

**Source:** [Zero-downtime Postgres schema migrations need this: lock_timeout and retries](https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries)

### Pitfall 3: Missing Migration in PR
**What goes wrong:** Developer runs db:push locally (old workflow), commits schema.ts changes, but no migration file. CI passes type checks. Production deployment applies no migration. Application code expects new columns that don't exist.
**Why it happens:** Old habit from development workflow. db:push is still in package.json. No CI validation to catch it.
**How to avoid:** Add CI job that runs drizzle-kit generate and fails if it would create files. Detect with `git status --porcelain drizzle/`.
**Warning signs:** Application crashes on deployment with "column does not exist" errors. Git history shows schema.ts changes without corresponding migration files.

### Pitfall 4: Forward-Only Migration Without Multi-Step
**What goes wrong:** Migration removes column. Deployment rollback to previous version. Old code tries to read removed column. Application crashes.
**Why it happens:** Drizzle has no automatic rollback. Teams apply expand-contract pattern incorrectly, removing old schema before all deployments use new code.
**How to avoid:**
- Step 1: Deploy code that doesn't use old column (application writes to both old and new)
- Step 2: Migration removes old column (after all instances deployed)
- Wait full deployment cycle between steps
**Warning signs:** Rollback causes crashes. Need emergency hotfix to re-add column.

**Source:** [Drizzle Migrations Rollback Discussion](https://github.com/drizzle-team/drizzle-orm/discussions/1339)

### Pitfall 5: Testing Against Empty Database Only
**What goes wrong:** Migration works on fresh database but fails on production data. Examples: column with NOT NULL constraint when existing rows have nulls, UNIQUE constraint with duplicate data, type conversion failures.
**Why it happens:** CI spins up fresh PostgreSQL, applies all migrations from scratch. No existing data to validate constraints against.
**How to avoid:** Periodically test migrations against sanitized production snapshot. Restore anonymized backup to staging, run pending migrations, verify success.
**Warning signs:** Migration passes in CI but fails in production. Emergency rollback required. Data integrity issues discovered post-migration.

**Source:** [Data Migration Testing in 2026: Strategy and Techniques](https://blog.qasource.com/a-guide-to-data-migration-testing)

### Pitfall 6: Not Committing Snapshot Files
**What goes wrong:** Developer commits migration SQL but not the corresponding snapshot.json in drizzle/meta/. Next developer runs generate, drizzle-kit can't find baseline, generates incorrect or duplicate migrations.
**Why it happens:** Git ignore patterns too broad, or developer unfamiliar with drizzle-kit's snapshot mechanism.
**How to avoid:** Ensure drizzle/meta/*.json files are tracked in git. Review PR diffs to verify snapshot files included with migrations.
**Warning signs:** Conflicting migrations on different branches, drizzle-kit errors about missing snapshots, team members generating different SQL for same schema change.

## Code Examples

Verified patterns from official sources:

### Migration Generation Script
```typescript
// package.json scripts
{
  "db:migrate:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "echo 'Use db:migrate:generate instead' && exit 1"
}

// Alternative: Disable db:push to enforce migration workflow
```
**Source:** [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)

### Programmatic Migration Execution (Alternative to CLI)
```typescript
// server/migrate.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const runMigrations = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set");
  }

  // Create connection for migrations only
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations completed successfully");

  await migrationClient.end();
};

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```
**Source:** [Drizzle ORM - Migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)

### CI Validation with Fresh Database
```yaml
# .github/workflows/ci.yml - New job
validate-migrations:
  name: Validate Migrations
  runs-on: ubuntu-latest
  timeout-minutes: 15

  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: test
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5

  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: "npm"

    - name: Install dependencies
      run: npm ci

    - name: Apply migrations to fresh database
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      run: npm run db:migrate

    - name: Check for schema drift
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      run: |
        # Generate would create files if schema changed without migration
        npx drizzle-kit generate

        if [ -n "$(git status --porcelain drizzle/)" ]; then
          echo "ERROR: Schema changes detected without corresponding migration"
          echo "Run: npm run db:migrate:generate"
          git status drizzle/
          git diff drizzle/
          exit 1
        fi

        echo "Schema and migrations are in sync"
```
**Source:** [GitHub Actions using Postgres/PostGIS and PSQL](https://medium.com/chrisrbailey/github-actions-using-postgres-postgis-and-psql-e920a2aea7e1)

### ArgoCD PreSync Hook with Retry Logic
```yaml
# k8s/base/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: scrumquest-migration
  annotations:
    # Run before main sync
    argocd.argoproj.io/hook: PreSync
    # Delete job before creating new one (allows retries)
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
    # Run in wave 1 (before app deployment in wave 0)
    argocd.argoproj.io/sync-wave: "1"
spec:
  # Allow 2 retries before failing deployment
  backoffLimit: 2
  # Clean up completed jobs after 1 hour
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels:
        app: scrumquest-migration
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: scrumquest:latest
          command: ["npm", "run", "db:migrate"]
          envFrom:
            - secretRef:
                name: scrumquest-secrets
          env:
            - name: LOG_LEVEL
              value: "info"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
      securityContext:
        fsGroup: 1001
        runAsNonRoot: true
        runAsUser: 1001
```
**Source:** [Managing migration jobs with ArgoCD](https://politepixels.io/articles/managing-migration-jobs-with-argocd)

### Safe Column Addition (Zero-Downtime Pattern)
```sql
-- Migration 1: Add nullable column (instant operation)
ALTER TABLE "users" ADD COLUMN "preferences" jsonb;

-- Migration 2 (separate deployment): Backfill in batches
-- Note: Drizzle doesn't generate data migrations, create custom migration
DO $$
DECLARE
  batch_size INT := 1000;
  offset_val INT := 0;
BEGIN
  LOOP
    UPDATE users
    SET preferences = '{}'::jsonb
    WHERE id IN (
      SELECT id FROM users
      WHERE preferences IS NULL
      ORDER BY id
      LIMIT batch_size
      OFFSET offset_val
    );

    IF NOT FOUND THEN EXIT; END IF;
    offset_val := offset_val + batch_size;

    -- Prevent lock accumulation
    COMMIT;
  END LOOP;
END $$;

-- Migration 3 (third deployment): Add NOT NULL constraint
ALTER TABLE "users" ALTER COLUMN "preferences" SET NOT NULL;
```
**Source:** [Zero-Downtime Database Migrations: Essential Patterns](https://drcodes.com/posts/zero-downtime-database-migrations-essential-patterns)

### Concurrent Index Creation (Requires Custom Migration)
```sql
-- drizzle/20260202150000_add_email_index.sql
-- Note: Cannot run in transaction, drizzle-kit generates wrapped in BEGIN/COMMIT
-- Solution: Create custom migration with --custom flag

-- Created with: npx drizzle-kit generate --custom
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_email_idx"
ON "users" ("email");

-- In drizzle.config.ts, set breakpoints: false for this migration
-- Or manually remove transaction wrapper from generated file
```
**Source:** [Stop worrying about PostgreSQL locks in your Rails migrations](https://medium.com/doctolib/stop-worrying-about-postgresql-locks-in-your-rails-migrations-3426027e9cc9)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| db:push | drizzle-kit generate + migrate | v0.20.0 (2023) | Push still works but skips version control, not production-safe |
| Manual SQL files | Snapshot-based diffing | v0.16.0 (2023) | Drizzle compares JSON snapshots, handles renames and complex changes |
| Down migrations | Forward-only migrations | Industry shift (2024+) | Safer: test forward migrations thoroughly, fix issues with new forward migration |
| Init containers for migrations | ArgoCD PreSync hooks | ArgoCD 2.0+ (2021) | PreSync runs once cluster-wide, init containers run per-replica |
| drizzle-orm introspect | drizzle-kit introspect | v0.31.0 (2025) | Introspection moved to kit CLI, 10x faster (10s → 1s) |

**Deprecated/outdated:**
- **db:push for production:** Still in CLI but explicitly marked for development only. Bypasses migration history.
- **drizzle-orm introspect:** Moved to drizzle-kit introspect. Old command removed.
- **drizzle-kit up:** Deprecated snapshot migration tool. Now automatic in generate command.
- **Migration folder in src/:** Community moved to project root (drizzle/ or migrations/) to separate from application code.

**Emerging patterns (2026):**
- **AI-enhanced migration validation:** Tools detecting unsafe migrations (large table locks, missing indexes) before deployment
- **Commutativity checks:** Drizzle team implementing conflict detection for team migrations on different branches (v1.0.0-beta.3+)
- **Snapshot testing:** Comparing database state before/after migration to verify correctness

## Open Questions

Things that couldn't be fully resolved:

1. **Production snapshot source for testing**
   - What we know: Testing against prod-like data catches constraint violations. Sanitization required for PII compliance.
   - What's unclear: User's existing backup strategy. Do they have automated snapshots? How to sanitize (PII includes usernames, emails, OAuth tokens).
   - Recommendation: Start with empty database testing in CI (Phase 9), add snapshot testing in later phase when backup strategy exists. For now, document pattern in runbook.

2. **ArgoCD sync-wave ordering with secrets**
   - What we know: PreSync hooks need DATABASE_URL from secrets. ArgoCD applies resources in wave order.
   - What's unclear: If scrumquest-secrets needs sync-wave annotation to ensure it exists before migration Job runs.
   - Recommendation: Test in dev environment. If migration Job fails due to missing secret, add `argocd.argoproj.io/sync-wave: "0"` to secret manifest.

3. **Migration failure rollback strategy**
   - What we know: Drizzle tracks migrations in __drizzle_migrations. Failed migration not recorded. Can retry after fix.
   - What's unclear: Should ArgoCD auto-rollback application deployment if migration fails, or leave old version running?
   - Recommendation: Leave old version running (ArgoCD default). Failed PreSync blocks sync. Manual intervention to fix migration. This is safer than auto-rollback which could cause cascading failures.

4. **Handling migration conflicts across branches**
   - What we know: Timestamp naming prevents filename conflicts. Schema conflicts still possible (two branches add same column with different types).
   - What's unclear: Does drizzle-kit generate detect and warn about conflicts? Planned commutativity checks not yet released.
   - Recommendation: Document in team workflow: Pull main before generating migrations. Review drizzle/meta/_journal.json in PRs for out-of-order migrations. Wait for v1.0.0-beta.3 commutativity checks.

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM - Generate Command](https://orm.drizzle.team/docs/drizzle-kit-generate) - Official migration generation docs
- [Drizzle ORM - Migrate Command](https://orm.drizzle.team/docs/drizzle-kit-migrate) - Official migration execution docs
- [Drizzle ORM - Check Command](https://orm.drizzle.team/docs/drizzle-kit-check) - Official validation docs
- [Drizzle ORM - Migrations Overview](https://orm.drizzle.team/docs/migrations) - Official migration concepts
- [ArgoCD Resource Hooks Documentation](https://argo-cd.readthedocs.io/en/stable/user-guide/resource_hooks/) - Official PreSync hook docs
- [GitHub Actions - PostgreSQL Service Containers](https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers) - Official CI testing pattern

### Secondary (MEDIUM confidence)
- [Managing migration jobs with ArgoCD | PolitePixels](https://politepixels.io/articles/managing-migration-jobs-with-argocd) - PreSync hook pattern verified with official docs
- [Database migration to Kubernetes - initContainers vs Jobs](https://dev.to/ahmeddrawy/database-schema-migration-to-kubernetes-initcontainers-vs-k8s-jobs-4a4f) - Pattern comparison verified with Kubernetes docs
- [Zero-downtime Postgres schema migrations: lock_timeout and retries](https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries) - PostgreSQL lock behavior verified with pganalyze
- [Zero-Downtime Database Migrations: Essential Patterns](https://drcodes.com/posts/zero-downtime-database-migrations-essential-patterns) - Expand-contract pattern verified across multiple sources
- [Drizzle migrations to postgres in production | Budi Voogt](https://budivoogt.com/blog/drizzle-migrations) - Production patterns verified with official docs

### Tertiary (LOW confidence - flagged for validation)
- [Detect Migrations Drift in CI | Atlas](https://atlasgo.io/faq/desired-state-drift) - Different tool (Atlas), but drift detection concept applies to Drizzle
- [Data Migration Testing in 2026](https://blog.qasource.com/a-guide-to-data-migration-testing) - General testing principles, not Drizzle-specific
- [Drizzle Migrations Rollback Discussion](https://github.com/drizzle-team/drizzle-orm/discussions/1339) - Community discussion, not official recommendation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Current versions verified in package.json, official Drizzle docs
- Architecture: HIGH - Patterns verified with official docs and multiple sources
- CI validation: HIGH - GitHub Actions PostgreSQL pattern from official docs
- Kubernetes deployment: HIGH - ArgoCD PreSync hooks from official docs, init container anti-pattern verified
- Pitfalls: MEDIUM - PostgreSQL lock behavior from pganalyze (authoritative), some patterns from community sources

**Research date:** 2026-02-02
**Valid until:** 2026-04-02 (60 days - Drizzle ecosystem relatively stable, PostgreSQL patterns evergreen)

**Known gaps:**
- Production snapshot testing workflow depends on user's backup strategy
- ArgoCD sync-wave ordering with secrets needs testing in actual environment
- Drizzle commutativity checks feature not yet released (planned for v1.0.0-beta.3)
