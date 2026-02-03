# Roadmap: ScrumQuest

## Milestones

- **v1.0 MVP** - Phases 1-6 (shipped 2025-12-15)
- **v1.1 CI/CD Infrastructure** - Phases (unnumbered) (shipped 2026-02-01)
- **v1.2 SDLC Best Practices** - Phases 7-14 (in progress)

## Overview

v1.2 matures the CI/CD infrastructure with engineering best practices: PR quality gates, security scanning, test coverage enforcement, visual regression testing, database migrations, API contracts, load testing, and deployment safety. The approach is incremental, starting with low-risk CI improvements that provide immediate value, then progressing to infrastructure-heavy features like migrations and rollback automation.

## Phases

**Phase Numbering:**
- Phases 7-14 continue from v1.0 numbering (v1.1 was unnumbered)
- Decimal phases (7.1, 7.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 7: CI Foundations** - PR workflow and test coverage enforcement
- [x] **Phase 8: Security Hardening** - Security scanning gates in CI
- [x] **Phase 9: Database Migrations** - Versioned migrations with deployment hooks
- [ ] **Phase 10: Visual Regression** - Screenshot-based UI change detection
- [ ] **Phase 11: Accessibility Testing** - axe-core integration with E2E tests
- [ ] **Phase 12: API Contract Testing** - OpenAPI spec validation
- [ ] **Phase 13: Load Testing** - k6 performance baselines
- [ ] **Phase 14: Rollback Automation** - ArgoCD rollback with environment protection

## Phase Details

### Phase 7: CI Foundations
**Goal**: PRs have quality gates enforced before merge
**Depends on**: Nothing (v1.1 CI infrastructure exists)
**Requirements**: PR-01, PR-02, PR-03, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. PRs cannot merge without at least one reviewer approval
  2. PRs use a template with summary, test plan, and checklist sections
  3. PRs cannot merge if any CI check fails
  4. CI fails when test coverage drops below configured threshold
  5. PR comments show coverage diff highlighting new/changed lines
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — PR templates, CODEOWNERS, and Vitest coverage thresholds
- [x] 07-02-PLAN.md — CI coverage reporting and branch protection configuration

### Phase 8: Security Hardening
**Goal**: Security issues caught before code reaches main branch
**Depends on**: Phase 7 (branch protection must exist)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. PRs with high/critical CodeQL findings cannot merge
  2. Commits with secrets/API keys are rejected before push
  3. PRs with unapproved dependency licenses cannot merge
  4. PRs with high/critical npm audit vulnerabilities cannot merge
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — CodeQL merge blocking via rulesets and gitleaks secret detection
- [x] 08-02-PLAN.md — Dependency vulnerability scanning (audit-ci) and license compliance (license-checker)

### Phase 9: Database Migrations
**Goal**: Schema changes deploy safely through versioned migrations
**Depends on**: Phase 8 (security scanning validates migration files)
**Requirements**: DB-01, DB-02, DB-03
**Success Criteria** (what must be TRUE):
  1. Schema changes produce versioned migration files (not db:push)
  2. CI fails if schema.ts changes without corresponding migration
  3. ArgoCD runs migrations before deploying new application version
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md — Local migration workflow with npm scripts and initial migration
- [x] 09-02-PLAN.md — CI migration validation with PostgreSQL service container
- [x] 09-03-PLAN.md — ArgoCD PreSync hook for deployment migration execution

### Phase 10: Visual Regression
**Goal**: UI changes detected and reviewed before merge
**Depends on**: Phase 7 (CI foundations for test infrastructure)
**Requirements**: TEST-03
**Success Criteria** (what must be TRUE):
  1. Playwright captures screenshots of key UI states
  2. CI compares screenshots against baseline and reports differences
  3. Baseline updates require explicit developer action (not automatic)
**Plans**: 3 plans

Plans:
- [ ] 10-01-PLAN.md — Visual test infrastructure (Playwright config, helpers, CSS)
- [ ] 10-02-PLAN.md — Visual regression test specs for game flow
- [ ] 10-03-PLAN.md — CI workflow and PR labeling for visual changes

### Phase 11: Accessibility Testing
**Goal**: Accessibility violations caught in CI before merge
**Depends on**: Phase 7 (CI foundations for E2E tests)
**Requirements**: TEST-04
**Success Criteria** (what must be TRUE):
  1. E2E tests run axe-core accessibility scans on critical paths
  2. CI fails on critical accessibility violations (WCAG 2.1 A/AA)
  3. Non-critical violations are reported but do not block merge
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

### Phase 12: API Contract Testing
**Goal**: API changes validated against documented spec
**Depends on**: Phase 7 (CI foundations for validation)
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. OpenAPI spec documents all REST endpoints with request/response schemas
  2. CI validates actual API responses match OpenAPI spec
  3. TypeScript types for API are generated from OpenAPI spec
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD

### Phase 13: Load Testing
**Goal**: Performance baselines established and tracked
**Depends on**: Phase 7 (CI foundations for test jobs)
**Requirements**: PERF-01, PERF-02, PERF-03
**Success Criteria** (what must be TRUE):
  1. k6 load tests establish baseline metrics for HTTP endpoints
  2. k6 load tests establish baseline metrics for WebSocket connections
  3. CI runs smoke load tests on PRs to catch performance regressions
**Plans**: TBD

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD

### Phase 14: Rollback Automation
**Goal**: Failed deployments can be recovered quickly and safely
**Depends on**: Phase 9 (migrations must be stable for rollback to be meaningful)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03
**Success Criteria** (what must be TRUE):
  1. GitHub workflow can trigger ArgoCD rollback to previous version
  2. Production rollbacks require manual approval via environment protection
  3. Rollback actions are recorded in GitHub Actions history for audit
**Plans**: TBD

Plans:
- [ ] 14-01: TBD
- [ ] 14-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 7.1 -> 7.2 -> 8 -> ... -> 14

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. CI Foundations | 2/2 | Complete | 2026-02-02 |
| 8. Security Hardening | 2/2 | Complete | 2026-02-02 |
| 9. Database Migrations | 3/3 | Complete | 2026-02-03 |
| 10. Visual Regression | 0/3 | Not started | - |
| 11. Accessibility Testing | 0/1 | Not started | - |
| 12. API Contract Testing | 0/2 | Not started | - |
| 13. Load Testing | 0/2 | Not started | - |
| 14. Rollback Automation | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-02*
*Milestone: v1.2 SDLC Best Practices*
