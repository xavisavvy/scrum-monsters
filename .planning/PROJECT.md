# ScrumQuest

## What This Is

A real-time multiplayer scrum poker estimation game with JRPG-style boss battles. Teams (Dev and QA) estimate story points while battling monsters — but estimation is the core, combat is the engaging wrapper. Full-stack TypeScript with Socket.IO for real-time sync and React Three Fiber for 3D graphics.

## Core Value

Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.

## Requirements

### Validated

- ✓ Real-time multiplayer lobbies with invite links — existing
- ✓ Team assignment (Developers, QA, Spectators) — existing
- ✓ Ticket management (add, remove, Jira integration) — existing
- ✓ Avatar selection with class-based abilities — existing
- ✓ Boss battles with HP, damage, ring attacks — existing
- ✓ Player combat (HP, downed state, revival) — existing
- ✓ Voting with multiple scales (Fibonacci, T-shirt) — existing
- ✓ Consensus detection and countdown — existing
- ✓ Discussion phase with vote changes — existing
- ✓ Spectators fight for boss side — existing
- ✓ Reconnection with grace period and token — existing
- ✓ Timer settings for voting — existing
- ✓ Team competition stats — existing

### Active

- [ ] **ARCH-01**: Split GameStateManager into Session, Estimation, and Combat domains
- [ ] **ARCH-02**: Split Lobby type into focused sub-types (SessionState, EstimationState, CombatState)
- [ ] **ARCH-03**: Replace lobby_updated with fine-grained domain events
- [ ] **FLOW-01**: New phase flow: estimation → battle → discussion
- [ ] **FLOW-02**: First vote triggers battle entry for that player
- [ ] **FLOW-03**: Players in different states simultaneously (estimating vs fighting)
- [ ] **FLOW-04**: Boss death before all voted = wait state
- [ ] **FLOW-05**: All voted = 10s countdown for bonus damage, then discussion
- [ ] **FLOW-06**: All players die = game over (keep existing)

### Out of Scope

- XP/leveling system — future feature, not this milestone
- New boss types or combat mechanics — keep existing combat, just restructure
- UI redesign — keep existing components, update for new flow
- Database schema changes — in-memory state focus

## Context

**Brownfield project** with ~15k lines of TypeScript across client/server/shared. The codebase is functional but has grown organically into a monolithic structure.

**Current pain points:**
- `GameStateManager` is 2000+ lines handling every concern
- `Lobby` type is 27 fields mixing session, estimation, and combat
- Every state change broadcasts entire Lobby object
- Hard to reason about, add features, or debug

**Codebase map exists** at `.planning/codebase/` — use for reference during implementation.

**Key files to refactor:**
- `server/gameState.ts` — the monolith to split
- `shared/gameEvents.ts` — types and events to redesign
- `server/socketHandlers.ts` — event handlers to update
- `client/src/lib/stores/useGameStore.tsx` — client state to align

## Constraints

- **Tech stack**: TypeScript, Socket.IO, React, Zustand — no changes
- **Real-time**: Must maintain low-latency multiplayer sync
- **Backward compatibility**: None required — clean slate on types acceptable
- **Testing**: Maintain test coverage, add tests for new domains

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Clean slate on Lobby type | Proper domain separation requires redesigning the core type | — Pending |
| Fine-grained events | Real-time game best practice — send only what changed | — Pending |
| Three domains (Session/Estimation/Combat) | Natural boundaries based on concerns | — Pending |
| Estimation before battle entry | Keep voting focused, combat as waiting entertainment | — Pending |
| Players in mixed states | Voters fight while non-voters estimate | — Pending |

---
*Last updated: 2026-02-01 after initialization*
