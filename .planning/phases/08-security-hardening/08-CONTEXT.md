# Phase 8: Security Hardening - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Catch security issues before code reaches main branch. This includes static analysis (CodeQL), secret detection, license compliance, and dependency vulnerability scanning. All checks run in CI and block PRs that fail configured thresholds.

</domain>

<decisions>
## Implementation Decisions

### Blocking Thresholds
- CodeQL: High and critical severity block merge; medium/low are reported as warnings
- npm audit: Same as CodeQL — high and critical block; moderate/low are warnings
- Baseline existing issues: Track pre-existing issues but don't block; only new issues introduced by PR block merge
- PR comments: Bot posts detailed comment listing issues, severity, and remediation hints

### Secret Detection
- Detection points: Both pre-commit hook AND CI check (pre-commit for fast feedback, CI as unbypassed safety net)
- Tools: gitleaks (pre-commit + CI) plus GitHub's free secret scanning (public repo)
- Scope: All commits checked; historical scanning not required for this phase

### License Policy
- Approved licenses: Permissive only — MIT, Apache-2.0, BSD, ISC
- Unapproved handling: Block PR by default, but allow exceptions via config file for reviewed cases
- Tool: license-checker npm package
- Depth: Check entire dependency tree including transitive dependencies

### Vulnerability Handling
- Scanner: npm audit (built-in, free)
- Auto-fix: PR comments include suggested fix commands (npm audit fix, specific upgrades)
- Transitive deps: Block same as direct — high/critical in any dependency blocks merge
- No-fix cases: Allow exception with audit note in exceptions file; reviewed periodically

### Claude's Discretion
- Exact gitleaks configuration patterns
- PR comment formatting and structure
- Exception file format and location
- How to surface baseline issues in reports

</decisions>

<specifics>
## Specific Ideas

- Must be free tools only (public repo)
- GitHub secret scanning is available since repo is public

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-security-hardening*
*Context gathered: 2026-02-02*
