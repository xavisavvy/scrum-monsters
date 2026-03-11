# Feature Landscape: Production Docker Deployment (Single VPS)

**Domain:** Docker Compose deployments to AWS Lightsail / self-managed VPS
**Researched:** 2026-02-24
**Scope:** ScrumQuest migration from Replit to $5-20/mo single-instance VPS with Docker + PostgreSQL
**Overall Confidence:** HIGH

---

## Executive Summary

Single-VPS Docker deployments are production-viable for apps handling <100 concurrent users (ScrumQuest target: 50). The technology stack is mature and cost-effective. Key decisions cluster around four categories:

1. **Table Stakes** (features users expect, missing = product broken)
2. **Differentiators** (competitive advantage, not expected but valued)
3. **Anti-Features** (over-engineering waste for single-instance setup)
4. **Constraints** (single-VPS inherent limitations to design around)

**Critical insight:** Most single-VPS failures stem from **under-preparation**, not over-engineering. Health checks, graceful shutdown, and backup automation prevent chaos. Docker Secrets and zero-downtime deployments are nice-to-haves until you reach >5 deploys/day.

---

## Table Stakes

Features users expect. Missing = app feels production-unready. All are implementable with existing stack.

| Feature | Why Expected | Complexity | Current Status | Notes |
|---------|--------------|------------|-----------------|-------|
| **App runs at all** | VPS crashes/reboots shouldn't take app offline | Low | ✅ Partially (docker-compose has `restart: unless-stopped`, needs systemd integration) | Add systemd service file to auto-start Compose on VPS reboot. Test: `sudo reboot`, verify app running 2min later |
| **Database persists** | User data shouldn't vanish on container restart | Low | ✅ Yes (named volumes in compose) | PostgreSQL data in `postgres_data:/var/lib/postgresql/data`. Verify: `docker volume ls` |
| **Health checks work** | Load balancer / monitoring needs to detect dead instances | Low | ✅ Yes (HEALTHCHECK in Dockerfile + Compose health checks) | App has `/api/health` endpoint, Compose checks it every 30s. Verified working |
| **TLS termination** | Custom domain + HTTPS for users | Medium | ❌ Not yet (Nginx reverse proxy needed) | Add Nginx container to docker-compose.yml with Let's Encrypt. See STACK.md for Nginx Proxy Manager option |
| **Env vars / secrets** | Configuration separation (DATABASE_URL, SESSION_SECRET, etc.) | Low | ✅ Yes (docker-compose uses .env file) | .env file not in git. Verify: `git check-ignore .env` returns true |
| **Graceful shutdown** | Deployments don't drop WebSocket connections | Medium | ⚠️ Needs work (SIGTERM handler for lingering connections) | Need to implement graceful shutdown in `server/index.ts`: drain in-flight requests for 30s before SIGKILL |
| **Database backups** | Data loss recovery | Medium | ❌ Not yet (manual `pg_dump` only) | Add automated daily backups to S3 or local filesystem with rotation |
| **Basic monitoring** | Observability of what's breaking | Medium | ✅ Partial (Prometheus `/metrics` exists, no Grafana dashboards for single-VPS) | Existing Prometheus setup works locally. Deploy Grafana or use lightweight Dozzle for Docker logs |
| **Error visibility** | Can see why app crashed (logs) | Low | ✅ Yes (Docker logs + Pino JSON logging) | `docker-compose logs -f app` shows Pino output. Consider ELK or Loki for log aggregation if >1 app |
| **Uptime alerts** | Get notified when app goes down | Low | ❌ Not yet | Integrate with monitoring tool (Prometheus AlertManager, Healthchecks.io, or simple cron health check curl) |

---

## Differentiators

Features that set ScrumQuest apart. Not expected, but highly valued. Worth implementing if time/budget allows.

| Feature | Value Proposition | Complexity | Effort | Notes |
|---------|-------------------|------------|--------|-------|
| **Zero-downtime deploys** | Deploy new versions without kicking off in-game users | High | Medium | Use blue-green (two app containers) or rolling restart with start-first + health checks. Requires reverse proxy. See ARCHITECTURE.md |
| **Automated backups to S3** | Recovery from data corruption / ransomware | Medium | Low | Use `postgres-backup-s3` Docker sidecar or cron job. Auto-rotate old backups. One-off migrations between databases trivial with automated dumps |
| **Real-time observability dashboard** | See concurrent users, active games, API latency | High | Medium | Grafana dashboard with socket.io-prometheus metrics. Custom counters for phase transitions, boss encounters. Differentiates from competitors showing "players online" |
| **Multi-region failover** | Users in EU get EU server, automatic fallback | Very High | High | Not recommended for <100 users. Deferred feature. Requires DNS failover + data replication |
| **Custom domain + branded emails** | Professional presence (yourgame.com) | Low | Very Low | Already supported via Lightsail DNS. Trivial to setup |
| **Auto-scaling on load** | App scales horizontally when traffic spikes | High | High | Not recommended for single-VPS. Requires shared state (Redis adapter for Socket.IO). Deferred until 50+ concurrent users |
| **Database read replicas** | Better read performance, geographic distribution | High | High | Not recommended for <100 concurrent users. Lightsail managed PostgreSQL has no replicas. Deferred until query load >60% CPU |
| **Rollback on deployment failure** | Auto-revert bad deploys | Medium | Low | Use git hash / Docker image tags. Roll back Compose file to previous commit. Requires deployment logs + tagging strategy |

---

## Anti-Features

Over-engineering waste for single-instance setup. Avoid until constraints force them.

| Anti-Feature | Why Avoid | Cost | When to Reconsider |
|--------------|-----------|------|-------------------|
| **Kubernetes orchestration** | Single instance doesn't benefit from pod scheduling. Over 10x complexity. | Time: 80 hours. Cost: Same VPS + K8s management overhead. | When >5 services, >10K concurrent users, or multi-region needed. At 50 users: Premature. |
| **Multi-container service mesh** | Istio/Linkerd for single app is waste. Adds observability debt. | 40+ hours setup. Network latency overhead. | When >10 microservices with complex routing policies. ScrumQuest: App + DB + Redis is enough. |
| **Container security scanning in CI/CD** | CVE scanning for all images. Busywork unless you run untrusted code. | 10+ hours Trivy/Snyk setup. | When handling user-uploaded images or plugins. ScrumQuest: Node.js app, low attack surface. |
| **Multi-stage Dockerfile optimization** | Shaving 50MB off a 200MB image. Negligible for <50 users. | 5 hours. 50MB = $0.05/month in egress. | When bandwidth is measurable cost (>100GB/month). Current: Not worth the debugging. |
| **Distributed tracing (Jaeger/Tempo)** | Trace requests across services. Single monolith means basic logging suffices. | 20 hours setup + agent overhead. | When debugging multi-service latency. ScrumQuest: Single Express server, see logs directly. |
| **Multiple replicas with load balancing** | "High availability" with >1 app instance. Requires stateless sessions (Redis), shared state. | 30 hours architecture refactor + Redis + LB setup. Extra $30/mo. | When you need zero-downtime deployments AND >50 concurrent users. Currently: Blue-green with 1 instance cheaper. |
| **Service mesh TLS (mTLS)** | Encrypt container-to-container traffic in internal network. | 15 hours + ongoing cert management. | When containers from untrusted sources / multi-tenant environment. ScrumQuest: Single VPS, same trust boundary. |
| **Secrets manager (Vault/AWS Secrets Manager)** | Complex key rotation for simple .env file. | 10 hours setup. | When rotating secrets >monthly or >10 apps. ScrumQuest: One app, one database. Use Docker Secrets file mount instead. |
| **GitOps deployment (ArgoCD/Flux)** | Automated Compose updates from git. Overkill for manual staging→prod promotion. | 15 hours. | When >3 environments or >2 devs pushing at same time. ScrumQuest: Single dev, manual deploys. Use git tags instead. |
| **Service discovery (Consul/Eureka)** | Dynamic service registration. docker-compose DNS handles this. | 10 hours. | When services scaling up/down frequently. ScrumQuest: Fixed services (app, db, redis). No discovery needed. |

---

## Feature Dependencies & Implementation Order

```
Phase 1: Foundation (Week 1)
├─ App runs at all (systemd service)
├─ Database persists (volumes)
├─ Health checks work (existing)
└─ Env vars / secrets (.env management)

Phase 2: Production Hardening (Week 2)
├─ TLS termination (Nginx reverse proxy)
├─ Graceful shutdown (SIGTERM handler)
├─ Database backups (automated s3/cron)
└─ Error visibility (Docker logs + monitoring)

Phase 3: Observability (Week 3)
├─ Basic monitoring (Prometheus + lightweight Grafana)
├─ Uptime alerts (AlertManager or Healthchecks.io)
└─ Real-time dashboard (Grafana + custom Socket.IO metrics)

Phase 4: Production QoL (Week 4+)
├─ Zero-downtime deploys (blue-green setup)
├─ Rollback on failure (git tags + image tagging)
└─ Custom domain + TLS (already done in Phase 2)

Deferred (50+ users):
├─ Auto-scaling
├─ Multi-region failover
└─ Database read replicas
```

---

## MVP Feature Set

**Minimum viable production deployment for ScrumQuest:**

| Feature | Rationale |
|---------|-----------|
| ✅ App runs at all | Non-negotiable. Systemd service for auto-restart. |
| ✅ Database persists | Named volumes. Simple but critical. |
| ✅ Health checks work | Already implemented. Docker knows when to restart. |
| ✅ TLS termination | Custom domain HTTPS users expect it. Nginx Proxy Manager = 30 min setup. |
| ✅ Graceful shutdown | WebSocket users will experience dropped connections without it. Worth 2 hours. |
| ✅ Database backups | Automated daily dumps to S3. Prevents panic on data corruption. 1 hour setup. |
| ✅ Basic monitoring | Logs viewable + simple health check. Dozzle or Prometheus dashboard. 2 hours. |
| ❌ Zero-downtime deploys | Nice-to-have at 50 users. Trade: Adds 20% complexity for 1% uptime savings. Defer. |
| ❌ Advanced observability | Grafana dashboards useful but not critical for troubleshooting. Add Phase 3+. |
| ❌ Multi-replica setup | Wait until you need it. Single instance proven. |

**MVP Timeline: 2-3 weeks** (assuming existing docker-compose + Express app working locally)

---

## Table Stakes Complexity Breakdown

### Tier 1: Already Done (0 hours)
- Database persists (volumes in docker-compose)
- Health checks (HEALTHCHECK + Compose checks)
- Env vars (docker-compose .env file)
- Error visibility (Pino JSON logs)

### Tier 2: Quick Wins (<3 hours each)
- App runs at all: Add systemd service file, test reboot scenario
- TLS termination: Use Nginx Proxy Manager Docker image (GUI-based, no config needed)
- Custom domain: Route53 / Lightsail DNS (15 min)
- Uptime alerts: Integrate with Healthchecks.io (free tier, email on down)

### Tier 3: Moderate Effort (3-8 hours)
- Graceful shutdown: Add SIGTERM handler to `server/index.ts`, test WebSocket connections during deploy
- Database backups: postgres-backup-s3 container or pg_dump cron job + S3 bucket
- Basic monitoring: Deploy Prometheus scrape config + Dozzle or Grafana dashboard

### Tier 4: Substantial Effort (8+ hours)
- Zero-downtime deploys: Blue-green architecture with shared data volumes
- Real-time dashboard: Custom Prometheus metrics + Grafana panels for Socket.IO + game-specific events

---

## Constraints: What Single-VPS Limits

These are inherited limitations of single-instance architecture. Design around them rather than fight them.

| Constraint | Impact | Workaround |
|-----------|--------|-----------|
| **One machine fails = entire service down** | 99.9% uptime impossible. Target: 99.5% (4 hours/year). | Accept the constraint. Design for fast recovery (backups) rather than high availability. |
| **Vertical scaling only** | Can't add more servers. Limited to machine size (Lightsail: max 4GB RAM / 2 vCPU in $20 tier). | Monitor CPU/RAM. Upgrade instance size when 80% sustained. Cost jumps $10-20/month. |
| **No horizontal scaling** | Can't run multiple app instances for load distribution. | Live with single app instance limits. At 50 users: Enough. At 200 users: Upgrade or refactor. |
| **Database on same machine** | App + DB compete for resources. Single disk failure = data loss. | Trade: Simpler operations vs. resilience. Use automated backups to mitigate. |
| **Sticky storage** | Data tied to one VPS. Multi-region failover requires replication. | Acceptable for MVP. Deferred feature. |
| **Network I/O bottleneck** | All traffic through single Lightsail instance. Egress bandwidth costs money ($0.10/GB). | Monitor bandwidth usage. Compress assets, optimize WebSocket payloads. At <50 users: Non-issue. |

---

## Complexity Matrix: Implementation Effort vs. Business Value

```
HIGH VALUE ─────────────────────────────────────────
│
│  Table Stakes:              Differentiators:
│  ✅ App runs              🎯 Zero-downtime deploys
│  ✅ DB persists           🎯 Real-time dashboard
│  ✅ Health checks         🎯 Automated backups
│  ✅ TLS termination
│  ✅ Graceful shutdown
│
│                            Anti-Features:
│                            ❌ Kubernetes
│                            ❌ Service mesh
│                            ❌ Multi-region
│
LOW VALUE ──────────────────────────────────────────
  LOW EFFORT                          HIGH EFFORT
```

**Recommendation:** Implement all Table Stakes first (3 weeks). Then:
- **If time available:** Add Differentiators in priority order (zero-downtime, then dashboard, then extra backups)
- **If launching soon:** Skip Differentiators, launch with Table Stakes only. Users don't care about fancy features if app is reliable.

---

## Feature Rollout Timeline

### Week 1: Foundation
```
Mon-Tue: App runs at all + Database persists
├─ systemd service file for auto-restart
├─ Test: `sudo reboot`, app alive in 2min
└─ Verify volumes: `docker volume ls | grep postgres`

Wed-Thu: TLS termination
├─ Nginx Proxy Manager container + Let's Encrypt
├─ Route domain to Lightsail IP
└─ Test: https://yourdomain.com loads with valid cert

Fri: Env vars + secrets
├─ Audit .env file: DATABASE_URL, SESSION_SECRET, OAuth creds
├─ Verify .gitignore excludes sensitive files
└─ Test: `docker-compose up` connects to real database
```

### Week 2: Hardening
```
Mon-Tue: Graceful shutdown
├─ Add SIGTERM handler to server/index.ts
├─ Drain active connections for 30s before exit
└─ Test: Deploy while game in progress, verify no crashes

Wed: Database backups
├─ postgres-backup-s3 container or cron pg_dump
├─ Automated daily rotation
└─ Test: Restore from backup to separate database

Thu: Error visibility + monitoring
├─ Prometheus scrape config + health check
├─ Dozzle (Docker logs UI) or Grafana dashboard
└─ Test: `curl http://localhost:9090/metrics` returns data

Fri: Uptime alerts
├─ Healthchecks.io integration
├─ Send test alert
└─ Verify email on VPS downtime
```

### Week 3-4: Nice-to-Haves
```
Optional: Real-time dashboard
├─ Grafana panels for socket.io metrics
├─ Custom counters for game events
└─ High ROI if you like watching metrics

Optional: Zero-downtime deploys
├─ Blue-green architecture
├─ Two app containers, traffic switch via reverse proxy
└─ Trade: 20% complexity increase for 1% uptime improvement
```

---

## Feature Dependency Notes

### Graceful Shutdown Depends On
- SIGTERM handler implementation (express app knows to stop accepting connections)
- Must complete before Docker's 30s default grace period (`stop_grace_period` in compose)
- Tests: Verify WebSocket connections survive deploy, no 502 errors

### TLS Termination Depends On
- Custom domain pointing to Lightsail IP (Route53 / DNS provider)
- Nginx Proxy Manager or manual Nginx config in Docker
- Let's Encrypt cert renewal automation (Certbot or Proxy Manager handles this)

### Database Backups Depend On
- S3 bucket with appropriate IAM permissions (or local filesystem mount)
- Cron schedule or sidecar container running pg_dump
- Verification: Run test restore monthly to ensure dumps are valid

### Zero-Downtime Deploys Depend On
- Two app containers in docker-compose (or blue-green version switching)
- Reverse proxy routing (Nginx)
- Shared data volumes (only needed if sessions stored in app memory—use PostgreSQL session store instead)
- Health checks passing before traffic switches

---

## Anti-Pattern Warnings

### Trap 1: Skipping Graceful Shutdown
**What goes wrong:** Deploy new version, active games crash mid-combat, users lose progress
**Why it happens:** SIGTERM handler seems optional when single instance has few users
**Consequence:** User churn, negative reviews
**Prevention:** Implement SIGTERM handler before production launch. Test: Deploy during a game.
**Detection:** Monitor logs for "connection reset" errors during deploys

### Trap 2: No Database Backups
**What goes wrong:** Ransomware or data corruption, no recovery path
**Why it happens:** "It won't happen to us" or "I'll do it manually next week"
**Consequence:** Hours/days of downtime, irrecoverable user data
**Prevention:** Automated daily dumps to S3 (postgres-backup-s3 = 30 min setup). Test restore monthly.
**Detection:** Missing backup files in S3, or restore test fails

### Trap 3: Secrets in .env Committed to Git
**What goes wrong:** GitHub exposes DATABASE_URL, SESSION_SECRET in public repo
**Why it happens:** .gitignore misconfigured or missed
**Consequence:** Attackers access database, reset user passwords, steal data
**Prevention:** Verify `.gitignore` includes `.env` before first commit. Use `git check-ignore .env`.
**Detection:** Run `git log --all -p -- .env` to find if ever committed

### Trap 4: No Health Checks
**What goes wrong:** App crashes silently, users see 502s, you don't know
**Why it happens:** "Docker will restart it automatically"
**Consequence:** Undetected downtime, users give up
**Prevention:** HEALTHCHECK in Dockerfile (already done). Enable Compose health checks (already done).
**Detection:** `docker ps` shows (unhealthy) or monitoring alerts on `/api/health` 502s

### Trap 5: Database and App on Same Disk (Inherited in Single-VPS)
**What goes wrong:** Disk fills up, database stops accepting writes, app hangs
**Why it happens:** Single machine, nowhere else to put database
**Consequence:** App becomes read-only, users can't save progress
**Prevention:** Monitor disk usage. Set up alerts at 80%. Use managed PostgreSQL (Lightsail RDS) if budget allows ($15+/mo extra).
**Detection:** `df -h` shows >80% usage, or PostgreSQL logs "no space left on device"

---

## Verification Checklist: Table Stakes Before Production Launch

- [ ] **App runs at all**: Test `sudo reboot`, app healthy within 2 min
- [ ] **Database persists**: Verify `docker volume ls` shows `postgres_data`, data survives container restart
- [ ] **Health checks work**: `curl http://localhost:5000/api/health` returns 200, Compose shows (healthy)
- [ ] **TLS termination**: `curl https://yourdomain.com` returns valid certificate, no warnings
- [ ] **Env vars correct**: `docker-compose config` shows real DATABASE_URL (not localhost), SESSION_SECRET set
- [ ] **Graceful shutdown**: Deploy during active game, verify no WebSocket crashes in logs
- [ ] **Database backups**: Backup file created in S3 / local directory with today's date
- [ ] **Error visibility**: `docker-compose logs app` shows Pino JSON output with timestamps
- [ ] **Uptime alerts**: Healthchecks.io / AlertManager configured, received test alert email

---

## Sources

Production Docker deployment patterns:
- [Use Compose in production | Docker Docs](https://docs.docker.com/compose/how-tos/production/)
- [Docker Compose: The Complete Guide for 2026 | DevToolbox Blog](https://devtoolbox.dedyn.io/blog/docker-compose-complete-guide)
- [Best Practices Around Production Ready Web Apps with Docker Compose — Nick Janetakis](https://nickjanetakis.com/blog/best-practices-around-production-ready-web-apps-with-docker-compose)

Nginx reverse proxy & TLS:
- [How to Set Up Docker with Nginx as a Reverse Proxy](https://oneuptime.com/blog/post/2026-01-16-docker-nginx-reverse-proxy/view)
- [Host Multiple Websites On One VPS With Docker And Nginx](https://www.ssdnodes.com/blog/host-multiple-websites-docker-nginx/)
- [GitHub - NginxProxyManager/nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager)

Database persistence & backups:
- [How to Use Docker Volumes for Persistent Data](https://oneuptime.com/blog/post/2026-02-02-docker-volumes-persistent-data/view)
- [PostgreSQL Backups with Docker — Cookiecutter Django 2026.8.6 documentation](https://cookiecutter-django.readthedocs.io/en/latest/4-guides/docker-postgres-backups.html)
- [GitHub - eeshugerman/postgres-backup-s3](https://github.com/eeshugerman/postgres-backup-s3)

Graceful shutdown & zero-downtime:
- [Zero-Downtime Deployments with Docker Compose and Rolling Updates | Reintech media](https://reintech.io/blog/zero-downtime-deployments-docker-compose-rolling-updates)
- [Deploy Docker Compose applications with zero downtime using GitHub Actions](https://jmh.me/blog/zero-downtime-docker-compose-deploy)
- [Effective Docker Healthchecks For Node.js | by Patrick Lee Scott | Medium](https://patrickleet.medium.com/effective-docker-healthchecks-for-node-js-b11577c3e595)

Secrets & environment management:
- [4 Ways to Securely Store & Manage Secrets in Docker](https://blog.gitguardian.com/how-to-handle-secrets-in-docker/)
- [How to Use Docker Environment Files (.env) Effectively](https://oneuptime.com/blog/post/2026-01-16-docker-env-files/view)
- [Secrets in Compose | Docker Docs](https://docs.docker.com/compose/how-tos/use-secrets/)

Monitoring & logging:
- [10 Best Docker Monitoring Tools in 2026 | Better Stack Community](https://betterstack.com/community/comparisons/docker-monitoring-addons/)
- [How to Implement Docker Logging Best Practices](https://oneuptime.com/blog/post/2026-01-30-docker-logging-best-practices/view)

AWS Lightsail:
- [Deploy and manage containers on Amazon Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html)
- [Guide to Amazon Lightsail: Features, Setup, and Advanced Use Cases](https://www.cloudoptimo.com/blog/guide-to-amazon-lightsail-features-setup-and-advanced-use-cases/)

---

**Research completed:** 2026-02-24
**Confidence:** HIGH — All recommendations verified with official documentation, 2026 resources, and production patterns
**Next:** Architecture patterns in ARCHITECTURE.md, pitfalls in PITFALLS.md
