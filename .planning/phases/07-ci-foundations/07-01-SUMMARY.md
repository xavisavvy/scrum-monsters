# Phase 07 Plan 01: CI Foundations - PR Templates & Coverage Summary

**One-liner:** PR template folder structure with feature/bugfix/docs variants, CODEOWNERS for auto-assignment, and Vitest coverage thresholds at 12%/9%/9%/12% baseline

---
phase: 07-ci-foundations
plan: 01
subsystem: ci-infrastructure
status: complete
completed: 2026-02-02
duration: 3min
tags: [github, pr-templates, codeowners, vitest, coverage, quality-gates]
---

## What Was Built

This plan established the foundation for PR quality gates by implementing:

1. **PR Template Structure**: Multiple template variants (feature, bugfix, docs) in `.github/PULL_REQUEST_TEMPLATE/` folder, enabling GitHub's template selection dropdown
2. **Code Ownership**: CODEOWNERS file with path-based auto-assignment rules for frontend, backend, shared types, and infrastructure
3. **Coverage Baseline**: Vitest configuration with coverage thresholds set at measured baseline to prevent regression

## Tasks Completed

| Task | Description | Commit | Files Modified |
|------|-------------|--------|----------------|
| 1 | Create PR Templates and CODEOWNERS | a7977ce | .github/PULL_REQUEST_TEMPLATE/feature.md, bugfix.md, docs.md, .github/CODEOWNERS |
| 2 | Configure Vitest Coverage Thresholds | 382d575 | vitest.config.ts |

## Technical Details

### PR Template Design

Created three specialized templates following conventional structure:

**Feature Template** (`feature.md`):
- Summary with issue linking (Fixes #)
- Changes checklist
- Test plan: unit tests, manual testing, browser compatibility
- Quality checklist: style, self-review, warnings, docs, types, breaking changes

**Bugfix Template** (`bugfix.md`):
- Summary with issue linking
- Root Cause section (what caused the bug)
- Solution section (how fix addresses root cause)
- Test plan: regression test, manual reproduction
- Quality checklist: style, self-review, warnings, root cause documentation

**Docs Template** (`docs.md`):
- Summary
- Changes list
- Quality checklist: spelling/grammar, links, code examples, formatting

All templates removed emojis to match project convention and focused on substantive content.

### CODEOWNERS Configuration

Path-based ownership rules:
```
* @Preston                    # Default
/client/ @Preston             # Frontend
*.tsx @Preston                # React components
/server/ @Preston             # Backend
/shared/ @Preston             # Shared types
/k8s/ @Preston                # Infrastructure
/.github/ @Preston            # CI/CD
Dockerfile @Preston           # Container config
```

Pattern precedence: last matching rule wins (per GitHub CODEOWNERS spec).

### Coverage Baseline Establishment

**Measured Current Coverage:**
- Lines: 12.81%
- Branches: 9.09%
- Functions: 9.8%
- Statements: 12.3%

**Configured Thresholds** (floor values):
```typescript
thresholds: {
  lines: 12,
  branches: 9,
  functions: 9,
  statements: 12,
}
```

**Reporter Configuration:**
- Added `json-summary` to reporters array (required for coverage report action in Plan 02)
- Existing reporters maintained: text, json, html
- Output: `coverage/coverage-summary.json` for CI consumption

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| PR template folder structure instead of single template | Enables GitHub template selection dropdown, better PR categorization | PRs can select appropriate template based on change type |
| Delete old single PR template | GitHub ignores folder templates if single template exists at root | Template selection now works correctly |
| Set thresholds at measured baseline (not aspirational) | Prevents blocking all PRs while establishing floor for regression prevention | Coverage can't drop below current levels |
| Include json-summary reporter | Required for coverage report GitHub Action (Plan 02) | Enables automated PR coverage comments |
| CODEOWNERS with single owner (@Preston) | Solo developer project, ownership clarity for future contributors | Auto-assignment ready when team grows |

## Files Changed

### Created
- `.github/PULL_REQUEST_TEMPLATE/feature.md` - Feature PR template with test plan and checklist
- `.github/PULL_REQUEST_TEMPLATE/bugfix.md` - Bugfix PR template with root cause section
- `.github/PULL_REQUEST_TEMPLATE/docs.md` - Documentation PR template
- `.github/CODEOWNERS` - Path-based code ownership rules

### Modified
- `vitest.config.ts` - Added json-summary reporter, configured coverage thresholds

### Deleted
- `.github/pull_request_template.md` - Old single template (replaced by folder structure)

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

### Dependencies Graph

**Requires:**
- v1.1 CI/CD infrastructure (ESLint, Playwright, GitHub Actions workflows)
- Vitest test suite with coverage support

**Provides:**
- PR template selection for standardized PR format
- CODEOWNERS for reviewer auto-assignment
- Coverage baseline configuration (json-summary output)

**Affects:**
- 07-02: Branch Protection & Coverage Reporting (depends on json-summary reporter)
- 08-*: Security Scanning (will use PR templates)
- Future contributors (CODEOWNERS provides ownership clarity)

### Tech Stack Updates

**Added:**
- None (GitHub native features and existing Vitest)

**Patterns Established:**
- PR template categorization (feature/bugfix/docs)
- Coverage threshold as regression floor (not aspirational target)
- Path-based code ownership

### Known Limitations

1. **Low coverage baseline**: Current coverage is only 9-12% across metrics
   - Thresholds set at floor prevent regression
   - Future work should incrementally raise thresholds as coverage improves
   - Per-directory thresholds could target high-value paths (server/domains)

2. **Single owner in CODEOWNERS**: All paths assigned to @Preston
   - Appropriate for solo developer
   - Will need updates when team grows
   - Consider team-based ownership for larger orgs

3. **Template selection requires folder structure**: GitHub's template dropdown only works with PULL_REQUEST_TEMPLATE folder
   - Old single template at root was blocking selection
   - Deletion required for proper functionality

### Blockers/Concerns

None. All prerequisites met, plan completed successfully.

## Metrics

- **Tasks completed:** 2/2
- **Commits:** 2 (1 per task)
- **Files created:** 4
- **Files modified:** 1
- **Files deleted:** 1
- **Duration:** 3 minutes
- **Coverage baseline:** Lines 12.81%, Branches 9.09%, Functions 9.8%, Statements 12.3%
- **Test suite status:** All tests passing (284+ tests)

## Validation

### Success Criteria (All Met)

- [x] PR template folder structure ready for GitHub recognition
- [x] CODEOWNERS ready for auto-assignment when branch protection enabled
- [x] Coverage thresholds configured at baseline (prevents regression)
- [x] json-summary reporter enabled (required for Plan 02)

### Verification Results

```bash
# PR templates exist
$ ls .github/PULL_REQUEST_TEMPLATE/
bugfix.md  docs.md  feature.md

# Old template removed
$ test ! -f .github/pull_request_template.md
✓ Removed successfully

# CODEOWNERS configured
$ grep "@Preston" .github/CODEOWNERS
* @Preston
/client/ @Preston
...

# Coverage tests pass
$ npm run test:coverage
✓ All tests passing
✓ Thresholds met (lines 12%, branches 9%, functions 9%, statements 12%)

# json-summary generated
$ test -f coverage/coverage-summary.json
✓ File exists
```

## References

- **GitHub PR Templates**: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository
- **GitHub CODEOWNERS**: https://docs.github.com/articles/about-code-owners
- **Vitest Coverage**: https://vitest.dev/config/coverage
- **Research**: `.planning/phases/07-ci-foundations/07-RESEARCH.md`
- **Context**: `.planning/phases/07-ci-foundations/07-CONTEXT.md`

---

*Plan completed: 2026-02-02*
*Next: 07-02 Branch Protection & Coverage Reporting*
