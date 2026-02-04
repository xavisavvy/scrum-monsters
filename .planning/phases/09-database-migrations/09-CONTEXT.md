# Phase 9: Database Migrations - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Schema changes deploy safely through versioned migrations. This phase replaces `db:push` with proper migration files, adds CI validation to ensure schema changes include migrations, and integrates migration execution into ArgoCD deployment. Rollback automation is a separate phase (Phase 14).

</domain>

<decisions>
## Implementation Decisions

### Migration Workflow
- Hybrid generation: drizzle-kit generates migrations from schema diff, developer can edit before committing
- Timestamp prefix naming: `20260202143052_add_user_preferences.sql` — sortable, conflict-free
- Migration files live in `drizzle/` at project root (drizzle-kit default)
- Add `npm run db:migrate:generate` convenience script for developers

### CI Validation
- Use drizzle-kit introspection in check mode — fails if it would produce output (indicates missing migration)
- Block merge if migration validation fails — enforces migration discipline
- Spin up PostgreSQL in CI and apply all migrations to fresh DB — catches SQL syntax errors
- Add migration check as new job in existing `ci.yml` workflow

### Deployment Execution
- Migrations run automatically when ArgoCD syncs — no manual approval required
- If migration fails, block deployment and keep old version running
- Add `npm run db:migrate` script to apply pending migrations (useful for local dev)

### Rollback Strategy
- Forward-only migrations — no down migrations, fix issues with new forward migrations
- Multi-step deployment for destructive changes: Step 1 deploys code that doesn't use column, Step 2 migration removes it
- Test migrations against sanitized production snapshot — catches data-dependent bugs

### Claude's Discretion
- Kubernetes execution method (Job vs init container vs ArgoCD PreSync hook)
- Snapshot source for prod data testing (periodic export vs on-demand)
- Exact drizzle-kit configuration options
- Migration tracking table implementation

</decisions>

<specifics>
## Specific Ideas

- Migration validation should catch the common mistake of running `db:push` instead of creating a proper migration
- Multi-step deployment pattern for destructive changes aligns with zero-downtime deployment goals
- Testing against prod-like data is important because empty DB testing doesn't catch data-dependent migration bugs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-database-migrations*
*Context gathered: 2026-02-02*
