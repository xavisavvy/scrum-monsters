---
phase: 08-security-hardening
plan: 01
subsystem: ci-security
tags: [codeql, gitleaks, secret-detection, security-gates, github-rulesets]
requires:
  - 07-02  # Branch protection rules (PR workflow foundation)
provides:
  - codeql-merge-blocking  # High/critical findings block PRs
  - two-point-secret-detection  # Pre-commit + CI gitleaks scanning
  - security-scan-workflow  # Automated secret detection in CI
affects:
  - 08-02  # Dependency vulnerability scanning (similar security workflow pattern)
  - 08-03  # License compliance (similar CI workflow pattern)
tech-stack:
  added:
    - gitleaks  # Secret detection tool (pre-commit + CI)
    - gitleaks-action  # GitHub Action for gitleaks integration
  patterns:
    - github-rulesets  # API-based repository rule management
    - two-point-validation  # Local pre-commit + CI safety net pattern
decisions:
  - id: SEC-01
    title: "CodeQL blocks high/critical security findings only"
    rationale: "Quality findings are informational; only security issues block merge"
    scope: "GitHub ruleset code_scanning rule"
  - id: SEC-02
    title: "Two-point secret detection with graceful fallback"
    rationale: "Pre-commit for fast feedback, CI as unbypassed safety net; no local blocking if gitleaks not installed"
    scope: "Pre-commit hook and CI workflow"
key-files:
  created:
    - .gitleaks.toml
    - .github/workflows/security-scan.yml
    - .github/rulesets/README.md
  modified:
    - .husky/pre-commit
metrics:
  duration: 3 minutes
  completed: 2026-02-02
  commits: 2
---

# Phase 08 Plan 01: Security Scanning Configuration Summary

**One-liner:** CodeQL merge blocking via GitHub ruleset + two-point gitleaks secret detection (pre-commit + CI)

## What Was Built

### CodeQL Merge Blocking (SEC-01)
Created GitHub repository ruleset "security-gates" via API to block PRs to main branch when CodeQL detects high or critical security findings. Ruleset enforces code_scanning rule with:
- `security_alerts_threshold: high_or_higher` (blocks high/critical)
- `alerts_threshold: none` (quality findings don't block)

Ruleset integrates with existing `.github/workflows/codeql.yml` (no changes needed).

### Two-Point Secret Detection (SEC-02)
Implemented gitleaks scanning at two points in the development workflow:

**1. Pre-commit Hook (.husky/pre-commit)**
- Runs `gitleaks protect --staged` on staged files
- Graceful fallback if gitleaks not installed (warns but doesn't block)
- Fast feedback loop for developers who install gitleaks locally

**2. CI Workflow (.github/workflows/security-scan.yml)**
- Runs on all pushes to main and PRs
- Uses `gitleaks/gitleaks-action@v2`
- Full repository scan with PR annotations
- Unbypassed safety net (catches secrets even if pre-commit skipped)

**3. Configuration (.gitleaks.toml)**
- Extends default gitleaks rules (`useDefault = true`)
- Allowlists: node_modules, .git, package-lock.json, markdown, test files
- Regex allowlists: example/sample/placeholder patterns, test API keys
- Custom rule for hardcoded localhost credentials

## Decisions Made

**1. GitHub Ruleset vs. Branch Protection Rules**
- **Decision:** Use GitHub Rulesets API for CodeQL enforcement
- **Rationale:** Rulesets support code_scanning rules with granular severity thresholds; branch protection doesn't
- **Impact:** More flexible security policy enforcement

**2. Graceful Gitleaks Fallback**
- **Decision:** Pre-commit hook warns but doesn't block if gitleaks not installed
- **Rationale:** CI is the safety net; local blocking would frustrate developers without gitleaks installed
- **Impact:** Better developer experience while maintaining security guarantee

**3. Security vs. Quality Alerts**
- **Decision:** Only security findings block merge; quality findings are informational
- **Rationale:** CodeQL quality findings often subjective; security findings are objective risks
- **Impact:** Focused security enforcement without developer friction on code style

## Technical Implementation

### GitHub Ruleset Creation
Used `gh api` to create ruleset via REST API:

```bash
gh api -X POST repos/xavisavvy/scrum-monsters/rulesets --input ruleset.json
```

Ruleset JSON structure:
- `target: "branch"` (applies to branch pushes/PRs)
- `enforcement: "active"` (blocks non-compliant PRs)
- `conditions.ref_name.include: ["refs/heads/main"]` (main branch only)
- `rules[].type: "code_scanning"` (CodeQL integration)

Documented in `.github/rulesets/README.md` for reference (ruleset lives in GitHub, not files).

### Gitleaks Configuration
TOML-based configuration extending default rules:

```toml
[extend]
useDefault = true

[allowlist]
paths = ['''node_modules/.*''', ...]
regexes = ['''(example|sample|placeholder)''', ...]
```

### Pre-commit Integration
Updated existing hook (previously just ran `npm test`):

```bash
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --verbose --redact
else
  echo "Warning: gitleaks not installed..."
fi
npm test
```

### CI Workflow
New workflow file with gitleaks-action:

```yaml
- uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GITLEAKS_CONFIG: .gitleaks.toml
    GITLEAKS_ENABLE_COMMENTS: true
```

## Requirements Satisfied

- **SEC-01:** CodeQL merge blocking configured (high/critical findings block PRs)
- **SEC-02:** Two-point secret detection implemented (pre-commit + CI)
- **Must-have truths:**
  - ✅ PRs with high/critical CodeQL findings cannot merge
  - ✅ Commits with secrets are rejected before push (if gitleaks installed)
  - ✅ Gitleaks runs in CI as unbypassed safety net
- **Must-have artifacts:**
  - ✅ .gitleaks.toml exists with useDefault = true
  - ✅ .husky/pre-commit contains "gitleaks"
  - ✅ .github/workflows/security-scan.yml uses gitleaks-action
- **Must-have links:**
  - ✅ Pre-commit hook uses .gitleaks.toml config
  - ✅ Security scan workflow references GITLEAKS_CONFIG

## Deviations from Plan

### Auto-added Documentation
**[Rule 2 - Missing Critical]** Added `.github/rulesets/README.md` documentation

- **Found during:** Task 1 (GitHub ruleset creation)
- **Issue:** Ruleset created via API has no file representation; future developers won't know it exists
- **Fix:** Created README documenting ruleset ID, configuration, purpose, and verification command
- **Files created:** `.github/rulesets/README.md`
- **Commit:** 6bf5449
- **Rationale:** Documentation is critical for maintainability; undocumented API-created rulesets are invisible

## Integration Points

### Existing Systems
- **CodeQL Workflow (.github/workflows/codeql.yml):** Ruleset consumes CodeQL scan results; no workflow changes needed
- **Branch Protection Rules (07-02):** Ruleset augments existing protection (PR approval, CI checks); both enforce together
- **Pre-commit Hook (.husky/pre-commit):** Already ran `npm test`; now also runs gitleaks before tests

### Future Systems
- **08-02 (Dependency Scanning):** Will follow similar security-scan.yml workflow pattern
- **08-03 (License Compliance):** Will add license-checker to security-scan.yml workflow

## Testing & Verification

**CodeQL Ruleset:**
```bash
gh api repos/xavisavvy/scrum-monsters/rulesets --jq '.[] | select(.name=="security-gates")'
# Returns ruleset with id: 12393135, enforcement: active
```

**Gitleaks Configuration:**
```bash
cat .gitleaks.toml | head -20
# Shows [extend] useDefault = true and allowlist configuration
```

**Pre-commit Hook:**
```bash
grep -c "gitleaks" .husky/pre-commit
# Returns 4 (gitleaks mentioned in hook)
```

**Security Scan Workflow:**
```bash
ls -la .github/workflows/security-scan.yml
# File exists, committed in 779d1ff
```

## Files Changed

**Created:**
- `.gitleaks.toml` - Gitleaks configuration with default rules and allowlists
- `.github/workflows/security-scan.yml` - CI workflow for secret detection
- `.github/rulesets/README.md` - Documentation for API-created GitHub ruleset

**Modified:**
- `.husky/pre-commit` - Added gitleaks secret detection before tests

**API Created:**
- GitHub Ruleset "security-gates" (ID: 12393135) - Blocks high/critical CodeQL findings on main branch

## Next Phase Readiness

**Blockers:** None

**Concerns:**
- Gitleaks not installed locally for most developers (expected - CI is safety net)
- Husky deprecation warning in pre-commit output (husky v10 breaking change; needs addressing in future maintenance)

**Recommendations for 08-02 (Dependency Scanning):**
- Follow similar workflow pattern (add to security-scan.yml or create separate workflow)
- Use existing PR comment pattern for vulnerability reports
- Consider npm audit cache to avoid rate limiting

## Commit Log

| Commit  | Type | Description                                   |
| ------- | ---- | --------------------------------------------- |
| 6bf5449 | feat | Configure CodeQL merge blocking via ruleset   |
| 779d1ff | feat | Implement two-point secret detection with gitleaks |

---

**Phase:** 08-security-hardening
**Plan:** 01
**Completed:** 2026-02-02
**Duration:** 3 minutes
