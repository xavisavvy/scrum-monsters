# Pitfalls Research: Adding SDLC Best Practices to Existing TypeScript Project

**Domain:** SDLC tooling integration for existing real-time multiplayer app (ScrumQuest)
**Researched:** 2026-02-02
**Confidence:** HIGH (verified with multiple authoritative sources)

---

## Critical Pitfalls

Mistakes that cause significant rework, failed deployments, or broken CI/CD pipelines.

---

### Pitfall 1: Drizzle Migration History Mismatch After db:push

**What goes wrong:**
Team has been using `drizzle-kit push` for local development and production schema updates. When switching to `drizzle-kit generate` + `drizzle-kit migrate`, the migration system doesn't know about the existing schema. Running `migrate` creates SQL to build tables that already exist, failing with "table already exists" errors. Worse: if you delete migration history to "start fresh," Drizzle loses ability to track schema versions, causing production data loss on future migrations.

**Why it happens:**
`db:push` directly applies schema changes without creating migration files or tracking history. The current ScrumQuest codebase uses `npm run db:push` (line 18 in package.json) with 6 tables (users, oauth_accounts, user_profiles, user_stats, estimation_history, sessions). When transitioning to migrations, there's no `drizzle` folder with journal/snapshot files tracking what has been applied.

**Warning signs:**
- "relation already exists" errors when running first migration
- Missing `drizzle/` folder with journal.json and snapshots
- Different schema state between environments (dev has column X, prod doesn't)
- Manual SQL fixes applied to production that aren't reflected in schema.ts

**Prevention strategy:**
1. **Introspect first:** Run `drizzle-kit introspect` on production database to generate initial schema.ts and migrations folder with "init" migration
2. **Use --no-init flag:** When running `drizzle-kit migrate` on database with existing tables, use `--no-init` to skip initial table creation
3. **Verify environments match:** Before switching, ensure dev/staging/prod schemas are identical (diff the introspected schemas)
4. **Never delete migration history in production:** Only safe to delete when DB hasn't been deployed to production yet

**Phase to address:** Early (before any schema changes) - Database migration infrastructure

**Recovery cost:** HIGH - May require manual SQL scripts to reconcile schema drift, potential data loss if migrations applied incorrectly

**Sources:**
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle ORM - push vs migrate](https://orm.drizzle.team/docs/drizzle-kit-push)
- [Discussion: Migrate after push in local dev database](https://github.com/drizzle-team/drizzle-orm/discussions/1604)

---

### Pitfall 2: Branch Protection Bypass Creates False Security

**What goes wrong:**
Team enables branch protection on main branch, but admins/maintainers can still push directly (default behavior). The git status shows "branch protection bypassed" because the committer has admin privileges. Team believes they have PR workflow protection, but critical changes go directly to main without review. Worse: GitHub Actions bots or release automation can bypass protections unexpectedly.

**Why it happens:**
The current ScrumQuest repo shows "branch protection bypassed" in git push output, indicating admins can still direct push. GitHub's default is to NOT apply restrictions to repository admins. Additionally, custom roles with "bypass branch protections" permission exist, and GitHub Apps with proper permissions can bypass rules.

**Warning signs:**
- Git output shows "branch protection bypassed" on push
- Main branch has commits without associated PRs
- Release bot pushes directly to main during `npm run release`
- CI checks pass but weren't actually required (soft enforcement)

**Prevention strategy:**
1. **Enable "Do not allow bypassing":** In branch protection rules, check "Do not allow bypassing the above settings" to include admins
2. **Use Rulesets instead:** GitHub Rulesets (newer feature) provide more granular control with explicit bypass actors list
3. **Audit bypass permissions:** Check Settings > Collaborators > Custom roles for "bypass branch protections"
4. **Configure release automation:** Use GitHub Apps with scoped tokens that can bypass only specific rules, not all protections

**Phase to address:** Early - PR workflow and branch protection setup

**Recovery cost:** LOW - Configuration change, no code changes needed

**Sources:**
- [GitHub Docs - About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Managing GitHub Branch Protections](https://medium.com/@lauravuo/managing-github-branch-protections-4fa37f36ee4f)
- [Bypass branch protections with a new permission](https://github.blog/changelog/2022-08-18-bypass-branch-protections-with-a-new-permission/)

---

### Pitfall 3: Security Scanning Noise Overwhelms Real Issues

**What goes wrong:**
Team adds CodeQL and Snyk to CI, immediately gets 50+ findings. Most are false positives, low-severity issues, or findings in test code. Developers start ignoring security alerts ("they're always wrong"). A real vulnerability gets buried in noise and reaches production.

**Why it happens:**
Security scanners default to maximum sensitivity. CodeQL scans entire repository including test fixtures with intentional vulnerabilities. Snyk reports every CVE in dependencies even if not exploitable. The current ScrumQuest CI has `npm audit --audit-level=high` (line 140 in ci.yml) with `continue-on-error: true` - security issues are already being ignored.

**Warning signs:**
- `continue-on-error: true` on security jobs (current state)
- Security alerts consistently dismissed without review
- Developers complaining about "noisy" security tools
- Same false positives reappearing after being dismissed

**Prevention strategy:**
1. **Scope scanning:** Configure CodeQL to only scan `src/` and `server/` folders, exclude `test/` and `*.test.ts`
2. **Tune severity thresholds:** Start with critical/high only, add medium after baseline is clean
3. **Use Snyk's "Consistent Ignores":** When dismissing false positives, use Snyk's feature to suppress consistently (released June 2025)
4. **Separate security-audit from blocking CI:** Run security scans but don't block PRs initially; create issues for triage
5. **Establish triage process:** Weekly security review of new findings, documented ignore reasons

**Phase to address:** Mid-phase - Security scanning implementation

**Recovery cost:** MEDIUM - Requires tuning configuration, establishing triage process, and clearing backlog

**Sources:**
- [2025 AI Code Security Benchmark: Snyk vs Semgrep vs CodeQL](https://sanj.dev/post/ai-code-security-tools-comparison)
- [Snyk Code: Issue management with Consistent Ignores](https://learn.snyk.io/lesson/snyk-consistent-ignores/)
- [JavaScript and TypeScript queries for CodeQL analysis](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/javascript-typescript-built-in-queries)

---

### Pitfall 4: Coverage Thresholds Create False Confidence

**What goes wrong:**
Team sets 80% line coverage threshold. Developers write tests that hit lines but don't assert correctness. Tests pass, coverage is green, but bugs ship to production. Worse: developers game the metric by writing easy tests on simple code while complex logic remains untested.

**Why it happens:**
Coverage measures execution, not verification. The current ScrumQuest CI runs `npm run test:coverage` (line 79 in ci.yml) but doesn't enforce thresholds - `continue-on-error: true` means low coverage doesn't fail builds. When thresholds are added, the incentive becomes "hit the number" not "catch bugs."

**Warning signs:**
- High coverage but bugs in production
- Tests with no assertions or only snapshot assertions
- Coverage concentrated in simple utility functions
- Complex business logic (like `gameState.ts` with 2000+ lines) excluded from coverage

**Prevention strategy:**
1. **Start without thresholds:** Use coverage as information, not enforcement, initially
2. **Measure test effectiveness, not coverage:** Use mutation testing (Stryker) to verify tests actually catch bugs
3. **Focus on critical paths:** Require coverage for server/gameState.ts, server/socketHandlers.ts - not UI components
4. **Gradual thresholds:** Start at 50%, increase 5% per quarter as tests improve
5. **Code review for test quality:** Review tests for meaningful assertions, not just existence

**Phase to address:** Mid-phase - Coverage threshold implementation

**Recovery cost:** LOW - Configuration change, but fixing test quality takes time

**Sources:**
- [Code Coverage Complications](https://anthonysciamanna.com/2020/01/26/code-coverage-complications.html)
- [Making your code base better will make your code coverage worse](https://stackoverflow.blog/2025/12/22/making-your-code-base-better-will-make-your-code-coverage-worse)
- [Code Quality in 2026: Best Practice, Metrics and Techniques](https://www.getpanto.ai/blog/code-quality)

---

### Pitfall 5: Visual Regression Tests Flaky from Environment Differences

**What goes wrong:**
Visual regression tests pass locally but fail in CI. Screenshots differ by a few pixels due to font rendering, anti-aliasing, or animation timing. Tests become so flaky they're disabled or ignored. Real visual bugs ship because "visual tests are always broken anyway."

**Why it happens:**
ScrumQuest uses React Three Fiber for 3D graphics and Framer Motion for animations (lines 58-74 in package.json). 3D rendering varies by GPU/driver. Animations captured mid-transition produce different snapshots. CSS transitions complete at different times on different machines.

**Warning signs:**
- Visual tests passing locally, failing in CI
- Screenshots differing by 1-3 pixels
- Flaky tests that pass on retry
- Baseline screenshots captured during active development
- Tests disabled with comments like "// TODO: fix flaky test"

**Prevention strategy:**
1. **Consistent environment:** Run visual tests in Docker with fixed fonts, resolution, and GPU emulation
2. **Disable animations for tests:** Add CSS `* { transition: none !important; animation: none !important; }` in test mode
3. **Wait for stability:** Add explicit waits for animations to complete before capturing screenshots
4. **Tolerance thresholds:** Allow small pixel differences (0.1-0.5%) to account for anti-aliasing
5. **Skip 3D content initially:** Focus visual regression on 2D UI components; test 3D separately with snapshot testing

**Phase to address:** Late phase - Visual regression testing

**Recovery cost:** MEDIUM - Requires CI environment changes and test refactoring

**Sources:**
- [The UI Visual Regression Testing Best Practices Playbook](https://medium.com/@ss-tech/the-ui-visual-regression-testing-best-practices-playbook-dc27db61ebe0)
- [Best Regression Testing Tools in 2026](https://bugbug.io/blog/software-testing/best-regression-testing-tools/)
- [Visual Regression Testing - All You Need to Know](https://www.virtuosoqa.com/post/visual-regression-testing-101)

---

### Pitfall 6: ArgoCD Rollback Breaks GitOps State

**What goes wrong:**
Production deployment fails, operator uses `argocd app rollback` to revert. Application recovers, but cluster state now differs from Git. Next sync from Git redeploys the broken version. Team disables auto-sync to prevent this, breaking GitOps model. Rollbacks become manual kubectl operations.

**Why it happens:**
ScrumQuest uses ArgoCD (k8s/argocd-apps/ directory) with auto-sync likely enabled. The `argocd app rollback` command points the application to a previous Git commit hash, but only works if auto-sync is disabled. With auto-sync enabled, the rollback is immediately overwritten.

**Warning signs:**
- Rollback appears successful but application redeploys broken version
- Auto-sync disabled "temporarily" for months
- Manual `kubectl apply` commands in production
- Git history doesn't match cluster state

**Prevention strategy:**
1. **Roll forward, not back:** Fix the issue in Git and let ArgoCD deploy the fix naturally
2. **If must rollback:** Disable auto-sync first, perform rollback, then revert commits in Git, re-enable sync
3. **Use Argo Rollouts for progressive delivery:** Canary/blue-green deployments catch failures before full rollout
4. **Tag stable releases:** Use Git tags for releases, revert by promoting previous tag to main
5. **Document rollback procedure:** Standard runbook that maintains GitOps state

**Phase to address:** Late phase - ArgoCD rollback procedures

**Recovery cost:** LOW - Process/documentation change, but can cause production incidents if mishandled

**Sources:**
- [Top 30 Argo CD Anti-Patterns to Avoid When Adopting Gitops](https://codefresh.io/blog/argo-cd-anti-patterns-for-gitops/)
- [Automated Deployment Rollbacks with GitOps](https://medium.com/@bavicnative/automating-deployment-rollbacks-with-gitops-3887a81e1b2a)
- [Zero-Downtime Rollbacks in Kubernetes with ArgoCD](https://dev.to/srinivasamcjf/zero-downtime-rollbacks-in-kubernetes-with-argocd-a-practical-gitops-lifesaver-1hbi)

---

## Moderate Pitfalls

Mistakes that cause delays, tech debt, or degraded developer experience.

---

### Pitfall 7: API Contract Testing Over-Promises

**What goes wrong:**
Team implements Pact for contract testing, celebrates green contracts, then production breaks on Black Friday. The contracts tested happy paths with clean data. Production failed on edge cases, timeout handling, and deployment order issues that contract tests don't cover.

**Why it happens:**
Contract testing verifies the contract, not the actual API call in production. If production config points to v2 endpoint but contracts test v1, you're testing the wrong thing. Contracts don't test resilience, error handling, or network issues.

**Warning signs:**
- All contracts green but production API failures
- Contracts only test successful responses
- No edge case contracts (empty arrays, null fields, malformed data)
- Deployment order dependencies despite "decoupled" services

**Prevention strategy:**
1. **Contract tests complement, not replace E2E:** Run E2E tests with real services before production
2. **Test failure scenarios:** Include contracts for 400, 500 responses, timeouts
3. **Test with realistic data:** Use production-like data samples, not just `{ "id": 1, "name": "test" }`
4. **Version contracts explicitly:** Include API version in contract, fail if endpoint version changes
5. **Consider OpenAPI-based contracts:** Use PactFlow's bi-directional testing with OpenAPI spec if you have one

**Phase to address:** Mid-phase - API contract testing

**Recovery cost:** MEDIUM - Requires expanding contract coverage and adding E2E tests

**Sources:**
- [Contract Testing With Pact: Looked Good, Broke Anyway](https://medium.com/@codexlab/contract-testing-with-pact-looked-good-broke-anyway-3774270bdd15)
- [Stop Breaking My API: A Practical Guide to Contract Testing with Pact](https://medium.com/@mohsenny/stop-breaking-my-api-a-practical-guide-to-contract-testing-with-pact-33858d113386)
- [Pact vs OpenAPI: Choosing the right foundation](https://www.speakeasy.com/blog/pact-vs-openapi)

---

### Pitfall 8: Accessibility Debt Ignored Until Blocking

**What goes wrong:**
Team adds axe-playwright accessibility testing, finds 50+ violations. Rather than fixing, they set `skipFailures: true` so tests don't block CI. Accessibility debt grows. When client requires WCAG compliance, team faces weeks of remediation.

**Why it happens:**
ScrumQuest E2E tests exist (line 133 in package.json: `@playwright/test`) but don't include accessibility checks. Adding axe-core to existing tests reveals years of inaccessible code. The UI uses custom components (React Three Fiber 3D, Framer Motion animations) that aren't inherently accessible.

**Warning signs:**
- A11y tests pass with `skipFailures: true`
- Violations printed to console but not tracked
- No WCAG compliance level specified
- 3D game elements have no keyboard navigation

**Prevention strategy:**
1. **Create accessibility debt tracker:** GitHub Issues for each violation, prioritized by severity
2. **Fix incrementally:** Target WCAG 2.1 AA for critical paths first (login, lobby join, voting)
3. **Exclude 3D game view initially:** Focus a11y on forms, dialogs, navigation - not 3D canvas
4. **Test in multiple browsers:** axe-core supports all major browsers; test in at least Chrome + Firefox
5. **Gradual enforcement:** Start with 0 critical violations, add serious/moderate over time

**Phase to address:** Mid-to-late phase - Accessibility testing

**Recovery cost:** HIGH - Accessibility fixes often require component rewrites

**Sources:**
- [Accessibility testing | Playwright](https://playwright.dev/docs/accessibility-testing)
- [How We Automate Accessibility Testing with Playwright and Axe](https://dev.to/subito/how-we-automate-accessibility-testing-with-playwright-and-axe-3ok5)
- [Add Accessibility Checks to Playwright Tests with Axe](https://www.checklyhq.com/blog/integrating-accessibility-checks-in-playwright-tes/)

---

### Pitfall 9: Load Testing Discovers Issues Too Late

**What goes wrong:**
Team implements k6 load tests, runs them before major release, discovers server can only handle 50 concurrent WebSocket connections (not the expected 200). No time to fix. Release goes ahead with known scaling issues.

**Why it happens:**
ScrumQuest uses Socket.IO for real-time game state (114 dependencies including socket.io). WebSocket connections are expensive. The current in-memory fallback storage means all game state lives in Node.js heap. Load testing late in development means architectural changes are too costly to make.

**Warning signs:**
- Load tests only run before releases, not continuously
- No baseline performance metrics to compare against
- Load test environment differs from production (no Redis, different node count)
- Server crashes or becomes unresponsive under moderate load

**Prevention strategy:**
1. **Baseline early:** Run load tests now to establish current capacity
2. **Continuous load testing:** Run scaled-down load tests in CI (10 concurrent users) to catch regressions
3. **Match production environment:** Load test against staging with production-like infra
4. **Set SLOs:** Define acceptable latency (p99 < 200ms) and error rate (< 0.1%) before testing
5. **Test WebSocket specifically:** k6 supports WebSocket; test Socket.IO event handling, not just HTTP

**Phase to address:** Early-to-mid phase - Load testing infrastructure

**Recovery cost:** HIGH if architectural changes needed; LOW if just tuning

**Sources:**
- [Load Testing Your API: k6 vs Artillery vs Locust](https://medium.com/@sohail_saifi/load-testing-your-api-k6-vs-artillery-vs-locust-66a8d7f575bd)
- [Grafana k6 documentation](https://k6.io/)
- [Top 10 Load Testing Tools for 2026](https://pflb.us/blog/best-load-testing-tools/)

---

### Pitfall 10: Changelog Automation Requires Commit Discipline

**What goes wrong:**
Team enables standard-version (already in package.json line 164), but changelog is useless: "fix: stuff", "feat: update", "chore: changes". Semantic versioning breaks because developers don't understand conventional commits. Patch release contains breaking change.

**Why it happens:**
ScrumQuest has commitlint configured (lines 130-131 in package.json) but conventional commit adoption requires team discipline. Without clear examples and PR enforcement, commits vary wildly. The `npm run release` script assumes commits follow convention.

**Warning signs:**
- CHANGELOG.md has entries like "fix: fix", "feat: feature"
- Version bumps don't match actual changes (patch with breaking changes)
- Developers using `git commit --no-verify` to skip commitlint
- No breaking change prefixes (BREAKING CHANGE:) despite API changes

**Prevention strategy:**
1. **Enforce in CI, not just locally:** Add commitlint check to PR workflow, not just husky pre-commit
2. **Document commit conventions:** Add CONTRIBUTING.md with examples for fix, feat, BREAKING CHANGE
3. **Use commit templates:** Configure git commit template with conventional commit format
4. **Review commit messages in PRs:** Make commit quality part of code review
5. **Consider release-please:** Google's tool creates Release PRs, giving review opportunity before version bump

**Phase to address:** Early - PR workflow setup

**Recovery cost:** LOW - Process/documentation change, but historical commits can't be retroactively fixed

**Sources:**
- [Conventional Commits](https://www.conventionalcommits.org/en/about/)
- [standard-version on GitHub](https://github.com/conventional-changelog/standard-version)
- [Embracing Automation in Versioning: Release-Please](https://medium.com/@koladilip/embracing-automation-in-versioning-the-power-of-release-please-github-action-4241bd8f3b54)

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily recoverable.

---

### Pitfall 11: CI Pipeline Becomes Slow After Adding All Tests

**What goes wrong:**
CI time grows from 5 minutes to 25 minutes as security scanning, coverage, visual tests, a11y tests, and load tests are added. Developers wait too long for feedback. They batch PRs instead of iterating, reducing code quality.

**Why it happens:**
The current ScrumQuest CI (ci.yml) already has 5 jobs running sequentially for some. Adding more tests without parallelization compounds the problem. Each test type has setup overhead (npm ci runs multiple times).

**Warning signs:**
- CI time > 15 minutes for typical PRs
- Developers complaining about "waiting for CI"
- Jobs running sequentially that could parallelize
- npm ci running in every job instead of caching

**Prevention strategy:**
1. **Parallelize jobs:** Security scan, tests, and lint can all run in parallel (current ci.yml already does this partially)
2. **Fail fast:** Put fastest checks first; lint/typecheck before tests
3. **Cache dependencies:** Use actions/cache for node_modules
4. **Tiered testing:** Run unit tests on every PR, visual/load tests only on main or nightly
5. **Path-based triggers:** Only run E2E tests if client code changed

**Phase to address:** Throughout - CI optimization

**Recovery cost:** LOW - Workflow configuration changes

**Sources:**
- [Five tips for faster GitHub Actions](https://namespace.so/blog/5-tips-for-faster-github-actions)
- [A Developer's Guide to Speeding Up GitHub Actions](https://www.warpbuild.com/blog/github-actions-speeding-up)
- [The 45-Minute GitHub Actions Build That Nearly Broke My Team](https://markaicode.com/github-actions-cicd-optimization-slow-to-fast/)

---

### Pitfall 12: Tool Versions Drift Between Local and CI

**What goes wrong:**
Developer's local Node.js is 22, CI uses 20, production uses 18. Tests pass locally, fail in CI due to API differences. Security scanner reports vulnerabilities for different dependency versions.

**Why it happens:**
ScrumQuest specifies Node 20 in CI (line 29 in ci.yml) but no .nvmrc or engines field in package.json. Developers install whatever version they have.

**Warning signs:**
- "Works on my machine" followed by CI failure
- Different npm versions producing different lockfiles
- Type errors appearing only in CI

**Prevention strategy:**
1. **Add .nvmrc:** Specify exact Node version, use `nvm use` in development
2. **Add engines field:** In package.json, specify `"engines": { "node": ">=20", "npm": ">=10" }`
3. **Pin tool versions in CI:** Use exact versions, not `latest`
4. **Use Corepack for npm/yarn:** Ensures consistent package manager version

**Phase to address:** Early - Development environment setup

**Recovery cost:** LOW - Configuration files only

---

## Integration-Specific Pitfalls

Mistakes specific to integrating tools with the existing ScrumQuest stack.

---

### Pitfall 13: CodeQL Fails on React Three Fiber Code

**What goes wrong:**
CodeQL JavaScript/TypeScript analysis fails or times out when analyzing React Three Fiber components with heavy WebGL code. The 3D shaders and canvas manipulation trigger false positives or cause the analysis to hang.

**Why it happens:**
ScrumQuest uses react-three/fiber, drei, and postprocessing (lines 58-60, 96 in package.json) which include complex WebGL bindings. CodeQL's JavaScript analysis isn't optimized for WebGL context.

**Prevention strategy:**
1. **Exclude 3D component directories:** Configure CodeQL to skip `client/src/components/game/3d/` or similar
2. **Set analysis timeouts:** Configure CodeQL timeout to prevent hanging
3. **Separate analysis jobs:** Run CodeQL on server code only; use different tools for client if needed

**Phase to address:** Mid-phase - Security scanning setup

---

### Pitfall 14: Drizzle Migrations Don't Handle In-Memory Fallback

**What goes wrong:**
ScrumQuest supports both PostgreSQL and in-memory storage (storage.ts fallback). Migrations assume PostgreSQL. Running `drizzle-kit migrate` without DATABASE_URL fails or does nothing. Tests with in-memory storage don't reflect migration changes.

**Why it happens:**
The storage.ts has in-memory fallback for development. Drizzle migrations only target the SQL database. Schema changes applied via migration aren't reflected in in-memory store structure.

**Prevention strategy:**
1. **Sync in-memory types with schema.ts:** In-memory store should use types derived from Drizzle schema
2. **Skip migrations in memory mode:** Guard migration code with DATABASE_URL check
3. **Test migrations separately:** Integration tests against PostgreSQL, unit tests against in-memory

**Phase to address:** Early - Database migration setup

---

### Pitfall 15: Visual Tests Capture Lobby State Incorrectly

**What goes wrong:**
Visual regression tests capture game UI, but game state is dynamic (player positions, animations, randomized boss sprites). Every test run produces different screenshots. Tests either fail constantly or have such high tolerance they catch nothing.

**Warning signs:**
- Player positions differ in every screenshot
- Boss health bars at different values
- Particle effects causing pixel differences
- Consensus countdown captured mid-animation

**Prevention strategy:**
1. **Seed random state:** Use fixed RNG seed for test runs
2. **Mock time-based elements:** Freeze timers, disable animations
3. **Capture specific states:** Wait for "lobby_updated" event indicating stable state
4. **Test static UI separately:** Visual test dialogs, buttons, forms - not game canvas

**Phase to address:** Late phase - Visual regression testing

---

## Phase-Specific Warning Matrix

| Phase/Topic | Likely Pitfall | Detection | Mitigation |
|-------------|----------------|-----------|------------|
| DB Migrations | History mismatch with db:push | "table already exists" errors | Introspect first, use --no-init |
| Branch Protection | Bypass by admins | "branch protection bypassed" in git | Enable "Do not allow bypassing" |
| Security Scanning | Alert fatigue | `continue-on-error: true`, ignored alerts | Scope scanning, tune thresholds |
| Coverage Thresholds | Gaming metrics | High coverage, production bugs | Focus on critical paths, use mutation testing |
| Visual Regression | Environment flakiness | Tests fail only in CI | Docker environment, disable animations |
| ArgoCD Rollback | GitOps state drift | Auto-sync overwrites rollback | Roll forward, tag stable releases |
| API Contracts | False confidence | Contracts pass, production fails | Include failure scenarios, complement with E2E |
| Accessibility | Ignored debt | `skipFailures: true` | Track violations as issues |
| Load Testing | Late discovery | Pre-release only | Continuous baseline testing |
| Changelog | Poor commit messages | CHANGELOG has "fix: stuff" | CI enforcement, documentation |
| CI Speed | Pipeline bloat | CI > 15 minutes | Parallelize, tier tests |

---

## Recovery Strategies

When pitfalls occur despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Migration history mismatch | HIGH | 1. Backup production DB 2. Introspect current state 3. Manually reconcile migration journal 4. Test on staging first |
| Branch protection bypass | LOW | 1. Enable rule in GitHub settings 2. Audit recent direct pushes 3. Revert if needed via PR |
| Security alert fatigue | MEDIUM | 1. Triage all existing alerts 2. Configure ignore rules 3. Establish weekly review process |
| Coverage gaming | MEDIUM | 1. Add mutation testing 2. Review test quality in PRs 3. Focus on critical paths |
| Flaky visual tests | MEDIUM | 1. Standardize CI environment 2. Add animation disabling 3. Increase tolerance slightly |
| ArgoCD rollback failure | LOW | 1. Revert commits in Git 2. Re-enable auto-sync 3. Document correct procedure |
| Contract test gaps | MEDIUM | 1. Audit production failures 2. Add edge case contracts 3. Supplement with E2E |
| Accessibility debt | HIGH | 1. Triage by severity 2. Create sprint backlog 3. Fix incrementally |
| Performance issues | HIGH | 1. Profile bottlenecks 2. Architectural review 3. Incremental improvements |
| CI slowness | LOW | 1. Profile job times 2. Parallelize 3. Add caching |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Branch Protection:** Verify admins CANNOT bypass (test with admin account)
- [ ] **Security Scanning:** Verify findings are reviewed, not just generated
- [ ] **Coverage Thresholds:** Verify tests have meaningful assertions (spot check 10 tests)
- [ ] **Migrations:** Verify migration works on fresh DB AND existing DB with data
- [ ] **Visual Tests:** Verify tests fail when UI actually breaks (break something on purpose)
- [ ] **A11y Tests:** Verify violations are tracked, not just logged
- [ ] **Load Tests:** Verify test environment matches production capacity
- [ ] **Contract Tests:** Verify contracts match production API calls
- [ ] **Changelog:** Verify CHANGELOG entries are human-readable and accurate
- [ ] **Rollback:** Verify rollback procedure maintains GitOps state (test in staging)

---

## Sources

### Database Migrations
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle ORM - push vs migrate](https://orm.drizzle.team/docs/drizzle-kit-push)
- [3 Biggest Mistakes with Drizzle ORM](https://medium.com/@lior_amsalem/3-biggest-mistakes-with-drizzle-orm-1327e2531aff)

### Branch Protection
- [GitHub Docs - About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [10 Rules of GitHub Branch Protection](https://www.hadosec.com/blog/github-branch-protection/)

### Security Scanning
- [2025 AI Code Security Benchmark](https://sanj.dev/post/ai-code-security-tools-comparison)
- [Snyk Code: Consistent Ignores](https://learn.snyk.io/lesson/snyk-consistent-ignores/)
- [CodeQL JavaScript/TypeScript queries](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/javascript-typescript-built-in-queries)

### Test Coverage
- [Making your code base better will make your code coverage worse](https://stackoverflow.blog/2025/12/22/making-your-code-base-better-will-make-your-code-coverage-worse)
- [Code Quality in 2026](https://www.getpanto.ai/blog/code-quality)

### Visual Regression
- [Visual Regression Testing Best Practices](https://medium.com/@ss-tech/the-ui-visual-regression-testing-best-practices-playbook-dc27db61ebe0)
- [Best Regression Testing Tools 2026](https://bugbug.io/blog/software-testing/best-regression-testing-tools/)

### ArgoCD
- [Top 30 Argo CD Anti-Patterns](https://codefresh.io/blog/argo-cd-anti-patterns-for-gitops/)
- [Troubleshooting Argo CD Sync Failures](https://www.mindfulchase.com/explore/troubleshooting-tips/troubleshooting-argo-cd-sync-failures-optimizing-deployments-and-resolving-resource-conflicts.html)

### API Contract Testing
- [Contract Testing With Pact: Looked Good, Broke Anyway](https://medium.com/@codexlab/contract-testing-with-pact-looked-good-broke-anyway-3774270bdd15)
- [Pact vs OpenAPI](https://www.speakeasy.com/blog/pact-vs-openapi)

### Accessibility
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [Accessibility audits with Playwright, Axe, and GitHub Actions](https://dev.to/jacobandrewsky/accessibility-audits-with-playwright-axe-and-github-actions-2504)

### Load Testing
- [Load Testing Your API: k6 vs Artillery vs Locust](https://medium.com/@sohail_saifi/load-testing-your-api-k6-vs-artillery-vs-locust-66a8d7f575bd)
- [Grafana k6](https://k6.io/)

### Changelog Automation
- [Conventional Commits](https://www.conventionalcommits.org/en/about/)
- [standard-version](https://github.com/conventional-changelog/standard-version)

### CI Performance
- [Five tips for faster GitHub Actions](https://namespace.so/blog/5-tips-for-faster-github-actions)
- [GitHub Actions CI optimization](https://markaicode.com/github-actions-cicd-optimization-slow-to-fast/)

---

*Pitfalls research for: Adding SDLC best practices to existing TypeScript project*
*Researched: 2026-02-02*
*Based on ScrumQuest codebase analysis (existing CI/CD, Drizzle ORM, ArgoCD deployment)*
