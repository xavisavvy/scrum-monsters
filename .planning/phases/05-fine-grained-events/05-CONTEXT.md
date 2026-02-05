# Phase 5: Fine-Grained Events - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace coarse `lobby_updated` full-state broadcasts with targeted domain-specific events. Server emits specific events (player_voted, boss_damaged, phase_changed), client Zustand store handles them, bandwidth decreases measurably. All game functionality works identically from user perspective.

</domain>

<decisions>
## Implementation Decisions

### Event granularity
- Claude determines appropriate granularity based on domain boundaries (logical batching vs every change)
- Claude determines throttling approach based on event frequency analysis
- Spectators receive all events — same as players for simpler implementation
- Claude determines information hiding strategy (server-side vs client-side filtering)

### Client sync strategy
- Claude determines initial sync approach prioritizing stable connection and gameplay experience
- Sequence numbers for event ordering — client requests missed range when gap detected
- Per-lobby sequence numbers — resets on lobby destruction, simpler isolation
- 30-second event buffer — covers brief disconnects, low memory usage
- Full state refresh as fallback when buffer exhausted — client resets gracefully
- Automatic recovery — client silently catches up without UI indicator
- Optimistic updates for own actions — immediately show your vote/attack, reconcile if server disagrees
- Claude determines event self-containment (delta vs context inclusion)

### Migration approach
- Big bang migration — replace lobby_updated completely in one phase
- Remove lobby_updated completely — no fallback mechanism, cleaner codebase
- Migrate all domains together (Session, Estimation, Combat) — consistent client handling
- No feature flag — commit fully to new system
- Update existing tests to use new events — ensures coverage continuity
- E2E tests plus manual verification for migration completeness
- Measure bandwidth reduction: server logs event sizes, plus manual dev tools inspection
- Claude determines acceptable bandwidth reduction threshold

### Event payload design
- Include timestamps — enables client-side ordering, latency measurement, replay
- Claude determines event naming convention (domain prefix vs flat)
- Claude determines player context inclusion (ID only vs name/avatar)
- Include resulting HP in damage events — e.g., {damage: 25, newHp: 75} for client sync
- Include type field in payload — useful for logging/debugging discriminated unions
- Mask vote values until reveal — vote events show "voted" during voting, actual value in reveal event
- Claude determines multi-entity event structure (one event with array vs multiple events)
- Absolute end time for timers — e.g., {endsAt: 1706900000000} handles clock drift

### Claude's Discretion
- Event granularity (batching strategy, throttling)
- Information hiding approach (server vs client filtering)
- Initial sync mechanism (full hydration vs event replay)
- Event self-containment (delta vs context)
- Event naming convention (domain prefix vs flat)
- Player context in events (ID only vs details)
- Multi-entity event structure
- Acceptable bandwidth reduction threshold

</decisions>

<specifics>
## Specific Ideas

- Sequence numbers should be efficient for requesting missed events over brief network hiccups
- Client recovery should be invisible to user — no "syncing" indicators
- Damage events must include new HP value so client can verify state after optimistic updates
- Vote masking aligns with existing vote visibility behavior (hidden until reveal phase)
- Timer events with absolute end time avoid clock drift issues on clients with latency

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-fine-grained-events*
*Context gathered: 2026-02-02*
