# Phase 2: SessionManager - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract player and lobby lifecycle management from GameStateManager into a dedicated SessionManager domain. Players can create lobbies, join via invite links, reconnect after network interruption, and transfer host privileges. All session-related socket handlers will delegate to SessionManager instead of GameStateManager.

</domain>

<decisions>
## Implementation Decisions

### API Surface Design
- Throw typed exceptions for validation errors (LobbyNotFoundError, LobbyFullError, etc.)
- SessionManager instantiated via dependency injection (not singleton) for testability

### Claude's Discretion (API)
- Method call style vs command pattern for handler interaction
- Return values and event emission strategy
- Specific method signatures

### State Ownership
- Full cutover migration — SessionManager replaces GSM session logic completely in this phase
- Host can modify lobby settings (max players, game mode) until game starts

### Claude's Discretion (State)
- Whether SessionManager owns the lobbies Map or receives it as dependency
- How other domains access session data (query methods vs events vs both)
- Cleanup coordination when lobby destroyed (cascade events vs explicit calls)
- Whether SessionManager tracks game phase or just player presence
- Player state structure (identity, presence, avatar grouping)
- Persistence strategy (direct writes vs event-driven)

### Reconnection Behavior
- 5-minute token validity window — generous grace period for network issues
- Session-only preservation on reconnect — identity and lobby membership preserved, game state may have moved on
- Disconnected players shown grayed out with "reconnecting..." status to other players

### Claude's Discretion (Reconnection)
- Token storage mechanism (localStorage vs URL vs other)
- Cross-device reconnection support

### Host Transfer Rules
- Transfer triggers after grace period expires (not immediately on disconnect)
- New host selected by most recent activity among remaining players
- Host can manually transfer privileges to any player at any time
- Original host regains privileges if they reconnect after transfer

</decisions>

<specifics>
## Specific Ideas

- Disconnected state should be visually obvious but not alarming — grayed out avatar with subtle "reconnecting" indicator
- Activity-based host selection rewards engaged players rather than just who joined first

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-sessionmanager*
*Context gathered: 2026-02-01*
