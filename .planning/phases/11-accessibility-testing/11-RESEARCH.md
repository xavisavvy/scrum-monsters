# Phase 11: Accessibility Testing - Research

**Researched:** 2026-02-03
**Domain:** Web accessibility testing with axe-core and Playwright
**Confidence:** HIGH

## Summary

Accessibility testing with axe-core and Playwright is a mature, industry-standard approach for automated WCAG compliance testing. The `@axe-core/playwright` package (v4.11.0, published 3 months ago) provides a chainable API to inject, configure, and analyze axe-core within Playwright E2E tests. This integration can catch approximately 57% of WCAG issues automatically, with the remaining 43-50% requiring manual testing by accessibility specialists.

The standard implementation uses Playwright test fixtures to create reusable AxeBuilder instances configured with WCAG tags and exclusions. Violations are categorized by impact level (critical/serious/moderate/minor) and mapped to specific WCAG success criteria. The community has established patterns for baseline management using "violation fingerprints" to prevent new violations while gradually remediating existing issues.

**Primary recommendation:** Use @axe-core/playwright v4.11.0+ with Playwright test fixtures, filter by WCAG 2.1 A/AA tags and critical/serious impact levels for merge blocking, implement violation fingerprinting for baseline management, and integrate with GitHub Actions for PR comments.

## Standard Stack

The established libraries/tools for accessibility testing with Playwright:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @axe-core/playwright | 4.11.0+ | Axe-core integration for Playwright | Official Deque package, chainable API, actively maintained |
| axe-core | 4.11.x | Accessibility testing engine | Industry standard (57% automated detection), tests WCAG 2.0/2.1/2.2 A/AA/AAA |
| @playwright/test | 1.49.1+ | Test framework with fixtures | Project already uses Playwright for E2E tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axe-playwright-report | Latest | Screenshot violations with highlighted elements | Optional: Enhanced visual reporting |
| axe-html-reporter | Latest | Generate detailed HTML reports | Optional: Standalone report generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @axe-core/playwright | axe-playwright (by abhinaba-ghosh) | Community package with different API, less official support |
| Automated only | pa11y, Lighthouse CI | Different rule engines, less Playwright integration |
| Test-time scanning | IDE linters (axe Accessibility Linter) | Catches issues earlier but doesn't verify rendered output |

**Installation:**
```bash
npm install --save-dev @axe-core/playwright
```

## Architecture Patterns

### Recommended Project Structure
```
e2e/
├── helpers/
│   ├── a11y-helpers.ts      # Accessibility test utilities
│   ├── a11y-fixture.ts      # Reusable AxeBuilder fixture
│   └── visual-helpers.ts    # Existing visual test helpers
├── a11y/
│   ├── lobby.a11y.spec.ts   # Accessibility tests for lobby flow
│   ├── voting.a11y.spec.ts  # Accessibility tests for voting
│   └── battle.a11y.spec.ts  # Accessibility tests for battle
├── visual/                   # Existing visual regression tests
└── lobby.spec.ts            # Existing functional E2E tests
.a11y-baseline.json          # Violation fingerprints for existing issues
playwright.config.ts         # Add a11y project configuration
package.json                 # Add test:a11y script
```

### Pattern 1: Test Fixture for Reusable Configuration
**What:** Extend Playwright base test with pre-configured AxeBuilder instance
**When to use:** When you need consistent WCAG tags and exclusions across all tests
**Example:**
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
import { test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type AxeFixture = {
  makeAxeBuilder: () => AxeBuilder;
};

// Extend base test by providing "makeAxeBuilder"
export const test = base.extend<AxeFixture>({
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('#commonly-reused-element-with-known-issue');

    await use(makeAxeBuilder);
  }
});

export { expect } from '@playwright/test';
```

### Pattern 2: Violation Fingerprinting for Baseline Management
**What:** Convert violations to minimal "fingerprint" objects for comparison
**When to use:** When introducing accessibility testing to legacy applications with existing violations
**Example:**
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
type ViolationFingerprint = {
  rule: string;
  targets: string[][];
};

function fingerprintViolations(violations: AxeResults['violations']): ViolationFingerprint[] {
  return violations.map(violation => ({
    rule: violation.id,
    targets: violation.nodes.map(node => node.target)
  }));
}

// In test:
const accessibilityScanResults = await makeAxeBuilder().analyze();
const actualFingerprints = fingerprintViolations(accessibilityScanResults.violations);
expect(actualFingerprints).toMatchSnapshot('a11y-baseline.json');
```

### Pattern 3: Impact-Based Filtering
**What:** Filter violations by severity (critical/serious/moderate/minor) to enforce blocking rules
**When to use:** When implementing progressive accessibility improvements
**Example:**
```typescript
// Source: https://www.npmjs.com/package/axe-playwright
const accessibilityScanResults = await makeAxeBuilder().analyze();

// Filter violations by impact level
const blockingViolations = accessibilityScanResults.violations.filter(
  v => v.impact === 'critical' || v.impact === 'serious'
);

// Only fail on critical/serious violations
expect(blockingViolations).toEqual([]);

// Report but don't block on moderate/minor
if (accessibilityScanResults.violations.length > blockingViolations.length) {
  console.log('Non-blocking violations found:',
    accessibilityScanResults.violations.length - blockingViolations.length);
}
```

### Pattern 4: WCAG Level Targeting
**What:** Use withTags() to constrain scans to specific WCAG levels
**When to use:** Always - defines which standards you're testing against
**Example:**
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
// Test only WCAG 2.1 Level A and AA (not AAA)
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .analyze();

// Available tags:
// - wcag2a, wcag2aa, wcag2aaa (WCAG 2.0)
// - wcag21a, wcag21aa, wcag21aaa (WCAG 2.1)
// - wcag22a, wcag22aa, wcag22aaa (WCAG 2.2)
// - best-practice (non-WCAG rules)
```

### Pattern 5: Element Exclusion
**What:** Use include() and exclude() to control scan scope
**When to use:** When third-party widgets cause false positives or known issues need temporary suppression
**Example:**
```typescript
// Source: https://www.npmjs.com/package/@axe-core/playwright
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .exclude('[id^="google_ads_iframe_"]')  // Exclude ads
  .exclude('.third-party-chat-widget')     // Exclude chat widget
  .analyze();

// When element is both included and excluded:
// - Nearest ancestor selector wins
// - Useful for including section but excluding problematic child
```

### Anti-Patterns to Avoid
- **Disabling entire rules globally:** Instead of disabling a rule, exclude specific problematic elements and document why
- **Snapshotting entire violation objects:** Violation objects contain HTML snippets that make tests brittle; use fingerprints instead
- **Testing without WCAG tags:** Always specify withTags() to define which standards you're enforcing
- **Ignoring incomplete results:** Axe-core returns "incomplete" results that need manual review; don't ignore these
- **Blocking on all violations immediately:** Use impact filtering to progressively improve without breaking CI on legacy issues

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility rule engine | Custom ARIA/WCAG validators | axe-core | 90+ rules, maintained by Deque (accessibility experts), tests 57% of WCAG automatically |
| Violation deduplication | Custom comparison logic | axe-core's built-in deduplication | Axe-core automatically calculates unique selectors and deduplicates results |
| WCAG rule mapping | Manual rule-to-criterion mapping | axe-core's tags system | Each rule tagged with applicable WCAG success criteria |
| Screenshot highlighting | Custom element highlighting | axe-playwright-report | Finds elements via target selectors, highlights in red, screenshots automatically |
| Baseline management | Custom JSON comparison | Violation fingerprinting pattern | Established pattern avoids brittleness of full object comparison |
| HTML report generation | Custom HTML templates | axe-html-reporter | Pre-built templates with violation details, WCAG links, fix suggestions |

**Key insight:** Accessibility testing involves complex heuristics and edge cases that accessibility experts have spent years refining. Axe-core represents hundreds of person-years of expertise - reinventing even "simple" checks will miss edge cases and produce false positives/negatives.

## Common Pitfalls

### Pitfall 1: Expecting 100% Automated Coverage
**What goes wrong:** Teams assume automated testing catches all accessibility issues and skip manual testing
**Why it happens:** Marketing often touts "automated accessibility testing" without mentioning limitations
**How to avoid:** Document that axe-core catches ~57% of WCAG issues; remaining 43-50% require manual testing (keyboard navigation, screen reader testing, cognitive load assessment, alt text accuracy)
**Warning signs:** No budget/time for manual accessibility audits, no accessibility specialists on team

### Pitfall 2: Blocking CI Immediately on All Violations
**What goes wrong:** Adding accessibility tests to legacy applications causes all builds to fail, team disables tests or adds broad exclusions
**Why it happens:** Existing violations overwhelm CI before team can remediate
**How to avoid:** Use baseline fingerprinting to "snapshot" existing violations, only block on NEW violations. Gradually remediate baseline violations over time
**Warning signs:** Large exclude() lists with no remediation plan, tests disabled in CI

### Pitfall 3: Testing Only Static Content
**What goes wrong:** Tests pass on initial page load but miss violations in dynamically loaded content (modals, dropdowns, AJAX updates)
**Why it happens:** Tests run analyze() immediately after page load without waiting for user interactions
**How to avoid:** Run analyze() after each significant interaction that changes DOM (opening modal, expanding accordion, loading new content)
**Warning signs:** Tests pass but manual testing finds violations in interactive elements

### Pitfall 4: Ignoring "Incomplete" Results
**What goes wrong:** Tests only check violations array, miss incomplete results that need manual review
**Why it happens:** Documentation focuses on violations, incomplete array seems optional
**How to avoid:** Log incomplete results as warnings, create tickets for manual review. Incomplete results often indicate complex patterns axe-core can't evaluate automatically (e.g., color contrast on gradients)
**Warning signs:** No tickets/documentation for incomplete results, incomplete array never logged

### Pitfall 5: Not Excluding Third-Party Content
**What goes wrong:** Tests fail on accessibility issues in third-party widgets/ads/embeds that team can't fix
**Why it happens:** Axe-core scans entire page including third-party iframes and embeds
**How to avoid:** Use exclude() for third-party content with documentation explaining why. File issues with third-party vendors separately
**Warning signs:** Tests blocked by ads, chat widgets, social media embeds that team doesn't control

### Pitfall 6: Brittle Baseline Snapshots
**What goes wrong:** Tests break constantly due to minor HTML changes even when accessibility hasn't regressed
**Why it happens:** Snapshotting entire violation objects including HTML snippets, line numbers, etc.
**How to avoid:** Use violation fingerprints (rule ID + target selector) instead of full objects. Only snapshot minimal identifying information
**Warning signs:** Baseline snapshots fail on whitespace changes, refactoring breaks all a11y tests

### Pitfall 7: No Impact Level Distinction
**What goes wrong:** Minor violations block PRs as strictly as critical violations, team loses trust in tests
**Why it happens:** Tests treat all violations equally without considering user impact
**How to avoid:** Block CI only on critical/serious violations (WCAG A + high impact). Report moderate/minor as warnings with grace period for fixes
**Warning signs:** PRs blocked by redundant title attributes, team adding broad exclusions to "fix" minor issues

## Code Examples

Verified patterns from official sources:

### Basic Accessibility Test
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('should not have accessibility violations', async ({ page }) => {
  await page.goto('https://example.com/');

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
```

### Test with Fixture
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
// In e2e/helpers/a11y-fixture.ts
import { test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type AxeFixture = {
  makeAxeBuilder: () => AxeBuilder;
};

export const test = base.extend<AxeFixture>({
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.third-party-widget');

    await use(makeAxeBuilder);
  }
});

export { expect } from '@playwright/test';

// In test file
import { test, expect } from './helpers/a11y-fixture';

test('lobby page accessibility', async ({ page, makeAxeBuilder }) => {
  await page.goto('/');
  const results = await makeAxeBuilder().analyze();
  expect(results.violations).toEqual([]);
});
```

### Impact-Based Filtering
```typescript
// Source: https://www.npmjs.com/package/axe-playwright
import { test, expect } from './helpers/a11y-fixture';

test('block only critical/serious violations', async ({ page, makeAxeBuilder }) => {
  await page.goto('/');

  const results = await makeAxeBuilder().analyze();

  // Filter by impact level
  const blockingViolations = results.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );

  const warningViolations = results.violations.filter(
    v => v.impact === 'moderate' || v.impact === 'minor'
  );

  // Block merge on critical/serious
  expect(blockingViolations).toEqual([]);

  // Log warnings but don't block
  if (warningViolations.length > 0) {
    console.warn(`Found ${warningViolations.length} non-blocking violations:`);
    warningViolations.forEach(v => {
      console.warn(`- [${v.impact}] ${v.id}: ${v.description}`);
    });
  }
});
```

### Baseline Fingerprinting
```typescript
// Source: https://playwright.dev/docs/accessibility-testing
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';

type ViolationFingerprint = {
  rule: string;
  targets: string[][];
};

function fingerprintViolations(violations: Result[]): ViolationFingerprint[] {
  return violations.map(violation => ({
    rule: violation.id,
    targets: violation.nodes.map(node => node.target)
  }));
}

test('should not introduce new violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const fingerprints = fingerprintViolations(results.violations);

  // Compare against baseline (stored in .a11y-baseline.json)
  expect(fingerprints).toMatchSnapshot('a11y-baseline.json');
});
```

### Testing Dynamic Content
```typescript
// Source: Community best practices
import { test, expect } from './helpers/a11y-fixture';

test('modal accessibility', async ({ page, makeAxeBuilder }) => {
  await page.goto('/');

  // Test initial page
  const initialResults = await makeAxeBuilder().analyze();
  expect(initialResults.violations).toEqual([]);

  // Open modal
  await page.getByRole('button', { name: /create lobby/i }).click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible' });

  // Test modal content
  const modalResults = await makeAxeBuilder().analyze();
  expect(modalResults.violations).toEqual([]);
});
```

### Detailed Violation Reporting
```typescript
// Source: Community best practices
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';

function formatViolation(violation: Result): string {
  return [
    `[${violation.impact}] ${violation.id}`,
    `Description: ${violation.description}`,
    `Help: ${violation.help}`,
    `Help URL: ${violation.helpUrl}`,
    `Affected elements:`,
    ...violation.nodes.map(node =>
      `  - ${node.target.join(' ')}\n    ${node.failureSummary}`
    )
  ].join('\n');
}

test('accessibility with detailed reporting', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (results.violations.length > 0) {
    console.log('\nAccessibility Violations Found:\n');
    results.violations.forEach(v => console.log(formatViolation(v)));
  }

  expect(results.violations).toEqual([]);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| axe-webdriverio | @axe-core/playwright | 2021 | Native Playwright integration, better async handling |
| Manual rule configuration | withTags() for WCAG levels | axe-core 4.0+ | Easier WCAG compliance targeting |
| Exclude entire pages | Element-level exclude() | axe-core 3.0+ | Granular control over scan scope |
| No baseline support | Violation fingerprinting pattern | 2022+ community | Incremental accessibility improvements |
| HTML-only scanning | Shadow DOM + iframe support | axe-core 4.0+ | Tests modern web components |

**Deprecated/outdated:**
- **axe-playwright package (by abhinaba-ghosh):** Community alternative to @axe-core/playwright. Official package preferred for better support
- **Testing WCAG 2.0 only:** WCAG 2.1 (2018) and 2.2 (2023) add important mobile/touch accessibility criteria
- **Blocking on all violations immediately:** Progressive improvement via fingerprinting is now best practice for legacy apps
- **axe-core v3.x:** Version 4.x (2020+) added shadow DOM support and improved accuracy

## Open Questions

Things that couldn't be fully resolved:

1. **Screenshot highlighting libraries**
   - What we know: axe-playwright-report can screenshot violations with red highlighting
   - What's unclear: Package maintenance status, compatibility with latest Playwright, performance impact on CI
   - Recommendation: Start without screenshot highlighting, add if PR reviewers request visual aids

2. **Incomplete results handling**
   - What we know: Axe-core returns incomplete array for rules requiring manual review
   - What's unclear: Best practice for surfacing incomplete results to team (PR comment? separate report? GitHub Issues?)
   - Recommendation: Log incomplete results in CI output, investigate PR commenting in later iteration

3. **Baseline file format**
   - What we know: Violation fingerprinting pattern uses snapshots with rule ID + targets
   - What's unclear: Should baseline be single file or per-test files? Committed or gitignored?
   - Recommendation: Single committed .a11y-baseline.json file for now, split if it grows large

4. **Third-party widget detection**
   - What we know: Third-party content should be excluded from scans
   - What's unclear: How to automatically detect third-party elements vs. manual exclude list
   - Recommendation: Manual exclude list with documentation, no automatic detection

5. **GitHub Actions PR comment format**
   - What we know: GitHub Actions can comment on PRs with violation summaries
   - What's unclear: Best format for violations (table? list? collapsible sections?), whether to update existing comment or post new ones
   - Recommendation: Follow visual-regression.yml pattern (single comment with failure summary), iterate on format based on team feedback

## Sources

### Primary (HIGH confidence)
- [Playwright Accessibility Testing Documentation](https://playwright.dev/docs/accessibility-testing) - Official Playwright docs with AxeBuilder examples
- [@axe-core/playwright npm package](https://www.npmjs.com/package/@axe-core/playwright) - Official package documentation (v4.11.0)
- [GitHub dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/README.md) - Official source repository
- [Axe API Documentation by Deque](https://www.deque.com/axe/core-documentation/api-documentation/) - Axe-core API reference
- [Axe-core GitHub Repository](https://github.com/dequelabs/axe-core) - Open source accessibility engine

### Secondary (MEDIUM confidence)
- [Accessibility audits with Playwright, Axe, and GitHub Actions](https://dev.to/jacobandrewsky/accessibility-audits-with-playwright-axe-and-github-actions-2504) - CI integration patterns
- [How We Automate Accessibility Testing with Playwright and Axe](https://dev.to/subito/how-we-automate-accessibility-testing-with-playwright-and-axe-3ok5) - Real-world implementation
- [Playwright Report Comment GitHub Action](https://github.com/marketplace/actions/playwright-report-comment) - PR commenting action
- [axe Accessibility Linter VS Code Extension](https://marketplace.visualstudio.com/items?itemName=deque-systems.vscode-axe-linter) - IDE integration
- [Deque University Axe Rules List](https://dequeuniversity.com/rules/axe/4.6) - Rule reference documentation

### Tertiary (LOW confidence)
- [How to Implement Accessibility Testing (OneUpTime blog, Jan 2026)](https://oneuptime.com/blog/post/2026-01-30-accessibility-testing/view) - Recent CI workflow example
- [axe-playwright-report npm package](https://www.npmjs.com/package/axe-playwright) - Screenshot highlighting (unclear maintenance status)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @axe-core/playwright is official Deque package with active maintenance
- Architecture: HIGH - Patterns documented in official Playwright docs and verified in multiple production implementations
- Pitfalls: MEDIUM - Based on community articles and GitHub issues, not official documentation

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - stable domain with mature tooling)
