# Phase 7: CI Foundations - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

PRs have quality gates enforced before merge: reviewer requirements, PR templates, CI status checks, and test coverage enforcement. This establishes the foundation for all subsequent SDLC phases.

</domain>

<decisions>
## Implementation Decisions

### Reviewer Policy
- 1 approval required before merge
- Stale reviews dismissed when new commits pushed
- Author cannot self-approve their own PR
- CODEOWNERS file for auto-assigning reviewers by path
- Admins can bypass branch protection (emergency escape hatch)
- Branches must be up-to-date with main before merging
- All CI checks must pass (lint, type-check, test, build)

### PR Template Design
- Multiple template variants: feature, bugfix, docs
- Templates include: Summary, Test Plan, Checklist sections
- Summary section prompts for linked issues (Fixes #123)

### Coverage Thresholds
- Enforce both line coverage AND branch coverage
- Initial threshold set by measuring current coverage (use as floor)
- Hard fail — PRs cannot merge if coverage drops below threshold

### Coverage Reporting
- PR comments show diff-only coverage (new/modified lines)
- Coverage badge in README showing current percentage
- Use native Vitest coverage (no external service like Codecov)

### Claude's Discretion
- Checklist items for PR templates (testing, types, docs, breaking changes based on project needs)
- Linear history strategy (squash vs rebase vs merge commits)
- Global vs per-directory coverage thresholds
- Whether to show inline annotations on uncovered lines in PR diff

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-ci-foundations*
*Context gathered: 2026-02-02*
