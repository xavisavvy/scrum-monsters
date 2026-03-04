# Phase 34: CI/CD Pipeline - Research

**Researched:** 2026-03-04
**Domain:** GitHub Actions CI/CD — GHCR build/push, SSH deploy, GitHub OIDC for AWS, Playwright smoke tests, Drizzle migration orchestration
**Confidence:** HIGH

---

## Summary

Phase 34 builds a complete automated deployment pipeline on top of the infrastructure Phase 33 established. The production server (34.199.135.244), the GHCR image registry, the deploy.sh script, and the APP_IMAGE_TAG rollback mechanism are all already operational. Phase 34's job is to wire GitHub Actions to invoke that machinery automatically on push-to-main (staging) and manually via workflow_dispatch (production).

The existing `.github/workflows/docker.yml` already handles the build-and-push to GHCR on every push to main, producing `sha-XXXXXXX`, `latest`, and semver tags via `docker/metadata-action@v5`. Phase 34 does not need to recreate that — it needs to create a new `deploy-lightsail.yml` workflow that triggers after `docker.yml` completes, SSH-deploys to the instance, runs migrations, then runs a Playwright smoke test against the live URL. The workflow_dispatch path adds a production environment gate.

GitHub OIDC (CICD-03) eliminates long-lived AWS API access keys from GitHub secrets. For this phase, the OIDC-authenticated AWS role is needed to support any future AWS API calls from CI (e.g., S3 operations, CloudWatch, Lightsail API). **Critical distinction:** OIDC replaces AWS API credentials only — SSH access to the Lightsail instance still requires a stored SSH private key secret in GitHub. Both are required: `id-token: write` for OIDC + `SSH_PRIVATE_KEY` secret for instance access. The Drizzle migration step is already codified in `deploy.sh` as `docker compose run --rm app npm run db:push` — it runs idempotently before the container restart and is safe to run on every deploy.

**Primary recommendation:** Create one new workflow file, `.github/workflows/deploy-lightsail.yml`, structured as three jobs: `build-and-push` (reuse or trigger-after docker.yml), `deploy-staging` (auto on push to main, SSH + migrate + restart), `deploy-prod` (workflow_dispatch only, same SSH steps but with GitHub environment protection). Add a fourth `smoke-test` job that runs `playwright test --grep @smoke` against the live URL after each deploy. Tag critical E2E tests with `@smoke` to create a fast smoke test suite that runs against production without a local server.

---

## Standard Stack

### Core (no new npm packages — all GitHub Actions tooling)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `appleboy/ssh-action` | `v1` | Execute remote SSH commands from GitHub Actions | Most widely used SSH action in the marketplace; supports multi-line scripts; active maintenance |
| `aws-actions/configure-aws-credentials` | `v6.0.0` | Exchange GitHub OIDC token for temporary AWS credentials | Official AWS action; supports OIDC role assumption; no access keys stored |
| `docker/metadata-action` | `v5` (already in docker.yml) | Produce sha/semver/latest GHCR tags | Already present; produces `sha-XXXXXXX` tags needed by deploy |
| `docker/build-push-action` | `v6` (already in docker.yml) | Build and push Docker image to GHCR | Already present; Phase 34 reuses the output image |
| `actions/checkout` | `v4` (already in all workflows) | Checkout repository | Standard |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `@playwright/test` | `^1.58.2` (already in package.json) | Post-deploy smoke test against live URL | After each staging/prod deploy; run only `@smoke`-tagged tests |
| `drizzle-kit push` | `^0.31.4` (already in package.json) | Idempotent schema sync before app restart | Runs via `docker compose run --rm app npm run db:push` in deploy SSH step |
| GitHub Environment protection rules | N/A (GitHub UI config) | Require manual approval before production deploy job runs | Adds human gate even with workflow_dispatch |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `appleboy/ssh-action@v1` | Native SSH in run step (ssh -i key host cmd) | Native is fine but requires manual key file setup in each job step; appleboy handles this declaratively |
| `appleboy/ssh-action@v1` | `webfactory/ssh-agent` | ssh-agent approach works but is more verbose for simple single-host deploys |
| Separate `deploy-lightsail.yml` file | Adding jobs to `docker.yml` | Separate file keeps concerns clean; docker.yml owns build, deploy-lightsail.yml owns deploy |
| `workflow_dispatch` with if-condition | Separate workflow file for prod | Single file with conditional jobs is simpler to maintain; both jobs share the same SSH deploy logic |

**Installation: No new npm packages.** All tooling is existing GitHub Actions in the marketplace.

---

## Architecture Patterns

### Recommended Workflow File Structure

```
.github/workflows/
├── ci.yml                   # Existing: lint, test, build checks
├── docker.yml               # Existing: build + push to GHCR on push-to-main
├── e2e.yml                  # Existing: full Playwright tests (local server)
└── deploy-lightsail.yml     # NEW: SSH deploy + migrate + smoke test
```

### Pattern 1: Single Workflow File with Conditional Jobs

**What:** One `deploy-lightsail.yml` with a `deploy-staging` job (auto on push to main) and a `deploy-prod` job (only on workflow_dispatch). Both jobs share identical SSH deploy steps but target different environments.

**When to use:** When staging and production use the same deploy mechanism but different triggers.

```yaml
# Source: GitHub Actions docs - events that trigger workflows
name: Deploy to Lightsail

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        default: "production"
        type: choice
        options:
          - production

jobs:
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    environment:
      name: staging
      url: https://scrummonsters.com
    # ... SSH deploy steps

  deploy-prod:
    name: Deploy to Production
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    environment:
      name: production
      url: https://scrummonsters.com
    # ... same SSH deploy steps
```

### Pattern 2: workflow_needs — Deploy After Docker Build

**What:** `deploy-staging` uses `workflow_run` trigger or `needs` to wait for `docker.yml` to complete before deploying. This ensures GHCR has the new image before SSH pull.

**Important:** On `push` to main, both `docker.yml` and `deploy-lightsail.yml` trigger simultaneously. Without coordination, the deploy job may SSH and pull `latest` before the new image is pushed. Two approaches:

**Option A — `workflow_run` trigger (recommended):**
```yaml
# Source: GitHub Actions docs - workflow_run event
on:
  workflow_run:
    workflows: ["Docker"]
    types: [completed]
    branches: [main]
```
This triggers deploy-lightsail ONLY after docker.yml completes. The `workflow_run` event provides `github.event.workflow_run.conclusion` to check if the upstream workflow succeeded.

**Option B — `needs` within same workflow file:**
If build and deploy are combined in one file, `needs: [build-and-push]` chains them directly. This is simpler but duplicates the build logic already in `docker.yml`.

**Recommendation:** Use `workflow_run` trigger so `deploy-lightsail.yml` remains purely a deploy workflow and does not duplicate the Docker build.

### Pattern 3: SSH Deploy Step with Drizzle Migration

**What:** The deploy SSH step runs four commands in sequence on the remote host. Migration runs before container restart to prevent schema drift on app startup.

```yaml
# Source: deploy.sh (existing in repo), appleboy/ssh-action docs
- name: Deploy to staging
  uses: appleboy/ssh-action@v1
  with:
    host: 34.199.135.244
    username: ubuntu
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    script: |
      set -e
      cd /opt/scrummonsters

      echo "[1/4] Pulling latest Docker image..."
      docker compose -f docker-compose.prod.yml pull app

      echo "[2/4] Running Drizzle migrations..."
      docker compose -f docker-compose.prod.yml run --rm app npm run db:push

      echo "[3/4] Restarting app container..."
      docker compose -f docker-compose.prod.yml up -d --no-deps app

      echo "[4/4] Verifying health..."
      sleep 10
      curl --fail --silent https://scrummonsters.com/api/health || exit 1

      echo "Deploy complete."
```

**Why `--no-deps` on the final up:** Ensures postgres and nginx-proxy-manager never restart during code deploys — only the `app` container is replaced.

### Pattern 4: GitHub OIDC for AWS Authentication

**What:** An IAM OIDC provider and role allow GitHub Actions to assume an AWS role without storing long-lived access keys. The role is scoped to this specific repo and branch.

**When to use:** Any workflow step that calls AWS APIs (e.g., future S3 operations, CloudWatch, Lightsail API management). For Phase 34, this is set up proactively per CICD-03 requirement.

**IAM Trust Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:xavisavvy/scrum-monsters:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

**Workflow configuration:**
```yaml
# Source: GitHub Docs - Configuring OIDC in AWS
# Source: aws-actions/configure-aws-credentials v6.0.0 README
permissions:
  id-token: write   # REQUIRED for OIDC token generation
  contents: read

steps:
  - name: Configure AWS credentials (OIDC)
    uses: aws-actions/configure-aws-credentials@v6.0.0
    with:
      role-to-assume: arn:aws:iam::ACCOUNT_ID:role/github-actions-scrummonsters
      aws-region: us-east-1
      role-session-name: GitHubActions-Deploy
```

**OIDC Provider setup (one-time, in AWS Console):**
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- This is a one-time account-level setup; the provider may already exist if AWS account is shared.

### Pattern 5: Playwright Smoke Test Against Live URL

**What:** After a successful deploy, run only `@smoke`-tagged Playwright tests against the live staging/production URL. No local server is started — `baseURL` points to the live instance.

**Tagging tests for smoke:**
```typescript
// Source: Playwright docs - test annotations
// In e2e/lobby.spec.ts or a new e2e/smoke.spec.ts
test('health check returns 200 @smoke', { tag: '@smoke' }, async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
});

test('home page loads @smoke', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

**Workflow step:**
```yaml
# Source: Playwright docs - running tests with grep
- name: Run smoke tests
  env:
    BASE_URL: https://scrummonsters.com
  run: npx playwright test --grep @smoke
```

**playwright.config.ts modification needed:**
The existing `playwright.config.ts` has `baseURL: 'http://localhost:5000'` hardcoded under `use:`. Change to read from environment:
```typescript
use: {
  baseURL: process.env.BASE_URL || 'http://localhost:5000',
  // ... rest unchanged
},
// Also disable webServer when BASE_URL is set (skip local server startup):
webServer: process.env.BASE_URL ? undefined : {
  command: 'npm run dev',
  url: 'http://localhost:5000',
  // ...
},
```

### Pattern 6: GitHub Environment Protection for Production

**What:** Create a GitHub Environment named `production` with required reviewers (or a deploy timer). The `deploy-prod` job declares `environment: production` — GitHub will pause execution and require approval before the job runs.

**Setup:** GitHub repo → Settings → Environments → New environment → `production` → Add required reviewers (or just use it as an audit log without reviewers, since workflow_dispatch already provides manual gating).

**Note:** Even without required reviewers, using `environment: production` provides: deployment history, deployment status in PRs, and environment-specific secrets (separate from repo secrets).

### Anti-Patterns to Avoid

- **Triggering deploy-lightsail.yml on `push` without waiting for docker.yml to complete:** The new image may not be in GHCR yet when the deploy SSH step runs `docker compose pull app`. Use `workflow_run` trigger after the Docker workflow.
- **Storing AWS access keys as GitHub secrets instead of OIDC:** Violates CICD-03. OIDC requires no stored long-lived credentials.
- **Using `docker compose up -d` (without `--no-deps`) in the deploy step:** This restarts postgres and nginx-proxy-manager on every deploy, causing unnecessary downtime.
- **Running all Playwright tests against production:** Full E2E suite against live production may create test data, is slow, and can interfere with real users. Use `--grep @smoke` to run only lightweight read-only checks.
- **Using `type=sha,prefix=` (empty prefix) in docker/metadata-action:** Already fixed in `docker.yml` — it uses `prefix=sha-` producing `sha-XXXXXXX` tags. Rollback commands in deploy.sh already expect this format.
- **Running `docker compose run --rm app npm run db:push` after the container is already running:** The migration must run before `up -d --no-deps app`. Running it after starts the app with potentially old schema.
- **Checking out code on the runner when deploy is SSH-only:** The deploy workflow that uses `appleboy/ssh-action` doesn't need `actions/checkout` — the VPS already has the code (or the VPS pulls from git). Avoid unnecessary checkout steps.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSH command execution | Custom `ssh -i keyfile` setup in run steps | `appleboy/ssh-action@v1` | Handles key permissions, known_hosts, multi-line scripts, failure propagation; battle-tested |
| AWS credential management | Storing access keys in GitHub secrets | `aws-actions/configure-aws-credentials@v6.0.0` with OIDC | Eliminates long-lived secrets; credentials auto-expire; official AWS-maintained action |
| Docker image tagging | Custom tagging script | `docker/metadata-action@v5` (already in docker.yml) | Already produces sha, semver, latest tags; no changes needed |
| Post-deploy health verification | Custom curl with retry loop | Playwright `@smoke` tests with Playwright's built-in retry | Playwright handles retries, timeouts, and structured test reporting; results visible in GH Actions |
| Migration orchestration | Custom docker exec or migration sidecar | `docker compose run --rm app npm run db:push` (already in deploy.sh) | Drizzle push is idempotent; existing pattern proven in Phase 33 |

**Key insight:** The deploy.sh script already codifies the correct deploy sequence. The GitHub Actions workflow is an SSH wrapper around that script — the heavy lifting is already done.

---

## Common Pitfalls

### Pitfall 1: Race Condition — Deploy Starts Before Image Is Pushed
**What goes wrong:** `deploy-lightsail.yml` triggers on `push` to main simultaneously with `docker.yml`. The deploy job SSHes in and runs `docker compose pull app` before the new image has been pushed to GHCR. The VPS pulls `latest` — but it's the previous build.
**Why it happens:** GitHub Actions triggers all workflows matching a `push` event simultaneously. There is no built-in sequencing between workflow files.
**How to avoid:** Use `workflow_run` trigger in `deploy-lightsail.yml` — it fires only after the named workflow (`Docker`) completes. Check `github.event.workflow_run.conclusion == 'success'` to skip deploy on failed builds.
**Warning signs:** Deploy completes successfully but the running image SHA is still the old one. Check with `docker inspect ghcr.io/xavisavvy/scrum-monsters:latest --format '{{.Id}}'` on VPS.

### Pitfall 2: SSH Key Permission Error in GitHub Actions Runner
**What goes wrong:** The SSH step fails with "WARNING: UNPROTECTED PRIVATE KEY FILE!" or "Permissions 0644 for key are too open."
**Why it happens:** When the runner writes the private key from a secret to a file, it may not set 0600 permissions. `appleboy/ssh-action@v1` handles this internally, but native SSH approaches in `run:` steps require manual `chmod 600`.
**How to avoid:** Use `appleboy/ssh-action@v1` which handles key file permissions automatically. If using a `run:` step with native SSH, always add `chmod 600 ~/.ssh/deploy_key` immediately after writing the key file.
**Warning signs:** SSH connection fails with permission-related error in CI but works locally.

### Pitfall 3: OIDC Token Not Generated — Missing `id-token: write` Permission
**What goes wrong:** `aws-actions/configure-aws-credentials` fails with "Error: Credentials could not be loaded" or "Unable to get OIDC token."
**Why it happens:** The workflow-level `permissions` block defaults to read-only for `id-token`. Without `id-token: write`, GitHub does not generate the OIDC JWT needed to assume the IAM role.
**How to avoid:** Add `permissions: id-token: write` at the job level (or workflow level). This must be explicitly set — it is not inherited.
**Warning signs:** `configure-aws-credentials` step fails immediately; error mentions "OIDC token" or "id-token."

### Pitfall 4: IAM Trust Policy Too Broad — Any Branch Can Assume Role
**What goes wrong:** The trust policy uses `StringLike` with a wildcard (`repo:org/repo:*`) instead of scoping to main branch. Any branch's workflow can assume the deploy IAM role.
**Why it happens:** Many tutorial trust policies use wildcards for convenience.
**How to avoid:** Use `StringEquals` with `repo:xavisavvy/scrum-monsters:ref:refs/heads/main` to restrict role assumption to main branch only. For workflow_dispatch (prod), also allow the ref that workflow_dispatch uses.
**Warning signs:** Feature branch CI workflows can assume the production IAM role — security risk.

### Pitfall 5: Playwright Smoke Test Fails Because baseURL is Hardcoded to localhost
**What goes wrong:** Playwright smoke test job uses `BASE_URL=https://scrummonsters.com` env var, but `playwright.config.ts` ignores it — `baseURL` is hardcoded to `http://localhost:5000`. Tests fail with connection refused (no local server).
**Why it happens:** The existing `playwright.config.ts` hardcodes `baseURL: 'http://localhost:5000'` and also starts a webServer. Neither works in the post-deploy smoke test context.
**How to avoid:** Change `playwright.config.ts` to read `baseURL: process.env.BASE_URL || 'http://localhost:5000'`. Also make `webServer` conditional: only start the dev server if `BASE_URL` is not set.
**Warning signs:** Playwright CI step shows "Connection refused" or "ECONNREFUSED localhost:5000" even though the live site is up.

### Pitfall 6: `docker compose run --rm` Fails — App Image Not Pulled Yet
**What goes wrong:** The migration step (`docker compose run --rm app npm run db:push`) runs before `docker compose pull app`. It uses the old image for migration.
**Why it happens:** Wrong ordering in the deploy script: migration before pull.
**How to avoid:** Strict ordering: (1) pull, (2) migrate, (3) up --no-deps. The existing `deploy.sh` already has the correct order — preserve it exactly in the GitHub Actions SSH script.
**Warning signs:** Migration completes but uses stale app image; schema may not match new code.

### Pitfall 7: Production Deploy Triggers Automatically via push
**What goes wrong:** Someone adds the production environment to the `push` event trigger accidentally. Production deploys without manual approval.
**Why it happens:** Copy-paste from staging job without changing the `if` condition.
**How to avoid:** The `deploy-prod` job must have `if: github.event_name == 'workflow_dispatch'`. This is the only guard. Test this explicitly: push to main and verify prod job does NOT run.
**Warning signs:** GitHub Actions run summary shows `deploy-prod` running on a push event.

### Pitfall 8: Drizzle Push Hangs Waiting for User Confirmation
**What goes wrong:** `drizzle-kit push` in non-interactive mode may prompt for confirmation when it detects potentially destructive schema changes (column drops, table renames). In CI it hangs indefinitely.
**Why it happens:** Drizzle push checks for data-loss operations and asks for confirmation by default.
**How to avoid:** Use `npx drizzle-kit push --force` or set `--accept-data-loss` flag for CI environments. The existing `deploy.sh` uses `npm run db:push` which calls `drizzle-kit push` — verify the drizzle.config.ts does not have prompts enabled, or add `--force` flag for the deploy context.
**Warning signs:** Migration step hangs in CI for 30+ seconds with no output, then times out.

---

## Code Examples

Verified patterns from official sources and codebase audit:

### Complete deploy-lightsail.yml Workflow

```yaml
# Source: GitHub Actions docs + appleboy/ssh-action@v1 + aws-actions/configure-aws-credentials@v6.0.0
name: Deploy to Lightsail

on:
  # Auto-deploy to staging after Docker build completes
  workflow_run:
    workflows: ["Docker"]
    types: [completed]
    branches: [main]
  # Manual trigger for production
  workflow_dispatch:
    inputs:
      environment:
        description: "Deploy to production"
        required: true
        default: "production"
        type: choice
        options:
          - production

concurrency:
  group: deploy-${{ github.event.workflow_run.head_branch || github.ref }}
  cancel-in-progress: false  # Never cancel in-progress deploys

permissions:
  id-token: write   # Required for OIDC token generation
  contents: read

env:
  REMOTE_HOST: "34.199.135.244"
  REMOTE_USER: "ubuntu"
  REMOTE_DIR: "/opt/scrummonsters"

jobs:
  # -------------------------------------------------------
  # Staging: auto-deploy on push to main (after docker.yml)
  # -------------------------------------------------------
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    timeout-minutes: 15
    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'
    environment:
      name: staging
      url: https://scrummonsters.com

    steps:
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6.0.0
        with:
          role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}
          aws-region: us-east-1
          role-session-name: GitHubActions-Staging-Deploy

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ env.REMOTE_HOST }}
          username: ${{ env.REMOTE_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            set -e
            cd /opt/scrummonsters

            echo "[1/4] Pulling latest Docker image from GHCR..."
            docker compose -f docker-compose.prod.yml pull app

            echo "[2/4] Running Drizzle migrations..."
            docker compose -f docker-compose.prod.yml run --rm app npm run db:push

            echo "[3/4] Restarting app container (no-deps preserves postgres + NPM)..."
            docker compose -f docker-compose.prod.yml up -d --no-deps app

            echo "[4/4] Health check..."
            sleep 15
            curl --fail --silent --show-error https://scrummonsters.com/api/health
            echo "Staging deploy complete."

  # -------------------------------------------------------
  # Production: manual workflow_dispatch only
  # -------------------------------------------------------
  deploy-prod:
    name: Deploy to Production
    runs-on: ubuntu-latest
    timeout-minutes: 15
    if: github.event_name == 'workflow_dispatch'
    environment:
      name: production
      url: https://scrummonsters.com

    steps:
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6.0.0
        with:
          role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}
          aws-region: us-east-1
          role-session-name: GitHubActions-Prod-Deploy

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ env.REMOTE_HOST }}
          username: ${{ env.REMOTE_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            set -e
            cd /opt/scrummonsters

            echo "[1/4] Pulling latest Docker image from GHCR..."
            docker compose -f docker-compose.prod.yml pull app

            echo "[2/4] Running Drizzle migrations..."
            docker compose -f docker-compose.prod.yml run --rm app npm run db:push

            echo "[3/4] Restarting app container..."
            docker compose -f docker-compose.prod.yml up -d --no-deps app

            echo "[4/4] Health check..."
            sleep 15
            curl --fail --silent --show-error https://scrummonsters.com/api/health
            echo "Production deploy complete."

  # -------------------------------------------------------
  # Smoke test: runs after any successful deploy
  # -------------------------------------------------------
  smoke-test:
    name: Post-Deploy Smoke Test
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [deploy-staging, deploy-prod]
    if: always() && (needs.deploy-staging.result == 'success' || needs.deploy-prod.result == 'success')

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers (chromium only for smoke)
        run: npx playwright install --with-deps chromium

      - name: Run smoke tests
        env:
          BASE_URL: https://scrummonsters.com
        run: npx playwright test --grep @smoke --project=chromium

      - name: Upload smoke test results
        uses: actions/upload-artifact@v6
        if: always()
        with:
          name: smoke-test-report
          path: playwright-report/
          retention-days: 7
```

### IAM Trust Policy for GitHub OIDC

```json
// Source: GitHub Docs - Configuring OIDC in Amazon Web Services
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:xavisavvy/scrum-monsters:*"
        }
      }
    }
  ]
}
```

**Note:** `StringLike` with `*` allows any branch. For tighter security, use `StringEquals` with `repo:xavisavvy/scrum-monsters:ref:refs/heads/main` (but workflow_dispatch from UI may use a different ref format — verify before applying strict scoping).

### playwright.config.ts Changes for Live URL Support

```typescript
// Source: Playwright docs - baseURL configuration
// Change in playwright.config.ts:
use: {
  // Read from environment — enables post-deploy smoke tests against live URL
  baseURL: process.env.BASE_URL || 'http://localhost:5000',
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  reducedMotion: 'reduce',
},

// Make webServer conditional — skip local server when targeting live URL
webServer: process.env.BASE_URL ? undefined : {
  command: 'npm run dev',
  url: 'http://localhost:5000',
  reuseExistingServer: !process.env.CI,
  timeout: 120 * 1000,
  stdout: 'pipe',
  stderr: 'pipe',
},
```

### Smoke Test File (e2e/smoke.spec.ts — new file)

```typescript
// Source: Playwright docs - test annotations with @smoke tag
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests @smoke', () => {
  test('health endpoint returns 200', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
  });

  test('home page loads without error', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    // No 500 errors, page content is present
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
  });

  test('WebSocket health endpoint responds', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.get('/api/ws-health');
    expect(response.status()).toBe(200);
  });
});
```

### GitHub Secrets Required

```
# SSH access to Lightsail instance
SSH_PRIVATE_KEY        = <contents of ~/.ssh/lightsail_scrummonsters private key>

# AWS OIDC role (no access key stored — role ARN only)
AWS_OIDC_ROLE_ARN      = arn:aws:iam::ACCOUNT_ID:role/github-actions-scrummonsters
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Stored AWS access key in GitHub secrets | GitHub OIDC → temporary credentials via `configure-aws-credentials@v6` | No long-lived secrets; credentials auto-expire |
| Manual SSH deploys (deploy.sh run locally) | GitHub Actions SSH via `appleboy/ssh-action` | Every push to main auto-deploys; full audit trail |
| K8s/ArgoCD deploy in existing deploy.yml | SSH + Docker Compose on Lightsail VPS | Matches actual infrastructure (Phase 33 moved to Lightsail) |
| Full E2E suite as post-deploy test | `@smoke`-tagged subset via `--grep @smoke` | Fast (under 2 min); read-only; safe against live production |
| `db:migrate` command | `db:push` (drizzle-kit push) | Idempotent schema sync; no migration file management needed |

**Deprecated/outdated in this repo:**
- The existing `deploy.yml` workflow (targets K8s/ArgoCD which no longer exists — Phase 33 migrated to Lightsail VPS). Phase 34 supersedes it for Lightsail deployments. The old `deploy.yml` can be disabled or deleted.

---

## Open Questions

1. **Exact GitHub repository owner/name for GHCR and OIDC**
   - What we know: `docker.yml` uses `${{ github.repository }}` which lowercase-normalizes to `xavisavvy/scrum-monsters`; the GHCR image is `ghcr.io/xavisavvy/scrum-monsters`
   - What's unclear: The exact GitHub org/username (`xavisavvy` appears in Phase 33 SUMMARY — confirm this is the correct GitHub username)
   - Recommendation: Planner should note this as a concrete value to fill in. Verify with `gh repo view --json owner` on the developer's machine.

2. **workflow_run trigger behavior with workflow_dispatch**
   - What we know: `workflow_run` fires when the named upstream workflow (`Docker`) completes. `workflow_dispatch` is a separate trigger.
   - What's unclear: With two triggers (`workflow_run` and `workflow_dispatch`), the `if` conditions on jobs must correctly distinguish them. `github.event_name` will be `'workflow_run'` or `'workflow_dispatch'` respectively.
   - Recommendation: Test the trigger logic thoroughly. A push to main should ONLY trigger deploy-staging. A workflow_dispatch should ONLY trigger deploy-prod.

3. **drizzle-kit push interactive prompt in CI**
   - What we know: `drizzle-kit push` can prompt for confirmation on destructive changes (column/table drops)
   - What's unclear: Whether `npm run db:push` passes `--force` or `--accept-data-loss` flags to skip prompts
   - Recommendation: Test `npm run db:push` in a non-interactive context. If it hangs, add `--force` flag to the `db:push` script in package.json or override in the deploy SSH script with `npx drizzle-kit push --force`.

4. **SSH Key for GitHub Actions — dedicated deploy key vs existing Lightsail key**
   - What we know: `deploy.sh` uses `~/.ssh/lightsail_scrummonsters` as the local SSH key
   - What's unclear: Whether to reuse the existing Lightsail default key in GitHub Actions or generate a dedicated deploy key
   - Recommendation: Generate a dedicated SSH deploy key (no passphrase) for CI, add the public key to `~/.ssh/authorized_keys` on the VPS, store the private key as `SSH_PRIVATE_KEY` GitHub secret. This avoids exposing the primary Lightsail key in GitHub.

5. **AWS Account ID for IAM ARN**
   - What we know: The AWS account has S3 bucket `scrummonsters-backups`, IAM user `scrummonsters-backup`, Route 53 health check — all created in Phase 33
   - What's unclear: The exact AWS account ID number (needed to construct IAM ARNs)
   - Recommendation: Run `aws sts get-caller-identity` to retrieve the account ID before creating IAM resources.

---

## Sources

### Primary (HIGH confidence)
- `.github/workflows/docker.yml` (codebase) — confirmed existing build-push pipeline; `sha-` prefix tag format; GHCR push on push-to-main
- `deploy.sh` (codebase) — confirmed deploy sequence: pull → migrate → up --no-deps; 4-step pattern is correct
- `docker-compose.prod.yml` (codebase) — confirmed `--no-deps` behavior; postgres/NPM services not restarted on code deploys
- `playwright.config.ts` (codebase) — confirmed `baseURL: 'http://localhost:5000'` is hardcoded; needs env var change
- `e2e/*.spec.ts` (codebase) — confirmed no existing `@smoke` tags; smoke test file must be created
- `package.json` (codebase) — confirmed `db:push: drizzle-kit push` script; `@playwright/test: ^1.58.2`; `drizzle-kit: ^0.31.4`
- [GitHub Docs: Configuring OIDC in Amazon Web Services](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) — OIDC provider URL, audience, trust policy format, `id-token: write` requirement
- [aws-actions/configure-aws-credentials v6.0.0](https://github.com/aws-actions/configure-aws-credentials) — confirmed current version v6.0.0; OIDC `role-to-assume` parameter
- [Playwright docs: Test annotations](https://playwright.dev/docs/test-annotations) — confirmed `{ tag: '@smoke' }` syntax; `--grep @smoke` CLI flag
- [drizzle-kit push docs](https://orm.drizzle.team/docs/drizzle-kit-push) — confirmed idempotent; compares schema vs DB state; safe for repeated execution

### Secondary (MEDIUM confidence)
- [appleboy/ssh-action@v1 README](https://github.com/appleboy/ssh-action) — confirmed v1 current version; `host`, `username`, `key`, `script` parameters; handles key permissions
- [GitHub Actions docs: workflow_run event](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows) — confirmed `workflow_run` trigger fires after named workflow completes; `conclusion` check pattern
- [GitHub Actions docs: workflow_dispatch](https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow) — confirmed `github.event_name == 'workflow_dispatch'` check; input types
- AWS blog: Use IAM roles to connect GitHub Actions to actions in AWS — confirmed OIDC replaces AWS access keys (not SSH keys); trust policy JSON format

### Tertiary (LOW confidence — marked for validation)
- drizzle-kit push `--force` flag for CI non-interactive mode — behavior described in community discussions but not officially documented for this specific version (0.31.4); verify before use

---

## Metadata

**Confidence breakdown:**
- Standard stack (Actions, OIDC, SSH): HIGH — verified against official GitHub docs and Action READMEs
- Architecture patterns (workflow_run trigger, deploy sequence): HIGH — verified against codebase + official docs
- Playwright smoke test approach: HIGH — verified against Playwright official docs
- drizzle-kit push idempotency: HIGH — verified against official Drizzle docs
- drizzle-kit push `--force` flag for CI: LOW — community knowledge, needs validation
- IAM trust policy syntax: HIGH — verified against official GitHub OIDC docs

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (30 days — GitHub Actions versions and OIDC trust policy syntax are stable)
