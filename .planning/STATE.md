# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** Phase 41 complete — reconnection state bugfix shipped (FIX-03 closed). v5.0 reconnection regression closed; remaining tutorial phases (39, 40) next.

## Current Position

Phase: 41 of 41 (Reconnection State Bugfix — complete)
Plan: 2 of 2 in current phase
Status: Phase 41 complete — ready to resume v5.0 tutorial work (Phase 39/40)
Last activity: 2026-05-06 — Completed 41-02 (server host preservation + token expiry alignment + create_lobby join race patches)

Progress: [██████████] 100%

## Performance Metrics

**Velocity (all shipped milestones):**
- Total plans completed: 138 (1 deferred)
- Total milestones shipped: 8

**By Milestone:**

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 Domain Separation | 1-6 | 30 | Complete | 2026-02-02 |
| v1.2 SDLC Best Practices | 7-14 | 21 | Complete | 2026-02-03 |
| v1.3 Game Progression | 15-20 | 28 | Complete | 2026-02-11 |
| v2.0 UI Redesign & Mobile | 21-25 | 23 | Complete | 2026-02-19 |
| v3.0 Production Optimization | 26-29 | 9 | Complete | 2026-02-20 |
| v3.1 Tech Debt Cleanup | 30-31 | 3/4 (1 deferred) | Complete | 2026-02-24 |
| v4.0 Hosting & Deployment | 32-36 | 14 | Complete | 2026-03-11 |
| v5.0 UX & Onboarding | 37-41 | 7/11 | In progress | - |

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

- [37-01] EmptyState uses RetroCard wrapper for consistent JRPG theming
- [37-01] BattleLoadingSpinner uses framer-motion rotating shield instead of CSS animation
- [37-02] Reused abandonQuest for restart_game handler to preserve ticket backlog while resetting game state
- [37-02] Used resetKey={currentPhase} on ErrorBoundary to auto-recover on phase transitions
- [38-03] PhaseInterstitial rendered as sibling to PhaseTransition to avoid AnimatePresence mode=wait conflicts
- [38-03] useReducedMotion makes triggerInterstitial a no-op for accessibility
- [38-01] Cast rest props via React.ComponentProps<typeof motion.button> to resolve React/framer-motion event handler type conflicts
- [38-01] Key vote card grid on currentTicket.id to auto-reset glow state on ticket change
- [38-02] Settings saved toast uses shared ID across timer/jira/estimation to prevent triple-stacking
- [38-02] Reconnection toast in useWebSocket reconnect_response handler (confirmed success)
- [38-02] Ability toast fires on ability:used server event for all lobby players
- [39-01] zustand persist partialize excludes all runtime state from localStorage
- [39-01] useHintTarget uses RAF loop for moving elements, one-shot for static
- [39-01] Resize listener debounced to 100ms to avoid layout thrash
- [41-01] Atomic three-key session storage (last-lobby + lobby-snapshot + reconnect-token); coherence validated by lobbyId
- [41-01] GamePage socket-listener useEffect deps reduced to [socket, navigate]; refs mirror state to break the lobby_sync teardown race
- [41-02] Host transfer deferred until grace expiry (wasHost flag on DisconnectedPlayer); attemptPlayerReconnect restores host with defense in depth
- [41-02] TOKEN_EXPIRY_TIME widened from 5min to 10min to match DISCONNECT_GRACE_PERIOD (HMAC binding makes the wider replay window acceptable)
- [41-02] GamePage hydrates from useWebSocket.lastLobbySnapshot when route lobbyId matches, short-circuiting the create_lobby → join_lobby duplicate-self race
- [41-02] SessionManager.joinLobby dedupes connected same-name players (returns existing record) as defense in depth

### Pending Todos

(None)

### Blockers/Concerns

- Phase 39: Tutorial overlay positioning on 3D/R3F elements needs prototyping (hint targets lack DOM rects)
- Phase 39: Radix Popover collision detection behavior with game layout needs validation
- Phase 40: Mobile hint positioning needs device testing (D-pad overlap risk)
- Phase 41 (resolved): legacy reconnect handler in gameState.ts:370-441 remains as dead code — safe to delete in a future cleanup phase
- Phase 41 (resolved): in-process reconnectTokens Map still wiped on server restart — client coherence guard handles cleanup; future Redis-backed persistence would shorten post-restart re-auth UX

## Session Continuity

Last session: 2026-05-06
Stopped at: Completed 41-02-PLAN.md (Phase 41 complete)
Resume file: None
Next action: Resume v5.0 tutorial work — execute 39-02-PLAN.md or replan 40

---
*State initialized: 2026-02-11*
*Last updated: 2026-05-06 — Completed 41-02 (server host preservation + token expiry alignment + create_lobby join race fix)*
