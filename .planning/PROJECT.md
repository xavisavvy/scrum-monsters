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

### Active

(None — planning next milestone)

### Out of Scope

- XP/leveling system — future feature
- New boss types or combat mechanics — keep existing combat
- UI redesign — keep existing components
- Database schema changes — in-memory state focus
- Microservices architecture — network latency kills real-time performance
- Full removal of lobby_updated fallback — intentionally retained for edge cases

## Context

**Current State (v1.2 shipped):**
- ~70k lines of TypeScript/YAML across client/server/shared/k8s
- Domain-separated architecture: SessionManager, EstimationManager, CombatManager
- EventBus-based coordination with scoped subscriptions
- Fine-grained events with 80-95% bandwidth reduction
- Comprehensive CI/CD: ESLint, Playwright E2E/visual/a11y, Vitest coverage
- Security scanning: CodeQL SAST, gitleaks secrets, audit-ci, license-checker
- Database migrations: Drizzle versioned, CI validation, ArgoCD PreSync
- API contracts: OpenAPI 3.1, AsyncAPI 3.0, Schemathesis testing
- Load testing: k6 HTTP/WebSocket with nightly runs
- Deployment safety: ArgoCD rollback with environment protection and audit trail
- Observability: Prometheus metrics, Grafana dashboards, Loki logs

## Shipped Milestones

- **v1.0 Domain Separation** (2025-12-15): Extracted domain managers, EventBus coordination, fine-grained events
- **v1.1 CI/CD Infrastructure** (2026-02-01): ESLint, Playwright E2E, Kubernetes/Kustomize, ArgoCD GitOps, observability
- **v1.2 SDLC Best Practices** (2026-02-03): PR gates, security scanning, migrations, contracts, load testing, rollback

## Next Milestone

Planning required. Potential directions:
- **v1.3 Feature Work**: XP/leveling system, new boss types, combat mechanics
- **v1.3 UI Polish**: UI redesign, mobile responsiveness, accessibility improvements
- **v2.0 Production Hardening**: Horizontal scaling, multi-region, disaster recovery

Run `/gsd:new-milestone` to define scope and create roadmap.

**Tech stack:** TypeScript, Socket.IO, React, Zustand, React Three Fiber, Drizzle ORM, Pino, Prometheus

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

---
*Last updated: 2026-02-03 after v1.2 milestone completion*
