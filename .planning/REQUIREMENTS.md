# Requirements: ScrumQuest v1.2

**Defined:** 2026-02-02
**Core Value:** Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.

## v1.2 Requirements

Requirements for SDLC Best Practices milestone. Each maps to roadmap phases.

### PR Workflow

- [x] **PR-01**: PRs require at least 1 reviewer approval before merge
- [x] **PR-02**: PRs use standardized template with summary, test plan, and checklist
- [x] **PR-03**: PRs require all CI status checks to pass before merge

### Security Scanning

- [x] **SEC-01**: CodeQL SAST blocks PRs on high/critical severity findings
- [x] **SEC-02**: Pre-commit hook detects secrets/API keys before commit
- [x] **SEC-03**: CI validates all dependencies use approved licenses
- [x] **SEC-04**: npm audit job blocks PRs on high/critical vulnerabilities

### Test Quality

- [x] **TEST-01**: CI fails if test coverage drops below 70% threshold
- [x] **TEST-02**: PR comments show coverage diff with lines changed
- [x] **TEST-03**: Playwright captures and compares UI screenshots for visual regression
- [x] **TEST-04**: E2E tests validate accessibility using axe-core (no critical violations)

### Database

- [x] **DB-01**: Schema changes use Drizzle versioned migrations instead of db:push
- [x] **DB-02**: CI validates migrations are generated for schema changes
- [x] **DB-03**: ArgoCD runs migrations via PreSync hook before deployment

### API Contracts

- [x] **API-01**: OpenAPI spec documents all REST endpoints
- [x] **API-02**: CI validates API responses match OpenAPI spec
- [x] **API-03**: TypeScript types are generated from OpenAPI spec

### Performance

- [x] **PERF-01**: k6 load tests establish baseline for HTTP endpoints
- [x] **PERF-02**: k6 load tests establish baseline for WebSocket connections
- [x] **PERF-03**: Nightly load tests run on schedule to track performance trends

### Deployment

- [x] **DEPLOY-01**: GitHub workflow triggers ArgoCD rollback with environment protection
- [x] **DEPLOY-02**: Rollback workflow requires approval for production
- [x] **DEPLOY-03**: Rollback creates audit trail in GitHub Actions history

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
| PR-01 | Phase 7 | Complete |
| PR-02 | Phase 7 | Complete |
| PR-03 | Phase 7 | Complete |
| SEC-01 | Phase 8 | Complete |
| SEC-02 | Phase 8 | Complete |
| SEC-03 | Phase 8 | Complete |
| SEC-04 | Phase 8 | Complete |
| TEST-01 | Phase 7 | Complete |
| TEST-02 | Phase 7 | Complete |
| TEST-03 | Phase 10 | Complete |
| TEST-04 | Phase 11 | Complete |
| DB-01 | Phase 9 | Complete |
| DB-02 | Phase 9 | Complete |
| DB-03 | Phase 9 | Complete |
| API-01 | Phase 12 | Complete |
| API-02 | Phase 12 | Complete |
| API-03 | Phase 12 | Complete |
| PERF-01 | Phase 13 | Complete |
| PERF-02 | Phase 13 | Complete |
| PERF-03 | Phase 13 | Complete |
| DEPLOY-01 | Phase 14 | Complete |
| DEPLOY-02 | Phase 14 | Complete |
| DEPLOY-03 | Phase 14 | Complete |

**Coverage:**
- v1.2 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-03 after Phase 14 completion*
