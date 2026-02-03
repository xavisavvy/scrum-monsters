# Requirements: ScrumQuest v1.2

**Defined:** 2026-02-02
**Core Value:** Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.

## v1.2 Requirements

Requirements for SDLC Best Practices milestone. Each maps to roadmap phases.

### PR Workflow

- [ ] **PR-01**: PRs require at least 1 reviewer approval before merge
- [ ] **PR-02**: PRs use standardized template with summary, test plan, and checklist
- [ ] **PR-03**: PRs require all CI status checks to pass before merge

### Security Scanning

- [ ] **SEC-01**: CodeQL SAST blocks PRs on high/critical severity findings
- [ ] **SEC-02**: Pre-commit hook detects secrets/API keys before commit
- [ ] **SEC-03**: CI validates all dependencies use approved licenses
- [ ] **SEC-04**: npm audit job blocks PRs on high/critical vulnerabilities

### Test Quality

- [ ] **TEST-01**: CI fails if test coverage drops below 70% threshold
- [ ] **TEST-02**: PR comments show coverage diff with lines changed
- [ ] **TEST-03**: Playwright captures and compares UI screenshots for visual regression
- [ ] **TEST-04**: E2E tests validate accessibility using axe-core (no critical violations)

### Database

- [ ] **DB-01**: Schema changes use Drizzle versioned migrations instead of db:push
- [ ] **DB-02**: CI validates migrations are generated for schema changes
- [ ] **DB-03**: ArgoCD runs migrations via PreSync hook before deployment

### API Contracts

- [ ] **API-01**: OpenAPI spec documents all REST endpoints
- [ ] **API-02**: CI validates API responses match OpenAPI spec
- [ ] **API-03**: TypeScript types are generated from OpenAPI spec

### Performance

- [ ] **PERF-01**: k6 load tests establish baseline for HTTP endpoints
- [ ] **PERF-02**: k6 load tests establish baseline for WebSocket connections
- [ ] **PERF-03**: CI runs smoke load tests on PRs (quick performance check)

### Deployment

- [ ] **DEPLOY-01**: GitHub workflow triggers ArgoCD rollback with environment protection
- [ ] **DEPLOY-02**: Rollback workflow requires approval for production
- [ ] **DEPLOY-03**: Rollback creates audit trail in GitHub Actions history

## Future Requirements

Deferred to v1.3 or later. Tracked but not in current roadmap.

### Advanced Testing

- **TEST-05**: Mutation testing with Stryker to validate test quality
- **TEST-06**: Contract testing with Pact for service boundaries
- **TEST-07**: Chaos engineering with fault injection

### Advanced Deployment

- **DEPLOY-04**: Canary deployments with Argo Rollouts
- **DEPLOY-05**: Automated rollback based on Prometheus metrics
- **DEPLOY-06**: Blue/green deployment strategy

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 100% coverage requirement | Leads to coverage-chasing over test quality |
| Visual regression for 3D canvas | GPU variance makes snapshots flaky |
| Snyk over CodeQL | CodeQL is free and sufficient for current needs |
| Full DAST scanning | Overkill for internal tool, defer to production hardening |
| Percy/Chromatic | Start with free Playwright screenshots |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PR-01 | Phase 7 | Pending |
| PR-02 | Phase 7 | Pending |
| PR-03 | Phase 7 | Pending |
| SEC-01 | Phase 8 | Pending |
| SEC-02 | Phase 8 | Pending |
| SEC-03 | Phase 8 | Pending |
| SEC-04 | Phase 8 | Pending |
| TEST-01 | Phase 7 | Pending |
| TEST-02 | Phase 7 | Pending |
| TEST-03 | Phase 10 | Pending |
| TEST-04 | Phase 11 | Pending |
| DB-01 | Phase 9 | Pending |
| DB-02 | Phase 9 | Pending |
| DB-03 | Phase 9 | Pending |
| API-01 | Phase 12 | Pending |
| API-02 | Phase 12 | Pending |
| API-03 | Phase 12 | Pending |
| PERF-01 | Phase 13 | Pending |
| PERF-02 | Phase 13 | Pending |
| PERF-03 | Phase 13 | Pending |
| DEPLOY-01 | Phase 14 | Pending |
| DEPLOY-02 | Phase 14 | Pending |
| DEPLOY-03 | Phase 14 | Pending |

**Coverage:**
- v1.2 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-02 after roadmap creation*
