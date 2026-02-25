# Project Research Summary

**Project:** ScrumQuest — Docker + AWS Lightsail Deployment
**Domain:** Production Docker Compose deployment to single VPS with CI/CD, TLS, observability, and data backups
**Researched:** 2026-02-24
**Confidence:** HIGH

---

## Executive Summary

ScrumQuest's migration from Replit to production hosting on AWS Lightsail is **technically low-risk and organizationally straightforward**. The existing stack already has a multi-stage Dockerfile, docker-compose.yml with health checks, GitHub Actions CI, Prometheus `/metrics` endpoint, and Pino structured logging. The missing pieces are operational: automated deployment workflow, TLS certificate management, database backups, and on-instance observability. No architectural refactoring is required.

**The recommended path** is a Lightsail Micro instance ($10/mo) with Docker Compose, an Nginx reverse proxy for TLS termination via Let's Encrypt, GitHub Actions CI/CD deploying to the instance via SSH, automated daily pg_dump to S3, and a lightweight on-instance monitoring stack (Prometheus + Grafana). With containerized PostgreSQL as a sidecar (no managed DB fee), total cost lands at $15-20/mo — equal to or less than current Replit spend — while gaining full control, backups, and observability. The 1GB RAM constraint is manageable: app (~300MB), PostgreSQL (~150MB), monitoring (~150MB), and OS overhead (~100MB) fit within budget when Prometheus retention and memory limits are properly configured.

**The primary risk** is not infrastructure complexity but operational correctness on first deploy: graceful shutdown must be implemented before the first production deployment (dropped WebSocket connections during deploys cause user churn), secrets must never touch git (one mistake exposes the database), and monitoring containers must have memory limits or they will starve the app. These are all solvable within the first two phases.

---

## Key Findings

### Recommended Stack

Both research streams agreed on the same core approach with minor differences in tooling choices. Where they differed, this summary prefers the more conservative and battle-tested recommendation.

**Core technologies:**

- **AWS Lightsail Micro ($10/mo)**: 1 vCPU, 1GB RAM, 40GB disk — sufficient for 50 concurrent users. Includes 1TB/mo free data transfer, critical for WebSocket-heavy games. Lightsail Instances preferred over Lightsail Containers ($40+/mo) given budget constraint.
- **Docker + Docker Compose 2.24+**: Already in use locally. Production-viable for single-instance; handles PostgreSQL, Redis, app, monitoring sidecars via `restart: unless-stopped` and health checks.
- **Node.js 22 (node:22-slim image)**: Node 20 reaches EOL April 30, 2026. node:22-slim has better musl compatibility vs. alpine and 30% smaller than full node image.
- **Nginx Proxy Manager (Docker container)**: GUI-based reverse proxy with built-in Let's Encrypt automation and WebSocket support. Lower error rate than hand-crafted nginx config. Requires explicit `Upgrade` and `Connection` header forwarding for Socket.IO. Caddy is a valid alternative with simpler config and better cert renewal automation.
- **Let's Encrypt via certbot or Caddy**: Free, automated 90-day renewal. Caddy was recommended by one research thread specifically for reducing TLS operational risk (fully automatic, no cron dependency).
- **GitHub Actions + AWS CLI**: Existing CI (lint, test, build) extended with a `deploy-lightsail.yml` workflow. Staging auto-deploys on push to main; production requires manual `workflow_dispatch`. GitHub OIDC for AWS avoids long-lived access keys in secrets.
- **GHCR (GitHub Container Registry)**: Free for GitHub repos, authenticated automatically via `GITHUB_TOKEN`. Tag strategy: `latest`, `sha-<commit>`, and semantic versions for rollback support.
- **PostgreSQL 16-alpine (sidecar)**: Containerized on same instance saves $15/mo vs. managed Lightsail DB. Acceptable for fewer than 500 concurrent users; migrate to managed at scale. Named Docker volume for persistence.
- **Redis 7-alpine (optional)**: Session store and Socket.IO adapter. Can be omitted on 512MB instance; recommended on 1GB instance. Required for future horizontal scaling.
- **Prometheus 2.54+ + Grafana 10+**: On-instance containers, bound to `127.0.0.1` only. Access via SSH tunnel. Prometheus retention set to 7 days to limit disk and memory. Grafana uses SQLite backend.
- **postgres-backup-s3 sidecar**: Community Docker image (`eeshugerman/postgres-backup-s3`) for automated daily pg_dump to S3 at 2am UTC. 30-day retention via S3 lifecycle policy.

**Versions verified (February 2026):**

| Tool | Recommended Version |
|------|---------------------|
| Node.js image | `node:22-slim` |
| PostgreSQL | `postgres:16-alpine` |
| Redis | `redis:7-alpine` |
| Prometheus | `prom/prometheus:v2.54.1` |
| Grafana | `grafana/grafana:10.2.2` |
| Docker Compose | `2.24+` |
| AWS CLI | `v2.33.26+` |

**Alternatives explicitly rejected:**

- Lightsail Containers: $40+/mo minimum, exceeds budget
- ECS Fargate or EKS: Overkill, $50+/mo, requires ops team knowledge
- Datadog or New Relic: $50+/mo, incompatible with budget
- CloudWatch Logs: $0.50/GB ingestion cost; Docker native logs are sufficient
- ArgoCD or GitOps: GitHub Actions CI is sufficient; ArgoCD adds operational burden for single team
- Kubernetes: Existing k8s manifests in repo are preserved as reference but not used for this deployment target

### Expected Features

Research converged tightly on a prioritized feature hierarchy. Both research threads identified identical table-stakes items.

**Must have (table stakes — all required before production launch):**

- HTTPS on custom domain (non-self-signed TLS via Let's Encrypt)
- Health checks and container auto-restart (`restart: unless-stopped`)
- Graceful shutdown (SIGTERM handler, drains WebSocket connections for 30s before exit)
- Database persistence (named Docker volumes)
- Automated database backups (daily pg_dump to S3)
- Basic monitoring (Prometheus scraping `/metrics`, Grafana dashboards)
- Uptime alerts (email notification within 5 min of downtime via Healthchecks.io or AlertManager)
- Automated CI/CD deployments (staging: auto on push; prod: manual trigger)
- Rollback capability (prior image tag redeploy in under 5 min)
- Secrets management (.env file not in git; GitHub Actions OIDC for AWS)

**Should have (high-value differentiators, after table stakes):**

- Zero-downtime deployments (blue-green via `docker-compose up -d --no-deps --build app`)
- Real-time observability dashboard (Prometheus + Grafana, Socket.IO-specific metrics)
- Automated database migrations run before app starts (Drizzle migrate, not `db:push`)
- Post-deploy smoke tests (existing Playwright E2E tests in CI)

**Defer to v2+ (not essential at fewer than 100 users):**

- Multi-region deployment
- Auto-scaling (requires Redis adapter and horizontal app instances)
- APM tools (Datadog, New Relic)
- Distributed tracing (Jaeger, Tempo)
- Service mesh (Istio, Linkerd)
- Managed PostgreSQL on Lightsail RDS (revisit at 500+ concurrent users)

**Constraints to design around (single-VPS inherent limitations):**

- Single point of failure: 99.5% uptime is realistic target (not 99.9%). Design for fast recovery via backups, not HA.
- Disk shared by app and database: Monitor at 80%, critical at 90%. Configure log rotation.
- No horizontal scaling without Redis adapter refactor.

### Architecture Approach

The production topology is a single Lightsail Micro instance running a Docker Compose stack. Internet traffic hits port 443 via Nginx Proxy Manager (TLS termination), which forwards HTTP internally to the app container on port 5000. PostgreSQL and Redis are internal-only services on the `scrumquest` bridge network. Prometheus and Grafana bind to `127.0.0.1` only and are accessed via SSH tunnel. A `postgres-backup-s3` sidecar runs pg_dump nightly. A systemd service unit file ensures Docker Compose restarts automatically on VPS reboot.

**Major components and their responsibilities:**

1. **Nginx Proxy Manager** — TLS termination, Let's Encrypt cert lifecycle, WebSocket header forwarding, HTTP-to-HTTPS redirect
2. **ScrumQuest App (Node.js)** — Game logic, Socket.IO WebSocket events, Express API, Prometheus metrics on `/metrics`, health check on `/api/health`
3. **PostgreSQL 16** — Persistent storage for user data, game results, sessions (`connect-pg-simple`). Named volume for data persistence. Health check via `pg_isready`.
4. **Redis 7** — Session store and Socket.IO adapter (required for future horizontal scaling). Optional at 512MB, recommended at 1GB.
5. **postgres-backup-s3** — Scheduled daily pg_dump to S3. Auto-deletes backups older than 30 days.
6. **Prometheus + Grafana** — On-instance monitoring. Prometheus scrapes `/metrics` every 60s (not default 15s to reduce memory pressure). Grafana bound to localhost, accessible via SSH tunnel.
7. **Certbot container or Caddy** — TLS certificate renewal automation. Caddy preferred for lower operational risk; certbot with volume persistence is valid alternative.
8. **Systemd service** — Ensures `docker-compose up -d` runs on VPS reboot.
9. **GitHub Actions CI/CD** — Build, test, push image to GHCR, deploy to Lightsail via SSH and `docker-compose up -d --no-deps --build app`. Staging auto on push; prod manual.

**Key patterns to follow:**

- App container runs as non-root user (`USER nodejs`)
- Secrets passed as environment variables from `.env` file (never in git)
- All internal services use Docker Compose DNS names (`postgres`, `redis`, `prometheus`)
- External ports 80 and 443 only. Database (5432), Redis (6379), Prometheus (9090), Grafana (3000) bind to `127.0.0.1`
- Drizzle migration job runs before app starts on each deployment

**State management:**

- In-memory game state (lobbies, combat) is ephemeral — acceptable for WebSocket-based game (users rejoin on app restart)
- Session state is in PostgreSQL via `connect-pg-simple` — persists across app restarts
- Database backups protect persistent data with RTO approximately 15-30 min, RPO 24 hours

### Critical Pitfalls

Both research threads identified identical top pitfalls with the same prevention strategies. Listed in priority order:

1. **Graceful shutdown not implemented** — Docker sends SIGTERM, app exits immediately, all WebSocket connections drop, in-progress games crash. Prevention: Add SIGTERM handler in `server/index.ts` that drains connections for 30s before exit. Use `CMD ["node", "dist/index.js"]` in Dockerfile (not `npm start` — npm does not forward signals). Set `stop_grace_period: 45s` in docker-compose.yml. Test by deploying during active game. This must ship before the first production deployment.

2. **Monitoring stack consumes all RAM on 1GB VPS** — Prometheus without memory limits can balloon to 400MB+, starving the app. Prevention: Set Docker memory limits on Prometheus (256MB) and Grafana (256MB). Configure Prometheus retention: `--storage.tsdb.retention.time=7d` and `--storage.tsdb.retention.size=500MB`. Increase scrape interval to 60s. Never use per-player label cardinality on Prometheus metrics (high cardinality explodes memory).

3. **Secrets committed to git** — DATABASE_URL or SESSION_SECRET in docker-compose.yml or .env file pushed to repo exposes production credentials. Prevention: Verify `.gitignore` includes `.env` before first commit. Use `git check-ignore .env` to confirm. Use environment variable substitution in docker-compose.yml (`${DATABASE_URL}`) never hardcoded values.

4. **TLS certificate renewal failure** — Let's Encrypt certs expire after 90 days. If renewal automation fails silently, HTTPS breaks for all users. Prevention: Use Caddy (handles renewal automatically) or ensure certbot container has persistent volume for cert storage. Set Prometheus alert for cert expiry under 14 days. Test renewal in staging before production.

5. **Database connection exhaustion on app restart** — App creates PostgreSQL connections but doesn't close them on SIGTERM. After multiple restarts, PostgreSQL reports "too many connections." Prevention: Include `await db.end()` in SIGTERM handler. Monitor `pg_stat_activity` count in Prometheus. Alert if connections exceed 80% of max.

6. **No rollback strategy** — Bad deploy pushed to prod with no quick way to revert. Prevention: Tag GHCR images with `sha-<commit>` (not just `latest`). Keep last 5 image tags in registry. GitHub Actions `workflow_dispatch` with `rollback_version` input parameter.

---

## Implications for Roadmap

Both research streams independently converged on the same 4-5 phase structure. This synthesis merges them into a definitive recommended structure.

### Phase 1: Infrastructure Foundation

**Rationale:** Cannot deploy or test anything without working infrastructure, HTTPS, and auto-restart. This phase is the unblocking prerequisite for all subsequent phases.

**Delivers:** ScrumQuest running on AWS Lightsail with HTTPS, custom domain, and auto-restart on VPS reboot.

**Addresses (from FEATURES.md):**
- HTTPS on custom domain
- Health checks and auto-restart
- Database persistence
- Secrets management

**Implements (from ARCHITECTURE.md):**
- Lightsail Micro instance provisioning
- Docker Compose production stack (app, postgres, redis, nginx-proxy-manager)
- Systemd service unit for auto-start
- DNS routing to Lightsail IP

**Avoids (from PITFALLS.md):**
- Secrets in git (.gitignore + env var substitution)
- Missing health checks (already in Dockerfile + Compose, verify correct)

**Research flag:** Minimal. DNS setup is provider-specific (15 min lookup). Standard patterns for Lightsail provisioning and Nginx Proxy Manager setup.

---

### Phase 2: Production Hardening

**Rationale:** Must complete before accepting real users. Graceful shutdown and backups prevent catastrophic data loss. Not optional.

**Delivers:** Deployments that do not drop connections, automated data protection, and uptime alerts.

**Addresses (from FEATURES.md):**
- Graceful shutdown (SIGTERM handler)
- Automated database backups
- Rollback capability
- Uptime alerts

**Implements (from ARCHITECTURE.md):**
- SIGTERM handler in `server/index.ts` with 30s drain window
- `stop_grace_period: 45s` in docker-compose.yml
- postgres-backup-s3 sidecar with daily S3 uploads
- Image tagging strategy (sha + semver) in GitHub Actions
- Healthchecks.io or AlertManager integration

**Avoids (from PITFALLS.md):**
- Graceful shutdown not implemented (Critical Pitfall 1)
- No rollback strategy (Critical Pitfall 6)
- No database backups

**Research flag:** Graceful shutdown for Socket.IO needs testing — drain logic for in-progress games requires verification. The 30s drain window is standard, but ScrumQuest-specific connection lifecycle may have edge cases.

---

### Phase 3: CI/CD Pipeline

**Rationale:** Manual SSH deploys are error-prone and slow. GitHub Actions automation is required for sustainable operations. Depends on stable infrastructure from Phases 1-2.

**Delivers:** Automated staging deployments on push to main, manual production deployments via GitHub Actions UI, post-deploy smoke tests.

**Addresses (from FEATURES.md):**
- Automated deployments (staging auto, prod manual)
- Post-deploy validation (Playwright E2E smoke tests)
- Zero-downtime deployments via `--no-deps --build`

**Implements (from ARCHITECTURE.md):**
- `.github/workflows/deploy-lightsail.yml`
- GitHub OIDC for AWS (no stored access keys)
- GHCR image push with SHA and semver tags
- SSH-based deployment to Lightsail instance
- Drizzle migration job before app container start

**Avoids (from PITFALLS.md):**
- Database migrations not coordinated with deployments (run migrate before app start)
- Secrets in GitHub Actions (OIDC eliminates stored AWS credentials)

**Research flag:** GitHub Actions OIDC IAM role configuration for Lightsail is well-documented but requires AWS console walkthrough during implementation. Standard pattern overall.

---

### Phase 4: Observability

**Rationale:** After CI/CD is working and production is stable, monitoring surfaces memory trends, error rates, and game-specific metrics that inform future optimization decisions.

**Delivers:** Prometheus + Grafana dashboards accessible via SSH tunnel, uptime monitoring, game-specific metrics.

**Addresses (from FEATURES.md):**
- Performance monitoring (CPU, memory, latency)
- WebSocket real-time metrics (active lobbies, player count)
- Error rate alerting

**Implements (from ARCHITECTURE.md):**
- Prometheus container bound to 127.0.0.1:9090
- Grafana container bound to 127.0.0.1:3000
- prometheus.yml scrape config targeting `app:5000/metrics`
- Grafana dashboards: system health, application metrics, database connections, infrastructure
- SSH tunnel runbook for accessing dashboards

**Avoids (from PITFALLS.md):**
- Monitoring stack consuming all RAM (memory limits, 7-day retention, 60s scrape interval, no per-player metric cardinality)

**Research flag:** Prometheus memory behavior on 1GB instance under real traffic should be validated empirically. Monitor `docker stats` for first 48 hours after enabling Prometheus. Standard stack otherwise.

---

### Phase 5: Backup Verification and Disaster Recovery

**Rationale:** Backups are only as good as the last successful restore test. This phase proves data recovery works end-to-end and documents runbooks for incident response.

**Delivers:** Validated backup and restore workflow, documented incident response runbook, RTO/RPO SLAs defined.

**Addresses (from FEATURES.md):**
- Backup restore tested (not just "backups exist")
- Runbooks for common incidents
- TLS certificate renewal tested

**Implements (from ARCHITECTURE.md):**
- End-to-end pg_restore test from S3 backup
- S3 lifecycle policy (auto-delete after 30 days)
- Incident response runbook (restart, restore, rollback procedures)
- TLS certificate renewal test in staging

**Avoids (from PITFALLS.md):**
- TLS renewal failure (test renewal before cert expires)
- Backup restore failure when needed (monthly test restore)

**Research flag:** Standard pattern. No additional research needed.

---

### Phase Ordering Rationale

- **Phase 1 blocks all others**: Without running infrastructure, nothing else can be tested or deployed.
- **Phase 2 must precede real users**: Graceful shutdown protects active sessions; backups protect data. Both are non-negotiable before production traffic.
- **Phase 3 after infrastructure is stable**: CI/CD automation is harder to debug when infrastructure is still shifting. Validate docker-compose manually first.
- **Phase 4 after CI/CD**: Observability is more useful once the deployment pipeline is automated — you can watch metrics across multiple deploys.
- **Phase 5 last**: Backup validation and DR runbooks are confirmation work, not blocking. postgres-backup-s3 was set up in Phase 2; this phase validates it.

### Research Flags Summary

| Phase | Research Needed | Standard Patterns |
|-------|----------------|-------------------|
| Phase 1 | DNS provider-specific routing (15 min lookup) | Lightsail provisioning, Nginx Proxy Manager, docker-compose production |
| Phase 2 | Socket.IO graceful drain testing for game session edge cases | SIGTERM patterns, pg_dump to S3, Healthchecks.io setup |
| Phase 3 | GitHub OIDC IAM role config walkthrough | GitHub Actions deploy workflows, GHCR tagging, Drizzle migrations |
| Phase 4 | Prometheus memory validation under real traffic | Prometheus + Grafana on Docker, SSH tunnel access |
| Phase 5 | None | pg_restore from S3, cert renewal testing, runbook templates |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official AWS docs, Docker docs, GitHub Actions patterns all verified Feb 2026. Node 22 EOL confirmed. All tool versions current. |
| Features | HIGH | Table-stakes features are industry-standard for production Docker deployments. Differentiator features (zero-downtime, game metrics) are well-documented extensions. |
| Architecture | HIGH | Single-VPS Docker Compose pattern is mature. Graceful shutdown, health check, and reverse proxy patterns are established Node.js best practices. |
| Pitfalls | HIGH | Both research threads identified identical top pitfalls from independent sources. Prevention strategies are standard practice with clear implementation paths. |
| Cost | MEDIUM | Based on AWS pricing and estimated ScrumQuest load. Actual cost depends on traffic volume and backup size growth. Projections are conservative. |

**Overall confidence:** HIGH

### Gaps to Address

- **Socket.IO graceful drain timing**: The 30s drain window is the standard recommendation, but ScrumQuest has in-game WebSocket state (lobbies, combat). Phase 2 must test what happens to a game in-progress during a deploy. May need longer drain window or client-side reconnect-and-rejoin logic.
- **Prometheus cardinality audit**: Before enabling Prometheus in production, audit `server/metrics.ts` for any per-player or per-lobby label usage. High-cardinality labels will exhaust memory on 1GB instance within days.
- **Replit compatibility**: The existing Replit workflow must remain unbroken. Deployment changes should be production-only additions, not modifications to dev environment behavior. The `.env` file approach and `npm run dev` command must continue working as-is on Replit.
- **Redis optionality**: Both research threads noted Redis is optional at fewer than 100 users. The docker-compose.yml should make Redis easy to disable for RAM-constrained deployments.

---

## Sources

### Primary (HIGH confidence)

- [AWS Lightsail Documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/) — instance types, pricing, container services, firewall rules
- [Docker Compose Production Guide](https://docs.docker.com/compose/how-tos/production/) — production-specific configuration patterns
- [Node.js LTS Release Schedule](https://nodejs.org/en/about/previous-releases) — Node 20 EOL April 2026 confirmed
- [GitHub Actions AWS OIDC](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) — keyless AWS authentication
- [Socket.IO Memory Usage Docs](https://socket.io/docs/v4/memory-usage/) — connection lifecycle and cleanup

### Secondary (MEDIUM confidence)

- [postgres-backup-s3 (eeshugerman)](https://github.com/eeshugerman/postgres-backup-s3) — community Docker image for automated pg_dump to S3; not official but widely used
- [Nick Janetakis — Production Docker Compose patterns](https://nickjanetakis.com/blog/best-practices-around-production-ready-web-apps-with-docker-compose) — verified Feb 2026
- [Deploy Docker Compose with zero downtime via GitHub Actions](https://jmh.me/blog/zero-downtime-docker-compose-deploy) — `--no-deps --build` rolling update pattern
- [Automating AWS Lightsail deployments with GitHub Actions](https://medium.com/@lukhee/automating-aws-lightsail-deployments-with-github-actions-53c73c9a1c1f) — CI/CD patterns for Lightsail instances

### Tertiary (supports specific decisions)

- [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) — GUI-based reverse proxy with Let's Encrypt
- [Prometheus + Grafana on Docker](https://codersociety.com/blog/articles/nodejs-application-monitoring-with-prometheus-and-grafana) — on-instance monitoring setup
- [PgBouncer connection pooling](https://oneuptime.com/blog/post/2026-02-02-postgresql-pgbouncer-pooling/) — connection pool layer for high-connection scenarios
- [Docker Graceful Shutdown](https://oneuptime.com/blog/post/2026-01-16-docker-graceful-shutdown-signals/) — SIGTERM handling patterns for Node.js

---

*Research completed: 2026-02-24*
*Synthesized from: STACK-deployment.md, STACK-docker-deployment.md, FEATURES-deployment.md, FEATURES-docker-deployment.md, ARCHITECTURE-deployment.md, ARCHITECTURE-docker-deployment.md, PITFALLS-deployment.md, PITFALLS-docker-deployment.md, SUMMARY-deployment.md, SUMMARY-docker-deployment.md*
*Ready for roadmap: yes*
