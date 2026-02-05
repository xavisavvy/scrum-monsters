---
phase: 11-accessibility-testing
plan: 01
subsystem: testing
tags: [accessibility, axe-core, playwright, wcag, a11y]

# Dependency graph
requires:
  - phase: 10-visual-regression
    provides: Playwright E2E test infrastructure and helper patterns
provides:
  - @axe-core/playwright integration for automated accessibility testing
  - Reusable Playwright fixtures for WCAG 2.1 A/AA compliance
  - Helper utilities for violation filtering and formatting
affects: [11-02, 11-03, accessibility-ci]

# Tech tracking
tech-stack:
  added: [@axe-core/playwright@4.11.0]
  patterns: [test-fixture-for-axe-builder, violation-fingerprinting, impact-based-filtering]

key-files:
  created: [e2e/helpers/a11y-fixture.ts, e2e/helpers/a11y-helpers.ts]
  modified: [package.json]

key-decisions:
  - "WCAG 2.1 A/AA tags for compliance targeting (industry standard)"
  - "Canvas elements excluded from scanning (3D scenes non-accessible by design)"
  - "Impact-based filtering: critical/serious blocks merge, moderate/minor warns"
  - "Violation fingerprinting for baseline comparison (minimal identifying info)"

patterns-established:
  - "Test fixture pattern: makeAxeBuilder() provides pre-configured AxeBuilder instance"
  - "Helper pattern: filterBlockingViolations() and filterWarningViolations() separate severity levels"
  - "Reporting pattern: formatViolation() includes rule ID, impact, description, help URL, and affected elements"

# Metrics
duration: 2min
completed: 2026-02-03
---

# Phase 11 Plan 01: Setup Accessibility Testing Infrastructure Summary

**Integrated @axe-core/playwright with WCAG 2.1 A/AA compliance testing, reusable fixtures, and impact-based violation filtering**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-03T22:16:29Z
- **Completed:** 2026-02-03T22:18:53Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- @axe-core/playwright v4.11.0 installed for automated WCAG testing
- Playwright test fixture with pre-configured AxeBuilder (WCAG 2.1 A/AA tags, canvas exclusions)
- Complete helper utilities for violation handling (fingerprinting, filtering, formatting)
- npm script for local accessibility testing

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @axe-core/playwright and create a11y fixture** - `240ccc3` (feat)
2. **Task 2: Create a11y helper utilities for violation handling** - `17c62aa` (feat)
3. **Task 3: Add test:a11y npm script** - `d255876` (feat)

## Files Created/Modified
- `e2e/helpers/a11y-fixture.ts` - Playwright test fixture extending base test with makeAxeBuilder factory
- `e2e/helpers/a11y-helpers.ts` - Violation utilities: fingerprinting, impact filtering, formatting, logging
- `package.json` - Added @axe-core/playwright dependency and test:a11y script

## Decisions Made
- **WCAG 2.1 A/AA targeting:** Used withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) to enforce industry standard compliance levels
- **Canvas exclusion:** Excluded canvas elements from scans as React Three Fiber 3D scenes are non-accessible by design (matches RESEARCH.md Pattern 5)
- **Impact-based filtering:** Separated critical/serious (blocking) from moderate/minor (warning) violations per CONTEXT.md severity rules
- **Violation fingerprinting:** Minimal structure (rule ID + targets) for baseline comparison to avoid brittle snapshots (RESEARCH.md Pattern 2)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Infrastructure ready for accessibility test implementation:
- Test fixture available for all accessibility tests
- Helper utilities provide consistent violation handling patterns
- npm script enables local testing before CI push
- Ready for 11-02: Lobby and voting accessibility tests

No blockers identified.

---
*Phase: 11-accessibility-testing*
*Completed: 2026-02-03*
