# Roadmap: ScrumQuest Domain Separation

## Overview

Refactor a 2000+ line monolithic GameStateManager into separate Session, Estimation, and Combat domains to improve maintainability while preserving real-time multiplayer performance. The journey follows dependency order: establish type definitions and communication infrastructure first, extract domain managers sequentially (Session -> Estimation -> Combat), optimize with fine-grained events, and finally implement the new estimation-before-battle game flow.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Extract state types and event bus
- [x] **Phase 2: SessionManager** - Extract lobby and player lifecycle
- [x] **Phase 3: EstimationManager** - Extract voting and consensus logic
- [x] **Phase 4: CombatManager** - Extract battle and health mechanics
- [x] **Phase 5: Fine-Grained Events** - Replace coarse broadcasts with targeted events
- [ ] **Phase 6: New Flow Implementation** - Implement estimation-before-battle flow

## Phase Details

### Phase 1: Foundation
**Goal**: Establish domain vocabulary and communication infrastructure without breaking existing functionality
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-04, ARCH-05, ARCH-06, ARCH-09
**Success Criteria** (what must be TRUE):
  1. SessionState, EstimationState, CombatState TypeScript interfaces exist and compile
  2. EventBus implementation exists with typed emit/subscribe methods
  3. Internal domain event types are defined (player_voted, consensus_reached, boss_damaged, etc.)
  4. Event listener cleanup contracts are documented to prevent memory leaks
  5. Test suite passes with no regressions from existing functionality
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Create domain state types (SessionState, EstimationState, CombatState)
- [x] 01-02-PLAN.md — Create domain event types and typed EventBus
- [x] 01-03-PLAN.md — Add scoped subscription management and tests

### Phase 2: SessionManager
**Goal**: Extract player and lobby lifecycle management from monolith into dedicated domain manager
**Depends on**: Phase 1
**Requirements**: ARCH-01, ARCH-10, INTG-02
**Success Criteria** (what must be TRUE):
  1. Players can create lobbies and receive invite links (existing functionality maintained)
  2. Players can join lobbies and see other players in real-time
  3. Host transfer works when host disconnects
  4. Reconnection token system restores player session after network interruption
  5. All session-related socket handlers delegate to SessionManager instead of GameStateManager
**Plans**: 5 plans

Plans:
- [x] 02-01-PLAN.md — Create SessionErrors and SessionManager class shell
- [x] 02-02-PLAN.md — Implement lobby lifecycle methods (TDD)
- [x] 02-03-PLAN.md — Implement reconnection system (TDD)
- [x] 02-04-PLAN.md — Implement host transfer and team management (TDD)
- [x] 02-05-PLAN.md — Wire SessionManager to socket handlers

### Phase 3: EstimationManager
**Goal**: Extract voting, consensus, and timer logic into dedicated domain manager
**Depends on**: Phase 2
**Requirements**: ARCH-02, ARCH-10, FLOW-01, FLOW-07
**Success Criteria** (what must be TRUE):
  1. Players can submit votes for story points on active tickets
  2. Consensus is detected automatically when all eligible players vote the same value
  3. Timer countdown works correctly for voting phases and discussion phases
  4. Players can change votes during discussion phase
  5. EstimationManager subscribes to player_joined events from SessionManager and initializes vote state
**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md — Create EstimationErrors and EstimationManager foundation
- [x] 03-02-PLAN.md — Implement vote casting and consensus detection (TDD)
- [x] 03-03-PLAN.md — Implement per-team timer management (TDD)
- [x] 03-04-PLAN.md — Implement vote visibility and host controls
- [x] 03-05-PLAN.md — Wire EstimationManager to session events and websocket handlers

### Phase 4: CombatManager
**Goal**: Extract battle mechanics, health tracking, and revival system into dedicated domain manager
**Depends on**: Phase 3
**Requirements**: ARCH-03, FLOW-02, FLOW-03, FLOW-04
**Success Criteria** (what must be TRUE):
  1. Boss has health bar that depletes when players submit votes
  2. Players have individual health that decreases from boss attacks
  3. Downed players can be revived by teammates within timeout period
  4. Boss death triggers wait state if not all players have voted yet
  5. CombatManager subscribes to player_voted events and triggers battle entry for that player
  6. Players can be in different states simultaneously (some estimating, some fighting)
**Plans**: 6 plans

Plans:
- [x] 04-01-PLAN.md — Create CombatErrors and CombatManager foundation
- [x] 04-02-PLAN.md — Combat initialization and boss mechanics (TDD)
- [x] 04-03-PLAN.md — Boss attack AI system (TDD)
- [x] 04-04-PLAN.md — Player health and down system (TDD)
- [x] 04-05-PLAN.md — Channel-based revival system (TDD)
- [x] 04-06-PLAN.md — Wire CombatManager to events and websocket handlers

### Phase 5: Fine-Grained Events
**Goal**: Replace lobby_updated full-state broadcasts with targeted domain-specific events
**Depends on**: Phase 4
**Requirements**: ARCH-07, ARCH-08, INTG-01
**Success Criteria** (what must be TRUE):
  1. Server emits specific events (player_voted, boss_damaged, phase_changed) instead of lobby_updated
  2. Client Zustand store subscribes to and handles all new fine-grained events
  3. Bandwidth usage decreases measurably compared to full-state broadcasts
  4. Socket handlers route client events through domain managers instead of directly mutating state
  5. All existing game functionality works identically from user perspective
**Plans**: 5 plans

Plans:
- [x] 05-01-PLAN.md — Create client event types and LobbyEventSequencer
- [x] 05-02-PLAN.md — Create useEventSync store and setupEventHandlers
- [x] 05-03-PLAN.md — Create ClientEventEmitter bridge
- [x] 05-04-PLAN.md — Wire ClientEventEmitter and add client event types
- [x] 05-05-PLAN.md — Migrate client to fine-grained events, remove lobby_updated

### Phase 6: New Flow Implementation
**Goal**: Implement estimation-before-battle flow with 10s countdown and simultaneous player states
**Depends on**: Phase 5
**Requirements**: FLOW-05, FLOW-06, INTG-03, INTG-04
**Success Criteria** (what must be TRUE):
  1. All players voting triggers 10-second countdown with bonus damage opportunity
  2. Countdown expiration transitions to discussion phase automatically
  3. Spectators continue fighting for boss side as expected
  4. Team competition stats track correctly across new flow
  5. Game flow works end-to-end: estimation -> battle (triggered by first vote) -> discussion -> next ticket
**Plans**: TBD

Plans:
- [ ] TBD (planning pending)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-01 |
| 2. SessionManager | 5/5 | Complete | 2026-02-01 |
| 3. EstimationManager | 5/5 | Complete | 2026-02-02 |
| 4. CombatManager | 6/6 | Complete | 2026-02-02 |
| 5. Fine-Grained Events | 5/5 | Complete | 2026-02-02 |
| 6. New Flow Implementation | 0/0 | Not started | - |
