---
phase: 12-api-contract-testing
plan: 03
subsystem: testing
tags: [schemathesis, openapi, contract-testing, github-actions, ci]

# Dependency graph
requires:
  - phase: 12-01
    provides: OpenAPI spec, type generation, Spectral linting scripts
provides:
  - GitHub Actions workflow for API contract validation
  - Schemathesis contract testing against live server
  - Type drift detection in CI
  - PR blocking on contract violations
affects: [13-load-testing, future API changes]

# Tech tracking
tech-stack:
  added: [schemathesis]
  patterns: [contract-testing-ci, type-drift-detection, gate-job-pattern]

key-files:
  created:
    - .github/workflows/api-contracts.yml
    - requirements-schemathesis.txt
  modified: []

key-decisions:
  - "Schemathesis pinned to >=3.25.0,<4.0.0 for stability"
  - "Separate Python requirements file isolates pip caching"
  - "hypothesis-seed=42 ensures reproducible test runs"
  - "Gate job (api-contracts-success) aggregates all checks for branch protection"
  - "JUnit report for PR visibility via action-junit-report"

patterns-established:
  - "Contract testing with Schemathesis against OpenAPI spec"
  - "Type drift detection: regenerate then git diff --exit-code"
  - "Gate job pattern: always() condition aggregates dependent job results"

# Metrics
duration: 2min
completed: 2026-02-03
---

# Phase 12 Plan 03: Contract Testing CI Integration Summary

**Schemathesis-based API contract testing CI workflow with spec validation, type drift detection, and PR blocking on violations**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-03T19:13:48Z
- **Completed:** 2026-02-03T19:15:55Z
- **Tasks:** 3
- **Files created:** 2

## Accomplishments

- Created Schemathesis Python requirements file with version pinning
- Built comprehensive CI workflow with three validation jobs
- Type drift detection catches uncommitted generated type changes
- Gate job provides single status check for branch protection
- JUnit reporting shows contract test results directly in PR

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Schemathesis requirements file** - `a209619` (chore)
2. **Task 2: Create API contracts CI workflow** - `30445c3` (feat)
3. **Task 3: Test contract workflow locally** - verification only, no commit

## Files Created

- `requirements-schemathesis.txt` - Python dependencies for Schemathesis contract testing
- `.github/workflows/api-contracts.yml` - CI workflow with 4 jobs:
  - `validate-specs`: Spectral linting for OpenAPI and AsyncAPI
  - `type-drift`: Detects uncommitted changes to generated types
  - `contract-tests`: Schemathesis against live server
  - `api-contracts-success`: Gate job for branch protection

## Decisions Made

1. **Separate Python requirements file** - Isolates Python deps from Node.js ecosystem, enables pip caching in CI
2. **Version pinning (>=3.25.0,<4.0.0)** - Prevents breaking CI on major updates while allowing patches
3. **hypothesis-seed=42** - Reproducible tests across CI runs
4. **hypothesis-max-examples=20** - Balance between coverage and CI speed
5. **workers=1** - Avoids race conditions with single server instance
6. **Gate job pattern** - Single check for branch protection, aggregates all job results

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**API contract testing infrastructure complete:**
- Spec validation runs on every PR touching server/shared/specs
- Type drift detection ensures generated types match spec
- Contract tests verify API responses match OpenAPI definitions
- PR blocking prevents spec drift from reaching main

**Branch protection setup (manual):**
To enforce contract validation on PRs, add `api-contracts-success` as a required status check in repository settings.

**Note on authenticated endpoints:**
Schemathesis will test that unauthenticated requests to protected endpoints return 401, which is correct behavior per the OpenAPI spec. Authenticated endpoint testing would require Schemathesis hooks for stateful testing (future enhancement).

---
*Phase: 12-api-contract-testing*
*Completed: 2026-02-03*
