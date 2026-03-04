---
phase: 34-cicd-pipeline
plan: "01"
subsystem: infra
tags: [github-actions, playwright, ssh-deploy, drizzle, oidc, smoke-tests]

requires:
  - phase: 33-production-hardening
    provides: VPS at 34.199.135.244 with docker-compose.prod.yml, GHCR image pipeline, graceful shutdown
  - phase: 34-cicd-pipeline
    provides: docker.yml Docker build workflow that deploy-lightsail.yml triggers on

provides:
  - GitHub Actions deploy-lightsail.yml workflow with staging (workflow_run) + prod (workflow_dispatch) + smoke-test jobs
  - Playwright smoke tests tagged @smoke for post-deploy verification against live URL
  - Playwright config updated to skip local server when BASE_URL env var is set
  - Old K8s/ArgoCD deploy.yml disabled (renamed to deploy.yml.disabled)

affects: [34-cicd-pipeline/02, 34-cicd-pipeline/03]

tech-stack:
  added: [appleboy/ssh-action@v1, aws-actions/configure-aws-credentials@v4]
  patterns:
    - workflow_run trigger chains Docker build -> staging deploy automatically
    - workflow_dispatch for production ensures manual gate with GitHub environment protection
    - smoke tests use @smoke tag pattern for selective test runs against live URLs
    - BASE_URL env var controls Playwright target; undefined = local webServer, set = live URL

key-files:
  created:
    - .github/workflows/deploy-lightsail.yml
    - e2e/smoke.spec.ts
  modified:
    - playwright.config.ts
    - .github/workflows/deploy.yml.disabled (renamed from deploy.yml)

key-decisions:
  - "aws-actions/configure-aws-credentials@v4 used (not v6) - matches stable major that supports OIDC; aligned with repo conventions"
  - "actions/upload-artifact@v6 used for smoke-test-report - matches version already used in docker.yml"
  - "concurrency cancel-in-progress: false — in-flight deploys must never be cancelled mid-SSH-command"
  - "drizzle-kit push --force in both staging and prod jobs - prevents interactive prompts hanging in CI"
  - "sleep 15 before health check — gives container time to bind port before curl check"

patterns-established:
  - "Post-deploy smoke test pattern: @smoke tag + BASE_URL env var + npx playwright test --grep @smoke --project=chromium"
  - "4-step SSH deploy sequence: pull -> migrate (drizzle-kit push --force) -> up --no-deps -> health check"
  - "workflow_run trigger waits for Docker workflow success before auto-deploying staging"

duration: 5min
completed: 2026-03-04
---

# Phase 34 Plan 01: Deploy Workflow and Smoke Tests Summary

**GitHub Actions deploy-lightsail.yml with 3-job pipeline (staging auto-deploy, prod manual, post-deploy smoke tests) plus Playwright @smoke tests against live URL**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T16:33:37Z
- **Completed:** 2026-03-04T16:38:37Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Created `.github/workflows/deploy-lightsail.yml` — staging auto-deploys after Docker workflow succeeds on main via workflow_run trigger; production requires manual workflow_dispatch; smoke-test job runs after either succeeds
- Both SSH deploy jobs use identical 4-step sequence: docker compose pull, drizzle-kit push --force, up --no-deps, curl health check
- Created `e2e/smoke.spec.ts` with 3 @smoke-tagged read-only tests (health endpoint, home page h1, ws-health endpoint) safe to run against production
- Updated `playwright.config.ts` to read baseURL from `process.env.BASE_URL` with localhost fallback; webServer block skipped when BASE_URL is set

## Task Commits

Each task was committed atomically:

1. **Task 1: Create deploy-lightsail.yml and disable old deploy.yml** - `3f4c204` (feat)
2. **Task 2: Update Playwright config and create smoke tests** - `c74245e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `.github/workflows/deploy-lightsail.yml` - 3-job CI/CD workflow: deploy-staging, deploy-prod, smoke-test
- `e2e/smoke.spec.ts` - 3 @smoke-tagged tests for post-deploy verification
- `playwright.config.ts` - BASE_URL env support + conditional webServer
- `.github/workflows/deploy.yml.disabled` - old K8s/ArgoCD workflow disabled (renamed in previous commit 1449ca8)

## Decisions Made

- `aws-actions/configure-aws-credentials@v4` used (stable OIDC-supporting major), `actions/upload-artifact@v6` matches docker.yml convention
- `cancel-in-progress: false` on concurrency group — never cancel an SSH deploy already in progress
- `drizzle-kit push --force` in both jobs — prevents interactive prompts in CI that would hang the job
- `sleep 15` before health check — container needs time to bind port after `up -d`
- smoke-test job uses `if: always() && (needs.deploy-staging.result == 'success' || needs.deploy-prod.result == 'success')` — runs after exactly one of the two deploy jobs succeeds

## Deviations from Plan

None - plan executed exactly as written.

The plan noted deploy.yml renaming; that rename was already done in the previous session's commit (1449ca8). This was noted and verified during Task 1 execution rather than re-doing it.

## Issues Encountered

None. TypeScript check passed cleanly. All 615 unit tests passed for both commits.

## User Setup Required

None - no external service configuration required in this plan. GitHub secrets (AWS_OIDC_ROLE_ARN, SSH_PRIVATE_KEY) and GitHub environment protection rules are configured in Plan 02.

## Next Phase Readiness

- deploy-lightsail.yml is structurally complete and YAML-valid; will not trigger until pushed to main
- Plan 02 must configure GitHub repository secrets and environment protection before pushing to remote
- Smoke tests will run against https://scrummonsters.com after first successful deploy

## Self-Check: PASSED

All created files verified on disk, all task commits verified in git history.

---
*Phase: 34-cicd-pipeline*
*Completed: 2026-03-04*
