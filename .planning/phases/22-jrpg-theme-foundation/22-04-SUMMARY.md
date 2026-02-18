---
phase: 22-jrpg-theme-foundation
plan: 04
subsystem: ui
tags: [framer-motion, animation, sound, react-hooks, zustand]

# Dependency graph
requires:
  - phase: 22-01
    provides: JRPG design token system (tokens.css + Tailwind mappings)

provides:
  - useGameSounds hook mapping 10 semantic game events to useAudio store
  - getGameSounds non-hook version for use outside React components
  - PhaseTransition using AnimatePresence mode="wait" with 250ms fade+slide+scale
  - usePhaseTransition hook (simplified, no setTimeout logic)
  - Phase sound on every phase change (delegates to playSuccess temporarily)
  - prefers-reduced-motion support (duration: 0 when active)

affects:
  - 22-05 (any future GameButton or component using useGameSounds)
  - Any component wrapping PhaseTransition
  - PhaseRenderer (updated to not pass isTransitioning to PhaseTransition)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Semantic sound abstraction: useGameSounds maps event names to useAudio, components never call store directly"
    - "AnimatePresence key-driven animation: key={toPhase} triggers exit/enter without imperative isTransitioning flags"
    - "Reduced motion via useReducedMotion: transition.duration = 0 when prefers-reduced-motion active"

key-files:
  created:
    - client/src/lib/hooks/useGameSounds.ts
  modified:
    - client/src/components/game/phases/PhaseTransition.tsx
    - client/src/components/game/phases/PhaseRenderer.tsx

key-decisions:
  - "useGameSounds maps to existing useAudio functions — no new Audio objects created; temporary mappings documented in JSDoc for future SFX replacement"
  - "framer-motion import from 'framer-motion' package (not 'motion/react') — v11.x uses the framer-motion package name"
  - "PhaseTransition uses key={toPhase} for AnimatePresence — phase string as key drives declarative enter/exit without isTransitioning prop"

patterns-established:
  - "Sound hook pattern: semantic event names (onButtonClick, onPhaseTransition) decouple components from sound store internals"
  - "Non-hook companion (getGameSounds): Zustand .getState() pattern for sound access outside React"

# Metrics
duration: 20min
completed: 2026-02-18
---

# Phase 22 Plan 04: AnimatePresence Phase Transitions + useGameSounds Summary

**Framer Motion AnimatePresence wired into PhaseTransition with key={toPhase} and useGameSounds semantic hook mapping 10 game events to useAudio store**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-18T20:05:54Z
- **Completed:** 2026-02-18T20:25:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `useGameSounds` hook with 10 semantic event mappings (onButtonClick, onConfirm, onError, onPhaseTransition, onPanelOpen, onPanelClose, onLevelUp, onDamage, onExplosion) delegating to existing useAudio store functions
- Created `getGameSounds` non-hook companion using `useAudio.getState()` for use outside React components
- Replaced setTimeout-based PhaseTransition with Framer Motion AnimatePresence (mode="wait", key={toPhase}, 250ms fade+slide+scale)
- Integrated `useReducedMotion` for accessibility — duration set to 0 when prefers-reduced-motion is active
- Phase change triggers `sounds.onPhaseTransition()` via useEffect comparing prevPhaseRef to current phase
- Simplified `usePhaseTransition` hook — removed setTimeout and isTransitioning state (AnimatePresence handles all animation)
- Updated PhaseRenderer to not pass `isTransitioning` to PhaseTransition (kept in interface for backward compat)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useGameSounds hook** - `a7a57b7` (feat)
2. **Task 2: Refactor PhaseTransition to use Framer Motion AnimatePresence** - `e43c0ed` (feat, included with Plan 22-02 commit due to staged files at commit time)

## Files Created/Modified
- `client/src/lib/hooks/useGameSounds.ts` - Semantic sound hook and getGameSounds companion; maps 10 events to useAudio
- `client/src/components/game/phases/PhaseTransition.tsx` - Replaced setTimeout animation with AnimatePresence, integrated useGameSounds
- `client/src/components/game/phases/PhaseRenderer.tsx` - Removed isTransitioning prop from PhaseTransition call

## Decisions Made
- useGameSounds delegates to existing useAudio store functions — no new Audio objects, temporary mappings documented with JSDoc for future SFX file replacement (panel-open.mp3, panel-close.mp3, error.mp3, phase-transition.mp3)
- `framer-motion` package import (not `motion/react`) — framer-motion v11.x uses the `framer-motion` package name
- `key={toPhase}` drives AnimatePresence declaratively — when phase string changes, AnimatePresence exits old child and enters new one without any imperative flag

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-commit hook exit code 1 on Task 2 commit caused confusion — the commit succeeded (575 tests pass), but the hook exited 1 due to untracked files in git status. Verified via `git log` that both PhaseTransition.tsx and PhaseRenderer.tsx were committed in `e43c0ed`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `useGameSounds` is ready for GameButton (Phase 22-05) and any future component needing sound
- Phase transitions now animate smoothly with 250ms fade+slide+scale (or instant for reduced-motion users)
- `getGameSounds` non-hook companion available for event handlers outside React component lifecycle

---
*Phase: 22-jrpg-theme-foundation*
*Completed: 2026-02-18*
