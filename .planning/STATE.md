# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-01)

**Core value:** Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.
**Current focus:** Phase 4 - CombatManager

## Current Position

Phase: 4 of 6 (CombatManager)
Plan: 5 of TBD in current phase
Status: In progress
Last activity: 2026-02-02 — Completed 04-05-PLAN.md

Progress: [██████░░░░] 67%

## Performance Metrics

**Velocity:**
- Total plans completed: 18
- Average duration: 3.8 min
- Total execution time: 1.15 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 8 min | 2.7 min |
| 02-sessionmanager | 5 | 22 min | 4.4 min |
| 03-estimationmanager | 5 | 27 min | 5.4 min |
| 04-combatmanager | 5 | 19 min | 3.8 min |

**Recent Trend:**
- Last 5 plans: 04-02 (4 min), 04-03 (5 min), 04-04 (3 min), 04-05 (4 min)
- Trend: Phase 04 maintaining fast TDD velocity, 3-5 min per plan

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Clean slate on Lobby type — Proper domain separation requires redesigning the core type (Pending)
- Fine-grained events — Real-time game best practice, send only what changed (Pending)
- Three domains (Session/Estimation/Combat) — Natural boundaries based on concerns (Pending)
- Estimation before battle entry — Keep voting focused, combat as waiting entertainment (Pending)
- Players in mixed states — Voters fight while non-voters estimate (Pending)

**From Plan 01-01:**
- Map types for runtime state — Use Map<string, T> for player collections, convert to Record for serialization later
- ID-based references — Domain states reference other domains by ID only to maintain isolation

**From Plan 01-02:**
- Event naming convention — domain:action format (e.g., estimation:vote_cast) for clear categorization
- Fire-and-forget async — Async listeners not awaited by emit(), each handles own timing and errors
- Typed EventBus pattern — Extend Node.js EventEmitter with TypeScript generics for compile-time safety

**From Plan 01-03:**
- Scoped subscription pattern — Use subscribeScoped(lobbyId, event, listener) for lobby-specific listeners
- Cleanup contract — Always call cleanupScope(lobbyId) when lobby destroyed to prevent memory leaks
- Scope tracking via Map — O(1) lookup for scope listener management

**From Plan 02-01:**
- Typed exception hierarchy — SessionError base with code property, specific error classes for each failure mode
- Token validity 5 minutes per CONTEXT.md — Explicit requirement from phase context
- Random SESSION_SECRET fallback — Generate with warning for dev convenience, not suitable for production

**From Plan 02-02:**
- Host starts as spectator — Host player begins in spectators team, not developers
- New players join developers — Default team for joining players
- Basic host transfer — Transfer to first remaining player (activity-based in 02-04)
- Empty lobby cleanup — Destroy lobby and call cleanupScope when last player leaves

**From Plan 02-03:**
- Token validity 5 min, grace period 10 min — Allows multiple reconnection attempts with token refresh
- Token validation first — Security before grace period check, reject tampered tokens immediately
- HMAC-SHA256 signing — Standard secure token signing prevents tampering
- Grace period pattern — Temporary disconnections tracked with expiry, auto-cleanup on timeout

**From Plan 02-04:**
- Activity-based host selection — Most recently active connected player becomes host
- promoteNewHost not integrated into removePlayer — Kept separate for explicit call from handlers (integration later)
- Team management split — Self-service (changeOwnTeam) vs host-only (assignTeam) patterns
- Disconnected player exclusion — promoteNewHost filters via disconnectedPlayers Map

**From Plan 02-05:**
- Domain barrel export — Single import point (domains/index.ts) for all domain managers and infrastructure
- Method visibility — Made SessionManager methods public for websocket integration (blocking issue)
- Activity tracking points — Avatar selection, team changes, and vote submission capture engagement
- Typed exception flow — SessionManager throws, websocket catches and converts to game_error emits

**From Plan 03-01:**
- 60-second default voting duration — Based on RESEARCH.md for focused estimation
- Per-team state structure — Separate TeamVoteState for developers/qa with votes Map and eligibleVoters Set
- Three-phase voting lifecycle — voting → revealed → discussion state transitions
- Timer cleanup contract — cleanupLobby clears timers before deleting state to prevent memory leaks

**From Plan 03-02:**
- Strict consensus definition — All eligible voters must vote same numeric value (not majority), per scrum poker standards
- Abstentions don't block consensus — '?' votes filtered out of consensus calculation
- Automatic team skipping — Teams with no eligible voters marked as hasConsensus=true
- Vote removal triggers recheck — Removing eligible voter removes vote and recalculates consensus
- Full consensus celebration delay — 2.5s pause before emitting full_consensus_reached event

**From Plan 03-03:**
- Timer starts on first vote — Not on ticket load, keeps timer meaningful
- Per-team independent timers — Dev and QA pace themselves independently
- Clear timer on consensus — No longer needed when agreement reached
- Remaining time calculation — Date.now() - timerStartedAt vs timerDurationMs enables accurate pause/resume

**From Plan 03-04:**
- Vote values hidden during voting — Prevents anchoring bias per classic planning poker principles
- Global phase from most advanced team — Enables cross-team discussion transparency once any team reveals
- Host must choose during ties — Explicit decision vs. arbitrary selection when forcing estimate
- VotingTeam type excludes spectators — Compile-time safety for voting operations

**From Plan 03-05:**
- Session event subscriptions in constructor — EstimationManager subscribes to session:player_joined/left/lobby_destroyed
- getPlayerTeam callback pattern — Cross-domain team lookup via dependency injection maintains domain isolation
- Team change notifications explicit — Websocket handlers call handleTeamChange after team updates
- New websocket handlers coexist with legacy — Gradual migration path from gameState to domain managers

**From Plan 04-01:**
- Combat error hierarchy — CombatError base with 5 specific error types for typed exception handling
- Fine-grained combat events — 9 new domain events for reactive coordination (battle_initialized, player_entered_battle, boss_enraged, boss_telegraph, revival_started, revival_cancelled, player_permanently_downed, cleanup_complete, player_healed)
- Player combat state enum — Explicit 3-state enum (fighting/downed/ghost) for clear state machine
- Healer classes constant — cleric, paladin, bard centralized for revival validation
- Combat constants from CONTEXT.md — HP/damage/timing tuned per requirements (1000 HP/player, 100 player HP, 25/40/50 damage, 10s down, 2.5s revival, 5s/3s boss attacks)
- Ticket index scaling — LobbyCombatState includes ticketIndex for dungeon crawl difficulty progression

**From Plan 04-02:**
- Class damage values — Tank (15), DPS (20), glass cannon (25), healer (12) for balanced TTK and class fantasy
- Spectator filtering — Excluded from boss HP calculation and combat states (non-combatants)
- Cumulative threat model — Threat is total damage dealt, simplest targeting for MVP
- Boss enrage once at 50% — Single phase transition with boolean flag prevents re-triggering

**From Plan 04-03:**
- Recursive setTimeout over setInterval — Allows variable timing (±30% variance) and clean cleanup on boss defeat
- Threat targeting weights (70/20/10) — Boss mostly targets top damage dealer with some unpredictability
- AoE frequency (15% normal, 25% enraged) — Keeps all players engaged without overwhelming single-target
- Telegraph delay 1000ms — Gives players time to react to heavy/special attacks
- Enraged attack speed (3s vs 5s) — Increases pressure without unfair one-shots, per RESEARCH.md
- Light attacks instant — 60% attacks instant maintains combat pressure vs telegraph downtime

**From Plan 04-04:**
- Centralized damage application — Boss attacks call applyDamageToPlayer() which handles HP reduction, capping, events, and down transition
- Timer handle storage pattern — Store timer in player.downTimerHandle, clear in both permanentlyDownPlayer and cleanupLobby
- Healer class validation — NotHealerClassError with proper signature (playerId, className) for non-healers attempting to heal
- State machine enforcement — Healing only allowed for fighting state (not downed/ghost), prevents edge cases

**From Plan 04-05:**
- setInterval for revival ticking — Continuous 100ms checks for interruption (reviver downed, target state changed)
- Session key pattern reviverId:targetId — O(1) lookup and prevents duplicate revivals on same target
- 50% HP restoration on revival — Balanced between useful and not OP, per CONTEXT.md requirements
- Clear down timer on revival — Prevents ghost transition after successful revival completion

### Pending Todos

None yet.

### Blockers/Concerns

- Pre-existing TypeScript errors in codebase (unrelated to domain types) — Should be addressed in future maintenance task

## Session Continuity

Last session: 2026-02-02 (04-05 execution complete)
Stopped at: Completed 04-05-PLAN.md
Resume file: None

**Phase 4 Progress:** Revival system complete. Channel-based revival with 2.5s duration. Healers (cleric/paladin/bard) can revive downed teammates at 50% HP. Damage interrupts revival channel. One-revive-per-fight enforced via hasBeenRevived flag. setInterval tick system checks for interruption every 100ms. Down timer cleared on successful revival. Target death (permanent down) cancels active revival attempts. cleanupLobby clears all revival intervals. 236 tests passing (92 in CombatManager). Ready for Plan 04-06 (websocket integration).
