# GitHub Rulesets

This directory documents GitHub rulesets configured via the GitHub API.

## security-gates

Created via GitHub API (ruleset ID: 12393135)

**Purpose:** Block PRs to main branch with high/critical CodeQL security findings

**Configuration:**
- Target: `refs/heads/main`
- Enforcement: Active
- Rule: CodeQL code scanning
  - Security alerts threshold: `high_or_higher`
  - Alerts threshold: `none` (only security alerts block, not quality alerts)

**Created:** 2026-02-02
**API Endpoint:** `/repos/xavisavvy/scrum-monsters/rulesets/12393135`

**Verification:**
```bash
gh api repos/xavisavvy/scrum-monsters/rulesets --jq '.[] | select(.name=="security-gates")'
```
