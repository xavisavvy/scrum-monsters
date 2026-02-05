---
phase: 09
plan: 03
subsystem: infrastructure
tags: [kubernetes, argocd, migrations, database, deployment-safety]

requires:
  - 09-01  # Migration workflow setup (npm scripts, initial migration)

provides:
  - ArgoCD PreSync migration hook
  - Automated database schema updates before deployment
  - Deployment safety (failed migrations block rollout)

affects:
  - 09-04  # Post-deployment verification (will verify migration ran)
  - 10-*   # Performance monitoring (migrations affect deployment time)

tech-stack:
  added:
    - ArgoCD hooks (PreSync, BeforeHookCreation, sync-wave)
  patterns:
    - Job-based migrations (not init containers)
    - Automatic retry and cleanup (backoffLimit, ttlSecondsAfterFinished)
    - Security-hardened containers (runAsNonRoot, drop ALL capabilities)

key-files:
  created:
    - k8s/base/migration-job.yaml
  modified:
    - k8s/base/kustomization.yaml

decisions:
  - name: Use ArgoCD PreSync hook for migrations
    rationale: Ensures migrations run before app deployment, failed migrations block rollout
    file: k8s/base/migration-job.yaml
    alternatives: [init-container, separate manual job, post-deploy hook]

  - name: Sync-wave 5 for migration ordering
    rationale: Run after secrets (wave 0), before app deployment (can add wave 10+ to app)
    file: k8s/base/migration-job.yaml
    alternatives: [wave 1, wave 10, no wave specified]

  - name: Job with backoffLimit vs init container
    rationale: Job runs once per sync (not per pod), supports retries, auto-cleanup
    file: k8s/base/migration-job.yaml
    alternatives: [deployment init container, separate pod, manual kubectl job]

  - name: BeforeHookCreation delete policy
    rationale: Allows re-runs by cleaning up previous job, prevents "job already exists" errors
    file: k8s/base/migration-job.yaml
    alternatives: [HookSucceeded, HookFailed, manual cleanup]

metrics:
  duration: 2m
  completed: 2026-02-02
---

# Phase 09 Plan 03: ArgoCD Migration Hook Summary

**One-liner:** ArgoCD PreSync Job runs `npm run db:migrate` before each deployment with retry logic and automatic cleanup.

## What Was Built

Created Kubernetes Job manifest with ArgoCD PreSync hook that automatically runs database migrations before application deployment.

### Job Configuration

**Location:** `k8s/base/migration-job.yaml`

**Key Features:**
- **PreSync hook:** Runs before main application sync
- **BeforeHookCreation delete policy:** Cleans up old job before creating new one (enables retries)
- **Sync-wave 5:** Executes after secrets (implicit wave 0), before app deployment
- **Retry logic:** backoffLimit: 2 (total 3 attempts before failing)
- **Auto-cleanup:** ttlSecondsAfterFinished: 3600 (1 hour retention)
- **Security:** Same hardened context as main deployment (user 1001, non-root, drop ALL capabilities)

**Resource limits:**
- Requests: 128Mi memory, 100m CPU
- Limits: 256Mi memory, 500m CPU

### Integration

Added `migration-job.yaml` to `k8s/base/kustomization.yaml` resources list.

ArgoCD will now include this Job in every sync operation, ensuring database schema stays in sync with application code.

## Technical Implementation

### Migration Execution Flow

1. **ArgoCD sync triggered** (manual or automatic)
2. **Sync-wave 0:** Secrets synced (implicit, no wave annotation needed)
3. **Sync-wave 5:** Migration Job created and runs
   - Job pulls latest `scrumquest:latest` image
   - Executes `npm run db:migrate` (from 09-01)
   - Uses `DATABASE_URL` from `scrumquest-secrets`
4. **Migration completes:**
   - **Success:** Job completes, sync continues to app deployment
   - **Failure:** Job fails after 3 attempts, sync halts, old app version keeps running
5. **Sync-wave 10+:** Application deployment (future - can add wave annotation)

### Safety Guarantees

**Deployment blocking:** If migration fails, ArgoCD marks the sync as failed and does not proceed with app deployment. Old version keeps running.

**Single execution:** Job runs once per sync, not once per pod replica (unlike init containers).

**Idempotency:** Drizzle migrations track applied changes in `__drizzle_migrations` table, safe to re-run.

**Automatic cleanup:** Completed Jobs auto-delete after 1 hour to prevent cluster clutter.

### First Deployment Note

The initial deployment to production will run the baseline migration (`0000_sharp_midnight.sql` from 09-01) that creates all 6 schema tables:
- users
- sessions
- lobbies
- lobby_players
- lobby_votes
- lobby_boss_states

This establishes the production schema baseline. Subsequent deployments will only run incremental migrations.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification checks passed:

- [x] k8s/base/migration-job.yaml exists with correct structure
- [x] ArgoCD annotations present: `hook: PreSync`, `hook-delete-policy: BeforeHookCreation`
- [x] Job uses `npm run db:migrate` command
- [x] Job references `scrumquest-secrets` for DATABASE_URL
- [x] kustomization.yaml includes migration-job.yaml in resources
- [x] `kubectl kustomize k8s/base/` succeeds without errors

## Success Criteria Validation

- [x] Migration Job runs before app deployment (PreSync hook)
- [x] Failed migrations block deployment (ArgoCD default behavior for failed PreSync)
- [x] Job runs once per sync, not per pod replica (Job vs init container)
- [x] Job has retry logic (backoffLimit: 2)
- [x] Job auto-cleans up after completion (ttlSecondsAfterFinished: 3600)

## Task Breakdown

| Task | Name                                          | Commit  | Files                           |
|------|-----------------------------------------------|---------|----------------------------------|
| 1    | Create migration Job manifest with PreSync    | 7937360 | k8s/base/migration-job.yaml      |
| 2    | Add migration job to kustomization            | 9c7f0ce | k8s/base/kustomization.yaml      |

## Next Phase Readiness

**Blockers:** None

**Prerequisites for 09-04 (Post-deployment Verification):**
- Migration Job manifest ready for deployment
- Can verify Job execution in ArgoCD UI
- Can query `__drizzle_migrations` table after deployment

**Phase 09 Status:**
- [x] Plan 09-01: Migration workflow setup (COMPLETE)
- [x] Plan 09-02: CI migration validation (COMPLETE)
- [x] Plan 09-03: ArgoCD migration hook (COMPLETE)
- [ ] Plan 09-04: Post-deployment verification (pending)

## Decision Log

### D-09-03-01: Use ArgoCD PreSync Hook for Migrations

**Context:** Need to run database migrations before application deployment in Kubernetes.

**Decision:** Use ArgoCD PreSync hook with Kubernetes Job instead of init containers or manual jobs.

**Rationale:**
- PreSync hooks run once per sync (not per pod replica)
- Failed hooks block deployment automatically
- BeforeHookCreation policy enables retries
- Native ArgoCD integration, no external orchestration needed

**Alternatives Considered:**
1. **Init containers:** Run per pod, concurrent execution risk, no cluster-wide retry logic
2. **Manual kubectl job:** Requires manual triggering, no deployment coupling
3. **Post-deploy hook:** Runs after app deployment, potential version mismatch errors

**Trade-offs:**
- Pros: Automatic execution, deployment safety, single execution guarantee
- Cons: Requires ArgoCD (not portable to plain kubectl), adds deployment time

### D-09-03-02: Sync-Wave 5 for Migration Ordering

**Context:** Need to run migrations after secrets are available, before app deploys.

**Decision:** Set `argocd.argoproj.io/sync-wave: "5"` on migration Job.

**Rationale:**
- Secrets have implicit wave 0 (synced first)
- Wave 5 provides buffer for any wave 1-4 infrastructure
- Application deployment can use wave 10+ in future (clear ordering)

**Alternatives Considered:**
1. **Wave 1:** Too close to secrets, no buffer for other infrastructure
2. **Wave 10:** Standard for apps, no separation from main deployment
3. **No wave:** Would run in parallel with app deployment (race condition risk)

### D-09-03-03: Job with backoffLimit vs Init Container

**Context:** Need retry logic for transient failures (network, database connection).

**Decision:** Use Job with `backoffLimit: 2` (total 3 attempts).

**Rationale:**
- Kubernetes automatically retries failed Jobs
- Each attempt gets clean pod (no state carryover)
- Cluster-wide retry tracking (not per-pod)
- Failed backoffLimit triggers ArgoCD sync failure

**Alternatives Considered:**
1. **Init container:** No automatic retry, would need app-level logic
2. **CronJob:** Not appropriate for one-time sync operations
3. **Manual retry:** Requires human intervention

**Trade-offs:**
- Pros: Automatic retry, clean state, cluster-wide tracking
- Cons: Each retry creates new pod (slight overhead)

### D-09-03-04: BeforeHookCreation Delete Policy

**Context:** Job names must be unique, need to handle re-runs on sync retry.

**Decision:** Use `argocd.argoproj.io/hook-delete-policy: BeforeHookCreation`.

**Rationale:**
- Deletes old Job before creating new one
- Allows sync retries without "Job already exists" errors
- Keeps only latest Job in cluster

**Alternatives Considered:**
1. **HookSucceeded:** Only deletes on success, failed jobs accumulate
2. **HookFailed:** Only deletes on failure, successful jobs accumulate
3. **No policy:** Jobs accumulate, manual cleanup required

**Trade-offs:**
- Pros: Clean slate for retries, automatic cleanup
- Cons: Lose history of failed runs (must check logs before they're deleted)

## Technical Artifacts

### Created Files

**k8s/base/migration-job.yaml**
- Kubernetes Job manifest
- ArgoCD PreSync hook annotations
- Executes `npm run db:migrate` from scrumquest image
- Uses scrumquest-secrets for DATABASE_URL
- Hardened security context (non-root, drop ALL capabilities)

### Modified Files

**k8s/base/kustomization.yaml**
- Added `migration-job.yaml` to resources list
- ArgoCD will include Job in all environment overlays (dev/staging/prod)

## Lessons Learned

### What Went Well

1. **Clean separation of concerns:** Migration Job is independent resource, easy to test/modify
2. **Security consistency:** Reused security context from main deployment (user 1001, non-root)
3. **Retry logic built-in:** No custom retry code needed in migration scripts
4. **Kustomization validation:** `kubectl kustomize` verified manifest correctness before commit

### What Could Be Improved

1. **Migration duration monitoring:** Future work could add Prometheus metrics for migration execution time
2. **Job completion notifications:** Could add ArgoCD notification on migration failure (future phase)
3. **Sync-wave documentation:** Should document wave assignments in k8s/base/README.md (future improvement)

### Recommendations for Future Work

1. **Add sync-wave annotation to main deployment** for explicit ordering (wave 10+)
2. **Consider separate migration container image** to reduce Job size (only include Drizzle, not full app)
3. **Add migration dashboard** to Grafana showing execution history, duration, success rate
4. **Implement migration dry-run** for pre-deployment validation in staging environment
