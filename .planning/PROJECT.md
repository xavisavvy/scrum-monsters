# ScrumQuest

## What This Is

A real-time multiplayer scrum poker estimation game with JRPG-style boss battles and RPG progression. Teams estimate story points while battling monsters with class abilities, team combos, and combat items. Full-stack TypeScript with Socket.IO for real-time sync and React Three Fiber for 3D graphics.

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
- ✓ ESLint configuration with TypeScript/React rules — v1.1
- ✓ E2E testing with Playwright — v1.1
- ✓ Kustomize overlays (dev/staging/prod) — v1.1
- ✓ Sealed Secrets for encrypted secrets in Git — v1.1
- ✓ cert-manager for automatic TLS certificates — v1.1
- ✓ Pino structured JSON logging — v1.1
- ✓ Prometheus metrics endpoint — v1.1
- ✓ Grafana + Loki monitoring stack — v1.1
- ✓ ArgoCD GitOps deployment — v1.1
- ✓ PR workflow with required reviews and templates — v1.2
- ✓ Security scanning (CodeQL SAST, gitleaks, audit-ci) — v1.2
- ✓ Test coverage thresholds with PR reporting — v1.2
- ✓ Visual regression testing with Playwright — v1.2
- ✓ Drizzle versioned migrations with CI validation — v1.2
- ✓ API contract testing with OpenAPI/Schemathesis — v1.2
- ✓ Load testing with k6 (HTTP + WebSocket) — v1.2
- ✓ Accessibility testing with axe-core — v1.2
- ✓ ArgoCD rollback automation with audit trail — v1.2
- ✓ Account-level XP with persistent progression and leveling curve — v1.3
- ✓ JRPG-styled XP UI (bar, floating numbers, level-up celebration) — v1.3
- ✓ Class mastery with three-tier progression and stat bonuses — v1.3
- ✓ 5 unique boss AIs with state machines and HP-phase transitions — v1.3
- ✓ Boss threat targeting and telegraph system — v1.3
- ✓ Boss difficulty scaling based on team level — v1.3
- ✓ 20 class-specific abilities with server-authoritative cooldowns — v1.3
- ✓ Team combo system with class-pair detection — v1.3
- ✓ Consensus ultimates with voting-speed damage scaling — v1.3
- ✓ Session-scoped combat items (heal/shield/damage boost) — v1.3
- ✓ Persistent lifetime statistics with session summaries — v1.3

### Active

(None — awaiting next milestone definition)

### Out of Scope

- UI redesign — deferred to future milestone
- Mobile responsiveness — deferred to future milestone
- Persistent inventory — items deliberately session-scoped
- Multi-class combo chains — 2-class combos sufficient
- XP penalties for "wrong" votes — undermines collaboration
- Pay-to-win progression — violates core value
- Microservices architecture — network latency kills real-time performance
- Full removal of lobby_updated fallback — intentionally retained for edge cases

## Context

**Current State (v1.3 shipped):**
- ~100k lines of TypeScript/YAML across client/server/shared/k8s
- Domain-separated architecture: SessionManager, EstimationManager, CombatManager, ProgressionManager, ClassMasteryManager, AbilityManager, ComboManager, ItemManager, StatsTracker
- EventBus-based coordination with scoped subscriptions
- Fine-grained events with 80-95% bandwidth reduction
- RPG progression: XP/leveling, class mastery tiers, 20 class abilities, team combos, combat items, lifetime stats
- Boss AI: 5 unique bosses with state machines, HP phases, threat targeting, telegraphing, level scaling
- Comprehensive CI/CD: ESLint, Playwright E2E/visual/a11y, Vitest coverage
- Security scanning: CodeQL SAST, gitleaks secrets, audit-ci, license-checker
- Database migrations: Drizzle versioned, CI validation, ArgoCD PreSync
- API contracts: OpenAPI 3.1, AsyncAPI 3.0, Schemathesis testing
- Load testing: k6 HTTP/WebSocket with nightly runs
- Deployment safety: ArgoCD rollback with environment protection and audit trail
- Observability: Prometheus metrics, Grafana dashboards, Loki logs
- Ad-hoc lobby magic/emote system (partially complete, needs formal planning)

## Shipped Milestones

- **v1.0 Domain Separation** (2026-02-02): Extracted domain managers, EventBus coordination, fine-grained events
- **v1.1 CI/CD Infrastructure** (2026-02-02): ESLint, Playwright E2E, Kubernetes/Kustomize, ArgoCD GitOps, observability
- **v1.2 SDLC Best Practices** (2026-02-03): PR gates, security scanning, migrations, contracts, load testing, rollback
- **v1.3 Game Progression** (2026-02-11): XP/leveling, class mastery, boss AI, abilities, combos, items, lifetime stats

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
| Kustomize overlays over Helm | Simpler, native kubectl support, good for single app | ✓ Good |
| Sealed Secrets over Vault | Lower complexity for self-hosted, encryption at rest | ✓ Good |
| ArgoCD over Flux | Better UI, easier debugging, wider adoption | ✓ Good |
| Pino over Winston | Better performance, native JSON, smaller bundle | ✓ Good |
| Prometheus + Loki over ELK | Lower resource usage, Grafana unification | ✓ Good |
| 12% coverage baseline over 70% target | Pragmatic start, prevents regression, raise incrementally | ✓ Good |
| CodeQL blocks high/critical only | Reduces noise from low-risk issues | ✓ Good |
| ArgoCD PreSync hook for migrations | Run once per sync, failed migrations block deployment | ✓ Good |
| Load tests never block PRs | Informational only, nightly runs track trends | ✓ Good |
| Auto-rollback disabled for production | Manual intervention ensures proper investigation | ✓ Good |
| JSONL audit trail for rollbacks | Simple append-only format, git history provides immutability | ✓ Good |
| Exponential XP curve (base=100, exp=1.5) | Balanced early progression with meaningful later grind | ✓ Good |
| Per-lobby ProgressionManager isolation | Each lobby manages its own XP state independently | ✓ Good |
| Fire-and-forget XP persistence | Non-blocking gameplay, async storage writes | ✓ Good |
| Three-tier mastery (Novice/Expert/Master) | Simple to understand, meaningful stat differences (1.0/1.1/1.2x) | ✓ Good |
| Award class XP to current class only | Encourages experimentation across classes | ✓ Good |
| Explicit FSM for boss state | Replaces boolean flags, prevents oscillation bugs | ✓ Good |
| HP-based boss phases (66%/33%) | Clear phase boundaries, one-way transitions only | ✓ Good |
| Data-driven boss behavior definitions | 9+ patterns per boss, easy to add new bosses | ✓ Good |
| Server-authoritative ability cooldowns | Prevents client-side cheating on cooldown timers | ✓ Good |
| Event-driven ability effects | Decoupled from CombatManager, clean architecture | ✓ Good |
| 3s ability window for combo detection | Balances coordination requirement vs network latency | ✓ Good |
| Consensus ultimate one-per-ticket | Prevents re-trigger on discussion phase return | ✓ Good |
| Session-scoped items (no persistence) | Simplicity, avoids inventory management complexity | ✓ Good |
| Event-driven stats tracking | StatsTracker subscribes to EventBus, zero coupling | ✓ Good |

---
*Last updated: 2026-02-11 after v1.3 milestone*
