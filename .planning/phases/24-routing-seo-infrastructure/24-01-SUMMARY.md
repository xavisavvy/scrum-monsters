---
phase: 24-routing-seo-infrastructure
plan: 01
subsystem: routing
tags: [react-router, spa, clean-urls, browser-history]

# Dependency graph
requires:
  - phase: 23-mobile-ux-critical-path
    provides: Touch-optimized UI components and responsive layouts
provides:
  - React Router v7 declarative mode integration
  - Clean URL structure without hash fragments
  - Browser history navigation support
  - Server-state-driven game phase rendering
  - Legacy query param redirect handling
affects: [24-02, 24-03, 24-04, 25]

# Tech tracking
tech-stack:
  added: [react-router@7]
  patterns: [url-based-routing, layout-components, server-state-drives-ui]

key-files:
  created:
    - client/src/routes.tsx
    - client/src/pages/LandingRoute.tsx
    - client/src/pages/AboutRoute.tsx
    - client/src/pages/FeaturesRoute.tsx
    - client/src/pages/PricingRoute.tsx
    - client/src/pages/SupportRoute.tsx
    - client/src/pages/MenuPage.tsx
    - client/src/pages/GamePage.tsx
    - client/src/pages/RoomPage.tsx
  modified:
    - client/src/main.tsx
    - client/src/App.tsx
    - package.json

key-decisions:
  - "React Router v7 declarative mode (not framework mode) — no CLI changes, no build changes"
  - "App.tsx becomes layout component with Outlet — routes handle specific logic"
  - "GamePage.tsx handles all game phases (avatar_selection, lobby, battle) at single URL"
  - "Server game phase drives rendering — URL never changes during phase transitions"
  - "Legacy query params (?join, ?room, ?page) redirect to clean URLs via loader functions"

patterns-established:
  - "Route wrapper components translate callback props to useNavigate() calls"
  - "Marketing pages use existing components with thin route wrappers"
  - "Game state managed in GamePage, not App layout"
  - "Reconnection and auto-join logic in GamePage useEffect"

# Metrics
duration: 8min
completed: 2026-02-19
---

# Phase 24 Plan 01: React Router Clean URLs Summary

**React Router v7 installed with clean URL structure, server-state-driven game phases, and legacy redirect support**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-19T05:09:26Z
- **Completed:** 2026-02-19T05:17:47Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Installed React Router v7 (declarative mode) replacing react-router-dom v6
- Created clean URL structure (/, /about, /features, /pricing, /support, /play, /game/:lobbyId, /room/:roomId)
- Refactored App.tsx from state-machine navigation to layout component with Outlet
- Implemented GamePage.tsx with server-state-driven phase rendering
- Browser back/forward navigation now works correctly
- No hash fragments (#) in any URLs

## Task Commits

Each task was committed atomically:

1. **Task 1: Install React Router v7 and create route structure** - `55868d6` (feat)
2. **Task 2: Wire game route with server-state-driven phases** - `c594eb0` (feat)

**Plan metadata:** (will be committed after SUMMARY creation)

## Files Created/Modified

### Created
- `client/src/routes.tsx` - Central route definitions with createBrowserRouter
- `client/src/pages/LandingRoute.tsx` - Landing page route wrapper
- `client/src/pages/AboutRoute.tsx` - About page route wrapper
- `client/src/pages/FeaturesRoute.tsx` - Features page route wrapper
- `client/src/pages/PricingRoute.tsx` - Pricing page route wrapper
- `client/src/pages/SupportRoute.tsx` - Support page route wrapper
- `client/src/pages/MenuPage.tsx` - Game menu (create/join lobby)
- `client/src/pages/GamePage.tsx` - Game route with phase handling
- `client/src/pages/RoomPage.tsx` - Recurring room route

### Modified
- `client/src/main.tsx` - RouterProvider mounting
- `client/src/App.tsx` - Layout component refactor
- `package.json` - React Router v7 dependency

## Decisions Made

**React Router v7 declarative mode:**
- Chosen over framework mode to avoid build changes and CLI dependencies
- Maintains existing Vite setup without modification
- Uses createBrowserRouter for clean URLs without hash fragments

**App.tsx as layout component:**
- Handles global concerns (WebSocket, audio, auth, developer tools)
- Route content renders via <Outlet />
- Removes appState string-based navigation entirely

**Server-state-driven game phases:**
- GamePage.tsx reads currentLobby.gamePhase from WebSocket state
- Renders appropriate component (AvatarSelection, Lobby, BattleScreen) based on phase
- URL stays at /game/:lobbyId regardless of phase (ROUTE-06 requirement met)
- Game phase transitions do NOT trigger URL changes

**Legacy query param handling:**
- Loader functions on root route handle ?join, ?room, ?page redirects
- Converts to clean URLs via redirect() function
- Maintains backward compatibility with old invite links

## Deviations from Plan

None - plan executed exactly as written. All route structure, wrapper components, and GamePage implementation followed the specification.

## Issues Encountered

None - React Router v7 migration was smooth, TypeScript compilation succeeded, all tests passed.

## Next Phase Readiness

Ready for 24-02 (React Helmet meta tags and Open Graph). Clean URL structure is in place, routes are functional, and server-state-driven rendering is working correctly.

---
*Phase: 24-routing-seo-infrastructure*
*Completed: 2026-02-19*
