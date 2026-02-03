---
phase: 10-visual-regression
plan: 03
subsystem: ci-cd
tags: [github-actions, docker, playwright, ci, labeler]
requires:
  - phase: 10-02
    provides: visual test specs for lobby, voting, reveal, victory
provides:
  - CI workflow for visual regression testing
  - PR auto-labeling for baseline changes
  - npm scripts for local visual testing
affects:
  - 10-04 (relies on CI infrastructure for baseline generation)
tech-stack:
  added:
    - mcr.microsoft.com/playwright:v1.49.1-noble
    - actions/labeler@v5
  patterns:
    - Docker container for consistent rendering
    - PR comments on test failures with artifact links
    - Auto-labeling PRs based on file changes
key-files:
  created:
    - .github/workflows/visual-regression.yml
    - .github/labeler.yml
    - .github/workflows/label.yml
  modified:
    - package.json
key-decisions:
  - "Docker container ensures consistent font rendering across CI runs"
  - "Visual failures block PR merge (explicit exit 1)"
  - "PR comments provide instructions and artifact links on failure"
  - "Auto-label 'visual-changes' makes baseline updates visible in PRs"
patterns-established:
  - "continue-on-error: true with explicit exit 1 for artifact upload before failure"
  - "Separate artifact uploads for diff report and test results"
  - "actions/github-script for PR comment automation"
metrics:
  duration: 152s
  completed: 2026-02-03
---

# Phase 10 Plan 03: CI Visual Regression Workflow Summary

**GitHub Actions workflow runs visual tests in Docker container, blocks PR merge on failures, uploads diff artifacts, and auto-labels baseline changes**

## Performance

- **Duration:** 2.5 minutes (152 seconds)
- **Started:** 2026-02-03T16:12:33Z
- **Completed:** 2026-02-03T16:15:05Z
- **Tasks:** 3/3
- **Files created:** 3
- **Files modified:** 1

## Accomplishments

- **Visual regression CI workflow:** Runs in mcr.microsoft.com/playwright:v1.49.1-noble Docker container on PRs
- **Merge blocking:** Visual test failures exit 1 after uploading artifacts, preventing PR merge
- **Failure reporting:** PR comments with artifact links and baseline update instructions
- **Auto-labeling:** PRs with baseline PNG changes get 'visual-changes' label
- **Local testing:** npm run test:visual and test:visual:update scripts for developer workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Create visual regression CI workflow** - `35426cc` (feat)
   - Docker container with consistent rendering environment
   - Visual failures block PR merge
   - Artifact upload for diff reports
   - PR comment on failure

2. **Task 2: Configure PR labeler for visual changes** - `452e9d9` (feat)
   - labeler.yml detects PNG changes in e2e snapshots
   - label.yml workflow applies 'visual-changes' label
   - Uses actions/labeler v5

3. **Task 3: Add npm scripts for visual testing** - `1957d7d` (feat)
   - test:visual runs visual tests locally
   - test:visual:update updates baselines
   - Verified with --list (15 tests discovered)

**Plan metadata:** Will be committed in docs(10-03) commit after this summary

## Files Created/Modified

**Created:**
- `.github/workflows/visual-regression.yml` - 78 lines, CI workflow for visual regression
- `.github/labeler.yml` - 7 lines, auto-labeling configuration
- `.github/workflows/label.yml` - 17 lines, labeler workflow

**Modified:**
- `package.json` - Added test:visual and test:visual:update scripts

**Total:** 102 lines of CI/CD configuration

## How It Works

### CI Workflow Execution

```yaml
# .github/workflows/visual-regression.yml
jobs:
  visual-tests:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.49.1-noble
      options: --init --ipc=host
    steps:
      - name: Run visual regression tests
        id: visual-tests
        run: npm run test:visual
        continue-on-error: true

      # Upload artifacts on failure
      - if: steps.visual-tests.outcome == 'failure'
        uses: actions/upload-artifact@v4

      # Comment PR with instructions
      - if: steps.visual-tests.outcome == 'failure'
        uses: actions/github-script@v7

      # Block merge
      - if: steps.visual-tests.outcome == 'failure'
        run: exit 1
```

**Key aspects:**
- **Docker container:** mcr.microsoft.com/playwright:v1.49.1-noble ensures consistent fonts and rendering
- **continue-on-error:** Allows artifact upload before failing
- **Explicit exit 1:** Blocks PR merge on visual regression
- **Two artifacts:** playwright-report/ (HTML diff report) and test-results/ (raw diffs)
- **PR comment:** Provides artifact link and instructions for baseline updates

### PR Auto-Labeling

```yaml
# .github/labeler.yml
visual-changes:
  - changed-files:
    - any-glob-to-any-file: 'e2e/visual-snapshots/**/*.png'
    - any-glob-to-any-file: 'e2e/**/*-snapshots/**/*.png'
```

**Behavior:**
- Detects PNG files in e2e snapshot directories
- Applies 'visual-changes' label to PRs with baseline updates
- Runs on PR open and synchronize events
- Makes intentional UI changes visible in PR list

### Local Development Workflow

```bash
# Run visual tests and compare against baselines
npm run test:visual

# Update baselines after intentional UI change
npm run test:visual:update
git add e2e/**/*-snapshots/
git commit -m "chore: update visual baselines"
```

**Scripts:**
- `test:visual`: playwright test e2e/visual/
- `test:visual:update`: playwright test e2e/visual/ --update-snapshots

**Discovery:** 15 visual tests across 4 spec files (verified with --list)

## Decisions Made

### Decision: Docker Container for Consistent Rendering
**Context:** Font rendering and anti-aliasing differ across host OS and CI environments, causing false positives.

**Options:**
1. Run on host Ubuntu (inconsistent fonts)
2. Docker container with pinned Playwright version
3. Install fonts manually in CI

**Choice:** Option 2 (mcr.microsoft.com/playwright:v1.49.1-noble)

**Rationale:**
- Microsoft's official Playwright image includes all necessary fonts
- Version pinned to v1.49.1 (matches @playwright/test dependency)
- Noble (Ubuntu 24.04) is latest stable base
- Eliminates font rendering variance between CI and local Docker runs
- Research (10-RESEARCH.md) identified Docker as best practice for visual testing

### Decision: continue-on-error + Explicit exit 1
**Context:** Need to upload artifacts before failing the job, but also need to block PR merge.

**Choice:** Set `continue-on-error: true` on test step, then `exit 1` in final step

**Rationale:**
- continue-on-error prevents immediate job failure
- Allows artifact upload and PR comment steps to run
- Final `exit 1` ensures job fails and blocks PR merge
- Alternative approaches (always() conditions) are more complex
- Pattern from GitHub Actions best practices documentation

### Decision: Two Separate Artifacts
**Context:** Playwright generates both HTML report (playwright-report/) and raw test results (test-results/).

**Choice:** Upload both as separate artifacts

**Rationale:**
- **playwright-report/**: Human-friendly HTML diff report for developers
- **test-results/**: Raw screenshots and diffs for debugging
- Separate retention policies possible if needed
- Small storage cost (7-day retention, only on failure)
- Provides complete information for investigating regressions

### Decision: Auto-Label Visual Changes
**Context:** PRs with baseline updates are important to review carefully, but not every baseline change is suspicious.

**Options:**
1. No labeling (baseline changes blend in)
2. Require manual approval for visual-changes label
3. Auto-label visual-changes (informational only)

**Choice:** Option 3 (auto-label, no special approval)

**Rationale:**
- Makes baseline updates visible in PR list
- Reviewers can see at a glance which PRs change UI
- No friction for legitimate UI changes
- Complements CI blocking (failures still block, label is informational)
- CONTEXT.md specified "no special approval required"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully.

## Next Phase Readiness

**Blockers:** None

**Ready for 10-04:** Not applicable - this is the final plan in phase 10 per STATE.md

**Notes:**
- CI workflow is ready to run on next PR
- No baselines exist yet - first run will generate them
- Pre-existing TypeScript errors noted in 10-01-SUMMARY.md remain (not introduced by this plan)
- Husky deprecation warning in pre-commit output (v10 breaking change, noted in STATE.md)

**Recommendations:**
- Generate baselines by running npm run test:visual locally in Docker or on first CI run
- Commit baselines to repository for PR comparison
- Monitor CI runs for flakiness - adjust thresholds if needed
- Consider Git LFS if baseline count exceeds 50 images

## Testing Strategy

**Verification performed:**
1. ✅ Workflow file exists (.github/workflows/visual-regression.yml)
2. ✅ Docker container config present (mcr.microsoft.com/playwright:v1.49.1-noble)
3. ✅ Labeler config exists (.github/labeler.yml with visual-changes)
4. ✅ Label workflow exists (.github/workflows/label.yml)
5. ✅ npm scripts work (npm run test:visual -- --list discovered 15 tests)
6. ✅ Scripts in package.json (test:visual and test:visual:update)

**Not tested in this plan:**
- Actual CI execution (requires PR creation)
- Artifact upload (requires test failure)
- PR comment posting (requires test failure)
- Auto-labeling (requires PNG file changes in PR)
- Baseline comparison (requires baselines to exist)

**Testing deferred to:**
- CI execution will be validated on next PR with UI changes
- Baseline generation workflow in 10-04 (if separate plan) or first PR

## Documentation

**CI Workflow Features:**
- Runs on PR to main branch
- Ignores markdown and docs changes
- Concurrency group cancels in-progress runs
- 7-day artifact retention
- PR write permissions for comments

**PR Comment Template:**
```markdown
### Visual Regression Tests Failed

Screenshots differ from baselines. Please review the changes:

1. [Download diff report](link) (Artifacts section)
2. If changes are intentional: `npm run test:visual:update` and commit updated baselines
3. If changes are unintentional: Fix the UI regression

See [visual testing docs](https://playwright.dev/docs/test-snapshots) for more info.
```

**Inline Comments:**
- visual-regression.yml explains each step's purpose
- labeler.yml documents auto-labeling behavior
- Both glob patterns in labeler.yml for flexibility

## Risk Assessment

**Low risk:**
- CI workflow only runs on PRs (no impact on main branch)
- Visual tests are additive (existing E2E tests unaffected)
- Labeler is informational only (no workflow blocking)
- npm scripts are opt-in

**No breaking changes:**
- Existing CI workflows (e2e.yml, ci.yml) continue to run independently
- No changes to production code or test infrastructure

**Future considerations:**
- Monitor CI runtime - visual tests may add 2-5 minutes to PR checks
- Adjust maxDiffPixelRatio if flakiness occurs (currently 1% global, 2% for voting)
- Implement Git LFS if baseline count grows large (>100 images)
- Enable skipped tests (reveal, victory) when full game flow is testable

## Artifacts

**GitHub Actions Workflows:**
- `.github/workflows/visual-regression.yml` - Visual regression CI workflow
- `.github/workflows/label.yml` - PR auto-labeling workflow

**Configuration:**
- `.github/labeler.yml` - Labeling rules for visual-changes

**npm Scripts:**
- `test:visual` - Run visual tests locally
- `test:visual:update` - Update baselines after UI changes

**Dependencies:**
- Requires: e2e/visual/*.visual.spec.ts (from 10-02)
- Requires: e2e/helpers/visual-helpers.ts (from 10-01)
- Requires: playwright.config.ts visual settings (from 10-01)

## What's Next

**Phase 10 Progress:** 3 of 3 plans complete

**Phase 10 Complete:**
- ✅ 10-01: Visual regression configuration (thresholds, viewports, masking)
- ✅ 10-02: Visual test specs (lobby, voting, reveal, victory)
- ✅ 10-03: CI workflow integration (Docker, PR blocking, auto-labeling)

**After Phase 10:**
- Phase 11: Drizzle migrations (already complete per STATE.md, phases 09-01 through 09-03)
- Phase 12: API contract testing with OpenAPI validation
- Phase 13: Load testing with k6 performance baselines
- Phase 14: Accessibility testing with axe-core in E2E

**Milestone Progress:**
- v1.2 SDLC Best Practices: 9 plans complete (07-01 through 10-03)
- Remaining: API contracts, load testing, accessibility, changelog, rollback automation

---
*Phase: 10-visual-regression*
*Completed: 2026-02-03*
