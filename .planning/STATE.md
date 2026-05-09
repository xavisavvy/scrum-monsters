---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: UX & Onboarding
status: completed
stopped_at: Completed 44-02-PLAN.md (NPM API + healthcheck bash modules + CI shellcheck/bats gate)
last_updated: "2026-05-09T04:24:49.611Z"
last_activity: 2026-05-09
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 20
  completed_plans: 20
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** Phase 43 — auth-user-account-validation

## Current Position

Phase: 44 — COMPLETE
Plan: 2 of 3 (complete; Plan 44-03 next)
Status: Phase 44 complete
Last activity: 2026-05-09

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
| v5.0 UX & Onboarding | 37-41 | 11/11 | In progress | - |

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
- [42-03] Tuned XP pacing — boss_damage 2→1 + curve exponent 1.5→1.8 (BAL-01); 30-min session reaches L4-5, L10 takes ~13 sessions
- [42-01] FIX-04 was purely a client-feedback gap; server damage path intact. Wired combat:player_damaged into PlayerCharacter HP-decrement flash + new FloatingDamage(Manager) mirroring FloatingXP, added HealthBar to PlayerHUD. Mounted in BattleScreen + phases/BattlePhase (PhaseRenderer.tsx in plan does not exist — Rule 3 deviation)
- [42-02a] autoAdvance default OFF; gate only consensus countdown in checkDiscussionConsensus; 3-min handleVotingTimeout safety net stays unchanged. session:settings_updated payload designed (timer/jira/estimation optional fields) but not emitted in 42-02a — rides existing update_estimation_settings → lobby_updated for now; 42-02b absorbs the emit migration.
- [42-02a] Parallel-executor coordination quirk: Task 0 changes (schema/type/storage extension) were swept into commit e34754e (mislabeled as 42-01) by a concurrent executor. Tasks 1 and 2 committed cleanly as 9841241 and 5c7ab93. All acceptance criteria pass against current HEAD.
- [40-01] First-combo hint anchored to persistent boss-health (not transient combo-notification) to eliminate typewriter-vs-dismissal timing race
- [40-01] Walkthrough auto-skip-on-missing-target advances mid-walkthrough or completes on last step, generically resolving non-host lobby step 3 and any future missing-target case
- [40-02] useTypewriter colocated under client/src/components/tutorial/ (not lib/hooks/) per CONTEXT decision
- [40-02] Reduced-motion: isComplete=true on first render so a single body click advances/dismisses with no intermediate reveal click
- [40-02] Single-step bubble (only onDismiss, no onNext): body click after isComplete falls back to onDismiss so reduced-motion users dismiss with one click
- [42-02b] Fully retired lobby_updated: 26 server emit sites migrated to fine-grained events (10 phase_changed via eventBus + 9 NEW events via emitFineGrained helper + 7 REMOVE-only). GamePage handler deleted; battle remount logic moved to useGameState.requestBattleRemount slice driven by session:phase_changed + session:ticket_advanced handlers. Type removed from ServerToClientEvents — tsc is the future safety net.
- [42-02b] proceed_next_level emits BOTH session:game_reset (full lobby) AND session:ticket_advanced (currentTicket) to keep BattleScreen-remount trigger explicit instead of inferring from lobby diff.
- [43-01] Co-located providers fetch inside useAuth (not a separate useAuthProviders hook) — single consumer, single fetch, matches existing chained-fetch pattern (checkAuth -> fetchProfile -> fetchStats)
- [43-01] Sequenced fetchProviders BEFORE /api/auth/me in checkAuth (no Promise.all) per RESEARCH Pitfall 4 — eliminates stale-closure race / render flicker
- [43-01] providersConfigured: boolean | null tri-state — null = loading; UserMenu renders null while null (no Sign In flash) and fail-closed on /providers errors (sets false, never null)
- [43-02] Adopted supertest@^7 as devDep (first HTTP-route integration test harness in repo); justified — prior server tests target domain managers, never Express routes
- [43-02] mockOidc.ts test helper stubs (req as any).oidc directly — does NOT vi.mock the express-openid-connect auth() factory (per RESEARCH §Anti-Patterns: factory mocks hide regressions)
- [43-02] Login-redirect smoke is structural ONLY — asserts configureAuth0 is exported + middleware mounts without throwing; no live redirect, no real Auth0 issuer contact (TODO stretch: assert 302 once express-openid-connect exposes a test mode)
- [43-02] AUTH0_* all-or-nothing zod .refine() chained AFTER existing production-DB refine, using the same httpLogger.error + process.exit(1) idiom (NOT throw); BASE_URL deliberately excluded from the all-or-nothing set
- [44-02] Bash deploy helpers split into source-able modules (npm-api.sh, health-poll.sh) under scripts/deploy/lib/; PATH-shim mocking via mktemp tmp dirs is the bats convention for this repo
- [44-02] npm_login fails loudly on requires_2fa response (extra 8th bats test added — Rule 2 critical security functionality per executor brief; total 13 bats tests > plan-stated 12)
- [44-02] CI deploy-scripts job uses apt-get install shellcheck bats jq on ubuntu-latest; ci-success needs[] gates branch protection on the new job

### Pending Todos

(None)

### Blockers/Concerns

- Phase 39: Tutorial overlay positioning on 3D/R3F elements needs prototyping (hint targets lack DOM rects)
- Phase 39: Radix Popover collision detection behavior with game layout needs validation
- Phase 40: Mobile hint positioning needs device testing (D-pad overlap risk)
- Phase 41 (resolved): legacy reconnect handler in gameState.ts:370-441 remains as dead code — safe to delete in a future cleanup phase
- Phase 41 (resolved): in-process reconnectTokens Map still wiped on server restart — client coherence guard handles cleanup; future Redis-backed persistence would shorten post-restart re-auth UX

## Session Continuity

Last session: 2026-05-08
Stopped at: Completed 44-02-PLAN.md (NPM API + healthcheck bash modules + CI shellcheck/bats gate)
Resume file: None
Next action: Plan 44-03 — blue-green deploy orchestrator (sources both helpers shipped in 44-02)

---
*State initialized: 2026-02-11*
*Last updated: 2026-05-08 — Completed 44-02 (scripts/deploy/lib/npm-api.sh + health-poll.sh, 13 bats tests, CI deploy-scripts job); commits 47cc14a + 8546614*
