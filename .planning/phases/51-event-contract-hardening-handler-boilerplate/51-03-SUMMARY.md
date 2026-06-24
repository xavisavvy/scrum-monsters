---
phase: 51-event-contract-hardening-handler-boilerplate
plan: "03"
subsystem: client-coordinate-helpers
tags: [maint, refactor, coordinates, viewport, helpers]
dependency_graph:
  requires: []
  provides: [worldToPercent, percentToWorld]
  affects:
    - client/src/components/game/PlayerController.tsx
    - client/src/lib/hooks/useViewport.ts
tech_stack:
  added: []
  patterns:
    - pure-function exports alongside a hook (same file)
    - TDD with pre-commit full-suite gate (RED via isolated run, GREEN via commit)
key_files:
  created:
    - client/src/lib/hooks/useViewport.test.ts
  modified:
    - client/src/lib/hooks/useViewport.ts
    - client/src/components/game/PlayerController.tsx
decisions:
  - "worldToPercent always clamps to [0,100]; percentToWorld never clamps — asymmetry is intentional and now unit-tested"
  - "Sites 2 and 4 (plus a discovered Site 2b D-pad shoot) clamping is the one intentional runtime change in this phase"
  - "Pre-clamp at Site 1 call site retained as a defensive guard — percentToWorld itself does not clamp"
  - "A 6th site (D-pad ControlLeft shoot, lines 769-772) discovered and converted with worldToPercent — same pattern as Sites 2 and 4"
  - "Receive-path percent-to-world sites (handleBossRingAttack, handlePlayersPos, handlePlayerProjectileFired) left as-is — outside plan scope"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-23"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 51 Plan 03: MAINT-10 Coordinate Helpers Summary

**One-liner:** Extracted `worldToPercent` (always clamps) and `percentToWorld` (never clamps) as pure named exports from `useViewport.ts`, replacing all open-coded world↔percent conversion sites with consistent clamping semantics.

## What Was Built

### Task 1: Helpers + Site 5 + Tests (commit f9c9ed9)

Added two pure named exports to `client/src/lib/hooks/useViewport.ts` after the existing `useViewport` hook:

- `worldToPercent(worldX, worldY, worldWidth, worldHeight)` — clamps result to [0,100] via `Math.max(0, Math.min(100, ...))`. Used for all socket emits (world→percent direction).
- `percentToWorld(percentX, percentY, worldWidth, worldHeight)` — no clamp; trusts server-provided values. Used for reading server data into rendering coordinates (percent→world direction).

Site 5 (camera follow, `useViewport.ts:146-147`) converted from inline math to `percentToWorld`. No behavior change — `percentToWorld` does not clamp, matching the old code.

Created `client/src/lib/hooks/useViewport.test.ts` with 11 pure-function tests covering:
- Center conversion (960,540 → 50%)
- Clamp-high (2000 → 100%)
- Clamp-low (-100 → 0%)
- Boundary values (0 → 0%, 1920 → 100%)
- `percentToWorld` no-clamp (110% → 2112px, -10% → -192px)
- Round-trip (in-bounds coords survive worldToPercent → percentToWorld)
- **Projectile-render proof:** out-of-bounds world coord clamps to [0,100] — this is the intentional behavior change for Sites 2 and 4

### Task 2: PlayerController Sites 1-4 (commit 092034c)

Converted all open-coded coordinate math in `client/src/components/game/PlayerController.tsx`.

**Site conversion table:**

| Site | Location | Direction | Old behavior | New behavior | Change? |
|------|----------|-----------|-------------|--------------|---------|
| 1 | L74-75 | percent→world (server sync) | Clamps input, manual math | Pre-clamp at call site + `percentToWorld` | NO |
| 2 | L182-185 | world→percent (keyboard projectile) | NO clamp | `worldToPercent` (always clamps) | **YES** |
| 2b | L769-772 | world→percent (D-pad ControlLeft shoot) | NO clamp | `worldToPercent` (always clamps) | **YES** |
| 3 | L478-479 | world→percent (movement loop) | Clamps after convert | `worldToPercent` (equivalent) | NO |
| 4 | L555-558 | world→percent (click-to-shoot) | NO clamp | `worldToPercent` (always clamps) | **YES** |

## Intentional Runtime Change (ONE change in this phase — MAINT-10 core intent)

**Sites 2, 2b, and 4 now clamp projectile emit coordinates to [0,100].**

Before this plan, these three sites emitted raw `(world.x / worldWidth) * 100` values without any `Math.min/max` guard. If a character was positioned near the edge and a projectile target computed to a world coordinate slightly outside the viewport (e.g., x = 1930 on a 1920-wide world), the old code emitted `percentX = 100.52` to the server. With the helper, this becomes `percentX = 100`.

**Rationale:**
- Out-of-bounds world coordinates are physically impossible in normal gameplay (characters are constrained to viewport bounds by `Math.max`/`Math.min` in the movement loop).
- The old behavior was inconsistent with Site 3 (movement loop), which already clamped. The inconsistency was the bug being fixed.
- The clamp does not affect in-range projectile rendering — proven by the round-trip test: `worldToPercent(800, 400, 1920, 1080)` → `percentToWorld` returns `(800, 400)` exactly.
- The only observable change is for projectiles targeting positions beyond the viewport edge, which cannot occur in normal gameplay.

**Proven by tests:** The projectile-render proof test in `useViewport.test.ts` confirms:
- In-bounds coords (`worldToPercent(800, 400, 1920, 1080)`) round-trip exactly.
- Out-of-bounds coords (`worldToPercent(2500, 540, 1920, 1080)`) now clamp to `{x: 100, y: 50}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Site] Discovered and converted a 6th unclamped projectile site**
- **Found during:** Task 2 post-conversion grep (`/ viewport.worldWidth) * 100`)
- **Issue:** Lines 769-772 in the D-pad ControlLeft shoot handler had the same unclamped worldToPercent pattern as Sites 2 and 4 — a third projectile emit site the RESEARCH missed.
- **Fix:** Applied `worldToPercent` with the same canonicalization as Sites 2 and 4. Added comment "Site 2b (D-pad shoot)" for traceability.
- **Files modified:** `client/src/components/game/PlayerController.tsx`
- **Commit:** 092034c

### Out-of-Scope Observations (not changed)

Lines 302, 306, 337-338, 361-362 contain `(/ 100) * viewport.worldWidth` patterns in receive-path handlers (`handleBossRingAttack`, `handlePlayersPos`, `handlePlayerProjectileFired`). These convert SERVER-sent percent data back to world coordinates — the `percentToWorld` direction. They are read paths (not wire-write paths) and were outside the plan's 5-site scope. Logged as deferred — could be converted to `percentToWorld` in a future cleanup without behavior change.

## Verification

- `npm run check` — exits 0 (tsc clean)
- `npm test` — 949/949 passed (938 baseline + 11 new useViewport tests)
- `npm run lint` — exits 0 (no ESLint issues)
- `grep '/ viewport.worldWidth) * 100' PlayerController.tsx` — 0 matches (all world-to-percent sites converted)

## Self-Check

### Files Exist
- `client/src/lib/hooks/useViewport.test.ts` — created (11 tests)
- `client/src/lib/hooks/useViewport.ts` — modified (helpers added, Site 5 converted)
- `client/src/components/game/PlayerController.tsx` — modified (all sites converted)

### Commits Exist
- f9c9ed9 — Task 1 helpers + tests + Site 5
- 092034c — Task 2 PlayerController sites

## Self-Check: PASSED
