# Requirements: ScrumQuest

**Defined:** 2026-02-24
**Core Value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun

## v4.0 Requirements

Requirements for hosting & deployment milestone. Each maps to roadmap phases.

### Infrastructure Setup

- [ ] **INFRA-01**: Lightsail Micro instance provisioned with firewall rules (ports 80, 443, 22 only)
- [ ] **INFRA-02**: Production docker-compose.yml runs app, PostgreSQL, and Nginx Proxy Manager containers
- [ ] **INFRA-03**: Custom domain points to Lightsail with HTTPS via Let's Encrypt (Nginx Proxy Manager)
- [ ] **INFRA-04**: Systemd service unit auto-starts Docker Compose on VPS reboot
- [ ] **INFRA-05**: Secrets managed via .env file (never in git), env var substitution in docker-compose.yml

### Production Hardening

- [ ] **HARD-01**: SIGTERM handler drains WebSocket connections for 30s before exit (no dropped games during deploys)
- [ ] **HARD-02**: postgres-backup-s3 sidecar runs daily pg_dump to S3 with 30-day retention
- [ ] **HARD-03**: GHCR images tagged with sha + semver for rollback to prior version in under 5 min
- [ ] **HARD-04**: Uptime alerts notify via email within 5 min of downtime

### CI/CD Pipeline

- [ ] **CICD-01**: Push to main triggers Docker build, push to GHCR, and deploy to staging on Lightsail
- [ ] **CICD-02**: Production deploys via GitHub Actions workflow_dispatch (never auto-deployed)
- [ ] **CICD-03**: GitHub OIDC for AWS authentication (no stored long-lived access keys)
- [ ] **CICD-04**: Playwright E2E smoke test runs after each deployment
- [ ] **CICD-05**: Drizzle migrations run automatically before app container starts on each deploy

### Observability

- [ ] **OBS-01**: Prometheus container scrapes app /metrics (60s interval, 7-day retention, memory-limited)
- [ ] **OBS-02**: Grafana dashboards for active lobbies, player count, WebSocket connections, error rates
- [ ] **OBS-03**: Log aggregation for all Docker containers viewable from single interface
- [ ] **OBS-04**: All monitoring services bound to 127.0.0.1, accessed via SSH tunnel only

### Disaster Recovery

- [ ] **DR-01**: End-to-end pg_restore from S3 backup verified working
- [ ] **DR-02**: Let's Encrypt certificate renewal verified in staging
- [ ] **DR-03**: Incident response runbook documents restart, restore, rollback, and common failure procedures

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Scaling

- **SCALE-01**: Redis adapter for Socket.IO horizontal scaling
- **SCALE-02**: Multi-instance deployment with load balancer
- **SCALE-03**: Managed PostgreSQL migration (Lightsail RDS or external)

### Advanced Deployment

- **ADV-01**: Blue-green zero-downtime deployments with traffic switching
- **ADV-02**: Infrastructure-as-code (Terraform/Pulumi) for reproducible setup
- **ADV-03**: Multi-region deployment for latency reduction

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Kubernetes deployment | Overkill for single VPS with 50 concurrent users; existing K8s manifests preserved as reference |
| ECS Fargate or EKS | $50+/mo, exceeds budget, requires ops team knowledge |
| Managed database (Lightsail RDS) | $15/mo extra; Docker sidecar sufficient at current scale |
| Datadog/New Relic APM | $50+/mo, incompatible with budget |
| Service mesh (Istio/Linkerd) | Massive complexity, zero benefit for single instance |
| Distributed tracing | Not needed at single-instance scale |
| Multi-region | Premature optimization; single region sufficient for current user base |
| Replit removal | Keep Replit as dev/demo fallback; no changes to Replit deployment |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |
| INFRA-05 | — | Pending |
| HARD-01 | — | Pending |
| HARD-02 | — | Pending |
| HARD-03 | — | Pending |
| HARD-04 | — | Pending |
| CICD-01 | — | Pending |
| CICD-02 | — | Pending |
| CICD-03 | — | Pending |
| CICD-04 | — | Pending |
| CICD-05 | — | Pending |
| OBS-01 | — | Pending |
| OBS-02 | — | Pending |
| OBS-03 | — | Pending |
| OBS-04 | — | Pending |
| DR-01 | — | Pending |
| DR-02 | — | Pending |
| DR-03 | — | Pending |

**Coverage:**
- v4.0 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-24 after initial definition*
