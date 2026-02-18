---
phase: 22-jrpg-theme-foundation
plan: "02"
subsystem: ui
tags: [react, cva, class-variance-authority, jrpg, components, tailwind]

# Dependency graph
requires:
  - phase: 22-01
    provides: JRPG design tokens (tokens.css, Tailwind jrpg-* mappings, .jrpg-panel CSS class)

provides:
  - GamePanel: CVA-based JRPG panel component with ornamental frame (variant/size props)
  - GameButton: CVA-based button component with sound integration and forwardRef
  - retro-card.tsx: thin wrapper delegating to GamePanel (backward-compatible)
  - retro-button.tsx: thin wrapper delegating to GameButton (backward-compatible)

affects:
  - 22-03 (phase component migration — components being migrated from RetroCard/RetroButton to GamePanel/GameButton)
  - Any future UI component that needs themed panels or buttons

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CVA (class-variance-authority) for type-safe component variants
    - Re-export wrapper pattern for backward-compatible component renaming
    - useAudio.getState() (not hook) for non-reactive sound triggers in event handlers

key-files:
  created:
    - client/src/components/ui/GamePanel.tsx
    - client/src/components/ui/GameButton.tsx
  modified:
    - client/src/components/ui/retro-card.tsx
    - client/src/components/ui/retro-button.tsx

key-decisions:
  - "GamePanel and GameButton are the canonical JRPG component names; RetroCard/RetroButton are backward-compatible aliases"
  - "Re-export wrapper pattern avoids 30-file import migration while establishing new naming convention"
  - "useAudio.getState().playButtonSelect() used in GameButton (not hook) to avoid re-renders on audio state changes"
  - "GameButton maps accent variant to danger in the variantMap (accent -> danger) for RetroButton backward compatibility"

patterns-established:
  - "GamePanel pattern: jrpg-panel base CSS class + CVA for variant/size, jrpg-panel-title for h3 titles"
  - "GameButton pattern: forwardRef + CVA + useAudio.getState() for sound — no hook subscription"
  - "Re-export wrappers: import new component, wrap with old prop interface, export old name + re-export new name"

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 22 Plan 02: JRPG Component Primitives Summary

**CVA-based GamePanel and GameButton with JRPG ornamental frames, plus backward-compatible RetroCard/RetroButton re-export wrappers enabling zero-migration upgrade for 30+ existing consumers**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-18T19:53:00Z
- **Completed:** 2026-02-18T20:08:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created GamePanel.tsx with CVA variant/size system using jrpg-panel ornamental frame from tokens.css
- Created GameButton.tsx with CVA variants, forwardRef, and sound integration via useAudio.getState()
- Converted retro-card.tsx and retro-button.tsx to thin delegation wrappers — all 30+ consumers work without import changes
- Full build passes (npm run build) and all 575 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GamePanel and GameButton with CVA variants** - `b1c9304` (feat)
2. **Task 2: Convert RetroCard and RetroButton to re-export wrappers** - `e43c0ed` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `client/src/components/ui/GamePanel.tsx` - CVA panel with jrpg-panel frame, variant (default/golden/dark), size (sm/md/lg), optional title
- `client/src/components/ui/GameButton.tsx` - CVA button with forwardRef, variant (primary/secondary/accent/danger/ghost), size, playSound prop
- `client/src/components/ui/retro-card.tsx` - Thin wrapper: delegates to GamePanel, re-exports GamePanel for gradual migration
- `client/src/components/ui/retro-button.tsx` - Thin wrapper: delegates to GameButton with variant map (accent->danger), re-exports GameButton

## Decisions Made
- Re-export wrapper pattern chosen over 30-file import migration — maintains backward compatibility while establishing new naming convention
- `useAudio.getState()` used in GameButton click handler (not `useAudio()` hook) to avoid component re-renders when audio state changes
- `border-2` used in GameButton base class instead of `border-jrpg-border-width` — `borderWidth` extension not in tailwind config, and 2px matches the token value exactly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Minor] Used `border-2` instead of `border-jrpg-border-width`**
- **Found during:** Task 1 (GameButton creation)
- **Issue:** `border-jrpg-border-width` requires a `borderWidth` tailwind extension that wasn't added in 22-01. Using it would produce a non-functional class.
- **Fix:** Used `border-2` (2px, matching `--jrpg-border-width: 2px` exactly) which is standard Tailwind
- **Files modified:** client/src/components/ui/GameButton.tsx
- **Verification:** TypeScript check passes, no broken classes
- **Committed in:** b1c9304 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - minor class name substitution)
**Impact on plan:** Non-impacting. 2px border renders identically whether specified via token class or Tailwind shorthand.

## Issues Encountered
None - pre-existing TypeScript errors in shared/schema.ts (Zod constraint type errors) were present before this plan and unrelated to component work. All new component files type-check cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GamePanel and GameButton are ready for use in Phase 22-03 (phase component migration)
- RetroCard/RetroButton consumers continue to work — migration can happen incrementally in subsequent plans
- New code can import either the canonical names (GamePanel/GameButton) or the legacy names (RetroCard/RetroButton) from their respective files

---
*Phase: 22-jrpg-theme-foundation*
*Completed: 2026-02-18*
