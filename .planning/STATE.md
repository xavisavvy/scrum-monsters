---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: Maintainability & Extensibility
status: verifying
stopped_at: Completed 48-03-PLAN.md
last_updated: "2026-06-23T08:25:55.454Z"
last_activity: 2026-06-23
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 12
  completed_plans: 12
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** Phase 50 — finish-the-gamestate-domain-manager-migration

## Current Position

Milestone: v6.0 Maintainability & Extensibility — PLANNING
Phase: 50 (finish-the-gamestate-domain-manager-migration) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-06-23

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
| Phase 47-ability-effects-data-driven-registries P01 | 10min | 2 tasks | 5 files |
| Phase 47 P04 | 4 minutes | 3 tasks | 10 files |
| Phase 47 P03 | 7 | 3 tasks | 7 files |
| Phase 48-testability-seams P01 | 15min | 2 tasks | 2 files |
| Phase 48-testability-seams P02 | 8min | 2 tasks | 3 files |
| Phase 48 P03 | 15min | 2 tasks | 7 files |
| Phase 50-finish-the-gamestate-domain-manager-migration P01 | 811s | 4 tasks | 7 files |
| Phase 50 P02 | 1620 | 5 tasks | 8 files |

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
- [Phase ?]: [47-01] BuffType union = 'damage_boost' | 'crit_boost' | 'dodge' | 'cooldown_reduction' derived from CLASS_ABILITY_CONFIGS values
- [Phase ?]: [47-01] durationMs populated at 10000ms for buff abilities and 8000ms for oathbreaker_aura_of_dread; paladin shield abilities deliberately omitted (handler supplies default)
- [Phase ?]: [47-01] gameEvents.ts wire type uses inline import('./abilityTypes').BuffType to avoid circular imports
- [Phase ?]: [47-04] SPRITE_TO_BOSS_TYPE derived via Object.fromEntries(Object.values(BOSS_BEHAVIORS)) — drift impossible by construction
- [Phase ?]: [47-04] availableBosses = Object.values(BOSS_BEHAVIORS) — inline array deleted from gameState.ts
- [Phase ?]: [47-04] TECH_DEBT_GOLEM_BEHAVIOR.sprite = 'technical-debt-golem.png' — live golem-AI mismatch fixed at source
- [Phase ?]: [47-03] ClassDef interface added to shared/gameEvents.ts; AVATAR_CLASSES annotated Record<AvatarClass, ClassDef> — missing class is a tsc error
- [Phase ?]: [47-03] HEALER_CLASSES derived via Object.entries(AVATAR_CLASSES).filter(role==='healer') — drift impossible by construction
- [Phase ?]: [47-03] getClassBaseDamage switch replaced by AVATAR_CLASSES[class].baseDamage registry lookup with fallback 20
- [Phase ?]: [48-01] GameStateManager exported with startWatchdogs opt; handleVotingTimeout promoted to public; definite-assignment on watchdog fields for tsc
- [Phase ?]: [48-02] damageInterceptor stored as private readonly field with pass-through lambda default; applyDamageToPlayerRaw is private so call sites cannot bypass shield logic
- [Phase ?]: [48-03] wireDomains factory defined inside domains/index.ts (closes over module-private helpers); activeConnections changed to mutable {value:number} ref for handler extraction; getClientEventEmitter not in HandlerDeps (vi.mock'd in tests)
- [50-02] session:host_transferred bridges to WIRE name 'host_transferred' (GamePage.tsx:232); distinct from session:host_changed (immediate path); ClientEventEmitter bridge pattern
- [50-02] Both 100ms revival watchdogs removed (gameState ctor + websocket.ts); CombatManager owns revival via self-managed per-session setInterval
- [50-02] disconnectWatchdog + processDisconnectedPlayers + removePlayer retained (Phase 50 out of scope)

### Pending Todos

(None)

### Blockers/Concerns

- Phase 39: Tutorial overlay positioning on 3D/R3F elements needs prototyping (hint targets lack DOM rects)
- Phase 39: Radix Popover collision detection behavior with game layout needs validation
- Phase 40: Mobile hint positioning needs device testing (D-pad overlap risk)
- Phase 41 (resolved): legacy reconnect handler in gameState.ts:370-441 remains as dead code — safe to delete in a future cleanup phase
- Phase 41 (resolved): in-process reconnectTokens Map still wiped on server restart — client coherence guard handles cleanup; future Redis-backed persistence would shorten post-restart re-auth UX

## Session Continuity

Last session: 2026-06-23T08:25:55.442Z
Stopped at: Completed 48-03-PLAN.md
Resume file: None
Next action: /gsd:verify-work phase 48 (testability-seams) — Phase 48 all 3 plans complete

---
*State initialized: 2026-02-11*
*Last updated: 2026-06-21 — v5.0 shipped; v6.0 Maintainability & Extensibility milestone drafted from review council (Phases 47-52); PR #167 ships the 2 live bugs*
