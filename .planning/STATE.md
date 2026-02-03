# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.
**Current focus:** Phase 13 - Load Testing

## Current Position

Phase: 13 of 14 (Load Testing)
Plan: 3 of 3 in current phase
Status: Phase complete
Last activity: 2026-02-03 - Completed 13-03-PLAN.md

Progress: [█████████████░      ] 65%

## Milestone Summary

**v1.2 SDLC Best Practices** (in progress):
- 8 phases (7-14), 23 requirements
- PR workflow, security scanning, coverage enforcement
- Visual regression, accessibility, API contracts
- Load testing, rollback automation

**v1.1 CI/CD Infrastructure** shipped 2026-02-01:
- ESLint, Playwright E2E, Kustomize, Sealed Secrets
- Pino logging, Prometheus metrics, Grafana + Loki, ArgoCD

**v1.0 Domain Separation** shipped 2025-12-15:
- 6 phases, 30 plans completed
- SessionManager, EstimationManager, CombatManager extracted
- EventBus-based cross-domain coordination

## Performance Metrics

**Velocity:**
- Total plans completed: 19 (v1.2 milestone)
- Average duration: 2.7 minutes
- Total execution time: 0.89 hours

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1]: Kustomize, Sealed Secrets, ArgoCD, Pino, Prometheus + Loki
- [v1.2]: Start coverage threshold at measured baseline
- [07-01]: PR template folder structure (feature/bugfix/docs variants)
- [07-01]: Coverage thresholds at 12%/9%/9%/12% baseline
- [07-01]: json-summary reporter for CI coverage reporting
- [07-02]: Branch protection via GitHub API (1 approval, CI gates, linear history)
- [07-02]: Coverage PR comments via vitest-coverage-report-action
- [07-02]: Dynamic coverage badge via gist
- [08-01]: CodeQL blocks high/critical security findings only (GitHub ruleset)
- [08-01]: Two-point secret detection with graceful fallback (pre-commit + CI)
- [08-02]: audit-ci blocks high/critical vulnerabilities only (moderate/low reported)
- [08-02]: License check on production dependencies only (dev tools excluded)
- [08-02]: Comprehensive license allowlist includes OFL-1.1, Hippocratic-2.1, MIT/BSD variants
- [09-01]: Remove DATABASE_URL requirement from drizzle.config.ts (generate doesn't need DB)
- [09-01]: Migration naming with drizzle-kit index prefix (0000_, 0001_, etc.)
- [09-01]: migrations/meta/ must be committed for team consistency
- [09-02]: PostgreSQL 16 Alpine for CI (matches production version)
- [09-02]: Health checks ensure database ready before migration steps
- [09-02]: Two-step validation: apply migrations, then check drift
- [09-02]: ci-success gates on validate-migrations for PR blocking
- [09-03]: ArgoCD PreSync hook for migrations before app deployment
- [09-03]: Sync-wave 5 for migration ordering (after secrets, before app)
- [09-03]: Job with backoffLimit: 2 for automatic retry on transient failures
- [09-03]: BeforeHookCreation delete policy enables sync retries
- [10-01]: maxDiffPixelRatio 0.01 (1%), threshold 0.2 for visual regression
- [10-01]: Viewports standardized (desktop 1280x720, tablet 768x1024, mobile 375x667)
- [10-01]: Canvas elements masked by default (WebGL non-deterministic)
- [10-01]: animations disabled + reducedMotion reduce for consistent screenshots
- [10-02]: Voting tests use 2% tolerance for 3D canvas WebGL variance
- [10-02]: Reveal and victory tests skipped until full game flow testable
- [10-02]: Conditional test execution with isVisible() checks handles variable UI states
- [10-03]: Docker container (mcr.microsoft.com/playwright:v1.49.1-noble) ensures consistent rendering
- [10-03]: Visual failures block PR merge with explicit exit 1
- [10-03]: PR comments provide artifact links and instructions on failure
- [10-03]: Auto-label 'visual-changes' makes baseline updates visible in PRs
- [11-01]: WCAG 2.1 A/AA tags for compliance targeting (industry standard)
- [11-01]: Canvas elements excluded from accessibility scans (3D scenes non-accessible)
- [11-01]: Impact-based filtering (critical/serious blocks, moderate/minor warns)
- [11-01]: Violation fingerprinting for baseline comparison (minimal identifying info)
- [11-02]: Conditional test execution with isVisible() checks for variable UI states
- [11-02]: Baseline file initialized for gradual remediation tracking
- [11-02]: Network stabilization (waitForLoadState) before accessibility scans
- [11-03]: Playwright container ensures deterministic CI execution (same as visual regression)
- [11-03]: PR comment automation provides actionable guidance on accessibility failures
- [11-03]: Unique artifact names prevent workflow collisions (accessibility-report, a11y-test-results)
- [12-01]: OpenAPI 3.1 chosen for modern JSON Schema support
- [12-01]: Spectral extends spectral:oas with stricter operationId and description rules
- [12-01]: Generated types marked linguist-generated in .gitattributes
- [12-01]: OAuth callback and /metrics routes excluded (non-JSON responses)
- [12-02]: AsyncAPI 3.0 format for WebSocket API documentation
- [12-02]: Zod schemas separate from types for incremental adoption
- [12-02]: ClientEventSchemas registry for dynamic middleware validation
- [12-03]: Schemathesis pinned >=3.25.0,<4.0.0 for CI stability
- [12-03]: hypothesis-seed=42 for reproducible contract tests
- [12-03]: Gate job (api-contracts-success) aggregates all checks
- [12-03]: JUnit report for PR visibility via action-junit-report
- [13-01]: k6 standalone binary with ES modules (not npm-based)
- [13-01]: Environment-specific thresholds: ci (lenient), staging (moderate), prod (strict)
- [13-01]: p95 latency targets: 1000ms (ci), 750ms (staging), 500ms (prod)
- [13-01]: Load test results excluded from version control
- [13-02]: Socket.IO v4 with Engine.IO v4 protocol (EIO=4 query param)
- [13-02]: WebSocket p95 < 100ms in prod (stricter than HTTP for real-time)
- [13-02]: 25-second heartbeat interval for idle connection test
- [13-02]: 5-minute idle test runs nightly only (never blocks PRs)
- [13-03]: Load tests run nightly only (never block PRs)
- [13-03]: All k6 runs use continue-on-error: true (informational only)
- [13-03]: Artifacts retained for 30 days for trend analysis
- [13-03]: Idle connection test runs on schedule + manual trigger
- [13-03]: k6 installed from GitHub releases (not npm package)

### Pending Todos

None.

### Blockers/Concerns

- [09-01]: Production baseline needed if db:push was used (manual __drizzle_migrations setup)
- [Research]: ArgoCD auto-sync config needs verification for rollback work
- [10-01]: Pre-existing TypeScript errors in codebase (BattleScreen, Lobby, socketHandlers, websocket)
- [10-01]: Resolved - 3D canvas masking strategy established (mask by default per research)
- [08-01]: Husky deprecation warning in pre-commit output (v10 breaking change)

## Session Continuity

Last session: 2026-02-03
Stopped at: Completed 13-03-PLAN.md (Phase 13 complete)
Resume file: None

**Next step:** Start Phase 14 - Rollback Automation
