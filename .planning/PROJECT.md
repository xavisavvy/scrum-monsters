# ScrumQuest

## What This Is

A real-time multiplayer scrum poker estimation game with JRPG-style boss battles. Teams (Dev and QA) estimate story points while battling monsters — voting happens first in a focused estimation phase, then voters enter battle while waiting for others. Full-stack TypeScript with Socket.IO for real-time sync and React Three Fiber for 3D graphics.

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
- ✓ Domain separation (Session, Estimation, Combat managers) — v1.0
- ✓ EventBus-based cross-domain coordination — v1.0
- ✓ Fine-grained events replacing full-state broadcasts — v1.0
- ✓ Estimation-before-battle flow with countdown — v1.0
- ✓ Players in mixed states (estimating vs fighting) — v1.0
- ✓ Spectator minion system — v1.0
- ✓ Boss death wait state — v1.0

### Active

(None — define in next milestone)

### Out of Scope

- XP/leveling system — future feature
- New boss types or combat mechanics — keep existing combat
- UI redesign — keep existing components
- Database schema changes — in-memory state focus
- Microservices architecture — network latency kills real-time performance
- Full removal of lobby_updated fallback — intentionally retained for edge cases

## Context

**Current State (v1.0 shipped):**
- ~43k lines of TypeScript across client/server/shared
- Domain-separated architecture: SessionManager, EstimationManager, CombatManager
- EventBus-based coordination with scoped subscriptions
- Fine-grained events with 80-95% bandwidth reduction
- 284+ tests including integration suite

**Tech stack:** TypeScript, Socket.IO, React, Zustand, React Three Fiber, Drizzle ORM

**Codebase map:** `.planning/codebase/` (created during v1.0)

**Key files:**
- `server/domains/SessionManager.ts` — lobby lifecycle, players, teams, reconnection
- `server/domains/EstimationManager.ts` — voting, consensus, timers, discussion
- `server/domains/CombatManager.ts` — boss, player HP, damage, revival, minions
- `server/events/ScopedEventBus.ts` — cross-domain event coordination
- `server/events/ClientEventEmitter.ts` — EventBus to Socket.IO bridge

## Constraints

- **Tech stack**: TypeScript, Socket.IO, React, Zustand — no changes
- **Real-time**: Must maintain low-latency multiplayer sync
- **Backward compatibility**: None required — clean slate on types acceptable
- **Testing**: Maintain test coverage, add tests for new features

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three domains (Session/Estimation/Combat) | Natural boundaries based on concerns | ✓ Good |
| EventBus for cross-domain coordination | Decouples domains, enables reactive patterns | ✓ Good |
| Scoped subscriptions with cleanup contracts | Prevents memory leaks in long-running lobbies | ✓ Good |
| Fine-grained events over full-state broadcasts | 80-95% bandwidth reduction, better scalability | ✓ Good |
| Estimation before battle entry | Keep voting focused, combat as waiting entertainment | ✓ Good |
| Players in mixed states | Voters fight while non-voters estimate | ✓ Good |
| Spectator minion system | Makes spectator role engaging, adds boss-side combat | ✓ Good |
| Retain lobby_updated as fallback | Safety net during migration, documented edge cases | ✓ Good |
| 10s countdown with scaling multiplier | Creates dramatic JRPG moment, rewards fast voting | ✓ Good |

---
*Last updated: 2026-02-02 after v1.0 milestone*
