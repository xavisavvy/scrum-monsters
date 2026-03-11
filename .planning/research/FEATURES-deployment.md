# Deployment Features & Capabilities

**Project:** ScrumQuest
**Researched:** 2026-02-24

---

## Table Stakes Features

Features required for production deployment. Missing = service feels incomplete.

| Feature | Why Expected | Complexity | Implementation | Notes |
|---------|--------------|-----------|-----------------|-------|
| **HTTPS/TLS on Custom Domain** | Standard for any web app; prevents man-in-the-middle attacks; browsers show warnings without it | Low | Let's Encrypt + certbot in Docker container; auto-renewal cron | Lightsail Containers handles automatically; instances require manual setup |
| **Zero-Downtime Deployments** | Users should not experience interruption during releases | Medium | Blue-green via image tags; healthcheck gates traffic | Lightsail Containers built-in; instances require manual orchestration |
| **Health Checks & Auto-Restart** | Dead containers should be restarted automatically | Low | docker-compose healthcheck + restart: unless-stopped | Catches crashes, OOM kills, segfaults |
| **Database Backups** | Data loss = product failure | Low | pg_dump to S3 nightly | Manual restore required; test quarterly |
| **Error Monitoring** | Team should be notified of critical issues | Medium | Prometheus alerting or Slack webhooks | Implemented in Grafana dashboards |
| **Performance Monitoring** | Need visibility into latency, memory, CPU usage | Medium | Prometheus metrics + Grafana dashboards | SSH tunnel access to dashboards (not public) |
| **Automated Deployments** | Manual SSH + git pull = error-prone and slow | Medium | GitHub Actions + AWS CLI lightsail commands | Staging auto-deploy on push; prod manual-trigger |
| **Rollback Capability** | Bad deploy should be recoverable in minutes | Low | Keep previous image tag in registry; redeploy | 2-5 minutes recovery time (container restart) |
| **Secrets Management** | Passwords/tokens must not be in git | Low | AWS Secrets Manager or .env files (local) | GitHub Actions can fetch from Secrets Manager at deploy time |

---

## Differentiators

Features that set ScrumQuest apart. Not expected, but valuable.

| Feature | Value Proposition | Complexity | Implementation | Notes |
|---------|-------------------|-----------|-----------------|-------|
| **WebSocket Real-Time Metrics** | Game events reflected in monitoring dashboards instantly | Medium | Custom prom-client metrics in Socket.IO handlers | Shows player count, estimates per second, reveal timings |
| **One-Click Production Deployment** | Team lead can deploy without ops knowledge | Medium | GitHub Actions workflow_dispatch UI | Workflow shows deployment history; no AWS console access needed |
| **Instant Rollback from UI** | Recover from bad deploy without CLI access | Medium | GitHub Actions workflow_dispatch with rollback_version input | Dropdown list of recent releases; auto-selects previous |
| **Multi-Environment Staging** | Test deployments in prod-like environment before releasing | Medium | Separate Lightsail instances (staging vs prod) | Staging auto-deploys; prod manual; can test TLS, backups, etc. |
| **Cost Visibility Dashboard** | Team knows exactly what infrastructure costs | Low | Grafana panel with Lightsail pricing + AWS billing data | Displays hourly cost estimate; alerts if exceeds budget |
| **Automated Database Migrations** | Schema changes deployed with app releases | Medium | `npm run db:migrate` in pre-start hook or pre-deploy job | Drizzle ORM already configured; just needs orchestration |
| **Canary Deployments** | Roll out to 10% of users first; watch for errors | High | Deploy to staging first; manual promote when confident | Not automated; requires team discipline |
| **Performance Regression Detection** | Alert if new deploy is slower than previous | High | Compare Prometheus metrics from old vs new deployment | Requires baseline data; complex to implement correctly |
| **Game Session Analytics** | Charts of lobbies created, avg game duration, player retention | Medium | Prometheus metrics + Grafana; export to Datadog if needed | Currently available in server logs; dashboards would surface trends |

---

## Anti-Features

Features to explicitly NOT build. Doing so wastes resources or introduces complexity.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Auto-scaling (Kubernetes / ECS)** | Overkill for 50 concurrent users; 5x cost + ops burden | Vertical scale to Lightsail Small ($20) if needed; revisit at 200+ users |
| **Multi-region deployment** | ScrumQuest has no global user base; adds latency for US users | Single region (us-east-1); add backup region if compliance required later |
| **APM tools (Datadog, New Relic)** | $50+/mo; Prometheus + Grafana covers all use cases at $0 | Use on-instance Prometheus + Grafana for entire lifetime |
| **Dedicated database server** | RDS Micro ($15/mo) unnecessary at <10K users; container sidecar is free | Keep PostgreSQL in docker-compose sidecar; migrate to RDS at 500+ users |
| **Message queue (RabbitMQ, Kafka)** | Adds complexity; game state already synced via WebSocket | Keep current Socket.IO architecture; queue is overkill |
| **GitOps (ArgoCD, Flux)** | GitHub Actions CI sufficient for single team; ArgoCD adds learning curve | GitHub Actions workflow_dispatch is simple and sufficient |
| **Distributed tracing (Jaeger, Tempo)** | Overkill for single-service monolith | Use structured JSON logs from Pino + Prometheus for now |
| **Service mesh (Istio)** | Only one app; no routing complexity; adds massive overhead | Use simple docker-compose networking; no mesh needed |
| **Custom load balancer** | Lightsail Containers has built-in LB; instances are single-node (no LB needed) | Use reverse proxy (nginx) only if splitting traffic (not needed yet) |
| **Persistent volumes for logs** | Docker logs sufficient; archive old logs to S3 if needed | Keep 7-day Docker log retention; export to S3 for long-term storage |

---

## Feature Dependencies

```
HTTP/HTTPS Server
├── Working on Lightsail Instance/Container
│   ├── Docker Compose orchestration
│   └── Health checks
│
├── TLS Certificates
│   ├── DNS resolution
│   ├── Let's Encrypt (free)
│   └── Certbot auto-renewal
│
├── Monitoring
│   ├── Prometheus scraping /metrics
│   ├── Grafana dashboards
│   └── PostgreSQL metrics (connection pool, query latency)
│
├── Deployment Automation
│   ├── GitHub Actions CI pipeline
│   ├── Docker image push to GHCR
│   └── AWS CLI lightsail commands
│
├── Backup & Recovery
│   ├── PostgreSQL pg_dump
│   ├── S3 storage
│   └── Restore scripts
│
├── Secrets Management
│   ├── Environment variables
│   ├── AWS Secrets Manager (optional)
│   └── SSH key for Lightsail access
│
└── Error Handling
    ├── Container health checks
    ├── Auto-restart on failure
    └── Alert notifications (Slack/email)

```

---

## MVP Deployment Stack

**Prioritize in Phase 1-3:**

1. **HTTPS on Custom Domain** — Non-negotiable; users expect secure connection
2. **Working Deployment Process** — GitHub Actions → GHCR → Lightsail (staging auto, prod manual)
3. **Health Checks & Auto-Restart** — Containers recover from crashes automatically
4. **Database Backups** — Nightly pg_dump to S3; test restore quarterly
5. **Basic Monitoring** — Prometheus + Grafana showing CPU, memory, request latency

**Defer to Phase 4-5:**

- Advanced alerting (PagerDuty, OpsGenie)
- Cost visualization dashboard
- Canary deployments
- Performance regression detection
- Multi-environment orchestration

---

## Feature Rollout Timeline

### Week 1-2: Docker Optimization

- Upgrade Dockerfile to node:22-slim
- Measure image size and startup time
- Validate existing health endpoints

**Ship:** Production-ready Docker image

---

### Week 3-4: Lightsail Setup & Firewall

- Provision Lightsail Micro instance
- Configure DNS (Route 53 or external)
- Open port 443 (HTTPS only); close 5000

**Ship:** Infrastructure ready for deployment

---

### Week 5-6: CI/CD Pipeline

- Create GitHub Actions deployment workflow
- Setup OIDC for AWS (no stored secrets)
- Test staging auto-deploy on push

**Ship:** Automated staging deployments

---

### Week 7-8: TLS & Monitoring

- Deploy certbot; test certificate renewal
- Deploy Prometheus + Grafana (localhost-only)
- Create key dashboards (CPU, memory, requests)

**Ship:** Production observability

---

### Week 9-10: Backup & Disaster Recovery

- Implement pg_dump to S3 nightly
- Test restore from backup
- Document runbooks

**Ship:** Data durability; ops confidence

---

## Success Criteria

### Deployment is "Done" When:

- [ ] HTTPS works on custom domain (non-self-signed)
- [ ] TLS certificate auto-renews without manual intervention
- [ ] Staging deployments are fully automated (push to main → live in 5 min)
- [ ] Production deployments are manual-triggered but fully automated (workflow_dispatch → live in 5 min)
- [ ] Rollback from bad deploy takes <5 minutes and is fully automated
- [ ] Database backups run nightly; can restore from backup in <10 minutes
- [ ] Prometheus collects metrics; Grafana dashboards show key metrics
- [ ] Crashed containers restart automatically within 30 seconds
- [ ] Team can deploy without SSH access (via GitHub Actions only)
- [ ] Post-deploy smoke tests run automatically (E2E validation)

### Observability is "Done" When:

- [ ] Dashboards show real-time player count, active lobbies, error rate
- [ ] Team can SSH + view docker logs; understand app state
- [ ] Alerts fire if TLS cert expiring in <14 days
- [ ] Alerts fire if disk space >80% full
- [ ] Alerts fire if 5xx error rate >1% for 5 minutes

---

## Rollout Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Failed deploy breaks prod** | Medium | Critical | Always deploy to staging first; run E2E tests post-deploy |
| **TLS cert expires; users get warning** | Low | High | Prometheus alert if <14 days to expiry; test renewal quarterly |
| **Disk runs out; postgres fails** | Low | Critical | Monitor disk %; rotate logs; docker system prune regularly |
| **AWS account compromised** | Low | Critical | Use OIDC for GitHub Actions (no stored secrets); audit AWS access regularly |
| **Backup restore fails when needed** | Medium | Critical | Test backup restore quarterly; keep 30-day retention in S3 |
| **Operator deletes instance by accident** | Low | Critical | AWS Lightsail has 15-minute delete protection; document restore from snapshot |
| **App memory leak causes OOM kills** | Medium | High | Monitor memory in Grafana; set heap limit; restart nightly if needed |

---

## Known Limitations (Honest Assessment)

1. **No instant failover** — Single Lightsail instance is SPOF (Single Point of Failure). Recover in 5-10 min if goes down.
2. **Manual rollback only** — No canary deployments or gradual rollouts; all-or-nothing deploy.
3. **Dashboard access requires SSH tunnel** — Grafana not public-facing; adds friction to ops workflow.
4. **PostgreSQL connection pool exhaustion** — At ~200+ concurrent users, pool limits enforced; app must handle gracefully.
5. **No auto-scaling** — If users spike beyond capacity, must manually restart instance or upgrade size (downtime).
6. **Backup restore is manual** — No "1-click restore" button; requires AWS CLI knowledge + shell access.
7. **No CDN** — All requests hit Lightsail instance; latency not optimized geographically (fine for US-centric user base).
8. **Monitoring is SSH-tunnel-only** — Can't show public metrics dashboard to stakeholders; requires access.

**Acceptability:** All limitations acceptable for MVP. Revisit at 200+ concurrent users.

---

