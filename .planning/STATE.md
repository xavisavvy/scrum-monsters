# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-01)

**Core value:** Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.
**Current focus:** Phase 6 - New Flow Implementation (COMPLETE)

## Current Position

Phase: 6 of 6 (New Flow Implementation)
Plan: 05 of 5 in current phase
Status: Phase complete
Last activity: 2026-02-02 — Completed 06-05 End-to-End Flow Integration

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 29
- Average duration: 4.5 min
- Total execution time: 2.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 8 min | 2.7 min |
| 02-sessionmanager | 5 | 22 min | 4.4 min |
| 03-estimationmanager | 5 | 27 min | 5.4 min |
| 04-combatmanager | 6 | 23 min | 3.8 min |
| 05-fine-grained-events | 5 | 25 min | 5.0 min |
| 06-new-flow-implementation | 5 | 47 min | 9.4 min |

**Recent Trend:**
- Last 5 plans: 06-03 (11 min), 06-03b (8 min), 06-04 (8 min), 06-05 (8 min)

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

**From Plan 04-06:**
- Cross-domain subscriptions in constructor — CombatManager subscribes to estimation:vote_cast and session events for automatic coordination
- First vote starts combat loops — Boss attack loop and modifier loop begin when first player enters battle via vote
- Recursive setTimeout for modifier loop — Enables boss defeat detection to stop loop cleanly
- Player cleanup on session:player_left — Removes from combat, cancels revivals, clears timers, removes from threat table
- Websocket delegation pattern — Handlers delegate to combatManager methods with typed error handling

**From Plan 05-01:**
- Domain prefix naming convention — Client events follow domain:action format (session:player_joined, estimation:vote_cast)
- 100-event buffer size — Covers ~30s at 3 events/sec for brief network hiccups
- Gap detection logic: lastSeq+1 < oldestSeq — Prevents false positives for new connections
- Lobby existence check via sequences map — Distinguishes "lobby doesn't exist" from "no events buffered yet"

**From Plan 05-03:**
- Vote masking pattern — estimation:vote_cast emits hasVoted=true only, NOT vote value until discussion phase
- Cleanup events as internal-only — session:lobby_destroyed and combat:cleanup_complete trigger sequencer cleanup but no client emission
- Full state recovery method — sendFullState() emits system:full_state with current sequence for late joiners and buffer exhaustion
- Event bridge pattern — emitToLobby() adds seq + timestamp to all events before Socket.IO emission

**From Plan 05-04:**
- Full state sync pattern — Late joiners and reconnecting clients receive system:full_state with current sequence for synchronization
- Deferred initialization pattern — ClientEventEmitter initialized after Socket.IO server creation via factory function
- Gap recovery endpoint — request_missed_events handler checks buffer and sends missed events or full state

**From Plan 05-05:**
- lobby_updated deprecated with fallback — Handler remains as safety net with console warning, will be fully removed after Phase 6
- Host transfer on rejoin — When joining a lobby where host is disconnected, new player automatically becomes host
- Avatar selection via sessionManager — select_avatar handler uses domain manager not legacy gameState to find lobbies
- currentPlayer state sync — Client handlers update both currentLobby.players AND currentPlayer for avatar changes

**From Plan 06-01:**
- Linear multiplier interpolation — 3.0x at 10s to 1.5x at 0s for dramatic JRPG countdown effect
- setInterval for countdown ticking — 1 second interval emits remaining time and multiplier
- full_consensus_reached triggers countdown — CombatManager subscribes to estimation event for automatic coordination
- Countdown cleanup in cleanupLobby — Prevents memory leaks on lobby destruction

**From Plan 06-02:**
- Team attack damage formula — baseDamage * multiplier * battleModifier for consistent calculation
- Team attack delay 500ms — Allows client to display STRIKE! animation before boss HP updates
- Countdown state cleanup 2s — Shows STRIKE! and team attack result before clearing overlay
- GSAP pulse animation — Scale 1.5 to 1.0 on each countdown tick for dramatic effect

**From Plan 06-03:**
- Minion HP scaling — Base HP 50 + 10 per voter for balanced difficulty
- Minion action distribution — 50% attack, 30% heal boss, 20% debuff
- Minion attack interval — 4 second loop for all alive minions
- Recursive setTimeout for AI loop — Clean cleanup on boss defeat or lobby destruction

**From Plan 06-03b:**
- Minion respawn random delay — 15-30 seconds for variety
- Team switch kills minion immediately — No respawn on team switch (respawnInSeconds=0)
- getCombatState returns undefined — Consistency with Map.get() behavior

**From Plan 06-04:**
- Discussion duration default 2 minutes — Sufficient time for meaningful discussion
- Finalize validation — Host can only pick from actually voted values
- Consensus auto-ends immediately — No delay needed when everyone agrees
- Four ending mechanisms — consensus, host_finalized, timer_expired in priority order

**From Plan 06-05:**
- Both teams needed for full consensus — Integration tests confirmed both dev and QA teams must consensus
- ScopedEventBus for integration tests — CombatManager expects ScopedEventBus interface
- battle_complete clears all timers — Boss attack, modifier, and minion timers cleared before discussion
- Phase transition via event bus — discussion_ended handler in websocket.ts transitions to next_level/victory

### Pending Todos

None yet.

### Blockers/Concerns

- Pre-existing TypeScript errors in codebase (unrelated to domain types) — Should be addressed in future maintenance task

## Session Continuity

Last session: 2026-02-02 22:19:00Z
Stopped at: Completed 06-05-PLAN.md
Resume file: None

**Phase 6 Complete:** All 5 plans executed. Complete game flow: estimation -> battle -> countdown -> team attack -> discussion -> next_level/victory. Integration tests verify flow (9 tests). Domain managers (Session, Estimation, Combat) fully wired via event bus. Fine-grained events emit to clients. Ready for production testing.
