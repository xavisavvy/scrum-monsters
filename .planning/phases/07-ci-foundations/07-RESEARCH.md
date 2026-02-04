# Phase 7: CI Foundations - Research

**Researched:** 2026-02-02
**Domain:** GitHub Branch Protection, PR Templates, Vitest Coverage, GitHub Actions
**Confidence:** HIGH

## Summary

This phase establishes CI quality gates for the ScrumQuest repository. The research covers four main areas: (1) GitHub branch protection rules for reviewer requirements and status checks, (2) PR templates for standardized contribution format, (3) Vitest coverage thresholds to enforce minimum test coverage, and (4) GitHub Actions for coverage reporting in PR comments with badges.

The project already has a working CI infrastructure (ci.yml, pr-checks.yml) with lint, type-check, test, and build jobs. The existing test coverage is very low (most files at 0%, some server/domains files at 64-91%), so the initial threshold should be set at current levels to establish a floor without blocking all PRs. The project also has an existing PR template that needs updating to match the multi-template structure decided upon.

**Primary recommendation:** Use GitHub branch protection rules (not rulesets) for simplicity, configure Vitest with `thresholds` for coverage enforcement, and use `davelosert/vitest-coverage-report-action` for PR comments and comparison against main.

## Standard Stack

The established tools for this domain:

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Branch Protection | N/A | Enforce reviewer approval, status checks | Native GitHub feature, no external deps |
| Vitest Coverage | v4.x | Test coverage with thresholds | Already in use, v8 provider configured |
| davelosert/vitest-coverage-report-action | v2 | PR coverage comments | Purpose-built for Vitest, actively maintained |
| schneegans/dynamic-badges-action | v1.7.0 | Coverage badge generation | Shields.io compatible, gist-based storage |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| CODEOWNERS | N/A | Auto-assign reviewers by path | When team grows, ownership clarity needed |
| GitHub Rulesets | N/A | Advanced branch rules | Only if branch protection insufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| davelosert action | codecov, coveralls | External service dependency, more features but overkill for this project |
| dynamic-badges-action | gist-based manual | More control but more maintenance |
| Branch protection | Rulesets | Rulesets are more powerful but complex; protection rules sufficient for single-branch protection |

**No installation needed** - all tools are GitHub-native or GitHub Actions.

## Architecture Patterns

### Recommended File Structure
```
.github/
├── CODEOWNERS                       # Auto-assign reviewers
├── pull_request_template.md         # Remove (replaced by folder)
├── PULL_REQUEST_TEMPLATE/
│   ├── feature.md                   # Feature PR template
│   ├── bugfix.md                    # Bugfix PR template
│   └── docs.md                      # Documentation PR template
└── workflows/
    ├── ci.yml                       # Existing - add coverage thresholds
    └── coverage.yml                 # New - coverage reporting (optional separate workflow)
```

### Pattern 1: Coverage Threshold Enforcement
**What:** Vitest thresholds fail CI when coverage drops below configured percentage
**When to use:** Every PR to prevent coverage regression
**Example:**
```typescript
// vitest.config.ts
// Source: https://vitest.dev/config/coverage
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "node_modules",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/test/**",
      ],
      thresholds: {
        // Set these to current coverage (floor) after measuring
        lines: 10,      // Placeholder - measure actual
        branches: 10,   // Placeholder - measure actual
        functions: 10,  // Placeholder - measure actual
        statements: 10, // Placeholder - measure actual
      },
    },
  },
});
```

### Pattern 2: Coverage Report Action
**What:** Post coverage summary and diff as PR comment
**When to use:** On every PR to show coverage impact
**Example:**
```yaml
# Source: https://github.com/davelosert/vitest-coverage-report-action
- name: Run tests with coverage
  run: npx vitest run --coverage.enabled true

- name: Report Coverage
  if: always()
  uses: davelosert/vitest-coverage-report-action@v2
  with:
    file-coverage-mode: changes  # Only show changed files
```

### Pattern 3: CODEOWNERS for Auto-Assignment
**What:** Automatically request reviewers based on file paths changed
**When to use:** To ensure domain experts review relevant code
**Example:**
```
# .github/CODEOWNERS
# Source: https://docs.github.com/articles/about-code-owners

# Default - all files
* @Preston

# Frontend ownership
/client/ @Preston
*.tsx @Preston
*.css @Preston

# Backend ownership
/server/ @Preston

# Shared types
/shared/ @Preston

# Infrastructure
/k8s/ @Preston
/.github/ @Preston
Dockerfile @Preston
```

### Anti-Patterns to Avoid
- **Setting thresholds too high initially:** Will block all PRs if current coverage is low. Start with current coverage as floor.
- **Using single PR template when multiple exist:** GitHub ignores additional templates unless properly structured in folder.
- **Forgetting json-summary reporter:** Coverage report action requires json-summary format.
- **Not dismissing stale reviews:** Allows outdated approvals to persist after code changes.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PR coverage comments | Custom action parsing coverage | davelosert/vitest-coverage-report-action | Handles all edge cases, fork PRs, comment updates |
| Coverage badges | Manual gist updates | schneegans/dynamic-badges-action | Automatic updates, shields.io compatible |
| Reviewer assignment | Manual @mentions | CODEOWNERS file | Automatic, path-based, team-aware |
| Status check enforcement | Manual review | Branch protection rules | Native GitHub, reliable, UI-configurable |
| Coverage diff calculation | Custom scripts | Coverage report action | Handles base branch comparison automatically |

**Key insight:** GitHub provides native features for branch protection and CODEOWNERS; external actions like davelosert's are mature and handle the many edge cases of GitHub Actions permissions, fork PRs, and comment threading.

## Common Pitfalls

### Pitfall 1: Coverage Threshold Set Too High
**What goes wrong:** CI fails on every PR because coverage is below threshold
**Why it happens:** Setting aspirational thresholds instead of measuring current state
**How to avoid:** Run `npm run test:coverage`, note current percentages, use those as initial thresholds
**Warning signs:** PRs failing immediately after threshold implementation

### Pitfall 2: Fork PRs Can't Comment
**What goes wrong:** Coverage report action fails silently on PRs from forks
**Why it happens:** Forks don't have write permissions by default
**How to avoid:** Use two-workflow pattern: test.yml runs on PR, coverage.yml runs on workflow_run with write permissions
**Warning signs:** Coverage comments missing on external contributor PRs

### Pitfall 3: Single PR Template Overrides Folder
**What goes wrong:** Multiple templates in PULL_REQUEST_TEMPLATE/ folder are ignored
**Why it happens:** A top-level pull_request_template.md takes precedence
**How to avoid:** Delete or move the single template file when using the folder structure
**Warning signs:** Only one template showing, dropdown not appearing

### Pitfall 4: Stale Reviews Not Dismissed
**What goes wrong:** Code changes after approval but approval persists
**Why it happens:** Branch protection doesn't dismiss stale reviews by default
**How to avoid:** Enable "Dismiss stale pull request approvals when new commits are pushed"
**Warning signs:** Approved PRs merged with different code than reviewed

### Pitfall 5: Missing json-summary Reporter
**What goes wrong:** Coverage report action fails with "file not found"
**Why it happens:** Vitest config only has text/html reporters, not json-summary
**How to avoid:** Add "json-summary" and "json" to coverage.reporter array
**Warning signs:** Action error about coverage-summary.json missing

### Pitfall 6: Admin Bypass Without Documentation
**What goes wrong:** Team members bypass protections without emergency documentation
**Why it happens:** Admins can always bypass, no audit trail
**How to avoid:** Document when admin bypass is acceptable, consider requiring PR for bypass justification
**Warning signs:** Direct pushes to main appearing in git log

## Code Examples

Verified patterns from official sources:

### Branch Protection Configuration (UI-based)
```markdown
Settings > Branches > Add branch protection rule

Branch name pattern: main

[x] Require a pull request before merging
    [x] Require approvals: 1
    [x] Dismiss stale pull request approvals when new commits are pushed
    [ ] Require review from Code Owners (enable when CODEOWNERS added)

[x] Require status checks to pass before merging
    [x] Require branches to be up to date before merging
    Status checks that are required:
      - CI Success (from ci.yml)
      - Validate PR Title (from pr-checks.yml)

[x] Require linear history (if squash merge preferred)

[x] Do not allow bypassing the above settings
    OR
[x] Allow specified actors to bypass (for emergency)
```

### Vitest Coverage Configuration
```typescript
// vitest.config.ts
// Source: https://vitest.dev/config/coverage
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./client/src/test/setup.ts"],
    include: [
      "client/src/**/*.{test,spec}.{ts,tsx}",
      "server/**/*.{test,spec}.ts",
      "shared/**/*.{test,spec}.ts",
    ],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "node_modules",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/test/**",
      ],
      thresholds: {
        lines: 10,       // Set to current coverage floor
        branches: 10,    // Set to current coverage floor
        functions: 10,   // Set to current coverage floor
        statements: 10,  // Set to current coverage floor
      },
    },
  },
});
```

### CI Workflow with Coverage Reporting
```yaml
# .github/workflows/ci.yml (modified test job)
# Source: https://github.com/davelosert/vitest-coverage-report-action

test:
  name: Test
  runs-on: ubuntu-latest
  timeout-minutes: 15
  permissions:
    contents: read
    pull-requests: write  # Required for coverage comments

  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: "npm"

    - name: Install dependencies
      run: npm ci

    - name: Run tests with coverage
      run: npx vitest run --coverage.enabled true

    - name: Report Coverage
      if: always() && github.event_name == 'pull_request'
      uses: davelosert/vitest-coverage-report-action@v2
      with:
        file-coverage-mode: changes

    - name: Upload coverage report
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: coverage-report
        path: coverage/
        retention-days: 7
```

### Coverage Badge Workflow
```yaml
# Add to ci.yml (on push to main only)
# Source: https://github.com/schneegans/dynamic-badges-action

update-coverage-badge:
  name: Update Coverage Badge
  runs-on: ubuntu-latest
  needs: [test]
  if: github.ref == 'refs/heads/main'

  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Download coverage artifact
      uses: actions/download-artifact@v4
      with:
        name: coverage-report
        path: coverage

    - name: Extract coverage percentage
      id: coverage
      run: |
        COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json)
        echo "percentage=$COVERAGE" >> $GITHUB_OUTPUT

    - name: Update coverage badge
      uses: schneegans/dynamic-badges-action@v1.7.0
      with:
        auth: ${{ secrets.GIST_SECRET }}
        gistID: <your-gist-id>
        filename: coverage.json
        label: coverage
        message: ${{ steps.coverage.outputs.percentage }}%
        valColorRange: ${{ steps.coverage.outputs.percentage }}
        maxColorRange: 90
        minColorRange: 50
```

### CODEOWNERS File
```
# .github/CODEOWNERS
# Source: https://docs.github.com/articles/about-code-owners
#
# Order matters: last matching pattern takes precedence
# Each line: pattern owner1 @owner2 @org/team

# Default owner for everything
* @Preston

# Frontend
/client/ @Preston
*.tsx @Preston
*.css @Preston

# Backend
/server/ @Preston

# Shared types and contracts
/shared/ @Preston

# Infrastructure and CI
/k8s/ @Preston
/.github/ @Preston
Dockerfile @Preston
docker-compose.yml @Preston

# Documentation
*.md @Preston
/docs/ @Preston
```

### PR Template: Feature
```markdown
<!-- .github/PULL_REQUEST_TEMPLATE/feature.md -->
## Summary

<!-- Brief description of the feature -->

Fixes #

## Changes

<!-- List the key changes -->
-

## Test Plan

<!-- How was this tested? -->
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Tested on multiple browsers (if UI)

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] No new warnings or errors
- [ ] Documentation updated (if needed)
- [ ] Types are correct and complete
```

### PR Template: Bugfix
```markdown
<!-- .github/PULL_REQUEST_TEMPLATE/bugfix.md -->
## Summary

<!-- Brief description of the bug and fix -->

Fixes #

## Root Cause

<!-- What caused this bug? -->

## Solution

<!-- How does this fix address the root cause? -->

## Test Plan

<!-- How was this tested? How do we know the bug is fixed? -->
- [ ] Regression test added
- [ ] Manual reproduction attempted (now fails to reproduce)

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] No new warnings or errors
- [ ] Root cause documented in comments if non-obvious
```

### PR Template: Docs
```markdown
<!-- .github/PULL_REQUEST_TEMPLATE/docs.md -->
## Summary

<!-- What documentation is being added/updated? -->

## Changes

<!-- List the documentation changes -->
-

## Checklist

- [ ] Spelling and grammar checked
- [ ] Links verified
- [ ] Code examples tested (if any)
- [ ] Formatting renders correctly
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Branch protection rules only | Rulesets available | 2023 | Rulesets allow multiple rules per branch, more granular control |
| External coverage services (Codecov) | Native Vitest + GitHub Actions | 2024+ | Reduced external dependencies, faster feedback |
| Single PR template | Multiple template folder | Always available | Better PR categorization |

**Deprecated/outdated:**
- Codecov/Coveralls for small projects: Overkill, adds external dependency when Vitest + GitHub Actions suffice
- Manual badge updates: Dynamic badges action automates this

## Claude's Discretion Recommendations

Based on the context decisions, here are recommendations for areas left to Claude's discretion:

### 1. PR Template Checklist Items
**Recommendation:** Include these checklist items across templates:
- Testing: "Unit tests added/updated", "No test regressions"
- Types: "TypeScript types correct and complete"
- Documentation: "Documentation updated (if needed)"
- Breaking changes: "Breaking changes documented in summary" (feature template only)

### 2. Linear History Strategy
**Recommendation:** Use **squash merge** for these reasons:
- Keeps main branch clean with one commit per PR
- Hides WIP commits and fixups
- PR title becomes commit message (already validated by semantic PR action)
- Easier to revert entire features
- Configure: Settings > General > "Allow squash merging" only

### 3. Global vs Per-Directory Thresholds
**Recommendation:** Start with **global thresholds** initially:
- Simpler to configure and understand
- Per-directory thresholds can be added later as coverage improves
- Current coverage is very low, global floor is appropriate first step

### 4. Inline Annotations on Uncovered Lines
**Recommendation:** **Do not show** inline annotations initially:
- Can be noisy with low coverage
- The file-level report in PR comments is sufficient
- Can enable later when coverage baseline improves
- Coverage report action's `file-coverage-mode: changes` already focuses on changed files

## Open Questions

Things that couldn't be fully resolved:

1. **Exact Current Coverage Thresholds**
   - What we know: Coverage is very low (most files 0%, some server/domains at 60-90%)
   - What's unclear: Exact aggregate percentages for lines/branches/functions/statements
   - Recommendation: Run `npm run test:coverage` and extract json-summary totals before setting thresholds

2. **Gist ID for Coverage Badge**
   - What we know: Dynamic badges action needs a gist ID
   - What's unclear: Whether to create new gist or use existing
   - Recommendation: Create new public gist named "scrumquest-coverage", add ID to workflow

3. **Fork PR Coverage Reporting**
   - What we know: External PRs from forks can't get coverage comments with simple setup
   - What's unclear: Whether ScrumQuest expects external contributors
   - Recommendation: Start with simple setup; add two-workflow pattern if external PRs become common

## Sources

### Primary (HIGH confidence)
- [Vitest Coverage Configuration](https://vitest.dev/config/coverage) - Thresholds, reporters, perFile options
- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule) - Protection rule configuration
- [GitHub CODEOWNERS](https://docs.github.com/articles/about-code-owners) - Syntax, patterns, precedence rules
- [davelosert/vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action) - Full usage, inputs, workflow examples
- [GitHub PR Templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository) - Single and multiple template setup

### Secondary (MEDIUM confidence)
- [schneegans/dynamic-badges-action](https://github.com/marketplace/actions/dynamic-badges) - Coverage badge generation
- [GitHub Actions Permissions](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token) - pull-requests: write for comments
- [GitHub Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) - Alternative to branch protection

### Tertiary (LOW confidence)
- WebSearch results on linear history best practices - Multiple sources agree on squash merge for clean history

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools are official GitHub features or well-documented GitHub Actions
- Architecture: HIGH - Patterns verified from official documentation
- Pitfalls: HIGH - Common issues documented in action READMEs and GitHub docs

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days - GitHub features stable, Vitest mature)
