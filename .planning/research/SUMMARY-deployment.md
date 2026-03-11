# Research Summary: Docker + AWS Lightsail Deployment & CI/CD

**Project:** ScrumQuest (Real-time multiplayer JRPG scrum poker)
**Researched:** 2026-02-24
**Overall Confidence:** HIGH (AWS official docs + GitHub Actions patterns verified)

---

## Executive Summary

ScrumQuest has a solid foundation for deployment: multi-stage Dockerfile, GitHub Actions CI pipeline, Docker Compose orchestration, and Kubernetes manifests. The missing piece is **bridging from dev (Replit) to production (AWS Lightsail)** with automated CI/CD, TLS management, and on-instance observability.

This research identifies the minimal, cost-effective stack for hosting 50 concurrent users on AWS Lightsail within a $5-20/mo budget:

**Primary path:** AWS Lightsail **Instances** (not Containers) with Docker Compose, automated Let's Encrypt via certbot, and lightweight on-instance monitoring (Prometheus + Grafana in containers). Total monthly cost: ~$15-20/mo including backups.

**Secondary path (if budget expands to $40/mo):** AWS Lightsail **Containers** for automatic TLS, zero-downtime deployments, and managed load balancing—trades simplicity for cost.

---

## Key Findings

### Stack Decisions

**Why AWS Lightsail for ScrumQuest:**
- Simplest AWS onboarding (no Kubernetes knowledge required)
- Includes 1TB free data transfer per month (critical for WebSocket-heavy games)
- Lightsail CLI tooling is minimal but sufficient for small teams
- Can host 50 concurrent users on $10/mo Micro instance
- GitHub Actions integrates seamlessly via aws-cli

**Why Docker Compose (not Kubernetes):**
- Replit dev workflow already uses docker-compose.yml
- Single-node Lightsail instance doesn't justify K8s overhead
- Familiar to NodeJS developers; YAML syntax already known
- Health checks + restart policies provide self-healing for 50-user scale

**Why Let's Encrypt + certbot (not AWS Certificate Manager):**
- ACM requires ALB/CloudFront (adds $16+/mo)
- Let's Encrypt + certbot costs $0, fully automated renewal
- Single domain (scrumquest.com) doesn't need multi-region failover
- Certbot runs in a simple Docker container; renewal via cron

**Why GHCR + minimal ECR:**
- GHCR free tier for public/private repos; authenticated via GitHub Actions token
- ECR useful for backup registry + Lightsail Containers integration
- Avoid DockerHub rate limiting; GHCR faster pulls in GitHub Actions

**Why Prometheus + Grafana on-instance:**
- Not Datadog/New Relic ($50+/mo incompatible with budget)
- Not CloudWatch Logs ($0.50/GB ingested; ScrumQuest ~30GB/mo = $15/mo)
- Lightweight containers use minimal overhead; fit in 1GB instance
- JSON structured logs from Pino (already configured) pair well with Grafana

### Critical Gaps Addressed

| Gap | Solution | Trade-off |
|-----|----------|-----------|
| **No automated deployments to Lightsail** | GitHub Actions workflow + AWS CLI lightsail commands | Manual triggers for prod; staging auto-deploys on push |
| **TLS certificate management** | certbot in cron container + Let's Encrypt | 90-day renewal cycle; requires monitoring for failures |
| **On-instance observability** | Prometheus (metrics) + Grafana (dashboards) + Pino logs | 7-day retention; SSH tunnel required to view dashboards |
| **Database backups** | pg_dump to S3 nightly + AWS Lightsail snapshots | Destroy-to-restore limitation on Lightsail snapshots (use pg_dump as primary) |
| **Health checks & auto-restart** | Docker Compose healthchecks + restart: unless-stopped | No orchestration across containers; manual ops for failures |
| **Rollback capability** | Keep previous image tags in GHCR; redeploy old version | Minutes (not seconds); requires manual trigger |

### Versions Verified (February 2026)

| Tool | Version | Rationale |
|------|---------|-----------|
| **Node.js** | 22.x LTS (not 20.x) | Node 20 EOL April 30, 2026; 22 battle-tested, 1-year runway |
| **Node image base** | node:22-slim (not alpine) | Alpine uses musl; slim has better compatibility + 30% smaller than full image |
| **Docker** | 29.2+ | Latest stable; multi-stage builds required |
| **Docker Compose** | 2.24+ | Latest stable; healthcheck dependencies supported |
| **AWS CLI v2** | 2.33.26+ | Active development; lightsail commands stable |
| **Prometheus** | 2.54.1 | Docker image; 15d retention suitable for 1GB instance |
| **Grafana** | 10.2.2 | Latest stable; SQLite backend for single-node |
| **Certbot** | 2.10+ | Automatic renewal; supports Docker containers |

---

## Implications for Roadmap

### Recommended Phase Structure

1. **Phase 1: Docker Optimization** (2 weeks)
   - Upgrade Dockerfile: node:22-slim, production deps only in runtime stage
   - Test image size and startup time on Lightsail Micro instance
   - Validate existing health endpoints (`/api/health`, `/metrics`, `/api/ws-health`)
   - **Addresses:** Lean production images; fast deployments

2. **Phase 2: AWS Account & Lightsail Setup** (1 week)
   - Create AWS account; setup billing alerts
   - Provision Lightsail Micro instance ($10/mo)
   - Configure Lightsail firewall rules (443 open, 5000 closed)
   - Point custom domain via Route 53 or external DNS
   - **Addresses:** Production infrastructure ready

3. **Phase 3: CI/CD Pipeline to Lightsail** (2 weeks)
   - Create `.github/workflows/deploy-lightsail.yml`
   - Setup GitHub Actions OIDC for AWS (no stored secrets)
   - Implement blue-green deployment via image tags
   - Test staging auto-deploy on push; prod manual-trigger
   - **Addresses:** Automated safe deployments; zero-downtime (manual for prod)

4. **Phase 4: TLS & On-Instance Monitoring** (2 weeks)
   - Deploy certbot in Docker container with renewal cron
   - Expose Prometheus + Grafana via SSH tunnels (not public)
   - Create dashboards: memory %, CPU %, request rate, error rate
   - Add health alerts to Grafana (webhook to Slack if available)
   - **Addresses:** Production observability; secure access

5. **Phase 5: Backup & Disaster Recovery** (1 week)
   - Implement nightly pg_dump to S3 with 30-day retention
   - Document recovery procedures (restore from S3 dump, restore from snapshot)
   - Test backup restore workflow
   - Setup CloudWatch alarms for disk space / memory pressure
   - **Addresses:** Data durability; runbooks for operations

### Phase Ordering Rationale

**Why this order:**
1. **Docker first** (no external deps) → tests image locally before AWS
2. **AWS setup second** (blocking for all later phases) → provision infrastructure
3. **CI/CD third** (depends on AWS account + image optimization) → automate deployments
4. **Monitoring fourth** (depends on running instance + Docker Compose) → observe production
5. **Backup fifth** (depends on stable deployment pipeline) → protect data

**Why NOT Kubernetes:**
- At 50 concurrent users, single-node Docker Compose is sufficient
- Kubernetes adds 100+ lines of YAML per service; team not familiar
- Lightsail instances are simpler; Lightsail Containers (managed Docker) is middle ground

### Research Flags for Deeper Dives

| Phase | Topic | Why It Needs Deeper Research |
|-------|-------|-------|
| **Phase 3** | Blue-green deployment automation | Lightsail Containers offers built-in; instances require custom script |
| **Phase 4** | SSH tunnel access control | Grafana/Prometheus should not be public; bastion host or VPN recommended |
| **Phase 4** | Prometheus scrape targets | Will app expose `/metrics` endpoint in all phases? Verify Socket.IO metrics collection |
| **Phase 5** | pg_dump frequency vs. bandwidth | Nightly dumps may hit bandwidth limits; consider weekly + point-in-time restore via WAL |
| **Phase 5** | S3 lifecycle policies | Auto-delete backups after 30 days; configure via Terraform or AWS console |

---

## Critical Decisions Made

### Decision 1: Lightsail Instances vs. Lightsail Containers

| Factor | Instances | Containers |
|--------|-----------|-----------|
| **Budget** | $5-20/mo | $40+/mo |
| **TLS** | Manual (certbot) | Automatic |
| **Deployments** | Push via lightsailctl + SSH | API-driven; zero-downtime |
| **Familiarity** | docker-compose (known) | Lightsail-specific config |
| **Recommendation for ScrumQuest** | **START HERE** | Upgrade later if budget/scale increases |

**Rationale:** Instances fit budget; Containers win on ops burden. Start with instances, migrate if costs allow.

### Decision 2: PostgreSQL Managed vs. Container Sidecar

| Factor | Managed DB ($15/mo) | Container ($0 + disk space) |
|--------|---------|-----------|
| **Backups** | Automatic daily | Manual pg_dump required |
| **Scaling** | Separate instance | Shares 1GB RAM |
| **Network isolation** | Isolated (secure) | Same docker network (simpler) |
| **Recommendation for ScrumQuest** | Container sidecar to stay <$20/mo | Upgrade to managed at 500+ concurrent users |

**Rationale:** Container sidecar keeps costs down. At <10K total users, shared instance is fine.

### Decision 3: Secrets Management (AWS Secrets Manager vs. .env)

| Factor | Secrets Manager | Environment Variables |
|--------|---------|-----------|
| **Cost** | ~$0.40/secret/mo | Free |
| **Rotation** | Automatic | Manual |
| **Complexity** | AWS API calls | Plain text (risky) |
| **Recommendation for ScrumQuest** | Use Secrets Manager for prod; plain .env for staging |

**Rationale:** Prod uses Secrets Manager (audit trail, rotation). Staging uses .env (faster iteration). GitHub Actions can fetch from Secrets Manager at deploy time.

---

## Over-Engineering Warnings

### Do NOT Add (Too Much Complexity)

1. **Kubernetes on EKS** — Overkill for 50 concurrent users; 5x infrastructure cost
2. **ECS Fargate** — Simpler than K8s, but still $11+/mo base cost; Lightsail cheaper
3. **RDS for PostgreSQL** — $15+/mo; container sidecar works for <10K users
4. **CloudWatch Logs** — Logs are structured JSON from Pino; Docker native logs sufficient; avoid $0.50/GB ingestion cost
5. **Multi-region failover** — Not needed for demo/small-scale product; complexity not justified
6. **GitOps (ArgoCD)** — Existing GitHub Actions CI is sufficient; ArgoCD adds operational burden
7. **Istio/service mesh** — Only one app; no need for traffic splitting
8. **Dedicated bastion host for SSH** — Use Lightsail's built-in browser SSH terminal; add VPN later if needed

### Do Add (Essential for Production)

1. **GitHub Actions OIDC** (not stored AWS keys) — Best practice; no secrets in repo
2. **Health checks in docker-compose** — Restart dead containers automatically
3. **Prometheus + Grafana** — Minimal overhead; essential for debugging production issues
4. **Automated backups** — pg_dump to S3; one failure away from data loss
5. **Let's Encrypt + certbot** — Free TLS; auto-renewal avoids certificate expiry incidents
6. **Post-deploy smoke tests** — Playwright E2E tests validate deployment end-to-end

---

## Integration with Existing Stack

### What's Already Working

- **Dockerfile** (multi-stage, non-root user) — Good foundation; just upgrade to node:22-slim
- **docker-compose.yml** — Already includes postgres + redis + app with healthchecks; production-ready
- **GitHub Actions CI** (lint, test, build) — Extend with Lightsail deployment job
- **Prometheus metrics** (`/metrics` endpoint) — Already exposed; just add Prometheus container
- **Pino structured logging** — JSON output ready for aggregation
- **Kubernetes manifests** — NOT needed for single-instance Lightsail; keep as reference for future scaling

### What Needs to Be Added

- **AWS CLI lightsail commands** — For image push + deployment management
- **certbot in Docker** — For TLS renewal automation
- **Lightsail instance provisioning** — Via AWS console or Terraform (recommend manual for first time)
- **GitHub Actions deployment workflow** — New `.github/workflows/deploy-lightsail.yml`
- **Grafana dashboards** — JSON config for monitoring key metrics
- **pg_dump to S3 cron** — Backup script in container or Lambda

### What Can Be Deferred

- **Migrate from Kubernetes to docker-compose** — Kubernetes manifests still valid; phase 3+ can use them for multi-node deployments
- **ArgoCD GitOps** — Not needed for single-instance; add when team grows
- **Sealed Secrets / cert-manager** — Lightsail DNS + certbot simpler for now

---

## Cost Projections

### Best Case ($15-17/mo)

```
Lightsail Micro instance     $10/mo
EBS snapshots (weekly)       $2/mo
S3 backups (30GB)            $0.70/mo
Route 53 DNS                 $0.50/mo
GitHub Actions               $0 (within free tier)
GHCR registry                $0 (within free tier)
Misc (overage, monitoring)   $1.80/mo
─────────────────────────────
TOTAL                        $15.50/mo
```

**Assumptions:** Container-based PostgreSQL, GHCR for images, nightly pg_dump to S3, 50 concurrent users, 500 GB/mo data transfer (within free limit).

### Realistic Case ($20-25/mo)

```
Lightsail Micro instance     $10/mo
EBS snapshots (bi-weekly)    $3/mo
S3 backups (60GB retained)   $1.50/mo
Route 53 DNS                 $0.50/mo
Secrets Manager (3 secrets)  $1.20/mo
CloudWatch alarms            $0.10/mo
AWS data transfer overage    $2-5/mo (if >1TB/mo)
─────────────────────────────
TOTAL                        $18-22/mo
```

### If Scaling to 200+ Concurrent Users ($80-100/mo)

```
Lightsail Containers Small   $80/mo (auto-scaling, managed TLS)
Lightsail Managed DB         $15/mo (separate PostgreSQL)
S3 backups (100GB)           $2/mo
Route 53 DNS                 $0.50/mo
Monitoring/logging           $2/mo
─────────────────────────────
TOTAL                        $99.50/mo
```

**Trigger to upgrade:** When Micro instance hits 80% CPU/memory for sustained periods, or when WebSocket connection pool exhaustion occurs.

---

## Confidence Assessment

| Area | Confidence | Evidence | Notes |
|------|------------|----------|-------|
| **Stack (Docker, AWS CLI, certbot)** | HIGH | Official AWS docs + GitHub Actions tutorials current as Feb 2026 | Versions verified; all tools actively maintained |
| **Lightsail pricing & features** | HIGH | AWS official pricing page checked Feb 2026 | Prices stable; Lightsail Containers feature mature (released 2021) |
| **CI/CD deployment patterns** | MEDIUM-HIGH | Multiple GitHub + Lightsail tutorials (2023-2025); one December 2025 pg_dump article | Pattern works; some implementations may be outdated; recommend testing |
| **On-instance monitoring** | HIGH | Prometheus + Grafana Docker images verified; Pino already in codebase | Well-established stack; low risk |
| **Database backup strategy** | MEDIUM | December 2025 article on serverless pg_dump backups; Lightsail snapshot limitations documented | pg_dump to S3 best practice; snapshot restore workflow requires testing |
| **Cost projections** | MEDIUM | Based on AWS pricing + ScrumQuest Phase 29 load test data | Depends on actual concurrent users; projections vary by region |

---

## Gaps That Need Phase-Specific Research

1. **Phase 3 (CI/CD):** Exact GitHub Actions OIDC IAM role configuration for Lightsail — will need AWS console walkthrough
2. **Phase 3:** Test deployment to staging Lightsail instance; measure zero-downtime switching time
3. **Phase 4:** Verify that Prometheus can scrape Socket.IO metrics correctly; may need custom prom-client instrumentation
4. **Phase 4:** SSH tunnel access control — how to securely expose Grafana to team without public internet
5. **Phase 5:** Test pg_dump restore workflow end-to-end; measure RTO/RPO
6. **Phase 5:** Determine optimal backup frequency (nightly vs. weekly vs. continuous WAL archiving) based on actual data volumes

---

## Recommendations for Implementation

### Immediate Actions (Before Phase 1)

- [ ] Read [AWS Lightsail Getting Started guide](https://docs.aws.amazon.com/lightsail/latest/userguide/getting-started-with-amazon-lightsail.html)
- [ ] Test docker-compose locally with node:22-slim image
- [ ] Create AWS account; setup billing alert at $50/mo
- [ ] Install AWS CLI v2.33.26+ on local dev machine

### Phase 1 Checklist

- [ ] Upgrade Dockerfile to node:22-slim; test image size
- [ ] Measure startup time; ensure <30s for health checks
- [ ] Verify all health endpoints respond correctly
- [ ] Document any changes to package.json (if moving dependencies)

### Phase 2 Checklist

- [ ] Create Lightsail Micro instance in us-east-1
- [ ] SSH in; confirm docker + docker-compose installed
- [ ] Test docker-compose up locally on Lightsail instance
- [ ] Configure domain DNS (Route 53 or external)
- [ ] Setup Lightsail firewall (443 open, 5000 closed)

### Phase 3 Checklist

- [ ] Create `.github/workflows/deploy-lightsail.yml`
- [ ] Configure GitHub Actions OIDC role in AWS
- [ ] Test staging deployment on push to main branch
- [ ] Implement rollback procedure; document steps
- [ ] Add post-deploy smoke tests (Playwright E2E)

### Phase 4 Checklist

- [ ] Deploy certbot in docker-compose; test renewal
- [ ] Deploy Prometheus + Grafana; SSH tunnel access
- [ ] Create 3-5 key dashboards (CPU, memory, requests, errors, WebSocket connections)
- [ ] Configure Grafana alerts to Slack (if available)
- [ ] Document monitoring runbook

### Phase 5 Checklist

- [ ] Implement pg_dump to S3 cron job
- [ ] Test restore from S3 backup
- [ ] Test restore from Lightsail snapshot
- [ ] Document RTO/RPO values
- [ ] Create incident response runbook

---

## Sources

All sources verified February 2026:

- [AWS Lightsail Container Services Documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html)
- [AWS Lightsail Pricing](https://aws.amazon.com/lightsail/pricing/)
- [AWS CLI v2 Reference — Lightsail Commands](https://docs.aws.amazon.com/cli/latest/reference/lightsail/)
- [Docker Compose Official Documentation](https://docs.docker.com/compose/)
- [Node.js LTS Release Schedule](https://nodejs.org/en/about/previous-releases)
- [Let's Encrypt & Certbot Documentation](https://certbot.eff.org/)
- [Prometheus & Grafana Stack on Docker](https://codersociety.com/blog/articles/nodejs-application-monitoring-with-prometheus-and-grafana)
- [GitHub Actions: Lightsail Deployment Automation](https://medium.com/@lukhee/automating-aws-lightsail-deployments-with-github-actions-53c73c9a1c1f)
- [Docker Health Checks Best Practices](https://last9.io/blog/docker-compose-health-checks/)
- [AWS Lightsail PostgreSQL Backup Strategy](https://medium.com/@praveenluke/how-i-built-a-serverless-postgresql-backup-system-for-aws-lightsail-that-costs-almost-nothing-5a186505b8f0)

---

## Next Steps for Roadmap Integration

1. **Review this research** with team; confirm AWS Lightsail + docker-compose path
2. **Schedule Phase 1-5 implementation** in sprint planning (estimated 8 weeks total)
3. **Create detailed Phase 1 plan** based on Dockerfile optimization specifics
4. **Spin up test Lightsail instance** to validate docker-compose deployment locally
5. **Iterate on CI/CD workflow** before committing to Phase 3

