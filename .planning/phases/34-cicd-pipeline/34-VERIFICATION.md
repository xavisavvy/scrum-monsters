---
phase: 34-cicd-pipeline
verified: 2026-03-09T22:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Trigger a push to main and confirm deploy-staging runs automatically"
    expected: "docker.yml completes, then deploy-lightsail.yml deploy-staging fires and succeeds"
    why_human: "Requires actual push to main and monitoring GitHub Actions UI"
  - test: "Manually trigger workflow_dispatch for production"
    expected: "deploy-prod job runs, deploy-staging is skipped"
    why_human: "Requires manual trigger in GitHub Actions UI"
---

# Phase 34: CI/CD Pipeline Verification Report

**Phase Goal:** Every push to main automatically deploys to staging; production deploys require a manual GitHub Actions trigger; AWS credentials never leave GitHub OIDC; each deploy is validated by smoke tests
**Verified:** 2026-03-09T22:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Push to main triggers Docker build, pushes image to GHCR, and auto-deploys to staging | VERIFIED | docker.yml triggers on `push: branches: [main]`, deploy-lightsail.yml has `workflow_run: workflows: ["Docker"]` trigger with `if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'` on deploy-staging job |
| 2 | Production only deploys on manual workflow_dispatch | VERIFIED | deploy-prod job has `if: github.event_name == 'workflow_dispatch'`; only `production` is a choice option; Plan 03 summary confirms deploy-prod was SKIPPED on push events (GitHub Actions run 22874530168) |
| 3 | GitHub Actions authenticates to AWS via OIDC -- no stored AWS access keys | VERIFIED | `permissions: id-token: write` at workflow level; both deploy jobs use `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}`; Plan 02 confirms IAM role `github-actions-scrummonsters` with OIDC trust policy created |
| 4 | After each deployment, smoke tests run and pass/fail is visible in GitHub Actions | VERIFIED | smoke-test job has `needs: [deploy-staging, deploy-prod]` with `if: always() && (needs.deploy-staging.result == 'success' || needs.deploy-prod.result == 'success')`; tests health, ws-health, and home page via SSH curl; Plan 03 confirms 3/3 passed on run 22874530168 |
| 5 | Drizzle migrations run before app container starts on each deploy | VERIFIED | SSH script step order: `[2/4] drizzle-kit push --force` before `[3/4] up -d --no-deps app` in both staging and prod jobs; `--force` flag prevents interactive prompts |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/deploy-lightsail.yml` | 3-job deploy workflow (staging, prod, smoke-test) | VERIFIED | 140 lines, 3 jobs, valid YAML, no TODOs/placeholders |
| `.github/workflows/docker.yml` | Docker build triggered on push to main | VERIFIED | 134 lines, triggers on push to main, pushes to GHCR |
| `e2e/smoke.spec.ts` | Playwright smoke tests tagged @smoke | VERIFIED | 18 lines, 3 tests with @smoke tags (health, home page, ws-health) |
| `playwright.config.ts` | BASE_URL env var support, conditional webServer | VERIFIED | `process.env.BASE_URL || "http://localhost:5000"` on line 26; webServer ternary on line 58 |
| `.github/workflows/deploy.yml.disabled` | Old K8s deploy workflow disabled | VERIFIED | File exists as .disabled; original deploy.yml removed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| deploy-lightsail.yml | docker.yml | workflow_run trigger | WIRED | `workflows: ["Docker"]` matches `name: Docker` exactly |
| deploy-lightsail.yml | VPS | SSH deploy via appleboy/ssh-action | WIRED | Both jobs SSH to `${{ env.REMOTE_HOST }}` (34.199.135.244) with 4-step deploy script |
| deploy-lightsail.yml | AWS OIDC | configure-aws-credentials@v4 | WIRED | `role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}`, `id-token: write` permission set |
| smoke-test job | deploy jobs | needs dependency | WIRED | `needs: [deploy-staging, deploy-prod]` with conditional `if` |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| CICD-01: Auto-deploy staging on push to main | SATISFIED | -- |
| CICD-02: Production manual deploy only | SATISFIED | -- |
| CICD-03: AWS OIDC authentication | SATISFIED | -- |
| CICD-04: Post-deploy smoke tests visible in Actions | SATISFIED | -- |
| CICD-05: Drizzle migrations before app start | SATISFIED | -- |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | -- |

No TODOs, FIXMEs, placeholders, or stub implementations found in any phase artifact.

### Notable Deviation from Plan

The smoke-test job was changed from Playwright-based (running on GitHub runner against external URL) to SSH-based curl tests (running on VPS against localhost:5000). Commit `e6a1bbd` documents the reason: port 5000 is internal-only and DNS was down, so Playwright from external runners could not reach the app. The curl-based tests verify the same three endpoints (health, ws-health, home page HTTP 200). The Playwright `e2e/smoke.spec.ts` file still exists and works for local/CI testing with BASE_URL set, but is not used in the deploy workflow.

This is a pragmatic change that preserves the goal (post-deploy verification with pass/fail in Actions) while adapting to infrastructure reality. The smoke tests are less thorough (curl vs. headless browser rendering check) but still validate that the app is serving HTTP correctly after deploy.

### Human Verification Required

### 1. Staging Auto-Deploy Chain

**Test:** Push a commit to main and monitor GitHub Actions
**Expected:** docker.yml runs, succeeds, triggers deploy-lightsail.yml, deploy-staging job runs and succeeds, smoke-test job runs and passes
**Why human:** Requires actual push and GitHub Actions UI monitoring

### 2. Production Manual Deploy

**Test:** Go to Actions > Deploy to Lightsail > Run workflow > select "production"
**Expected:** deploy-prod job runs, deploy-staging is skipped, smoke-test runs after deploy-prod succeeds
**Why human:** Requires manual trigger in GitHub Actions UI

### 3. OIDC Credential Verification

**Test:** Check GitHub Actions run logs for deploy-staging
**Expected:** "Assuming role with OIDC" message, no stored AWS_ACCESS_KEY_ID in secrets
**Why human:** Requires checking Actions run logs and repo Secrets page

### Gaps Summary

No gaps found. All 5 success criteria are met by the codebase artifacts. The deploy-lightsail.yml workflow correctly chains docker.yml (push to main) to staging auto-deploy, gates production behind workflow_dispatch, uses OIDC for AWS auth, runs smoke tests after deploy, and executes Drizzle migrations before app restart.

Plan 03 summary reports successful end-to-end verification against GitHub Actions run 22874530168, confirming the pipeline works in practice, not just in theory.

---

_Verified: 2026-03-09T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
