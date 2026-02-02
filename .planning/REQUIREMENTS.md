# Requirements: ScrumQuest Domain Separation

**Defined:** 2026-02-01
**Core Value:** Focused estimation with engaging combat layer — voting distraction-free, waiting fun

## v1 Requirements

Requirements for this refactoring milestone. Each maps to roadmap phases.

### Architecture

- [ ] **ARCH-01**: Create SessionManager handling lobby lifecycle, players, teams, host transfer
- [ ] **ARCH-02**: Create EstimationManager handling tickets, voting, consensus, discussion
- [ ] **ARCH-03**: Create CombatManager handling boss, player HP, damage, revival, battle modifiers
- [ ] **ARCH-04**: Create EventBus for cross-domain coordination using Node.js EventEmitter
- [ ] **ARCH-05**: Split Lobby type into SessionState, EstimationState, CombatState
- [ ] **ARCH-06**: Define domain event types (session.*, estimation.*, combat.*)
- [ ] **ARCH-07**: Replace lobby_updated with fine-grained domain events
- [ ] **ARCH-08**: Update client stores to subscribe to domain-specific events
- [ ] **ARCH-09**: Establish event listener cleanup contracts to prevent memory leaks
- [ ] **ARCH-10**: Migrate timer ownership to respective domain managers

### Flow

- [ ] **FLOW-01**: Implement estimation phase as distinct from battle phase
- [ ] **FLOW-02**: Trigger battle entry on first vote submission
- [ ] **FLOW-03**: Support players in mixed states (estimating vs fighting)
- [ ] **FLOW-04**: Implement boss death wait state when voting incomplete
- [ ] **FLOW-05**: Add 10s countdown for bonus damage after all voted
- [ ] **FLOW-06**: Transition to discussion phase after countdown/battle ends
- [ ] **FLOW-07**: Maintain vote changeability during discussion phase

### Integration

- [ ] **INTG-01**: Update socketHandlers.ts to route events through domain managers
- [ ] **INTG-02**: Preserve reconnection functionality across domain split
- [ ] **INTG-03**: Maintain spectator boss-side combat behavior
- [ ] **INTG-04**: Keep existing team competition stats working

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Polish

- **POL-01**: Domain-specific reconnection (each domain restores independently)
- **POL-02**: Per-domain telemetry and monitoring
- **POL-03**: Smooth UI animations for state transitions
- **POL-04**: Visual indicator showing who's still estimating

### Advanced

- **ADV-01**: XP/leveling system for combat
- **ADV-02**: Event sourcing for state replay
- **ADV-03**: CQRS for read/write separation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Microservices architecture | Network latency kills real-time performance, keep domains in-process |
| Redis pub/sub for events | Premature optimization, in-memory EventEmitter sufficient |
| Full CQRS/Event Sourcing | Overkill for in-memory game state, adds unnecessary complexity |
| Database schema changes | Focus on in-memory state refactoring |
| New combat mechanics | Keep existing combat, just restructure |
| UI redesign | Keep existing components, update for new flow |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | TBD | Pending |
| ARCH-02 | TBD | Pending |
| ARCH-03 | TBD | Pending |
| ARCH-04 | TBD | Pending |
| ARCH-05 | TBD | Pending |
| ARCH-06 | TBD | Pending |
| ARCH-07 | TBD | Pending |
| ARCH-08 | TBD | Pending |
| ARCH-09 | TBD | Pending |
| ARCH-10 | TBD | Pending |
| FLOW-01 | TBD | Pending |
| FLOW-02 | TBD | Pending |
| FLOW-03 | TBD | Pending |
| FLOW-04 | TBD | Pending |
| FLOW-05 | TBD | Pending |
| FLOW-06 | TBD | Pending |
| FLOW-07 | TBD | Pending |
| INTG-01 | TBD | Pending |
| INTG-02 | TBD | Pending |
| INTG-03 | TBD | Pending |
| INTG-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 (pending roadmap creation)

---
*Requirements defined: 2026-02-01*
*Last updated: 2026-02-01 after initial definition*
