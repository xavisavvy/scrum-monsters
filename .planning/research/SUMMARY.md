# Project Research Summary

**Project:** ScrumQuest v1.2 SDLC Best Practices
**Domain:** Software Development Lifecycle tooling for existing TypeScript full-stack application
**Researched:** 2026-02-02
**Confidence:** HIGH

## Executive Summary

ScrumQuest v1.2 focuses on maturing the existing CI/CD infrastructure with SDLC best practices. The codebase already has substantial tooling (11 GitHub Actions workflows, Kustomize-based Kubernetes, ArgoCD GitOps, Vitest, Playwright, CodeQL), so this milestone is primarily about **extending and hardening** rather than building from scratch. The recommended approach is incremental enhancement: start with low-risk CI improvements (coverage thresholds, branch protection), progress to security hardening, then tackle infrastructure-heavy features (visual regression, database migrations, rollback automation).

The most critical risks are: (1) Drizzle migration history mismatch when transitioning from `db:push` to versioned migrations on existing production data, (2) security scanning noise overwhelming real findings (current CI has `continue-on-error: true` on all security jobs), and (3) visual regression flakiness due to React Three Fiber 3D content and Framer Motion animations. All three are well-documented pitfalls with clear prevention strategies.

The stack additions are minimal: only 3 new npm packages required (axe-core/playwright, openapi-typescript, openapi-fetch). Most features leverage existing tools (Playwright for visual testing, drizzle-kit for migrations, standard-version for changelog). External tools are k6 for load testing and Argo Rollouts for progressive delivery. This conservative approach minimizes risk while delivering comprehensive SDLC improvements.

## Key Findings

### Recommended Stack

The research recommends minimal additions to the existing stack, favoring tools already installed or with native integrations.

**Core technologies:**
- **CodeQL** (already configured): SAST scanning - free, GitHub-native, excellent TypeScript support
- **@vitest/coverage-v8** (already installed): Coverage enforcement - just add thresholds config
- **Playwright toHaveScreenshot()** (already installed): Visual regression - native API, no external service
- **drizzle-kit generate/migrate** (already installed): Database migrations - enable existing workflow
- **k6** (new): Load testing - native TypeScript, WebSocket support, Grafana integration
- **@axe-core/playwright** (new): Accessibility - integrates with existing Playwright
- **openapi-typescript** (new): API contract types - TypeScript compiler as contract enforcer
- **Argo Rollouts** (new): Progressive delivery - automated rollback on metrics failure

**Not recommended:** Percy/Chromatic (paid, Playwright native sufficient), Snyk (CodeQL is free), semantic-release (standard-version already works), Pact (overkill for single repo).

### Expected Features

**Must have (table stakes):**
- PR workflow with required reviews and branch protection
- Test coverage enforcement with thresholds (start at 60-70%)
- Database migration workflow (replace db:push in production)
- Basic accessibility testing (axe-core for critical violations)

**Should have (differentiators):**
- Visual regression testing for UI consistency
- API contract validation via TypeScript/OpenAPI
- Load testing for WebSocket connection limits
- Automated rollback via ArgoCD/Argo Rollouts
- Secret scanning pre-commit and CI

**Defer (v2+):**
- Percy/Chromatic cloud visual testing
- Full Pact consumer-driven contracts
- Mutation testing with Stryker
- Canary deployments with traffic splitting

### Architecture Approach

The v1.2 features integrate into existing CI/CD architecture through five clear integration points: (1) security scans as parallel CI jobs gating ci-success, (2) coverage thresholds enforced by Vitest config with PR comments via vitest-coverage-report-action, (3) visual regression baselines stored in Git LFS with Playwright snapshots, (4) database migrations via ArgoCD PreSync hooks before deployment, and (5) rollback via workflow_dispatch with ArgoCD CLI.

**Major components:**
1. **CI Enhancement Layer** - Modified ci.yml with coverage thresholds, license-check job, secret scanning job, removed continue-on-error flags
2. **Visual Testing Infrastructure** - Git LFS for snapshot storage, playwright.config.ts updates, update-snapshots.yml manual workflow
3. **Migration System** - npm scripts (db:generate, db:migrate, db:check), k8s/base/migration-job.yaml as ArgoCD PreSync hook
4. **Rollback Workflow** - .github/workflows/rollback.yml with environment protection, dry-run support, health verification
5. **Quality Gates** - Branch protection rules via GitHub settings, CODEOWNERS file

### Critical Pitfalls

1. **Drizzle Migration History Mismatch** - When switching from db:push to migrations, existing tables cause "already exists" errors. **Prevention:** Run `drizzle-kit introspect` first to capture current state, use initial migration that marks existing tables as applied.

2. **Branch Protection Bypass by Admins** - GitHub default allows admins to bypass protections. **Prevention:** Enable "Do not allow bypassing the above settings" checkbox, or use Rulesets for granular control.

3. **Security Alert Fatigue** - Adding CodeQL/Snyk produces 50+ findings, developers ignore all of them including real vulnerabilities. **Prevention:** Scope scanning to src/server folders only, start with critical/high only, establish weekly triage.

4. **Visual Regression Flakiness** - 3D content (React Three Fiber) and animations (Framer Motion) cause screenshots to differ between runs. **Prevention:** Disable animations in test mode, mask dynamic elements, use threshold-based comparison, skip 3D canvas initially.

5. **ArgoCD Rollback Breaks GitOps** - Using `argocd app rollback` with auto-sync enabled causes immediate re-deployment of broken version. **Prevention:** Roll forward via Git revert, or disable auto-sync before rollback and revert commits in Git.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: CI Foundations
**Rationale:** Low-risk improvements that provide immediate value without disrupting existing workflows. Coverage and security improvements are purely additive.
**Delivers:** Enforced coverage thresholds, PR coverage comments, blocking security audit, branch protection rules
**Addresses:** PR workflow with required reviews, test coverage enforcement
**Avoids:** Coverage threshold shock (start at measured baseline minus 5%)

### Phase 2: Security Hardening
**Rationale:** Build on stable CI. Security features should be early but after basic improvements validated. Secrets detection in pre-commit catches issues before they reach remote.
**Delivers:** Pre-commit secret scanning (gitleaks), CI secret detection, license compliance check
**Uses:** Existing husky hooks, GitHub Actions
**Implements:** Defense-in-depth security layer

### Phase 3: Database Migration System
**Rationale:** Migrations are foundational for production safety. Must be done carefully due to existing db:push usage. Requires introspection of current state before generating first migration.
**Delivers:** Migration file workflow, CI validation, ArgoCD PreSync deployment hook
**Avoids:** Migration history mismatch (introspect first), init container race conditions (use PreSync hook)

### Phase 4: Visual Regression Testing
**Rationale:** Requires infrastructure setup (Git LFS) before tests can be written. Depends on stable CI for integration. Benefits from understanding gained in phases 1-3.
**Delivers:** Playwright screenshot comparison, Git LFS baseline storage, manual update workflow
**Avoids:** Flaky tests (disable animations, mask dynamic content, threshold comparison)

### Phase 5: Accessibility Testing
**Rationale:** Can run in parallel with visual regression (both extend Playwright). Lower priority than visual regression for a game UI.
**Delivers:** axe-core integration with E2E tests, WCAG 2.1 A/AA coverage for critical paths
**Avoids:** Accessibility debt ignored (track violations as GitHub issues, fix incrementally)

### Phase 6: API Contract Testing
**Rationale:** Builds on existing TypeScript contracts in shared/gameEvents.ts. OpenAPI spec generation is low-risk.
**Delivers:** OpenAPI spec for REST endpoints, type-safe client generation, contract validation in CI
**Implements:** TypeScript compiler as contract enforcer

### Phase 7: Load Testing
**Rationale:** k6 requires test environment matching production. Best done after other CI improvements stabilize. Discovers WebSocket connection limits before production incidents.
**Delivers:** k6 test scripts for HTTP and WebSocket, CI integration for baseline tracking, Grafana dashboard integration
**Avoids:** Late discovery of performance issues (establish baseline early, run scaled-down tests in CI)

### Phase 8: Rollback Automation
**Rationale:** Final phase because it requires stable deployment pipeline. Provides safety net for all previous improvements.
**Delivers:** Manual rollback workflow, health verification, environment protection
**Avoids:** GitOps state drift (roll forward via Git, document correct procedures)

### Phase Ordering Rationale

- **Dependencies:** Coverage thresholds must exist before visual regression can be added without slowing CI further. Migrations must be stable before rollback automation has meaningful purpose.
- **Risk management:** Low-risk changes (coverage, branch protection) before high-risk (migrations, rollback). Each phase validates before adding complexity.
- **Quick wins:** Phases 1-2 deliver immediate visible improvements (PR comments, security checks) building team confidence.
- **Architecture:** Migration system (Phase 3) must precede rollback (Phase 8) because rollback complexity increases with migration state.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Migrations):** Complex state reconciliation with existing db:push usage. May need manual SQL review depending on current schema drift between environments.
- **Phase 7 (Load Testing):** WebSocket testing with Socket.IO has specific patterns. k6 WebSocket support requires custom handling for Socket.IO protocol.

Phases with standard patterns (skip research-phase):
- **Phase 1 (CI Foundations):** Vitest coverage thresholds and GitHub branch protection are well-documented.
- **Phase 2 (Security Hardening):** gitleaks and license-checker are standard GitHub Action patterns.
- **Phase 4 (Visual Regression):** Playwright toHaveScreenshot() is built-in and well-documented.
- **Phase 5 (Accessibility):** axe-core/playwright is the canonical pattern, official Playwright docs cover it.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Minimal additions, leverages existing tools, verified against current package.json |
| Features | HIGH | Existing CI infrastructure analyzed, clear gaps identified vs. SDLC best practices |
| Architecture | HIGH | All 11 workflows analyzed, integration points verified against actual code |
| Pitfalls | HIGH | Codebase-specific analysis (db:push usage, React Three Fiber, ArgoCD config), multiple authoritative sources |

**Overall confidence:** HIGH

All recommendations verified against existing codebase. Patterns are standard for GitHub Actions + ArgoCD deployments. Stack additions are minimal and well-documented.

### Gaps to Address

- **Current coverage baseline:** Unknown. Measure before setting thresholds to avoid breaking all PRs.
- **Production schema state:** May differ from local if manual SQL applied. Run introspect on all environments before migration work.
- **ArgoCD auto-sync configuration:** Verify dev/staging/prod sync policies before implementing rollback workflow.
- **3D content visual testing:** May need to exclude React Three Fiber canvas entirely. Validate with initial screenshot tests.

## Sources

### Primary (HIGH confidence)
- GitHub Actions workflows (.github/workflows/*.yml) - Existing CI/CD structure
- Drizzle ORM documentation - Migration patterns, introspect workflow
- Playwright documentation - Visual comparison, accessibility testing
- ArgoCD documentation - PreSync hooks, rollback commands
- Vitest documentation - Coverage thresholds configuration

### Secondary (MEDIUM confidence)
- k6 documentation - WebSocket testing patterns
- Argo Rollouts documentation - Progressive delivery patterns
- CodeQL documentation - JavaScript/TypeScript scanning configuration

### Tertiary (LOW confidence)
- Community blog posts on visual regression with 3D content - Limited authoritative sources
- Socket.IO + k6 integration - Requires custom protocol handling, sparse official docs

---
*Research completed: 2026-02-02*
*Ready for roadmap: yes*
