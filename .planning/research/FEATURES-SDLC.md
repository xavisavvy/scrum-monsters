# Feature Landscape: SDLC Best Practices

**Domain:** Software Development Lifecycle (SDLC) Best Practices for Full-Stack TypeScript Application
**Researched:** 2026-02-02
**Overall Confidence:** HIGH

## Context: What Already Exists

ScrumQuest v1.1 already has substantial CI/CD infrastructure:

| Existing Feature | Implementation | Status |
|-----------------|----------------|--------|
| ESLint linting | CI workflow, `npm run lint` | Complete |
| TypeScript type checking | CI workflow, `npm run check` | Complete |
| Unit testing | Vitest with coverage | Complete |
| E2E testing | Playwright (Chromium, Firefox) | Complete |
| CodeQL SAST | GitHub workflow with security-extended queries | Complete |
| npm audit | Security audit in CI (non-blocking) | Complete |
| Trivy container scanning | Docker workflow with SARIF output | Complete |
| PR title validation | Conventional commits enforcement | Complete |
| PR size labeling | Automatic XS/S/M/L/XL labels | Complete |
| Dependabot auto-merge | Patch auto-merge, minor auto-approve | Complete |
| ArgoCD GitOps | Dev/staging/prod environments | Complete |
| Prometheus metrics | `/metrics` endpoint, ServiceMonitor | Complete |
| Grafana dashboards | Monitoring infrastructure | Complete |
| GitHub Releases | Automated with Docker images | Complete |
| standard-version | Changelog generation with conventional commits | Complete |
| commitlint/husky | Commit message enforcement | Complete |

---

## Table Stakes

Features that are expected for mature SDLC. Missing these indicates gaps in engineering practices.

### 1. PR Workflow with Required Reviews

**Why Expected:** Industry standard for code quality. Prevents solo merges to main branch.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Required approvals | 1-2 approving reviews before merge | Low |
| Dismiss stale reviews | New commits invalidate old approvals | Low |
| CODEOWNERS | Auto-assign reviewers by file path | Low |
| Up-to-date branch | PR must be current with base branch | Low |
| Status checks gate | All CI must pass before merge | Low |

**Current Gap:** ScrumQuest has PR workflows but branch protection rules need configuration in GitHub repository settings.

**Implementation Notes:**
- Configure via GitHub UI: Settings > Branches > Branch protection rules
- Create `CODEOWNERS` file mapping paths to teams/users
- Reference: [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)

**Complexity:** Low
**Dependencies:** None (GitHub repository settings)

---

### 2. Test Coverage Enforcement

**Why Expected:** Prevents coverage regression. Makes testing culture measurable.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Coverage threshold | Fail if coverage drops below threshold (70-80% recommended start) | Low |
| Per-file minimum | Optional per-file thresholds | Medium |
| Coverage reporting | PR comments showing coverage delta | Low |
| Ratcheting | Threshold increases as coverage improves | Low |

**Current Gap:** ScrumQuest runs `test:coverage` but uses `continue-on-error: true` and doesn't enforce thresholds.

**Implementation Notes:**
- Vitest supports coverage thresholds in `vitest.config.ts`
- Use [Vitest Coverage Report action](https://github.com/marketplace/actions/vitest-coverage-report) for PR comments
- Start with 70% threshold, ratchet up over time
- Consider [Code Coverage Summary action](https://github.com/marketplace/actions/code-coverage-summary) for LCOV parsing

**Complexity:** Low
**Dependencies:** Existing Vitest coverage setup

---

### 3. Database Migration Safety

**Why Expected:** Schema changes in production require careful management. `db:push` is for development only.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Migration files | Generated SQL files, not direct push | Low |
| Version tracking | Migrations table tracks applied changes | Low |
| Reversible migrations | Down migrations for rollback | Medium |
| CI validation | Test migrations against clean DB | Medium |
| Staging-first | Apply to staging before production | Low |

**Current Gap:** ScrumQuest uses `drizzle-kit push` for development. No migration file workflow.

**Implementation Notes:**
- Switch to `drizzle-kit generate` + `drizzle-kit migrate` workflow
- Add migration script using `drizzle-orm/postgres-js/migrator`
- Track migrations in `__drizzle_migrations` table
- Reference: [Drizzle Migrations Docs](https://orm.drizzle.team/docs/migrations)

**Complexity:** Medium
**Dependencies:** Existing Drizzle ORM setup

---

### 4. Accessibility Testing (Basic)

**Why Expected:** Legal requirements (ADA, WCAG), user inclusivity. Basic automated checks are table stakes.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Automated a11y checks | axe-core or pa11y in CI | Low |
| Critical violations fail | Block merge on critical a11y issues | Low |
| Integration with E2E | Run a11y checks during Playwright tests | Low |

**Current Gap:** No accessibility testing configured.

**Implementation Notes:**
- Add `@axe-core/playwright` to E2E tests
- axe-core + pa11y combined find ~35% of issues (manual testing still needed)
- Start with critical violations only, expand over time
- Reference: [Playwright axe integration](https://playwright.dev/docs/accessibility-testing)

**Complexity:** Low
**Dependencies:** Existing Playwright setup

---

## Differentiators

Features that set engineering practices apart. Not expected, but add significant value.

### 5. SAST Beyond CodeQL

**Why Valuable:** CodeQL is good but additional tools catch different issue types. Defense in depth.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Semgrep rules | Custom security rules for patterns | Medium |
| Secret scanning | Detect leaked credentials pre-commit | Low |
| Dependency vulnerabilities | Beyond npm audit - Snyk or similar | Low |

**Current State:** CodeQL with security-extended queries, npm audit (non-blocking), Trivy for containers.

**Implementation Notes:**
- Consider [Semgrep](https://github.com/returntocorp/semgrep-action) for custom rules
- Add [gitleaks](https://github.com/gitleaks/gitleaks-action) for pre-commit secret detection
- npm audit is already present; consider Snyk for richer SCA
- Reference: [Aikido Security SAST comparison](https://www.aikido.dev/blog/top-javascript-security-tools)

**Complexity:** Low-Medium
**Dependencies:** None

---

### 6. Visual Regression Testing

**Why Valuable:** Catches unintended UI changes. Especially valuable for ScrumQuest's 3D/animation-heavy UI.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Screenshot comparison | Baseline vs current screenshots | Medium |
| Cross-browser consistency | Same UI across browsers | Medium |
| PR review workflow | Visual diff in PR comments | Medium |
| Threshold configuration | Pixel/percentage diff tolerance | Low |

**Current Gap:** No visual regression testing.

**Implementation Notes:**
- **Option 1: Playwright built-in** - `toHaveScreenshot()`, free, local baselines, OS-dependent rendering
- **Option 2: Percy** (BrowserStack) - Cloud-based, AI noise filtering, cross-browser, paid
- **Option 3: Chromatic** - Best for Storybook/component-driven, collaboration features, paid
- For ScrumQuest: Start with Playwright built-in, consider Percy for CI consistency
- Reference: [Playwright Visual Testing](https://playwright.dev/docs/test-snapshots)

**Complexity:** Medium
**Dependencies:** Existing Playwright setup

---

### 7. API Contract Testing

**Why Valuable:** Ensures client-server contract doesn't break. Critical for Socket.IO event contracts.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Contract definition | Types/schemas define contract | Low |
| Consumer tests | Client validates expected responses | Medium |
| Provider verification | Server validates it meets contract | Medium |
| Breaking change detection | CI fails on contract violations | Medium |

**Current State:** ScrumQuest already has `shared/gameEvents.ts` defining Socket.IO contracts with TypeScript interfaces.

**Implementation Notes:**
- TypeScript provides compile-time contract enforcement
- Consider runtime validation with Zod schemas (already in project)
- For REST endpoints: OpenAPI spec generation from routes
- For Socket.IO: Custom contract tests validating event shapes
- Pact is overkill for single-app; TypeScript + Zod is sufficient

**Complexity:** Medium
**Dependencies:** Existing TypeScript contracts in shared/

---

### 8. Load/Performance Testing

**Why Valuable:** Validates system under stress. Critical for real-time multiplayer game.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Load test scenarios | Simulate concurrent users | Medium |
| Performance baselines | Track metrics over time | Medium |
| Threshold failures | CI fails on performance regression | Medium |
| Grafana integration | Correlate with observability | Low |

**Current Gap:** No load testing configured.

**Implementation Notes:**
- **k6** (Grafana) is ideal - JavaScript-based, integrates with existing Grafana
- Test scenarios: concurrent lobbies, WebSocket connections, game state sync
- Start with smoke tests (10 users), expand to load tests (100+)
- Integrate with existing Prometheus/Grafana stack
- Reference: [k6 documentation](https://grafana.com/docs/k6/latest/)

**Complexity:** Medium-High
**Dependencies:** Grafana observability stack (exists)

---

### 9. Deployment Rollback Automation

**Why Valuable:** Faster recovery from bad deployments. Reduces MTTR.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| One-click rollback | Revert to previous version easily | Low |
| Automated health checks | Detect failed deployments | Medium |
| Auto-rollback | Automatically revert on failure | High |
| Rollback notifications | Alert team on rollback events | Low |

**Current State:** ArgoCD supports manual rollback via UI/CLI. Health checks exist in deploy workflow.

**Implementation Notes:**
- ArgoCD: `argocd app rollback` for manual rollback
- Argo Rollouts for progressive delivery with automatic rollback
- Add Slack/Discord notifications on rollback
- Consider canary deployments for safer releases
- Reference: [ArgoCD Rollback](https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_rollback/)

**Complexity:** Medium (manual) / High (automated canary)
**Dependencies:** Existing ArgoCD setup

---

### 10. Advanced Changelog Automation

**Why Valuable:** Better release communication. Reduces manual release notes work.

| Aspect | Expected Behavior | Complexity |
|--------|-------------------|------------|
| Categorized changes | Group by type (feat, fix, etc.) | Low |
| Breaking change highlights | Clear breaking change section | Low |
| Contributor attribution | Credit contributors automatically | Low |
| Release PR automation | Auto-create release PRs | Medium |

**Current State:** standard-version generates CHANGELOG.md. Release workflow generates notes from commits.

**Implementation Notes:**
- Current setup is functional
- Consider [release-please](https://github.com/googleapis/release-please) for release PR workflow
- release-please maintains "Release PRs" updated with each merge
- Better for teams wanting release review before publish

**Complexity:** Low-Medium
**Dependencies:** Existing conventional commits setup

---

## Anti-Features

Things to deliberately NOT build. Common mistakes in this domain.

### 1. 100% Test Coverage Requirement

**Why Avoid:** Leads to meaningless tests written for coverage, not quality. Diminishing returns past 80%.

**What to Do Instead:**
- Start with 70% threshold, ratchet to 80% max
- Focus on critical path coverage
- Use coverage as indicator, not absolute goal
- Require coverage for new code, not legacy

---

### 2. Blocking CI on Every Security Finding

**Why Avoid:** Security tools generate false positives. Blocking on all findings creates alert fatigue and slows development.

**What to Do Instead:**
- Block on CRITICAL/HIGH severity only
- Use `continue-on-error: true` for audits (already done)
- Triage findings weekly, not per-PR
- Establish security severity thresholds per tool

---

### 3. Pre-commit Hooks for Everything

**Why Avoid:** Slow commits frustrate developers. Heavy pre-commit = developers avoid committing frequently.

**What to Do Instead:**
- Pre-commit: lint-staged (only changed files), commitlint
- CI: Full test suite, type checking, security scans
- Keep pre-commit under 10 seconds

---

### 4. Manual Migration Approvals for Every Change

**Why Avoid:** Slows development velocity. Most migrations are safe.

**What to Do Instead:**
- Auto-apply migrations to dev/staging
- Require approval only for production
- Flag "dangerous" migrations (data loss, long locks) for review
- Use shadow databases to test migrations

---

### 5. Visual Regression on Every Component

**Why Avoid:** Baseline churn, false positives, slow CI. 3D/animated content especially prone to flakiness.

**What to Do Instead:**
- Test critical user journeys, not every component
- Skip WebGL/canvas content initially
- Use appropriate thresholds (not pixel-perfect)
- Review failures manually, don't auto-fail

---

### 6. Contract Testing Between Internal Services

**Why Avoid:** Overkill for monolithic or single-repo apps. ScrumQuest is full-stack in one repo.

**What to Do Instead:**
- Use TypeScript's type system for internal contracts
- Add Zod runtime validation at boundaries
- Reserve Pact for microservices with separate teams

---

### 7. Over-engineered Rollback Automation

**Why Avoid:** Complex auto-rollback can cause rollback storms. Simple rollback is usually sufficient.

**What to Do Instead:**
- Manual rollback with good tooling (ArgoCD provides this)
- Alert on deployment failures for human decision
- Add canary/progressive delivery only when needed
- Start simple, add automation when pain is proven

---

## Feature Dependencies

```
Branch Protection Rules
         |
         v
Required Status Checks <-- Test Coverage Enforcement
         |                          |
         v                          v
  PR Review Workflow         Coverage Threshold Config
         |
         v
All CI Features (lint, test, build, security)

Database Migrations
         |
         +--> Migration File Generation (drizzle-kit generate)
         |
         +--> Migration Tracking (__drizzle_migrations)
         |
         +--> CI Validation (test against clean DB)

Visual Regression Testing
         |
         +--> Playwright (exists)
         |
         +--> Baseline Management
         |
         +--> Percy/Chromatic (optional cloud service)

Load Testing
         |
         +--> k6 Scripts
         |
         +--> Grafana Integration (exists)
         |
         +--> CI Pipeline Integration
```

---

## MVP Recommendation

For v1.2 MVP, prioritize in this order:

### Phase 1: Foundations (Low effort, high impact)

1. **Branch Protection Rules** - Configure in GitHub settings
2. **Test Coverage Enforcement** - Enable thresholds in Vitest config
3. **Basic A11y Testing** - Add @axe-core/playwright to E2E

### Phase 2: Safety (Medium effort, prevents problems)

4. **Database Migration Workflow** - Switch to generate/migrate pattern
5. **Secret Scanning** - Add gitleaks pre-commit

### Phase 3: Quality (Medium effort, quality improvements)

6. **Visual Regression (basic)** - Playwright screenshots for critical flows
7. **API Contract Validation** - Zod runtime validation at boundaries

### Defer to Post-MVP

- **Load Testing** - Valuable but time-intensive to set up properly
- **Argo Rollouts** - Current ArgoCD rollback is sufficient
- **Percy/Chromatic** - Start with free Playwright screenshots
- **release-please** - Current standard-version works fine

---

## Sources

### PR Workflow & Branch Protection
- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [Understanding GitHub Branch Protection Rules](https://graphite.com/guides/github-branch-protection-rules)
- [Required Review Action](https://github.com/marketplace/actions/required-review)

### Test Coverage
- [Vitest Coverage Report Action](https://github.com/marketplace/actions/vitest-coverage-report)
- [Code Coverage Summary Action](https://github.com/marketplace/actions/code-coverage-summary)
- [Enforce JavaScript Code Coverage](https://dev.to/bcoe/enforce-javascript-code-coverage-with-github-actions-36lg)

### Security Scanning
- [Best JavaScript Security Tools](https://www.aikido.dev/blog/top-javascript-security-tools)
- [OWASP Source Code Analysis Tools](https://owasp.org/www-community/Source_Code_Analysis_Tools)
- [Semgrep GitHub Action](https://github.com/returntocorp/semgrep-action)

### Visual Regression
- [Playwright Visual Testing](https://playwright.dev/docs/test-snapshots)
- [Visual Testing with Playwright - Chromatic](https://www.chromatic.com/blog/how-to-visual-test-ui-using-playwright/)
- [Percy vs Chromatic Comparison](https://medium.com/@crissyjoshua/percy-vs-chromatic-which-visual-regression-testing-tool-to-use-6cdce77238dc)

### Database Migrations
- [Drizzle Migrations Docs](https://orm.drizzle.team/docs/migrations)
- [Drizzle Kit Migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- [CI/CD Basics for PostgreSQL](https://circleci.com/blog/ci-cd-basics-for-postgresql/)

### Accessibility Testing
- [axe-core vs PA11Y Comparison](https://www.craigabbott.co.uk/blog/axe-core-vs-pa11y/)
- [Combining axe-core and PA11Y](https://www.craigabbott.co.uk/blog/combining-axe-core-and-pa11y/)
- [Automated Accessibility Testing with GitHub Actions](https://accessibility.civicactions.com/posts/automated-accessibility-testing-leveraging-github-actions-and-pa11y-ci-with-axe)

### Load Testing
- [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/)
- [k6 Testing Guides](https://grafana.com/docs/k6/latest/testing-guides/)
- [Organizing k6 Test Suites](https://grafana.com/blog/organizing-your-grafana-k6-performance-testing-suite-best-practices-to-get-started/)

### Contract Testing
- [Pact Documentation](https://docs.pact.io/)
- [Pact vs OpenAPI](https://www.speakeasy.com/blog/pact-vs-openapi)
- [Top API Contract Testing Tools 2026](https://www.testsprite.com/use-cases/en/the-top-api-contract-testing-tools)

### Deployment & Rollback
- [ArgoCD Rollback Documentation](https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_rollback/)
- [Automated Deployment Rollbacks with GitOps](https://medium.com/@bavicnative/automating-deployment-rollbacks-with-gitops-3887a81e1b2a)
- [Argo Rollouts](https://argoproj.github.io/rollouts/)

### Changelog Automation
- [standard-version](https://github.com/conventional-changelog/standard-version)
- [release-please](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/en/about/)
