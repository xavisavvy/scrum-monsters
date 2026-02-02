# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-01)

**Core value:** Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.
**Current focus:** Phase 3 - EstimationManager

## Current Position

Phase: 3 of 6 (EstimationManager)
Plan: 4 of TBD in current phase
Status: In progress
Last activity: 2026-02-02 — Completed 03-04-PLAN.md (Vote visibility & host controls)

Progress: [██████░░░░] 48%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 3.7 min
- Total execution time: 0.73 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 8 min | 2.7 min |
| 02-sessionmanager | 5 | 22 min | 4.4 min |
| 03-estimationmanager | 4 | 22 min | 5.5 min |

**Recent Trend:**
- Last 5 plans: 03-01 (2 min), 03-02 (5 min), 03-03 (8 min), 03-04 (7 min)
- Trend: Phase 03 work averaging 5.5 min

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

### Pending Todos

None yet.

### Blockers/Concerns

- Pre-existing TypeScript errors in codebase (unrelated to domain types) — Should be addressed in future maintenance task

## Session Continuity

Last session: 2026-02-02 07:22 (03-04 execution)
Stopped at: Completed 03-04-PLAN.md - Vote visibility and host controls
Resume file: None

**Phase 3 Progress:** EstimationManager domain feature-complete. Foundation (03-01) + Voting/consensus (03-02) + Timer management (03-03) + Vote visibility & host controls (03-04) ready for WebSocket integration.
