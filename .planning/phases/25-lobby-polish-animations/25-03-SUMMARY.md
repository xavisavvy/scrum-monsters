---
phase: 25-lobby-polish-animations
plan: 03
subsystem: lobby
tags: [lobby, animations, sprites, ui-polish, framer-motion]

# Dependency graph
requires:
  - phase: 22-design-system
    provides: UI component foundations
  - phase: 25-02
    provides: Player ready system and lobby UI structure
provides:
  - Multi-frame idle sprite animation (2-frame breathing cycle)
  - Framer Motion Y-axis bobbing for idle characters
  - Layered idle animation system (sprite frames + motion)
affects: [26-testing, 27-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [multi-frame-sprite-animation, gpu-composited-motion, conditional-animation-rendering]

key-files:
  created: []
  modified:
    - client/src/hooks/useSpriteAnimation.ts
    - client/src/components/game/Lobby.tsx

key-decisions:
  - "2-frame idle animation uses frames 0-1 from row 0 (subtle weight-shifting effect)"
  - "800ms per frame (1.6s full cycle) for slow, calm idle breathing"
  - "3px Y-axis bobbing with 2.5s duration for gentle breathing motion"
  - "Bobbing only applies when idle (not moving, jumping, or dead)"
  - "Conditional rendering: motion.div wrapper only for idle, direct SpriteRenderer for movement"
  - "Framer Motion already in dependency tree (used in Phase 22) - no new dependencies"

patterns-established:
  - "Layered animation pattern: sprite frame cycling + GPU-composited motion transform"
  - "Conditional animation wrapper: idle gets motion.div, movement gets direct renderer"
  - "Animation state guards: check isMoving, isDead, isJumping before applying idle animations"

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 25 Plan 03: Lobby Idle Animations Summary

**Multi-frame sprite animation and Framer Motion bobbing create subtle "breathing" effect for idle lobby characters, replacing static sprites with living presence**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-02-19T17:05:21Z
- **Completed:** 2026-02-19T17:09:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Idle characters now cycle between 2 sprite frames (frames 0-1 of row 0)
- Characters gently bob 3px vertically when idle (GPU-composited motion)
- Layered animation effect: sprite frame shift + vertical bobbing
- Idle animations only apply when character is truly idle (not moving/jumping/dead)
- No performance impact (GPU compositing, max 8 players)
- No new dependencies (Framer Motion already in tree from Phase 22)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend useSpriteAnimation idle config to 2-frame cycle** - `d04db1c` (feat)
2. **Task 2: Add Framer Motion bobbing to lobby character sprites** - `8865cfb` (feat)

## Files Created/Modified

- `client/src/hooks/useSpriteAnimation.ts` - Changed idle animation from 1 frame to 2 frames at 800ms speed
- `client/src/components/game/Lobby.tsx` - Added Framer Motion import and motion.div wrappers for idle characters

## Decisions Made

- **2-frame cycle:** Frames 0-1 from row 0 create subtle weight-shifting effect without looking like walking
- **Slow timing:** 800ms per frame (1.6s full cycle) feels idle, not active movement
- **Gentle bobbing:** 3px Y-axis motion with 2.5s duration creates calm breathing effect
- **Conditional rendering:** Idle characters wrapped in motion.div, moving characters use direct SpriteRenderer
- **Animation guards:** Check `keys.size === 0`, `!isDead`, `!isJumping`, `!isMoving` before applying idle animations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Phase 26. All Phase 25 plans complete (3/3). Lobby polish and animations milestone achieved:
- Player ready system (25-02)
- Idle animations with sprite cycling and bobbing (25-03)

## Self-Check: PASSED

- FOUND: client/src/hooks/useSpriteAnimation.ts
- FOUND: client/src/components/game/Lobby.tsx
- FOUND: d04db1c (Task 1 commit)
- FOUND: 8865cfb (Task 2 commit)

---
*Phase: 25-lobby-polish-animations*
*Completed: 2026-02-19*
