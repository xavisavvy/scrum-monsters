# Phase 11: Accessibility Testing — Context

## Phase Goal
Accessibility violations caught in CI before merge

## Success Criteria (from ROADMAP.md)
1. E2E tests run axe-core accessibility scans on critical paths
2. CI fails on critical accessibility violations (WCAG 2.1 A/AA)
3. Non-critical violations are reported but do not block merge

---

## Scan Coverage

**What gets scanned:**
- Every page visited during E2E tests (automatic, no explicit marking)
- Full depth including iframes and shadow DOM
- Shared components (header, footer, nav) scanned on every occurrence

**When scanning occurs:**
- After page load stabilizes (wait for network idle and animations)

**Exclusions:**
- Third-party embeds and widgets we don't control

---

## Violation Handling

**CI output:**
- Violations appear as inline test failures with full details
- Each violation includes: element selector, WCAG rule, impact level, fix suggestion, and help URL

**PR integration:**
- Bot posts summary comment on PR with violations found
- Screenshots of affected elements included on failure

**Artifacts:**
- Test failure screenshots highlighting violating elements

---

## Severity Rules

**Blocking behavior:**
- WCAG Level A violations block merge
- Axe-core "critical" and "serious" impact levels block
- WCAG Level AA and lower impact (moderate, minor) warn but don't block

**Suppressions:**
- Allowed with required tracking (comment or ticket reference)
- Suppression must document reason and remediation plan

**Baseline handling:**
- Capture existing violations in baseline file
- Only new violations block merge
- Baseline violations tracked for gradual remediation

---

## Developer Workflow

**Local testing:**
- `npm run test:a11y` script runs same checks as CI
- Playwright test filter for component-level testing

**Fix guidance:**
- Axe-core suggestions displayed inline
- Links to Deque documentation for each violation type

**IDE integration:**
- Document recommended VS Code extensions for accessibility
- Out of scope: automatic IDE configuration

---

## Deferred Ideas

(None captured during discussion)

---

## Implementation Notes

**Technology stack:**
- axe-core via @axe-core/playwright integration
- Existing Playwright E2E test infrastructure
- GitHub Actions for CI integration

**Key decisions locked:**
1. Scan-all approach rather than explicit path marking
2. Baseline file strategy for existing violations
3. Level A + critical/serious impact as blocking threshold
4. PR summary comments (not inline annotations)
