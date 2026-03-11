# ScrumQuest

## What This Is

A real-time multiplayer scrum poker estimation game with JRPG-style boss battles, RPG progression, and a polished mobile-responsive UI. Teams estimate story points while battling monsters with class abilities, team combos, and combat items. Full-stack TypeScript with Socket.IO for real-time sync, React Three Fiber for 3D graphics, JRPG design tokens with WCAG AA compliance, React Router v7 clean URLs with SEO, production-ready PostgreSQL persistence with graceful lifecycle management, structured Pino logging, and production hosting on AWS Lightsail with Docker Compose, CI/CD pipeline, and full observability.

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
- ✓ Production security: rate limiting, CSRF, secure randomness, Actions permissions — v2.0
- ✓ JRPG design system: CSS tokens, GamePanel/GameButton/StatBar/HealthBar components — v2.0
- ✓ WCAG AA contrast compliance with axe-core E2E test — v2.0
- ✓ Smooth phase transitions with Framer Motion AnimatePresence — v2.0
- ✓ UI sound effects on game events — v2.0
- ✓ Mobile-first responsive: 44px touch targets, safe-area handling, 100dvh — v2.0
- ✓ Adaptive Three.js rendering: DPR cap, PerformanceMonitor quality scaling — v2.0
- ✓ MobileControls virtual D-pad with pointer events — v2.0
- ✓ Orientation support with RotateDeviceOverlay — v2.0
- ✓ React Router v7 clean URLs with server-side SEO meta injection — v2.0
- ✓ Open Graph/Twitter card rich previews — v2.0
- ✓ Three.js code splitting (863KB isolated vendor chunk) — v2.0
- ✓ Player readiness system with ARIA accessibility — v2.0
- ✓ Idle sprite animations with Framer Motion bobbing — v2.0
- ✓ Emote system with magic word detection (40 unit tests) — v2.0
- ✓ Zod 4.x upgrade resolving shared/schema.ts TypeScript errors — v3.0
- ✓ Production OG image (1200x630 branded) replacing placeholder — v3.0
- ✓ Husky v10 deprecation warning resolved — v3.0
- ✓ Debug console.log removed from sprite code — v3.0
- ✓ PostgreSQL persistence with connection pooling and session store — v3.0
- ✓ Zod environment validation with fail-fast startup — v3.0
- ✓ Graceful shutdown with WebSocket client notification — v3.0
- ✓ Split Kubernetes health probes (livez/readyz) with DB connectivity — v3.0
- ✓ Global error handlers (unhandledRejection/uncaughtException) — v3.0
- ✓ Structured startup config logging (DB type, pool size, env) — v3.0
- ✓ Resource profiling infrastructure with MetricsCollector — v3.0
- ✓ Hosting cost comparison across 5 platforms (9 tiers) — v3.0
- ✓ Data-driven hosting recommendation (AWS Lightsail $5/mo) — v3.0
- ✓ All 394 console.log statements migrated/removed (228 server → Pino, 166 client removed) — v3.1
- ✓ ESLint no-console upgraded from warn to error with CI enforcement — v3.1
- ✓ Unused zod-validation-error dependency removed — v3.1
- ✓ Graceful server shutdown client notifications with auto-reconnect — v3.1
- ✓ Lightsail instance with firewall (80, 443, 22), Docker Compose 3-service stack — v4.0
- ✓ Custom domain HTTPS via Nginx Proxy Manager + Let's Encrypt — v4.0
- ✓ Systemd auto-start on VPS reboot, secrets via .env (never in git) — v4.0
- ✓ SIGTERM handler drains WebSocket connections for 30s (io.close()) — v4.0
- ✓ Daily PostgreSQL backups to S3 with 30-day retention — v4.0
- ✓ GHCR image tags (sha + semver) with rollback in under 5 minutes — v4.0
- ✓ Route 53 + CloudWatch + SNS uptime alerting within 5 minutes — v4.0
- ✓ CI/CD: auto-deploy staging on push to main, manual prod via workflow_dispatch — v4.0
- ✓ AWS OIDC auth for GitHub Actions (no stored long-lived keys) — v4.0
- ✓ Post-deploy Playwright smoke tests, Drizzle migrations before app start — v4.0
- ✓ Prometheus + Grafana dashboards (10 panels), Dozzle log aggregation — v4.0
- ✓ All monitoring ports localhost-only (SSH tunnel access) — v4.0
- ✓ End-to-end S3 database restore verified working — v4.0
- ✓ Blackbox Exporter TLS certificate monitoring with Prometheus alerts — v4.0
- ✓ Incident runbook: restart, restore, rollback, 5 failure scenarios — v4.0

### Active

(No active requirements — define in next milestone)

### Out of Scope

- Persistent inventory — items deliberately session-scoped
- Multi-class combo chains — 2-class combos sufficient
- XP penalties for "wrong" votes — undermines collaboration
- Pay-to-win progression — violates core value
- Microservices architecture — network latency kills real-time performance
- Full removal of lobby_updated fallback — intentionally retained for edge cases
- Pixel-perfect sprite animations — high complexity, diminishing returns for estimation app
- Dynamic lobby OG images — server-side image generation complexity, low SEO impact
- Lobby mini-games — scope creep risk, only warranted if wait times become problematic
- Full SSR framework (Next.js) — overkill, vite-react-ssg handles marketing pages
- Player collision physics in lobby — fun but non-essential, high implementation cost
- Native mobile app (PWA/React Native) — responsive web sufficient for now
- Database read replicas — premature optimization for current scale
- Kubernetes production deployment — Docker Compose on single VPS sufficient at current scale
- ECS Fargate or EKS — exceeds budget, requires ops team knowledge
- Datadog/New Relic APM — incompatible with $5-20/mo budget
- Multi-region deployment — premature, single region sufficient for current user base

## Context

**Current State (post-v4.0):**
- ~62,000 lines of TypeScript across client/server/shared
- Domain-separated architecture: SessionManager, EstimationManager, CombatManager, ProgressionManager, ClassMasteryManager, AbilityManager, ComboManager, ItemManager, StatsTracker
- EventBus-based coordination with scoped subscriptions
- Fine-grained events with 80-95% bandwidth reduction
- RPG progression: XP/leveling, class mastery tiers, 20 class abilities, team combos, combat items, lifetime stats
- Boss AI: 5 unique bosses with state machines, HP phases, threat targeting, telegraphing, level scaling
- JRPG design system: 53 CSS tokens, CVA components (GamePanel, GameButton, StatBar, HealthBar), WCAG AA verified
- Mobile-responsive: safe-area, 44px touch targets, adaptive DPR, virtual D-pad, orientation handling
- Modern routing: React Router v7, server-side SEO, Three.js code splitting, clean URLs
- Production security: rate limiting, CSRF, secure randomness, GitHub Actions permissions
- Production database: PostgreSQL with connection pooling, Zod env validation, fail-fast startup
- Server lifecycle: graceful shutdown with 30s WebSocket drain (io.close()), split health probes (livez/readyz), global error handlers
- Structured logging: Pino JSON logs (5 logger types), ESLint no-console at error level, zero unstructured console output
- Comprehensive CI/CD: ESLint (no-console enforced), Playwright E2E/visual/a11y, Vitest coverage (615 tests)
- Security scanning: CodeQL SAST, gitleaks, audit-ci, license-checker
- Production hosting: AWS Lightsail $5/mo, Docker Compose (app + postgres + nginx proxy manager)
- CI/CD pipeline: auto-deploy staging on push, manual prod promote, AWS OIDC, post-deploy smoke tests
- Observability: Prometheus + Grafana (10-panel dashboard), Dozzle logs, all monitoring localhost-only
- Disaster recovery: daily S3 backups, verified restore, TLS cert monitoring, incident runbook

**Deployment:**
- Live at https://scrummonsters.com on AWS Lightsail ($5/mo)
- Static IP: 34.199.135.244 (scrummonsters-prod instance)
- CI/CD: push to main → staging auto-deploy → manual prod promote
- Monitoring: SSH tunnel to localhost:9090 (Prometheus), :3001 (Grafana), :9999 (Dozzle)
- Budget: $5-20/mo
- Scale: handles 50 concurrent users, 58% headroom for 2x growth

**Known tech debt:**
- CI/CD doesn't git pull compose changes on VPS (manual deploy.sh needed for config changes)
- Grafana metric name mismatch: 1 of 10 panels shows "No data" (heap_used vs heap_size_used)
- deploy.sh vs CI/CD deploy not documented (which to use when)
- No Terraform/IaC — infrastructure provisioned via console (future ADV-02)

## Shipped Milestones

- **v1.0 Domain Separation** (2026-02-02): Extracted domain managers, EventBus coordination, fine-grained events
- **v1.1 CI/CD Infrastructure** (2026-02-02): ESLint, Playwright E2E, Kubernetes/Kustomize, ArgoCD GitOps, observability
- **v1.2 SDLC Best Practices** (2026-02-03): PR gates, security scanning, migrations, contracts, load testing, rollback
- **v1.3 Game Progression** (2026-02-11): XP/leveling, class mastery, boss AI, abilities, combos, items, lifetime stats
- **v2.0 UI Redesign & Mobile** (2026-02-19): JRPG design system, mobile responsive, security hardening, routing/SEO, lobby polish
- **v3.0 Production Optimization** (2026-02-20): PostgreSQL persistence, graceful shutdown, health probes, hosting analysis
- **v3.1 Tech Debt Cleanup** (2026-02-24): Pino structured logging, ESLint no-console enforcement, dependency cleanup, shutdown UX
- **v4.0 Hosting & Deployment** (2026-03-11): AWS Lightsail hosting, Docker Compose, CI/CD pipeline, Prometheus/Grafana observability, S3 backups, disaster recovery

## Constraints

- **Tech stack**: TypeScript, Socket.IO, React, Zustand — no changes
- **Real-time**: Must maintain low-latency multiplayer sync
- **Backward compatibility**: None required — clean slate on types acceptable
- **Testing**: Maintain test coverage, add tests for new features
- **Budget**: $5-20/mo hosting (AWS Lightsail)

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
| Three-tier rate limiting (auth/profile/api) | Defense in depth, different limits per sensitivity | ✓ Good |
| CSRF via x-csrf-token header (not form body) | SPA pattern, OAuth routes excluded (use state param) | ✓ Good |
| crypto.randomBytes for security, Math.random for gameplay | Secure IDs without slowing game randomness | ✓ Good |
| CSS custom property tokens over Tailwind-only | Framework-agnostic, works in plain CSS and Tailwind | ✓ Good |
| GamePanel/GameButton as canonical, RetroCard/RetroButton as re-exports | Avoids 30-file migration, backward compatible | ✓ Good |
| HealthBar standalone (not StatBar wrapper) | Threshold-based dynamic color is fundamentally different pattern | ✓ Good |
| viewport-fit=cover over maximum-scale=1 | Enables safe-area CSS while preserving WCAG pinch-to-zoom | ✓ Good |
| React Router v7 declarative mode (not framework) | No build changes, maintains existing Vite setup | ✓ Good |
| Server-state-driven game phases (URL reflects, doesn't drive) | Prevents state machine vs URL navigation conflicts | ✓ Good |
| Server-side meta injection for all requests | Ensures social previews work without client-side JS | ✓ Good |
| Three.js vendor chunk isolation (863KB) | Marketing pages load fast, game bundle lazy-loaded | ✓ Good |
| Zod 4.x upgrade over staying on 3.x | Resolves drizzle-zod peer dependency, fixes TypeScript errors | ✓ Good |
| Zod refinement for DATABASE_URL warning | Preserves MemStorage fallback while being loud about missing DB | ✓ Good |
| instanceof PgStorage over env var check | More reliable type detection, leverages storage abstraction | ✓ Good |
| Fail-fast on DB connectivity failure | Exit code 1 prevents limping along with broken database | ✓ Good |
| 15-min session pruning interval | Balances database load with timely cleanup (industry standard) | ✓ Good |
| Split health probes (livez/readyz) | Prevents restart loops from transient DB issues | ✓ Good |
| 3s health check timeout | Balances responsiveness with network variability | ✓ Good |
| ESLint no-console at error with exemptions | CI enforcement prevents regression, tests/scripts exempt | ✓ Good |
| AWS Lightsail $5/mo recommendation | 58% headroom for 2x growth, $240/yr savings vs Replit | ✓ Good |
| Object-first Pino API for all server logs | Structured JSON, parseable by Prometheus/Loki | ✓ Good |
| Silent catch for non-critical client errors | Audio autoplay errors expected, no logger needed | ✓ Good |
| Sonner toast for shutdown notifications | Non-blocking UX, already integrated | ✓ Good |
| Grace period timestamp for reconnection | Robust against race conditions between server_shutdown and disconnect | ✓ Good |
| Defer ARGO-01 to FUTURE-ENHANCEMENTS | No ArgoCD host deployed, workflow_dispatch prevents accidents | ✓ Good |
| Docker Compose over Kubernetes for production | Single VPS, 50 concurrent users, K8s is overkill | ✓ Good |
| Nginx Proxy Manager over Caddy/Traefik | GUI-based TLS, built-in Let's Encrypt, low ops overhead | ✓ Good |
| io.close() before server.close() in shutdown | Socket.IO 4.x server.close() does NOT close WS connections | ✓ Good |
| Custom pg17 backup sidecar | Upstream lacks :17 tag, pg_dump v16 refuses Postgres 17 | ✓ Good |
| Route 53 + CloudWatch + SNS over UptimeRobot | AWS-native, 30s interval, no third-party dependency | ✓ Good |
| workflow_run trigger for deploy chaining | Atomic Docker build → staging deploy without manual coordination | ✓ Good |
| AWS OIDC over stored access keys | Short-lived credentials, no secret rotation needed | ✓ Good |
| All monitoring ports localhost-only | Defense in depth, SSH tunnel required for access | ✓ Good |
| Blackbox Exporter for TLS monitoring | Probe-based cert expiry alerts, 32MB memory cap | ✓ Good |
| gunzip|psql for restore (not pg_restore) | Backup format is plain-text SQL, not custom format | ✓ Good |

---
*Last updated: 2026-03-11 after v4.0 milestone*
