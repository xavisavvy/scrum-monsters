# Codebase Concerns

**Analysis Date:** 2026-02-01

## Tech Debt

**Insecure Token Generation:**
- Issue: Reconnect tokens use `Math.random()` for ID generation in `gameState.ts` (lines 78, 459, 549, etc.), which is cryptographically insecure. Token SECRET fallback also uses `Math.random()` (line 33).
- Files: `server/gameState.ts`, `server/websocket.ts`
- Impact: Session hijacking possible; attackers can predict token values and reconnect as other players or take over lobbies
- Fix approach: Replace all `Math.random().toString(36).substring()` with `crypto.randomBytes()` for sensitive IDs. Use `crypto.randomUUID()` for standard token generation. This affects player IDs, lobby IDs, and all security-sensitive random values.

**Weak Session Secret Default:**
- Issue: `SESSION_SECRET` defaults to hardcoded string `"scrumquest-dev-secret-change-in-production"` in `server/index.ts` (line 14)
- Files: `server/index.ts`
- Impact: If `SESSION_SECRET` env var not set in production, sessions are compromised; anyone can forge valid session cookies
- Fix approach: Require `SESSION_SECRET` to be explicitly set in production via environment check. Throw error during startup if NODE_ENV=production and SESSION_SECRET is not configured.

**Weak Reconnect Token Secret Default:**
- Issue: `RECONNECT_TOKEN_SECRET` defaults to `'scrum-monsters-secret-' + Math.random()` in `gameState.ts` (line 33)
- Files: `server/gameState.ts`
- Impact: Reconnect tokens can be forged; players can steal other players' reconnect tokens
- Fix approach: Require `RECONNECT_TOKEN_SECRET` env var. Generate it from `crypto.randomBytes()` if missing and log warning. Better: fail startup if not configured in production.

**Unencrypted Sensitive Data in Redis:**
- Issue: Reconnect tokens stored as plaintext in Redis cache (`redis.ts` line 102-104): `client.setex('token:${sessionData.reconnectToken}'...)`
- Files: `server/redis.ts`
- Impact: If Redis breached, all reconnect tokens exposed; attackers can impersonate any player with active session
- Fix approach: Hash reconnect tokens before storing. Store only hash in Redis, validate token hash during lookup. Alternatively, use Redis ACL/encryption at transport layer.

## Known Issues

**Missing State Sync During Disconnect:**
- Issue: `lobbySync.stateChanges` has TODO comments (lines 407-408 in `gameState.ts`) - doesn't track which players joined/left during disconnect period
- Files: `server/gameState.ts:407-408`
- Symptoms: Reconnecting player doesn't see other players who joined/left while disconnected; UI shows stale lobby state
- Workaround: UI re-requests full lobby state on reconnect, but this is inefficient and races with incoming events
- Fix approach: Track `playersJoined` and `playersLeft` during grace period by comparing snapshots. Populate these arrays in `LobbySync.stateChanges` before returning reconnect response.

**Unsynchronized Animation State:**
- Issue: PlayerController has hardcoded false for jump/movement sync (lines 1026-1032)
- Files: `client/src/components/game/PlayerController.tsx:1026-1032`
- Symptoms: Other players don't see your character jumping or moving smoothly; animation state only syncs on next estimation
- Impact: Poor multiplayer UX; players appear frozen until gameplay event
- Fix approach: Emit player_movement_update events on every position/state change, with debouncing to prevent spam. Store state in combat states.

**Incomplete Emote System:**
- Issue: Emote display in CheatMenu not integrated with main Lobby system (line 40 in CheatMenu.tsx)
- Files: `client/src/components/ui/CheatMenu.tsx:40`
- Symptoms: Emotes shown in CheatMenu but not broadcast to other players; no emote display in main game
- Impact: Feature partially implemented; only visible locally
- Fix approach: Integrate CheatMenu emote system with Lobby's emote modal. Broadcast emote events to all players in lobby.

## Security Considerations

**Session Fixation Risk:**
- Risk: Session middleware attached to Socket.IO but no session regeneration on login/reconnection
- Files: `server/websocket.ts:63-65`, `server/index.ts:33`
- Current mitigation: Express session middleware attached, cookies set to secure mode in production
- Recommendations: Regenerate session on reconnect_with_token. Use `req.session.regenerate()` before updating socket session data. Clear old session tokens.

**OAuth Token Exposure:**
- Risk: Google/GitHub OAuth client secrets could leak if `.env` committed accidentally
- Files: All OAuth routes use env vars for secrets
- Current mitigation: `.env` in `.gitignore`, `.env.example` shows masked placeholders
- Recommendations: Add git pre-commit hook to verify no `.env` files staged. Use secret scanning in CI/CD (GitHub secret scanning already enabled).

**Brute Force Attack on Reconnect:**
- Risk: No rate limiting on `reconnect_with_token` endpoint; attacker can try all possible tokens rapidly
- Files: `server/websocket.ts:942`
- Current mitigation: 15-minute token expiry (`TOKEN_EXPIRY_TIME` line 32 in gameState.ts)
- Recommendations: Add rate limiting per socket/IP. Track failed reconnect attempts, lock after 5 failures. Log reconnect attempts.

**Unvalidated WebSocket Events:**
- Risk: Socket event handlers have minimal input validation
- Files: `server/socketHandlers.ts`, `server/websocket.ts`
- Current mitigation: Basic null checks, type definitions from TypeScript
- Recommendations: Add Zod validation schema for all incoming socket events. Validate position values are within bounds (0-100). Validate damage values are non-negative.

**Player ID Enumeration:**
- Risk: Player IDs are sequential or predictable; attacker can enumerate all player IDs
- Files: `server/gameState.ts:459, 549` (generate with `Math.random().substring(2,15)`)
- Current mitigation: Non-sequential randomization
- Recommendations: Use cryptographic UUID v4 for all player/lobby IDs. This also fixes the insecure random issue.

## Performance Bottlenecks

**Revival Watchdog Interval Too Aggressive:**
- Problem: Revival sessions checked every 100ms (line 40 in gameState.ts) in a tight loop
- Files: `server/gameState.ts:40`
- Cause: High CPU usage for interval that only triggers on active revivals (3-second duration)
- Improvement path: Increase interval to 500ms. Use timers for exact completion instead of polling. Current implementation wastes cycles checking expired sessions.

**Consensus Countdown Updates Excessive:**
- Problem: Consensus countdown emits updates every 100ms (line 1566 in gameState.ts), creating high socket message volume
- Files: `server/gameState.ts:1566`
- Cause: Event emitted to all players in lobby for every tick
- Improvement path: Emit updates every 500ms or 1000ms. Calculate remaining time client-side. Only emit when second changes.

**Large Lobby Performance:**
- Problem: Ring attack creation iterates all players (line 1743+ in gameState.ts); with 20+ players creates 120+ projectiles
- Files: `server/gameState.ts:1743-1783`
- Cause: O(n) projectile generation per attack with no culling
- Improvement path: Limit max targets to 10. Cull players too far away. Use spatial hash for target selection. Batch projectile updates.

**In-Memory Lobby Storage Unbounded:**
- Problem: All lobbies stored in memory map (line 16 in gameState.ts); never cleaned except on manual removal
- Files: `server/gameState.ts:16`
- Cause: No automatic cleanup of abandoned lobbies or completed games
- Improvement path: Add automatic lobby expiration (30 minutes idle). Move old lobbies to Redis. Implement soft delete before hard deletion.

**Redis Cache on Every Lobby Update:**
- Problem: `syncLobbyToCache()` called on every state change, potentially expensive serialization
- Files: `server/gameState.ts:48-51`
- Cause: No debouncing or batching of cache writes
- Improvement path: Batch cache updates every 5 seconds. Only cache on phase changes, not every position update. Use Redis pipelining.

## Fragile Areas

**Game State Manager - Complex State Mutations:**
- Files: `server/gameState.ts:1-2008`
- Why fragile: Single large class manages lobbies, players, timers, voting, consensus, combat, revival, disconnection recovery. 2000+ lines with deeply nested state. No transaction support - partial failures leave inconsistent state.
- Safe modification: Extract subsystems into separate managers (TimerManager, CombatManager, VotingManager). Use immutable updates. Add state validation before/after mutations.
- Test coverage: No unit tests for gameState.ts. No integration tests for multi-player scenarios. No tests for edge cases like double-disconnect or concurrent voting+reveal.

**WebSocket Connection Handling:**
- Files: `server/websocket.ts:1-1000+`
- Why fragile: Connection/disconnect/reconnection logic intertwined with game logic. Race conditions possible between reconnect token validation and lobby removal. No locks for concurrent operations.
- Safe modification: Separate connection lifecycle from game logic. Use explicit state machine for connection states. Add semaphores for critical sections. Document all race conditions.
- Test coverage: No tests for reconnection scenarios. No chaos tests for network failures.

**Voting and Consensus Logic:**
- Files: `server/gameState.ts:1254-1610` (checkVotingCompletion, checkDiscussionConsensus, completeConsensus)
- Why fragile: Multiple strategies (all voted, all connected voted, 75% majority with time delay). Consensus countdown can race with vote updates. No idempotency guarantees.
- Safe modification: Define consensus state machine explicitly. Lock consensus state during countdown. Make completeConsensus idempotent.
- Test coverage: No tests for voting timeout. No tests for consensus countdown cancellation. No tests for disconnected players affecting voting.

**Player Position and Combat State:**
- Files: `server/gameState.ts:1204-1227`, `server/websocket.ts` position/damage handlers
- Why fragile: Position updates are stateless; no validation of physics. Combat state can diverge from UI if damage events arrive out-of-order. No conflict resolution for simultaneous attacks.
- Safe modification: Add position validation (bounds checking, movement speed validation). Use version numbers for combat state updates. Handle OOO events with version comparison.
- Test coverage: No tests for invalid positions. No tests for simultaneous damage from multiple players.

## Scaling Limits

**In-Memory Lobby Limit:**
- Current capacity: Depends on available RAM, but realistically 100-500 lobbies before memory pressure
- Limit: Each lobby stores full player list, combat states, positions, performance data. No pruning.
- Scaling path: Move to persistent storage (Redis/database). Implement lobby snapshots. Archive old lobbies. Use connection pooling for database.

**WebSocket Connection Limit:**
- Current capacity: Socket.IO with polling fallback; limited by file descriptor limits (typically 65k per process)
- Limit: Single Node process can handle ~1000 concurrent connections with Replit proxying
- Scaling path: Use Socket.IO Redis adapter for horizontal scaling. Deploy multiple processes with load balancing. Use namespace separation for high-traffic lobbies.

**Message Throughput:**
- Current capacity: Broadcasting lobby_updated to 20+ players per position change creates exponential message volume
- Limit: ~100 events/second before network saturation
- Scaling path: Implement spatial subscriptions (only send position updates to nearby players). Use message batching. Compress payloads.

**Database Queries:**
- Current capacity: Optional PostgreSQL with no connection pooling configured
- Limit: If enabled, connection pool quickly exhausted with concurrent lobbies
- Scaling path: Add connection pooling config. Use read replicas for stats. Cache frequently queried data (user profiles, stats).

## Dependencies at Risk

**Socket.IO 4.8.1:**
- Risk: Not latest (v5 available); older versions have known vulnerabilities in connection handling
- Impact: Potential DoS vectors, memory leaks with disconnections
- Migration plan: Test upgrade to v5. Verify compatibility with reconnection tokens. Update test suite.

**bcryptjs 3.0.3:**
- Risk: Legacy crypt implementation; much slower than modern alternatives
- Impact: Login/register endpoints are CPU-bound, vulnerable to computational attacks
- Migration plan: Consider argon2 or scrypt. bcryptjs acceptable if passwords validated server-side first.

**Express 4.21.2 with No Rate Limiting:**
- Risk: No built-in rate limiting; vulnerable to brute force and DoS
- Impact: Reconnect endpoint, login endpoint unprotected
- Migration plan: Add express-rate-limit middleware. Implement per-socket rate limits for WebSocket events.

**Drizzle ORM 0.39.1:**
- Risk: Relatively new ORM; lower community support than Sequelize/Prisma
- Impact: Fewer battle-tested integrations, potential SQL injection if queries constructed incorrectly
- Migration plan: Use parameterized queries exclusively. Add SQL injection tests.

**Upstash Redis Client 1.36.1:**
- Risk: REST-only client without connection pooling; higher latency than direct Redis
- Impact: Cache writes/reads slower; not suitable for high-frequency caching
- Migration plan: Consider ioredis with Upstash REST gateway, or self-hosted Redis for development. Cache effectiveness may be limited.

## Missing Critical Features

**Game State Persistence:**
- Problem: Lobbies exist only in memory. Server restart loses all active games, player positions, estimated scores.
- Blocks: Production deployment; recovery from crashes; audit trails

**Player Authentication Audit Logging:**
- Problem: No logging of who logs in, when, from where. No session audit trail.
- Blocks: Security compliance; investigating compromised accounts

**Admin Panel / Moderation Tools:**
- Problem: No way to manage lobbies, ban players, view server stats without direct code access.
- Blocks: Operational management; detecting abuse

**Rate Limiting on Lobbies:**
- Problem: No limit on how many lobbies a player can create or join. No spam prevention.
- Blocks: Protection against abuse; resource exhaustion

**Estimation Accuracy Tracking:**
- Problem: Completed tickets store story points but don't track actual points realized or accuracy metrics per player.
- Blocks: Performance analytics; leaderboards

## Test Coverage Gaps

**Game State Manager:**
- What's not tested: All state mutations in gameState.ts, reconnection flows, voting/consensus logic, revival system, timer management
- Files: `server/gameState.ts`
- Risk: Critical bugs in game logic go unnoticed until production. No regression protection for complex state machines.
- Priority: **High** - Core game logic must be tested before any feature changes

**WebSocket Event Handlers:**
- What's not tested: Connection/disconnection race conditions, malformed event handling, concurrent events, socket cleanup
- Files: `server/websocket.ts`, `server/socketHandlers.ts`
- Risk: Network edge cases cause game deadlocks or memory leaks. Security issues in event validation missed.
- Priority: **High** - Foundation of real-time system

**Client State Management:**
- What's not tested: useGameStore updates, useWebSocket event handling, phase transitions, UI state consistency
- Files: `client/src/lib/stores/useGameStore.tsx`, `client/src/lib/stores/useWebSocket.tsx`
- Risk: UI bugs go unnoticed. State inconsistencies between server and client become production issues.
- Priority: **Medium** - UI can be iterated on but state bugs compound

**Voting and Consensus:**
- What's not tested: Voting timeout triggering, consensus detection, countdown behavior, edge cases (all disconnect, 1 player, etc)
- Files: `server/gameState.ts:1254-1610`
- Risk: Voting deadlocks, consensus never completes, teams silently desync
- Priority: **High** - Core game mechanic

**Reconnection System:**
- What's not tested: Token generation/validation, grace period expiry, reconnect with stale token, concurrent reconnects, host transfer during disconnect
- Files: `server/gameState.ts:299-431`, `server/websocket.ts:942-1030`
- Risk: Players can't rejoin games after disconnect. Host transfers fail silently. Tokens can be forged or reused.
- Priority: **Critical** - Blocking issue for multiplayer stability

**End-to-End Integration:**
- What's not tested: Full game flows (lobby → avatar → battle → voting → reveal → consensus → next level), multi-player scenarios with different team mixes
- Files: All client and server
- Risk: Complete game flows never verified. Regressions break entire game without detection.
- Priority: **Critical** - Must have before any production deployment

