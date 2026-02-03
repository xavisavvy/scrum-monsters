# Architecture: v1.2 SDLC CI/CD Integration

**Project:** ScrumQuest v1.2 SDLC Best Practices
**Researched:** 2026-02-02
**Focus:** How new SDLC features integrate with existing CI/CD infrastructure
**Confidence:** HIGH (based on existing codebase analysis)

## Executive Summary

ScrumQuest already has a mature CI/CD infrastructure with 11 GitHub Actions workflows, Kustomize-based Kubernetes deployments, and ArgoCD for GitOps. The v1.2 SDLC features primarily involve **extending existing workflows** rather than creating new infrastructure. The architecture is well-positioned for these additions, with clear integration points.

**Key insight:** Most v1.2 features fit naturally into the existing workflow structure. The main architectural decisions are:
1. Where security scans fit in the pipeline sequence
2. How to handle visual regression baseline storage
3. How database migrations integrate with GitOps deployments
4. How coverage thresholds gate PRs
5. How rollback triggers work with ArgoCD

---

## Current Architecture Overview

### Existing Workflow Inventory

```
.github/workflows/
  ci.yml              # lint-and-typecheck -> test -> build -> ci-success
  e2e.yml             # Playwright E2E tests (parallel to CI)
  deploy.yml          # ArgoCD sync triggers (dev auto, staging/prod manual)
  docker.yml          # Build, push, Trivy scan, SBOM generation
  release.yml         # Tag-based releases with changelog
  codeql.yml          # SAST (weekly scheduled + code change triggers)
  pr-checks.yml       # Title validation, size labeling, path detection
  dependabot-auto-merge.yml  # Auto-approve/merge patch updates
  stale.yml           # Stale issue/PR management
  cleanup.yml         # Workflow run and cache cleanup
```

### Current Security Scanning Posture

| Scan Type | Tool | Trigger | Blocking? | Location |
|-----------|------|---------|-----------|----------|
| SAST | CodeQL | Weekly + code changes | No (alerts only) | codeql.yml |
| Container | Trivy | After Docker build | No (SARIF upload) | docker.yml |
| Dependencies | npm audit | On push/PR | No (continue-on-error: true) | ci.yml |
| SBOM | Anchore | After Docker build | No (artifact only) | docker.yml |

### Current Test Infrastructure

| Test Type | Tool | Config | Coverage |
|-----------|------|--------|----------|
| Unit/Integration | Vitest | vitest.config.ts | v8 provider, text/json/html reporters |
| E2E | Playwright | playwright.config.ts | chromium, firefox, 30s timeout |
| Threshold | None | - | No enforcement |

### Current Deployment Architecture

```
                    push to main
                         |
                         v
     +-------------------+-------------------+
     |                   |                   |
     v                   v                   v
  ci.yml             e2e.yml           docker.yml
(lint/test/build)   (Playwright)     (build/scan/push)
     |                   |                   |
     +-------------------+-------------------+
                         |
                         v
                   deploy.yml
                         |
     +-------------------+-------------------+
     |                   |                   |
     v                   v                   v
   dev               staging              prod
(auto-sync)      (manual trigger)   (manual + approval)
     |                   |                   |
     v                   v                   v
  ArgoCD             ArgoCD              ArgoCD
(scrumquest-dev) (scrumquest-staging) (scrumquest-prod)
```

---

## Integration Points for v1.2 Features

### 1. Security Scanning Integration

**Current state:**
- npm audit exists but `continue-on-error: true` (non-blocking)
- CodeQL runs weekly + on code changes (alerts only)
- Trivy scans container images after build (SARIF upload)

**v1.2 enhancements:**

| Feature | Integration Point | Change Type | Blocking? |
|---------|-------------------|-------------|-----------|
| npm audit enforcement | ci.yml security-audit | Modify existing | Yes (high/critical) |
| OWASP Dependency-Check | ci.yml new job | Add job | Optional |
| Secret scanning | Pre-commit hook + CI | New hook + job | Yes |
| License compliance | ci.yml new job | Add job | Yes (blocklist) |

**Recommended CI architecture:**

```yaml
# ci.yml job additions/modifications
jobs:
  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    # CHANGE: Remove continue-on-error to make blocking
    steps:
      - name: npm audit
        run: npm audit --audit-level=high  # Fail on high/critical

  license-check:  # NEW JOB
    name: License Compliance
    runs-on: ubuntu-latest
    steps:
      - name: Check licenses
        run: npx license-checker --production --onlyAllow="MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;0BSD"

  secret-scan:  # NEW JOB (or pre-commit hook)
    name: Secret Detection
    runs-on: ubuntu-latest
    steps:
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Pre-commit integration:**
```bash
# .husky/pre-commit (extend existing)
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run lint
npm run check
npx gitleaks detect --source=. --verbose  # NEW: block commits with secrets
```

**Rationale for integration point:**
- Security jobs run parallel to lint-and-typecheck (no dependencies)
- Pre-commit catches secrets before they reach CI
- Non-blocking jobs (dependency-check) can run in background
- Blocking jobs must complete before ci-success gate job

### 2. Coverage Reporting Integration

**Current state:**
- Coverage runs in ci.yml test job with v8 provider
- Artifacts uploaded but no thresholds enforced
- No PR comments or badges
- `continue-on-error: true` on coverage step

**v1.2 enhancements:**

| Feature | Integration Point | Change Type |
|---------|-------------------|-------------|
| Coverage thresholds | vitest.config.ts | Modify config |
| PR coverage comments | ci.yml test job | Add step |
| Coverage badge | README + external service | Integration |
| Historical tracking | Codecov or similar | External service |

**Recommended configuration:**

```typescript
// vitest.config.ts modification
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html", "lcov"],  // ADD lcov for external tools
  include: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
  exclude: ["node_modules", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/test/**"],
  // ADD: Thresholds (start at current baseline, increase over time)
  thresholds: {
    global: {
      branches: 60,    // Start conservative
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
}
```

```yaml
# ci.yml test job modifications
test:
  steps:
    - name: Run tests with coverage
      run: npm run test:coverage
      # CHANGE: Remove continue-on-error to enforce thresholds

    - name: Coverage Report  # NEW STEP
      uses: davelosert/vitest-coverage-report-action@v2
      if: github.event_name == 'pull_request'
      with:
        json-summary-path: coverage/coverage-summary.json
        json-final-path: coverage/coverage-final.json

    # Alternative: Codecov integration
    - name: Upload to Codecov
      uses: codecov/codecov-action@v4
      with:
        files: coverage/lcov.info
        fail_ci_if_error: false  # Don't fail CI, just report
```

**Rationale for integration point:**
- Coverage step already exists in test job
- PR comments require pull_request event context
- Codecov provides historical tracking without self-hosting
- Thresholds in vitest.config.ts ensure local failures match CI

### 3. Visual Regression Testing Integration

**Current state:**
- Playwright configured for screenshots on failure only
- No visual comparison baselines
- e2e/ directory with functional tests (lobby.spec.ts, battle.spec.ts)

**v1.2 enhancements:**

| Feature | Integration Point | Change Type |
|---------|-------------------|-------------|
| Visual snapshots | playwright.config.ts | Modify config |
| Baseline storage | Git LFS | New setup |
| Visual diff reports | e2e.yml | Modify workflow |
| Update baseline workflow | New workflow or manual | New |

**Recommended storage architecture (Git LFS):**

```bash
# .gitattributes (create or modify)
# Track visual regression baselines with Git LFS
e2e/**/*-snapshots/**/*.png filter=lfs diff=lfs merge=lfs -text
```

```yaml
# e2e.yml modifications
e2e:
  steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        lfs: true  # ADD: Pull LFS files

    - name: Install Playwright browsers
      run: npx playwright install --with-deps chromium firefox

    - name: Run Playwright tests
      run: npm run test:e2e

    - name: Upload visual diff report  # ADD
      uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: visual-diff-report
        path: |
          test-results/
          e2e/__snapshots__/
        retention-days: 14
```

**Playwright config modifications:**

```typescript
// playwright.config.ts
export default defineConfig({
  // ... existing config

  // ADD: Visual comparison settings
  expect: {
    timeout: 5 * 1000,
    toHaveScreenshot: {
      maxDiffPixels: 100,        // Allow small differences (anti-aliasing)
      threshold: 0.2,            // 20% pixel difference tolerance
      animations: 'disabled',    // Disable CSS animations during capture
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02,   // 2% max diff for text snapshots
    },
  },

  // ADD: Snapshot storage
  snapshotDir: './e2e/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
});
```

**Visual test patterns:**

```typescript
// e2e/visual.spec.ts (NEW)
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('home page renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Mask dynamic content (timestamps, animations)
    await expect(page).toHaveScreenshot('home-page.png', {
      mask: [
        page.locator('[data-testid="timestamp"]'),
        page.locator('.animation-container'),
      ],
    });
  });

  test('lobby creation modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /create/i }).click();

    await expect(page.locator('[role="dialog"]')).toHaveScreenshot('create-lobby-modal.png');
  });
});
```

**Baseline update workflow:**

```yaml
# .github/workflows/update-snapshots.yml (NEW - manual trigger only)
name: Update Visual Snapshots

on:
  workflow_dispatch:
    inputs:
      branch:
        description: 'Branch to update snapshots on'
        required: true
        default: 'main'

jobs:
  update-snapshots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.branch }}
          lfs: true

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - name: Update snapshots
        run: npx playwright test --update-snapshots

      - name: Commit updated snapshots
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add e2e/__snapshots__/
          git diff --cached --quiet || git commit -m "chore: update visual snapshots"
          git push
```

**Rationale for Git LFS:**
- Keeps repo clone fast (LFS files downloaded on demand)
- Works with existing Git workflow (no external storage setup)
- Snapshots versioned with code (reproducible builds)
- GitHub Actions supports LFS natively

### 4. Database Migrations Integration

**Current state:**
- Drizzle ORM with `db:push` command (schema sync, no migrations)
- No migration files (migrations/ directory configured but empty)
- drizzle.config.ts configured with `out: "./migrations"`

**v1.2 enhancements:**

| Feature | Integration Point | Change Type |
|---------|-------------------|-------------|
| Migration generation | npm scripts + drizzle-kit | Add scripts |
| Migration validation | deploy.yml or ci.yml | Add job |
| Pre-deploy migrations | K8s init container or ArgoCD hook | Add manifest |
| Rollback support | Migration tooling | Add scripts |

**npm scripts additions:**

```json
// package.json scripts
{
  "scripts": {
    "db:push": "drizzle-kit push",           // Existing (dev only)
    "db:generate": "drizzle-kit generate",   // NEW: Generate migration
    "db:migrate": "drizzle-kit migrate",     // NEW: Apply migrations
    "db:check": "drizzle-kit check",         // NEW: Validate schema sync
    "db:studio": "drizzle-kit studio"        // NEW: Visual DB explorer
  }
}
```

**CI validation (deploy.yml):**

```yaml
# deploy.yml - add validation job
jobs:
  validate:
    name: Validate Manifests
    runs-on: ubuntu-latest
    steps:
      # ... existing Kustomize validation

  validate-migrations:  # NEW JOB
    name: Validate DB Migrations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Check migrations in sync
        run: npm run db:check
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_DEV }}  # Dev DB for validation
```

**ArgoCD PreSync Hook (recommended for production):**

```yaml
# k8s/base/migration-job.yaml (NEW)
apiVersion: batch/v1
kind: Job
metadata:
  name: scrumquest-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  ttlSecondsAfterFinished: 300  # Cleanup after 5 minutes
  template:
    spec:
      containers:
        - name: migrate
          image: scrumquest:latest
          command: ["npm", "run", "db:migrate"]
          envFrom:
            - secretRef:
                name: scrumquest-secrets
          resources:
            requests:
              memory: "128Mi"
              cpu: "50m"
            limits:
              memory: "256Mi"
              cpu: "200m"
      restartPolicy: Never
  backoffLimit: 3
```

**Kustomization update:**

```yaml
# k8s/base/kustomization.yaml - add migration job
resources:
  - namespace.yaml
  - configmap.yaml
  - deployment.yaml
  - service.yaml
  - ingress.yaml
  - hpa.yaml
  - postgres.yaml
  - redis.yaml
  - sealed-secret-template.yaml
  - migration-job.yaml  # NEW
```

**Rationale for ArgoCD PreSync Hook:**
- Migrations run BEFORE deployment starts
- Failed migrations block deployment (safe)
- Job cleanup is automatic (HookSucceeded policy)
- Visible in ArgoCD UI for debugging
- Init containers run every pod start (wasteful for migrations)

### 5. Rollback Integration with ArgoCD

**Current state:**
- ArgoCD apps configured for dev/staging/prod
- Dev: auto-sync enabled
- Staging/Prod: manual sync required
- Prod uses tagged releases (`targetRevision: v1.0.0`)
- `revisionHistoryLimit: 10` set on prod app

**v1.2 enhancements:**

| Feature | Integration Point | Change Type |
|---------|-------------------|-------------|
| Manual rollback workflow | New workflow | Add workflow |
| Rollback to previous | ArgoCD CLI | Add job step |
| Rollback to specific revision | ArgoCD CLI | Add job step |
| Health-based alerts | ArgoCD notifications | Configure |

**Rollback workflow:**

```yaml
# .github/workflows/rollback.yml (NEW)
name: Rollback

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to rollback'
        required: true
        type: choice
        options:
          - staging
          - prod
      revision:
        description: 'Revision to rollback to (leave empty for previous)'
        required: false
        type: string
      dry_run:
        description: 'Dry run (preview only)'
        required: false
        type: boolean
        default: false

permissions:
  contents: read

env:
  ARGOCD_SERVER: argocd.local

jobs:
  rollback:
    name: Rollback ${{ github.event.inputs.environment }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: ${{ github.event.inputs.environment == 'prod' && 'production' || 'staging' }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install ArgoCD CLI
        run: |
          curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/download/v2.13.3/argocd-linux-amd64
          chmod +x argocd
          sudo mv argocd /usr/local/bin/

      - name: Get current state
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP="scrumquest-${{ github.event.inputs.environment }}"
          echo "## Current Application State" >> $GITHUB_STEP_SUMMARY
          argocd app get $APP --server $ARGOCD_SERVER --grpc-web >> $GITHUB_STEP_SUMMARY

      - name: Preview rollback
        if: github.event.inputs.dry_run == 'true'
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP="scrumquest-${{ github.event.inputs.environment }}"
          echo "## Rollback Preview (Dry Run)" >> $GITHUB_STEP_SUMMARY
          argocd app history $APP --server $ARGOCD_SERVER --grpc-web >> $GITHUB_STEP_SUMMARY
          echo "Dry run complete - no changes made"

      - name: Execute rollback
        if: github.event.inputs.dry_run != 'true'
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP="scrumquest-${{ github.event.inputs.environment }}"

          if [ -n "${{ github.event.inputs.revision }}" ]; then
            echo "Rolling back to revision: ${{ github.event.inputs.revision }}"
            argocd app rollback $APP ${{ github.event.inputs.revision }} \
              --server $ARGOCD_SERVER \
              --grpc-web
          else
            echo "Rolling back to previous revision"
            argocd app rollback $APP \
              --server $ARGOCD_SERVER \
              --grpc-web
          fi

      - name: Wait for rollback
        if: github.event.inputs.dry_run != 'true'
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP="scrumquest-${{ github.event.inputs.environment }}"
          argocd app wait $APP \
            --server $ARGOCD_SERVER \
            --grpc-web \
            --health \
            --timeout 300

      - name: Post-rollback status
        if: always() && github.event.inputs.dry_run != 'true'
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP="scrumquest-${{ github.event.inputs.environment }}"
          echo "## Post-Rollback Status" >> $GITHUB_STEP_SUMMARY
          argocd app get $APP --server $ARGOCD_SERVER --grpc-web >> $GITHUB_STEP_SUMMARY
```

**Rationale for workflow-based rollback:**
- Audit trail in GitHub Actions history
- Environment protection rules apply (prod requires approval)
- Dry run option for safety
- Visible in repository (not hidden in ArgoCD UI)

---

## Component Boundaries

### New Files/Directories

| Path | Purpose | Created By |
|------|---------|------------|
| `.gitattributes` | Git LFS tracking for visual snapshots | Manual setup |
| `.github/workflows/rollback.yml` | Manual rollback trigger | v1.2 Phase |
| `.github/workflows/update-snapshots.yml` | Update visual baselines | v1.2 Phase |
| `e2e/__snapshots__/` | Visual regression baselines | Playwright |
| `e2e/visual.spec.ts` | Visual regression tests | v1.2 Phase |
| `k8s/base/migration-job.yaml` | ArgoCD PreSync hook | v1.2 Phase |
| `migrations/` | Drizzle migration files | drizzle-kit generate |

### Modified Files

| Path | Changes |
|------|---------|
| `.github/workflows/ci.yml` | Remove continue-on-error, add license-check, add secret-scan, add coverage comments |
| `.github/workflows/e2e.yml` | Add LFS checkout, add visual diff artifact upload |
| `.github/workflows/deploy.yml` | Add validate-migrations job |
| `.husky/pre-commit` | Add gitleaks secret detection |
| `vitest.config.ts` | Add coverage thresholds, add lcov reporter |
| `playwright.config.ts` | Add screenshot comparison settings, add snapshot directory |
| `package.json` | Add db:generate, db:migrate, db:check scripts |
| `k8s/base/kustomization.yaml` | Add migration-job.yaml to resources |

---

## Data Flow Diagrams

### Security Scan Data Flow

```
PR Created/Updated
       |
       +-- ci.yml --------+-- npm audit (high/critical) ---> Block PR
       |                  |
       |                  +-- license-check ------------> Block PR (if blocklist)
       |                  |
       |                  +-- gitleaks -----------------> Block PR (if secrets)
       |
       +-- codeql.yml ----+-- CodeQL analysis ----------> SARIF -> Security Tab
       |
       +-- docker.yml ----+-- Trivy scan ---------------> SARIF -> Security Tab
                          |
                          +-- SBOM generation ----------> Artifact

Pre-commit (local):
       |
       +-- gitleaks detect ---> Block commit (if secrets found)
```

### Coverage Data Flow

```
PR Created/Updated
       |
       v
   ci.yml test job
       |
       +-- vitest --coverage
       |       |
       |       +-- coverage/coverage-summary.json
       |       +-- coverage/coverage-final.json
       |       +-- coverage/lcov.info
       |       +-- coverage/html/ (report)
       |
       +-- Thresholds check (in vitest) ---> Fail if below threshold
       |
       +-- vitest-coverage-report-action ---> PR Comment with diff
       |
       +-- (optional) codecov-action -------> Codecov Dashboard
       |
       +-- Upload artifact -----------------> coverage-report artifact
```

### Visual Regression Data Flow

```
PR Created/Updated
       |
       v
   e2e.yml
       |
       +-- git lfs pull <-- e2e/__snapshots__/*.png (baselines from LFS)
       |
       +-- playwright test
       |       |
       |       +-- Compare screenshots against baselines
       |       |
       |       +-- Pass: Screenshots match within threshold
       |       |
       |       +-- Fail: Screenshots differ
       |               |
       |               +-- test-results/ (diff images)
       |               +-- Upload artifact for review
       |
       v
Developer reviews diff
       |
       +-- Fix UI issue --> Re-run tests
       |
       +-- Update baseline --> workflow_dispatch update-snapshots.yml
                                   |
                                   +-- playwright test --update-snapshots
                                   +-- git commit + push (LFS)
```

### Migration Data Flow

```
Schema Change (shared/schema.ts)
       |
       v
Developer: npm run db:generate
       |
       +-- migrations/000X_migration_name.sql created
       |
       v
Developer: git commit migrations/
       |
       v
PR Created/Updated
       |
       +-- deploy.yml validate-migrations
       |       |
       |       +-- npm run db:check ---> Fail if schema/migrations out of sync
       |
       v
Merge to main
       |
       v
ArgoCD Sync (dev auto / staging+prod manual)
       |
       +-- PreSync Hook: migration-job
       |       |
       |       +-- npm run db:migrate
       |       |
       |       +-- Success: Continue to deployment
       |       +-- Fail: Block deployment, job visible in ArgoCD
       |
       v
Deployment proceeds (or blocked on migration failure)
```

### Rollback Data Flow

```
Issue Detected in Production
       |
       v
Developer triggers workflow_dispatch
       |
       +-- rollback.yml (environment: prod)
       |       |
       |       +-- GitHub environment protection (requires approval)
       |       |
       |       +-- argocd app rollback scrumquest-prod [revision]
       |       |
       |       +-- argocd app wait --health (verify rollback healthy)
       |
       v
Production running previous version
       |
       v
Post-mortem / fix forward on new branch
```

---

## Suggested Build Order

Based on dependencies and risk assessment:

### Phase 1: Low-Risk CI Enhancements (Week 1)

**Rationale:** Non-breaking changes that improve visibility without disrupting existing flows.

1. **Coverage thresholds** - Modify vitest.config.ts
   - Start at current baseline (measure first)
   - Remove continue-on-error from coverage step
   - Risk: LOW (local failures match CI)

2. **Coverage PR comments** - Add step to ci.yml
   - Add vitest-coverage-report-action
   - Risk: LOW (additive step, non-blocking initially)

3. **npm audit enforcement** - Modify ci.yml
   - Remove continue-on-error from security-audit
   - Risk: MEDIUM (may block PRs with known vulnerabilities)
   - Mitigation: Create .npmrc allowlist for known issues

### Phase 2: Security Hardening (Week 2)

**Rationale:** Security features should be added early but after basic CI improvements validated.

1. **Pre-commit secrets detection** - Modify .husky/pre-commit
   - Add gitleaks detect step
   - Risk: LOW (local only, doesn't break CI)

2. **CI secret scanning** - Add job to ci.yml
   - Add gitleaks-action job
   - Risk: LOW (runs parallel, informational initially)

3. **License compliance** - Add job to ci.yml
   - Add license-checker job
   - Risk: MEDIUM (may find unexpected licenses)
   - Mitigation: Review current licenses first, build allowlist

### Phase 3: Visual Testing Infrastructure (Week 3)

**Rationale:** Requires infrastructure setup (LFS) before tests can be written.

1. **Git LFS setup** - Create/modify .gitattributes
   - Track e2e/**/*-snapshots/**/*.png
   - Risk: LOW (LFS is opt-in per file)

2. **Playwright snapshot config** - Modify playwright.config.ts
   - Add toHaveScreenshot settings
   - Add snapshotDir configuration
   - Risk: LOW (configuration only)

3. **Initial baseline capture** - Create e2e/__snapshots__
   - Run playwright with --update-snapshots
   - Commit via LFS
   - Risk: LOW (first run creates baselines)

4. **e2e.yml workflow updates** - Modify e2e.yml
   - Add LFS checkout
   - Add visual diff artifact upload
   - Risk: LOW (additive steps)

5. **Update snapshots workflow** - Create update-snapshots.yml
   - Manual trigger only
   - Risk: LOW (intentional updates only)

### Phase 4: Database Migrations (Week 4)

**Rationale:** Requires careful sequencing. Schema-to-migration tooling must work before CI integration.

1. **Add npm scripts** - Modify package.json
   - Add db:generate, db:migrate, db:check
   - Risk: LOW (scripts don't run automatically)

2. **Generate initial migration** - Create migrations/
   - Run npm run db:generate
   - Verify migration matches schema
   - Risk: MEDIUM (first migration is complex)
   - Mitigation: Test on dev database first

3. **Add CI validation** - Modify deploy.yml
   - Add validate-migrations job
   - Risk: MEDIUM (may block deploys if out of sync)
   - Mitigation: Run validation in warning-only mode initially

4. **Add ArgoCD PreSync hook** - Create k8s/base/migration-job.yaml
   - Create Job manifest
   - Update kustomization.yaml
   - Risk: HIGH (failed migrations block deployments)
   - Mitigation: Deploy to dev first, test rollback

### Phase 5: Deployment Enhancements (Week 5)

**Rationale:** Build on stable CI. Rollback is safety net for migration phase.

1. **Rollback workflow** - Create rollback.yml
   - Manual trigger with environment protection
   - Dry-run option for safety
   - Risk: LOW (manual only, has preview)

2. **Test rollback on dev** - Validate workflow
   - Trigger manual rollback on dev
   - Verify ArgoCD state
   - Risk: LOW (dev environment only)

3. **Enable for staging/prod** - Update environment protection
   - Configure GitHub environment approvals
   - Risk: MEDIUM (prod requires extra care)
   - Mitigation: Require 2 approvals for prod rollback

---

## Anti-Patterns to Avoid

### 1. Coverage Threshold Shock
**Bad:** Setting 80% threshold immediately on existing codebase
**Why bad:** Blocks all PRs until massive test backfill
**Instead:** Measure current coverage, set threshold 5% below, incrementally increase

### 2. Blocking Visual Diffs on 3D Content
**Bad:** Failing CI on any visual diff (WebGL rendering varies by GPU)
**Why bad:** False positives from anti-aliasing, GPU driver differences
**Instead:** Use threshold-based comparison, mask dynamic/3D elements

### 3. Parallel Migration Init Containers
**Bad:** Running migrations in init containers (every pod startup)
**Why bad:** Migrations run multiple times, race conditions on parallel deploys
**Instead:** ArgoCD PreSync hook (runs once before deployment)

### 4. Blocking on npm audit with Stale Dependencies
**Bad:** Strict npm audit on projects with many transitive dependencies
**Why bad:** Known vulnerabilities in deep dependencies block development
**Instead:** Create allowlist for known issues, focus on direct dependencies

### 5. LFS Without Limits
**Bad:** Storing full-page screenshots without file size limits
**Why bad:** LFS bandwidth charges, slow clones, large diff reviews
**Instead:** Capture components only, set max resolution, periodic cleanup

### 6. Rollback Without Health Checks
**Bad:** Fire-and-forget rollback without waiting for health
**Why bad:** Rollback may introduce different issues
**Instead:** Always `argocd app wait --health` after rollback

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Security scanning integration | HIGH | Existing tools (CodeQL, Trivy) well understood, adding npm audit/gitleaks is standard |
| Coverage thresholds | HIGH | Vitest native feature, well documented |
| Visual regression | MEDIUM | Playwright screenshots work, but 3D content (React Three Fiber) may have GPU variance |
| Database migrations | HIGH | Drizzle-kit generate/migrate is mature, ArgoCD hooks are standard pattern |
| Rollback workflow | HIGH | ArgoCD CLI rollback is documented, workflow_dispatch is straightforward |

**Overall confidence:** HIGH

All integration points verified against existing workflow files. Patterns are standard for GitHub Actions + ArgoCD deployments.

---

## Sources

All integration points verified by reading existing codebase:
- `.github/workflows/` - All 11 workflow files analyzed
- `k8s/` - ArgoCD apps and Kustomize structure analyzed
- `vitest.config.ts`, `playwright.config.ts` - Test configuration analyzed
- `drizzle.config.ts`, `shared/schema.ts` - Database configuration analyzed
- `package.json` - Existing scripts analyzed

External references (HIGH confidence):
- GitHub Actions official documentation
- ArgoCD official documentation (sync hooks, rollback)
- Drizzle ORM documentation (generate, migrate, check)
- Playwright visual comparison documentation
- Vitest coverage documentation

---

*Architecture research for: ScrumQuest v1.2 SDLC CI/CD integration*
*Researched: 2026-02-02*
*Confidence: HIGH*
