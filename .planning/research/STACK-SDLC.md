# Technology Stack - v1.2 SDLC Best Practices

**Project:** ScrumQuest
**Researched:** 2026-02-02
**Overall Confidence:** HIGH

## Executive Summary

This document covers NEW stack additions for v1.2 SDLC features. The existing stack (ESLint, Playwright, Vitest, ArgoCD, GitHub Actions, Kustomize, Prometheus/Grafana/Loki, Sealed Secrets, cert-manager, Pino logging) is NOT re-researched here.

**Key findings:**
- Use CodeQL for SAST (free, native GitHub integration)
- Drizzle already supports migrations - just enable `drizzle-kit generate` workflow
- Keep standard-version for changelog (already installed, works fine)
- Add Argo Rollouts for progressive delivery and automated rollback
- Native Playwright visual comparison is sufficient (no external service needed)

---

## Recommended Stack Additions

### 1. Security Scanning (SAST)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| CodeQL | v4 (action) | Static Application Security Testing | Free for public repos, native GitHub integration, excellent JavaScript/TypeScript support, AI-powered autofix suggestions |

**Why CodeQL over alternatives:**
- **Native integration**: Built into GitHub, no external service needed
- **Free tier**: Available for all public repositories
- **TypeScript support**: First-class JavaScript/TypeScript analysis
- **Low friction**: Uses `github/codeql-action@v4` - simple workflow addition

**Integration point:** Add to existing `ci.yml` or create dedicated `security.yml` workflow.

```yaml
# .github/workflows/security.yml
- uses: github/codeql-action/init@v4
  with:
    languages: javascript-typescript
- uses: github/codeql-action/analyze@v4
```

**NOT recommended:**
- Snyk (paid for full features, adds external dependency)
- SonarQube (self-hosted overhead, overkill for this project size)
- Semgrep (good alternative but CodeQL is simpler for GitHub-native projects)

---

### 2. Test Coverage Enforcement

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @vitest/coverage-v8 | ^4.0.18 | Coverage collection | Already installed, v8 provider is fast |
| vitest-coverage-report-action | v2 | PR coverage comments | Shows coverage delta on PRs, blocks merges if below threshold |

**Configuration addition to `vitest.config.ts`:**
```typescript
coverage: {
  provider: "v8",
  reporter: ["text", "json", "json-summary", "html"],
  thresholds: {
    lines: 70,
    branches: 60,
    functions: 70,
    statements: 70,
  },
}
```

**Why these thresholds:**
- 70% is achievable for a game with 3D graphics (harder to unit test)
- Focus on server logic and shared types (easier to cover)
- `thresholds` property causes Vitest to fail if not met

**GitHub Action integration:**
```yaml
- uses: davelosert/vitest-coverage-report-action@v2
```

**NOT adding:**
- Codecov (external service, free tier limited)
- Coveralls (same - external dependency not needed)

---

### 3. Visual Regression Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @playwright/test | ^1.58.1 | Visual comparison | Native `toHaveScreenshot()` API, already installed |

**Why native Playwright over external services:**
- **Zero cost**: No Percy/Chromatic subscription
- **No flakiness from external network**: Screenshots generated and compared locally
- **Full control**: Configure `maxDiffPixels`, masking for dynamic content
- **Already integrated**: Playwright is already set up in CI

**Configuration for visual tests:**
```typescript
// playwright.config.ts addition
expect: {
  toHaveScreenshot: {
    maxDiffPixels: 100,      // Allow minor rendering differences
    threshold: 0.2,           // 20% threshold for pixel-by-pixel
  },
},
```

**Test pattern:**
```typescript
test('lobby page visual', async ({ page }) => {
  await page.goto('/lobby');
  // Mask dynamic elements
  await expect(page).toHaveScreenshot('lobby.png', {
    mask: [page.locator('.timestamp'), page.locator('.player-count')],
  });
});
```

**NOT adding:**
- Percy (paid, adds complexity)
- Chromatic (paid, designed for Storybook)
- BackstopJS (separate tool, Playwright native is better)

---

### 4. Database Migrations

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| drizzle-kit | ^0.31.8 | Migration generation | Already installed, just needs workflow enablement |

**Current state:** Project uses `npm run db:push` (schema push, no migration history).

**Migration workflow to enable:**
```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations (production)
npx drizzle-kit migrate
```

**Add scripts to package.json:**
```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

**Production deployment pattern:**
```typescript
// server/migrate.ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';

await migrate(db, { migrationsFolder: './migrations' });
```

**NOT adding:**
- Prisma Migrate (would require ORM switch)
- node-pg-migrate (Drizzle handles this natively)
- Flyway (Java-based, overkill)

---

### 5. API Contract Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| openapi-typescript | ^7.10.1 | Type generation from OpenAPI spec | TypeScript-native, excellent DX |
| openapi-fetch | ^0.15.0 | Type-safe API client | Works with generated types |

**Why this approach:**
- **Type safety as contract**: TypeScript compiler catches API drift
- **Single source of truth**: OpenAPI spec defines the contract
- **Zero runtime overhead**: Types are compile-time only

**Workflow:**
1. Define OpenAPI spec in `shared/openapi.yaml`
2. Generate types: `npx openapi-typescript shared/openapi.yaml -o shared/api-types.ts`
3. Use types in both client and server
4. CI fails if types don't match implementation

**Add script:**
```json
{
  "api:generate": "openapi-typescript shared/openapi.yaml -o shared/api-types.ts",
  "api:validate": "tsc --noEmit shared/api-types.ts"
}
```

**NOT adding:**
- Pact (consumer-driven, more complex than needed)
- Dredd (older tool, less TypeScript integration)
- Prism (OpenAPI mock server - nice but not essential)

---

### 6. Load Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| k6 | v1.5.0 | Load/performance testing | Modern, scriptable, excellent WebSocket support |
| grafana/setup-k6-action | v1 | CI integration | Official GitHub Action |
| grafana/run-k6-action | v1.3.1 | Test execution | Parallel execution, glob support |

**Why k6 over alternatives:**
- **Native TypeScript support**: As of v0.57, no transpilation needed
- **WebSocket support**: Critical for Socket.IO testing
- **Built-in metrics**: Response times, throughput, error rates
- **Grafana integration**: Matches existing monitoring stack
- **Open source**: Free, no cloud requirement

**Test structure:**
```
load-tests/
  scenarios/
    websocket.ts    # Socket.IO connections
    api.ts          # REST API endpoints
  thresholds.json   # Pass/fail criteria
```

**Example test:**
```typescript
// load-tests/scenarios/websocket.ts
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    ws_connecting: ['p(95)<500'],
    ws_msgs_received: ['count>100'],
  },
};

export default function () {
  const url = 'ws://localhost:5000/socket.io/';
  const res = ws.connect(url, function (socket) {
    socket.on('open', () => socket.send('join_lobby'));
  });
  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
```

**NOT adding:**
- Artillery (good but less TypeScript-native)
- Locust (Python, doesn't fit stack)
- JMeter (XML config, poor DX)

---

### 7. Accessibility Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @axe-core/playwright | ^4.11.0 | Accessibility scanning | Official Deque package, integrates with existing Playwright |

**Why axe-core with Playwright:**
- **Already using Playwright**: No new test runner needed
- **Comprehensive**: WCAG 2.1 A/AA coverage
- **Actionable**: Provides fix suggestions
- **CI-friendly**: JSON output for reporting

**Integration pattern:**
```typescript
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('home page accessibility', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

**NOT adding:**
- Pa11y (separate CLI tool, Playwright integration is cleaner)
- Lighthouse (broader scope, less focused)
- WAVE (browser extension, not CI-friendly)

---

### 8. Changelog Automation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| standard-version | ^9.5.0 | Version bumping + changelog | Already installed, works well |

**Current state:** Already configured and working. No changes needed.

**Why keep standard-version:**
- Already installed and configured
- Works with existing commitlint setup
- Simple, predictable behavior
- Manual control over when to release

**NOT switching to:**
- semantic-release (fully automated, less control - overkill for this project)
- commit-and-tag-version (no benefit over current setup)
- release-please (Google's tool, adds complexity)

**Existing scripts (keep as-is):**
```json
{
  "release": "standard-version",
  "release:minor": "standard-version --release-as minor",
  "release:major": "standard-version --release-as major",
  "release:patch": "standard-version --release-as patch"
}
```

---

### 9. Rollback Automation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Argo Rollouts | v1.7+ | Progressive delivery | Blue-green, canary, automated rollback |
| ArgoCD | existing | GitOps deployment | Already configured |

**Why Argo Rollouts:**
- **Automated rollback**: Metrics-driven rollback on failure
- **Progressive delivery**: Canary/blue-green strategies
- **Native integration**: Works with existing ArgoCD setup
- **No code changes**: CRD-based, configuration only

**Integration approach:**
```yaml
# k8s/base/rollout.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: scrumquest
spec:
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause: { duration: 1m }
        - setWeight: 50
        - pause: { duration: 2m }
        - setWeight: 100
      analysis:
        templates:
          - templateName: success-rate
        startingStep: 1
```

**Automated rollback triggers:**
```yaml
# Analysis template
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  metrics:
    - name: success-rate
      interval: 30s
      successCondition: result[0] >= 0.95
      provider:
        prometheus:
          query: |
            sum(rate(http_requests_total{status=~"2.."}[1m])) /
            sum(rate(http_requests_total[1m]))
```

**NOT adding:**
- Flagger (similar to Argo Rollouts, but ArgoCD ecosystem is cleaner)
- Spinnaker (enterprise-grade, massive overkill)
- Custom scripts (reinventing the wheel)

---

### 10. Branch Protection & PR Workflow

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| GitHub Branch Protection | n/a | Enforce PR rules | Native GitHub feature |
| CODEOWNERS | n/a | Required reviewers | Native GitHub feature |

**No new packages needed** - this is GitHub configuration.

**Recommended rules for `main` branch:**
- Require pull request before merging
- Require 1 approval
- Dismiss stale reviews when new commits pushed
- Require status checks: `ci-success`, `e2e`
- Require branches to be up to date
- Include administrators (no bypass)

**CODEOWNERS file:**
```
# .github/CODEOWNERS
* @project-maintainers
/k8s/ @devops-team
/shared/schema.ts @backend-team
```

---

## Summary: New Dependencies

### npm install (devDependencies)

```bash
npm install -D \
  @axe-core/playwright@^4.11.0 \
  openapi-typescript@^7.10.1 \
  openapi-fetch@^0.15.0
```

### Already installed (no action needed)

| Package | Current Version | Notes |
|---------|-----------------|-------|
| @vitest/coverage-v8 | ^4.0.17 | Just add thresholds config |
| @playwright/test | ^1.49.1 | Just use toHaveScreenshot() |
| drizzle-kit | ^0.31.4 | Just enable generate/migrate workflow |
| standard-version | ^9.5.0 | Already working |

### External tools (not npm)

| Tool | Version | Installation |
|------|---------|--------------|
| k6 | v1.5.0 | `brew install k6` or GitHub Action |
| Argo Rollouts | v1.7+ | `kubectl apply -k k8s/infrastructure/argo-rollouts` |

---

## GitHub Actions to Add

| Action | Version | Workflow |
|--------|---------|----------|
| github/codeql-action | v4 | security.yml |
| davelosert/vitest-coverage-report-action | v2 | ci.yml |
| grafana/setup-k6-action | v1 | load-test.yml |
| grafana/run-k6-action | v1 | load-test.yml |

---

## What NOT to Add (and Why)

| Category | Avoided | Reason |
|----------|---------|--------|
| Visual testing | Percy, Chromatic | Paid services, Playwright native is sufficient |
| Coverage | Codecov, Coveralls | External services, vitest-coverage-report-action is simpler |
| SAST | Snyk, SonarQube | CodeQL is free and GitHub-native |
| Changelog | semantic-release | standard-version already works, less automation is fine |
| Load testing | Artillery, Locust | k6 has better TypeScript + WebSocket support |
| a11y | Pa11y, WAVE | axe-core/playwright integrates better |
| Migrations | Prisma, Flyway | Drizzle already handles this |
| Contract testing | Pact | openapi-typescript is simpler for this use case |

---

## Sources

### Security Scanning
- [GitHub CodeQL Action](https://github.com/github/codeql-action)
- [CodeQL JavaScript/TypeScript Queries](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/javascript-typescript-built-in-queries)
- [About Code Scanning with CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)

### Coverage
- [Vitest Coverage Configuration](https://vitest.dev/config/coverage)
- [vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action)

### Visual Testing
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [BrowserStack Snapshot Testing Guide](https://www.browserstack.com/guide/playwright-snapshot-testing)

### Migrations
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle Kit Generate](https://orm.drizzle.team/docs/drizzle-kit-generate)

### Contract Testing
- [OpenAPI TypeScript](https://openapi-ts.dev/openapi-fetch/testing)
- [Contract Testing with OpenAPI & TypeScript](https://alexocallaghan.com/openapi-typescript-contract-testing)

### Load Testing
- [Grafana k6](https://grafana.com/oss/k6/)
- [k6 TypeScript Compatibility](https://grafana.com/docs/k6/latest/using-k6/javascript-typescript-compatibility-mode/)
- [run-k6-action](https://github.com/grafana/run-k6-action)

### Accessibility
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [@axe-core/playwright npm](https://www.npmjs.com/package/axe-playwright)

### Changelog
- [standard-version](https://github.com/conventional-changelog/standard-version)

### Rollback
- [Argo Rollouts](https://argoproj.github.io/rollouts/)
- [ArgoCD Rollback Guide](https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_rollback/)
- [Zero-Downtime Rollbacks with ArgoCD](https://dev.to/srinivasamcjf/zero-downtime-rollbacks-in-kubernetes-with-argocd-a-practical-gitops-lifesaver-1hbi)

### Branch Protection
- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [About Protected Branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
