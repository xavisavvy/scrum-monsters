# Phase 8: Security Hardening - Research

**Researched:** 2026-02-02
**Domain:** Security scanning and hardening in CI/CD pipelines
**Confidence:** HIGH

## Summary

Security hardening for CI/CD involves four layers of protection: static analysis (CodeQL), secret detection (gitleaks + GitHub secret scanning), license compliance (license-checker variants), and dependency vulnerability scanning (npm audit or audit-ci). The standard approach uses free, GitHub-native tools wherever possible with two enforcement points: pre-commit hooks for fast developer feedback and CI checks as unbypassed safety nets.

Key finding: Tools support baseline/differential scanning to block only new issues while tracking existing vulnerabilities. This prevents "noise" from legacy code blocking all PRs while still maintaining security posture improvements over time.

**Primary recommendation:** Use GitHub's native CodeQL with rulesets for severity-based merge blocking, gitleaks in both pre-commit and CI, license-checker for allowlist enforcement, and audit-ci (not npm audit) for granular vulnerability control with advisory suppression.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| github/codeql-action | v3 | Static Application Security Testing (SAST) | GitHub-native, free for public repos, 200+ security queries, integrates with GitHub Security tab |
| gitleaks | v8.24.2+ | Secret detection (pre-commit + CI) | 150+ default patterns, zero false positives focus, TOML configuration, supports baseline files |
| audit-ci | Latest | Dependency vulnerability scanning | Better CI control than npm audit: allowlisting, threshold config, JSON output parsing, multi-package manager support |
| GitHub Secret Scanning | N/A (platform) | Secret detection for public repos | Free, automatic for public repos, 200+ partner patterns, alerts in Security tab |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| license-checker-rseidelsohn | Latest | License compliance scanning | More actively maintained fork of license-checker with better CI exit codes |
| @onebeyond/license-checker | Latest | Alternative license checker | Better --allowOnly flag support for permissive license allowlisting |
| pre-commit framework | Latest | Git hook manager (Python) | Alternative to Husky for teams already using Python tooling |
| advanced-security/dismiss-alerts | N/A (action) | Automated alert dismissal | Baseline suppression via SARIF data for CodeQL alerts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| audit-ci | npm audit --audit-level=high | Simpler but no allowlisting, no advisory suppression, harder to parse JSON output |
| gitleaks | truffleHog, detect-secrets | More detectors but higher false positive rate, gitleaks optimized for accuracy |
| CodeQL queries: security-and-quality | security-extended only | security-and-quality adds maintainability/reliability queries, broader scope but more alerts |

**Installation:**
```bash
npm install --save-dev audit-ci license-checker-rseidelsohn
# gitleaks installed via pre-commit framework or GitHub Action (no npm package needed)
```

## Architecture Patterns

### Recommended Project Structure
```
.github/
├── workflows/
│   ├── security-scan.yml     # CodeQL, license check, secret scan
│   └── ci.yml                # Include vulnerability audit
├── rulesets/                 # Branch protection with code scanning rules
│   └── main-branch.json
└── SECURITY.md               # Security policy, disclosure process

.husky/
├── pre-commit                # Run gitleaks + fast checks
└── commit-msg                # Conventional commits (existing)

.gitleaks.toml                # Custom gitleaks rules, allowlist
.audit-ci.json                # Vulnerability thresholds, allowlist
.licensecheckrc.json          # Approved license list
```

### Pattern 1: Two-Point Secret Detection
**What:** Run secret detection at both pre-commit (developer machine) and CI (GitHub Actions)
**When to use:** Always - pre-commit gives fast feedback, CI is unbypassed safety net
**Example:**
```yaml
# .github/workflows/security-scan.yml
- name: Gitleaks Scan
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GITLEAKS_CONFIG: .gitleaks.toml
```
```bash
# .husky/pre-commit
npx gitleaks protect --staged --verbose
npm test
```

### Pattern 2: Baseline Differential Scanning
**What:** Track existing issues in baseline file, only fail CI on new issues introduced by PR
**When to use:** Large/legacy codebases with existing security debt
**Example:**
```bash
# Initial baseline creation
gitleaks detect --report-path .gitleaks-baseline.json

# CI scan with baseline
gitleaks detect --baseline-path .gitleaks-baseline.json --report-format sarif
```

### Pattern 3: CodeQL with Rulesets for Severity-Based Blocking
**What:** Use GitHub rulesets to block PRs based on CodeQL severity, not workflow exit codes
**When to use:** Always - more granular than workflow-level blocking, supports baseline
**Example:**
```json
// .github/rulesets/main-branch.json (via API or UI)
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"]
    }
  },
  "rules": [
    {
      "type": "code_scanning",
      "parameters": {
        "code_scanning_tools": [
          {
            "tool": "CodeQL",
            "security_alerts_threshold": "high_or_higher",
            "alerts_threshold": "none"
          }
        ]
      }
    }
  ]
}
```

### Pattern 4: Advisory Suppression with audit-ci
**What:** Allow specific known vulnerabilities via config while blocking new high/critical findings
**When to use:** When vulnerability has no fix available or false positive confirmed
**Example:**
```json
// .audit-ci.json
{
  "high": true,
  "critical": true,
  "moderate": false,
  "low": false,
  "advisories": [1234567, 2345678],
  "allowlist": ["package-name"],
  "registry": "https://registry.npmjs.org"
}
```

### Pattern 5: License Allowlist with Fail-Fast
**What:** Enforce permissive licenses only, fail CI immediately on unapproved license
**When to use:** Always for open source projects, especially with many dependencies
**Example:**
```bash
# package.json script
"license-check": "license-checker-rseidelsohn --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC' --production"

# CI workflow
- name: License Check
  run: npm run license-check
```

### Anti-Patterns to Avoid
- **Skip CI on security failures:** Never use `continue-on-error: true` on security scans - defeats purpose
- **Only pre-commit hooks:** Developers can skip with `--no-verify`, must have CI safety net
- **No baseline for existing issues:** Blocking on all existing issues prevents any PRs, use baseline files
- **Ignore transitive dependencies:** Most vulnerabilities are transitive, must scan entire tree
- **Hard-code secrets in examples:** Even example/test secrets trigger scanners, use placeholders like `<YOUR_API_KEY>`

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret detection regex | Custom grep patterns | gitleaks | 150+ patterns, entropy detection, false positive reduction, maintained by security community |
| Vulnerability severity parsing | npm audit JSON parsing | audit-ci | Handles npm v7+ JSON format changes, advisory allowlisting, multi-package manager support |
| License SPDX matching | Custom license text parsing | license-checker variants | Handles complex SPDX expressions (MIT OR Apache-2.0), transitive deps, edge cases |
| CodeQL alert suppression | Custom SARIF filtering | advanced-security/dismiss-alerts | Official GitHub action, handles baseline properly, integrates with Security tab |
| Security baseline tracking | Git diff-based comparison | Tool-native baseline flags | Tools like gitleaks and CodeQL support baseline files natively with proper delta calculation |

**Key insight:** Security tools evolve rapidly with new attack patterns. Custom solutions become outdated, miss edge cases, and create maintenance burden. Use community-maintained tools with active security research backing them.

## Common Pitfalls

### Pitfall 1: Security Scan Fatigue (False Positives)
**What goes wrong:** Too many false positives cause developers to ignore/skip security scans entirely
**Why it happens:** Using overly aggressive query suites (CodeQL security-and-quality), no baseline for legacy code, no allowlist for known safe patterns
**How to avoid:**
- Start with `security-extended` not `security-and-quality` for CodeQL
- Create baseline files for existing issues in legacy codebases
- Use tool-specific allowlists (gitleaks allowlist, audit-ci advisories)
- Review false positives with security team, add to suppressions
**Warning signs:** Developers routinely using `git commit --no-verify`, security scan step showing 100+ findings

### Pitfall 2: Bypassing Pre-Commit Hooks
**What goes wrong:** Developers skip pre-commit checks with `--no-verify`, secrets reach remote repo
**Why it happens:** Pre-commit hooks slow (running full test suite), too strict (blocking on linting), no education
**How to avoid:**
- Keep pre-commit fast (<30 seconds): only staged files, no full build
- Always have CI mirror of pre-commit checks (safety net)
- Educate team: `--no-verify` is for emergency only, CI will catch it
- Make pre-commit valuable: catch issues that would fail CI anyway
**Warning signs:** Frequent CI failures that would have been caught pre-commit, git commit messages with "skip hooks"

### Pitfall 3: Configuration File Drift
**What goes wrong:** `.gitleaks.toml`, `.audit-ci.json` diverge from actual security policy, become stale
**Why it happens:** Allowlist additions without review, no ownership of security config, no periodic audits
**How to avoid:**
- CODEOWNERS file: require security team review for `.gitleaks.toml`, `.audit-ci.json` changes
- Quarterly security config audit: review all suppressions, remove fixed advisories
- Document WHY in comments: each allowlist entry has ticket/rationale
- Expiring suppressions: add dates to allowlist comments, GitHub issue for follow-up
**Warning signs:** `.audit-ci.json` with 50+ suppressed advisories, no comments explaining why

### Pitfall 4: License Check Ignoring Dev Dependencies
**What goes wrong:** License checker only scans production deps, misses GPL dev dependency that could affect build
**Why it happens:** Using `--production` flag without understanding implications, not all dev deps are benign
**How to avoid:**
- Default to scanning all dependencies including dev
- Use `--production` only if build output is verified to not include dev deps
- For SaaS/internal tools, dev dependency licenses rarely matter (no distribution)
- For distributed software/libraries, scan everything
**Warning signs:** GPL library in devDependencies, webpack bundle includes code from dev dep

### Pitfall 5: CodeQL Not Blocking PRs Despite Alerts
**What goes wrong:** CodeQL workflow runs successfully but PRs merge with high severity findings
**Why it happens:** Workflow success != merge blocked; need rulesets, not workflow exit codes
**How to avoid:**
- Use GitHub rulesets with code_scanning rule, not workflow-level blocking
- Set security_alerts_threshold: "high_or_higher" in ruleset
- Test: create PR with intentional vulnerability, verify it's blocked
- Monitor Security tab for alerts bypassing protection
**Warning signs:** Security tab shows critical alerts merged to main, no PR blocking

### Pitfall 6: npm audit JSON Format Breaking CI
**What goes wrong:** CI script parsing npm audit JSON breaks after npm version upgrade
**Why it happens:** npm audit JSON format unstable across versions, no official schema
**How to avoid:**
- Use audit-ci instead of parsing npm audit --json directly
- If parsing directly, test against multiple npm versions in CI matrix
- Pin npm version in CI to avoid surprise breakage
- Monitor npm release notes for audit format changes
**Warning signs:** CI fails after npm version bump, JSON parsing errors, missing fields

### Pitfall 7: Baseline Files Committed Without Review
**What goes wrong:** Developer commits baseline with hidden vulnerabilities, suppressing real issues
**Why it happens:** Baseline creation not reviewed, no approval process, automated baseline updates
**How to avoid:**
- Baseline files require security team review (CODEOWNERS)
- Baseline creation is manual, documented event with ticket
- PR description explains baseline changes with link to security review
- Never auto-update baselines in CI, only human-approved updates
**Warning signs:** Baseline file changes in unrelated PRs, growing baseline without security team awareness

## Code Examples

Verified patterns from official sources:

### CodeQL Workflow with Extended Queries
```yaml
# Source: https://github.com/github/codeql-action
name: CodeQL Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0' # Weekly scan for new queries

permissions:
  contents: read
  security-events: write

jobs:
  analyze:
    name: CodeQL Analysis
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          queries: security-extended

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:javascript-typescript"
```

### Gitleaks Pre-Commit with Husky
```bash
# Source: https://github.com/gitleaks/gitleaks
# .husky/pre-commit

echo "🔒 Running gitleaks secret detection..."

# Install gitleaks if not present (first-time setup)
if ! command -v gitleaks &> /dev/null; then
  echo "gitleaks not found. Install from: https://github.com/gitleaks/gitleaks"
  exit 1
fi

# Scan staged changes only (fast)
gitleaks protect --staged --verbose --redact

# Exit code 1 = leaks found, blocks commit
```

### Gitleaks Configuration with Allowlist
```toml
# Source: https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml
# .gitleaks.toml

title = "ScrumQuest Gitleaks Configuration"

# Extend default rules
[extend]
useDefault = true

# Global allowlist (paths to ignore)
[allowlist]
description = "Allowlisted files"
paths = [
  '''node_modules/''',
  '''\.git/''',
  '''package-lock\.json''',
  '''.*\.md$''',  # Markdown files often have example secrets
  '''.*\.test\.(ts|js)$''',  # Test files may have mock secrets
]

# Regex patterns to ignore (common false positives)
regexes = [
  '''(?i)example''',
  '''(?i)sample''',
  '''(?i)placeholder''',
  '''(?i)<YOUR_.*>''',
  '''(?i)TODO''',
  '''(?i)CHANGEME''',
]

# Example: Disable specific rule if too many false positives
# [[rules]]
# id = "generic-api-key"
# disabled = true
# description = "Disabled due to high false positive rate in our codebase"
```

### audit-ci Configuration with Advisory Suppression
```json
// Source: https://github.com/IBM/audit-ci
// .audit-ci.json
{
  "high": true,
  "critical": true,
  "moderate": false,
  "low": false,
  "package-manager": "auto",
  "advisories": [],
  "allowlist": [],
  "registry": "https://registry.npmjs.org"
}
```

### audit-ci in CI Workflow
```yaml
# Source: https://github.com/IBM/audit-ci
- name: Install dependencies
  run: npm ci

- name: Audit Dependencies
  run: npx audit-ci --config .audit-ci.json
  env:
    # Fail build on high/critical, configured in .audit-ci.json
    CI: true
```

### License Checker with Permissive-Only Allowlist
```bash
# Source: https://github.com/davglass/license-checker
# package.json scripts
{
  "scripts": {
    "license-check": "license-checker-rseidelsohn --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;Unlicense' --production --summary"
  }
}
```

### License Checker in CI
```yaml
- name: Check License Compliance
  run: |
    npm ci
    npx license-checker-rseidelsohn \
      --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC' \
      --production \
      --failOn 'GPL;AGPL;LGPL;CC-BY-NC'
```

### PR Comment with Security Findings
```yaml
# Source: https://github.com/advanced-security/secret-scanning-review-action
- name: Secret Scanning Review
  uses: advanced-security/secret-scanning-review-action@v1
  with:
    fail-on-alert: true
    # Automatically posts PR comment with findings
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| npm audit only | audit-ci with allowlisting | npm v7 (2021) | npm audit JSON format broke, audit-ci handles parsing + adds granular control |
| Branch protection rules | GitHub Rulesets | April 2024 | Rulesets support code scanning severity thresholds, more flexible than status checks |
| CodeQL default queries | security-extended suite | March 2023 | Extended queries catch more issues (broader coverage), slightly higher false positives |
| Manual secret scanning | Automated GitHub secret scanning for public repos | December 2022 | Free secret scanning for all public repos, 200+ partner patterns auto-enabled |
| gitleaks v7 | gitleaks v8 | 2023 | v8 adds baseline support, improved TOML config, better entropy detection |
| license-checker (unmaintained) | license-checker-rseidelsohn fork | 2020+ | Original abandoned, rseidelsohn fork actively maintained with npm 8+ support |

**Deprecated/outdated:**
- **npm audit --parseable**: Deprecated in npm v7, JSON format is standard but unstable - use audit-ci
- **CodeQL action v2**: Use v3, v2 loses support for new CodeQL features and queries
- **gitleaks pre-commit without baseline**: Always use baseline for existing repos to avoid blocking all commits

## Open Questions

Things that couldn't be fully resolved:

1. **Baseline File Maintenance Strategy**
   - What we know: Baseline files track existing issues to avoid blocking PRs, supported by gitleaks and CodeQL
   - What's unclear: Best practice for periodic baseline refresh, who owns baseline updates, when to reset
   - Recommendation: Quarterly security team review of baselines with goal to reduce over time, never auto-update

2. **CodeQL Custom Queries**
   - What we know: CodeQL supports custom queries in QL language for project-specific patterns
   - What's unclear: ROI of custom queries for this project size, maintenance burden, learning curve
   - Recommendation: Start with security-extended built-in queries, only add custom if repeated false negatives

3. **License Exceptions Process**
   - What we know: Some dependencies may have unapproved licenses but are necessary
   - What's unclear: Approval workflow, exception documentation format, periodic re-review
   - Recommendation: Create `.license-exceptions.json` with rationale, require security team approval via CODEOWNERS

4. **GitHub Secret Scanning Push Protection**
   - What we know: GitHub offers push protection (blocks git push with secrets) for public repos but requires opt-in
   - What's unclear: Whether push protection is too aggressive for development workflow, false positive rate
   - Recommendation: Enable after gitleaks pre-commit hook is stable, provides third layer of defense

## Sources

### Primary (HIGH confidence)
- GitHub Docs: [Set code scanning merge protection](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/set-code-scanning-merge-protection) - CodeQL rulesets severity configuration
- GitHub Docs: [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) - Ruleset code_scanning parameters
- GitHub: [gitleaks repository](https://github.com/gitleaks/gitleaks) - Official gitleaks documentation and configuration
- GitHub: [gitleaks config/gitleaks.toml](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml) - Default 150+ secret detection patterns
- GitHub: [codeql-action repository](https://github.com/github/codeql-action) - Official CodeQL action documentation
- npm: [audit-ci package](https://www.npmjs.com/package/audit-ci) - IBM audit-ci documentation
- GitHub: [IBM/audit-ci repository](https://github.com/IBM/audit-ci) - audit-ci configuration examples
- npm: [license-checker package](https://www.npmjs.com/package/license-checker) - Original license-checker documentation
- GitHub Docs: [About secret scanning](https://docs.github.com/code-security/secret-scanning/about-secret-scanning) - Free secret scanning for public repos

### Secondary (MEDIUM confidence)
- GitHub Blog: [Secret scanning is now available for free on public repositories](https://github.blog/changelog/2022-12-15-secret-scanning-is-now-available-for-free-on-public-repositories/) - Public repo secret scanning announcement
- GitHub Changelog: [CodeQL security-extended query suite](https://github.blog/changelog/2023-03-20-you-can-now-use-the-security-extended-query-suite-in-code-scanning-default-setup-with-codeql/) - Extended query suite availability
- GitHub Docs: [CodeQL query suites](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/codeql-query-suites) - Differences between default/extended/quality suites
- Medium: [Securing Your Repositories with gitleaks and pre-commit](https://medium.com/@ibm_ptc_security/securing-your-repositories-with-gitleaks-and-pre-commit-27691eca478d) - Gitleaks + pre-commit integration patterns
- Veracode Docs: [Pipeline Scan baseline files](https://docs.veracode.com/r/Using_a_Pipeline_Scan_Baseline_File) - Baseline scanning best practices (SAST general)
- SentinelOne: [CI/CD Security Scanning: Types & Best Practices](https://www.sentinelone.com/cybersecurity-101/cloud-security/ci-cd-security-scanning/) - Security scanning architecture patterns
- OWASP: [CI CD Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html) - CI/CD security best practices

### Tertiary (LOW confidence)
- Medium: [The easiest way to check all your npm dependency licenses](https://medium.com/@fokusman/the-easiest-way-to-check-all-your-npm-dependency-licenses-753075ef1d9d) - License checker usage patterns
- DEV Community: [Fixing High and Critical Vulnerabilities in npm Using npm audit](https://dev.to/chaudharidevam/fixing-high-and-critical-vulnerabilities-in-npm-using-npm-audit-n6p) - npm audit usage
- GitHub Community Discussion: [npm audit JSON schema](https://github.com/orgs/community/discussions/153882) - npm audit JSON format issues

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools are industry-standard with official documentation and active maintenance
- Architecture: HIGH - Patterns verified with official GitHub documentation and tool maintainers
- Pitfalls: MEDIUM - Based on WebSearch results and general CI/CD security best practices, not project-specific data

**Research date:** 2026-02-02
**Valid until:** 2026-04-02 (60 days - security tools and best practices evolve but core patterns stable)
