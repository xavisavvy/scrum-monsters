# Phase 10: Visual Regression - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Screenshot-based UI change detection for the critical game flow. CI captures screenshots at key UI states, compares against committed baselines, and reports differences in PR comments. Baseline updates require explicit developer action.

</domain>

<decisions>
## Implementation Decisions

### Screenshot coverage
- Critical paths only: lobby creation, voting screen, reveal, victory — the core game flow
- Capture at both phase transitions and key user actions (join, vote, reveal click)
- Include 3D battle scene with canvas masking to ignore rendering differences
- Three viewport sizes: desktop (1280x720), tablet, mobile (375x667)

### Comparison sensitivity
- Threshold tolerance for pixel comparison (0.1-1% range) — not pixel-perfect
- Dynamic content: mock at test level where possible, CSS masking for what can't be controlled
- Disable animations during capture using prefers-reduced-motion or CSS
- Docker container for visual tests with pinned fonts — consistent rendering across environments

### Baseline management
- Baselines committed to Git repository — versioned, reviewable in PRs
- Update workflow: both local npm script (`npm run test:visual:update`) and CI-generated artifacts
- Baseline updates in same commit as UI change — atomic, easier to review
- PRs with baseline changes auto-labeled 'visual-changes' (no special approval required)

### Failure handling
- Visual regression failures block PR merges — forces intentional baseline update or fix
- PR comment with side-by-side diff images for failures
- Retry failed tests 2-3 times before declaring failure (handles flakiness)
- Report shows failures only — keeps PR comments focused

### Claude's Discretion
- Exact threshold percentage within 0.1-1% range
- Docker image and font selection
- Retry count (2 or 3)
- Specific viewport dimensions for tablet

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard Playwright visual comparison approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-visual-regression*
*Context gathered: 2026-02-03*
