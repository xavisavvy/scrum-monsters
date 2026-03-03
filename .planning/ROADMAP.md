# Roadmap: ScrumQuest

## Milestones

- ✅ **v1.0 Domain Separation** — Phases 1-6 (shipped 2026-02-02)
- ✅ **v1.2 SDLC Best Practices** — Phases 7-14 (shipped 2026-02-03)
- ✅ **v1.3 Game Progression** — Phases 15-20 (shipped 2026-02-11)
- ✅ **v2.0 UI Redesign & Mobile** — Phases 21-25 (shipped 2026-02-19)
- ✅ **v3.0 Production Optimization** — Phases 26-29 (shipped 2026-02-20)
- ✅ **v3.1 Tech Debt Cleanup** — Phases 30-31 (completed 2026-02-24, 1 plan deferred)
- 🚧 **v4.0 Hosting & Deployment** — Phases 32-36 (in progress)

## Phases

<details>
<summary>✅ v1.0 Domain Separation (Phases 1-6) — SHIPPED 2026-02-02</summary>

See `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 SDLC Best Practices (Phases 7-14) — SHIPPED 2026-02-03</summary>

See `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Game Progression (Phases 15-20) — SHIPPED 2026-02-11</summary>

See `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 UI Redesign & Mobile (Phases 21-25) — SHIPPED 2026-02-19</summary>

See `.planning/milestones/v2.0-ROADMAP.md`

- [x] Phase 21: Production Security Hardening (5/5 plans) — completed 2026-02-18
- [x] Phase 22: JRPG Theme Foundation (6/6 plans) — completed 2026-02-18
- [x] Phase 23: Mobile UX Critical Path (5/5 plans) — completed 2026-02-18
- [x] Phase 24: Routing & SEO Infrastructure (4/4 plans) — completed 2026-02-18
- [x] Phase 25: Lobby Polish & Animations (3/3 plans) — completed 2026-02-19

</details>

<details>
<summary>✅ v3.0 Production Optimization (Phases 26-29) — SHIPPED 2026-02-20</summary>

See `.planning/milestones/v3.0-ROADMAP.md`

- [x] Phase 26: Tech Debt Cleanup (2/2 plans) — completed 2026-02-19
- [x] Phase 27: Database Foundation (2/2 plans) — completed 2026-02-19
- [x] Phase 28: Production Reliability (2/2 plans) — completed 2026-02-19
- [x] Phase 29: Hosting Analysis (3/3 plans) — completed 2026-02-20

</details>

<details>
<summary>✅ v3.1 Tech Debt Cleanup (Phases 30-31) — SHIPPED 2026-02-24</summary>

See `.planning/milestones/v3.1-ROADMAP.md`

- [x] Phase 30: Logging Cleanup (2/2 plans) — completed 2026-02-20
- [x] Phase 31: Dependency & Lifecycle Polish (1/2 plans, 1 deferred) — completed 2026-02-24

</details>

### 🚧 v4.0 Hosting & Deployment (In Progress)

**Milestone Goal:** Deploy ScrumMonsters to AWS Lightsail with Docker containers, custom domain HTTPS, full CI/CD pipeline, production observability, automated backups, and verified disaster recovery — with a clean break from Replit.

- [x] **Phase 32: Infrastructure Foundation** — Lightsail instance live, custom domain HTTPS, Docker Compose stack auto-starting (completed 2026-03-02)
- [ ] **Phase 33: Production Hardening** — Graceful deploys, daily DB backups, rollback capability, uptime alerting
- [ ] **Phase 34: CI/CD Pipeline** — Automated staging deploys, manual prod promotes, OIDC auth, post-deploy smoke tests
- [ ] **Phase 35: Observability** — Prometheus + Grafana dashboards, log aggregation, all services localhost-only
- [ ] **Phase 36: Disaster Recovery** — Backup restore verified end-to-end, TLS renewal tested, incident runbook complete

---

### Phase 32: Infrastructure Foundation

**Goal**: ScrumMonsters is live on AWS Lightsail with HTTPS on scrummonsters.com, the Docker Compose stack auto-restarts on VPS reboot, and all Replit-specific code is stripped from the codebase
**Depends on**: Nothing (first phase of milestone)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. The game is reachable at https://scrummonsters.com over HTTPS (no browser security warnings)
  2. Navigating to https://scrummonsters.com loads the ScrumMonsters lobby — the same experience as Replit
  3. Rebooting the VPS results in the Docker Compose stack coming back up without manual intervention
  4. Database credentials and secrets are absent from git history and docker-compose.prod.yml (no hardcoded values)
**Plans**: 3 plans

Plans:
- [x] 32-01-PLAN.md — Strip all Replit-specific code, harden DATABASE_URL env validation, remove dead dependencies
- [x] 32-02-PLAN.md — Write docker-compose.prod.yml (3-service stack), deploy.sh script, and operations runbook
- [x] 32-03-PLAN.md — Provision Lightsail VPS, configure DNS (Route 53 A record), set up HTTPS via Nginx Proxy Manager

---

### Phase 33: Production Hardening

**Goal**: Active games survive deploys, data is backed up daily off-server, bad deploys can be rolled back in under 5 minutes, and downtime triggers an alert within 5 minutes
**Depends on**: Phase 32
**Requirements**: HARD-01, HARD-02, HARD-03, HARD-04
**Success Criteria** (what must be TRUE):
  1. Deploying a new image while a game is in progress does not drop WebSocket connections mid-game (30s drain completes cleanly)
  2. A pg_dump file appears in S3 every day at 2am UTC and files older than 30 days are automatically deleted
  3. Rolling back to the previous deploy by specifying a prior image tag completes in under 5 minutes
  4. When the app goes down, an email alert arrives within 5 minutes
**Plans**: 2 plans

Plans:
- [ ] 33-01-PLAN.md — Fix graceful shutdown (io.close()), add stop_grace_period, switch to GHCR image pull, add backup sidecar, update deploy.sh and runbook
- [ ] 33-02-PLAN.md — Provision S3 bucket/IAM user/GHCR auth/UptimeRobot, deploy, verify all four success criteria end-to-end

---

### Phase 34: CI/CD Pipeline

**Goal**: Every push to main automatically deploys to staging; production deploys require a manual GitHub Actions trigger; AWS credentials never leave GitHub OIDC; each deploy is validated by Playwright smoke tests
**Depends on**: Phase 33
**Requirements**: CICD-01, CICD-02, CICD-03, CICD-04, CICD-05
**Success Criteria** (what must be TRUE):
  1. Pushing a commit to main triggers a Docker build, pushes the image to GHCR, and deploys to the staging Lightsail instance automatically
  2. Production can only be deployed by manually triggering the workflow_dispatch in GitHub Actions — no push to any branch deploys to prod automatically
  3. The GitHub Actions workflow authenticates to AWS via OIDC — no AWS access key secrets stored in GitHub
  4. After each deployment, a Playwright E2E smoke test runs and its pass/fail status is visible in the GitHub Actions run
  5. Drizzle migrations run and complete before the app container starts on each deploy
**Plans**: TBD

Plans:
- [ ] 34-01: Create deploy-lightsail.yml GitHub Actions workflow (build, tag, push to GHCR, SSH deploy to staging on push to main)
- [ ] 34-02: Configure GitHub OIDC for AWS authentication (IAM role, trust policy, no stored access keys), add workflow_dispatch prod deploy job
- [ ] 34-03: Wire Drizzle migration step before app container start, add post-deploy Playwright smoke test job

---

### Phase 35: Observability

**Goal**: Prometheus scrapes app metrics every 60 seconds, Grafana dashboards show active lobbies and player counts, all Docker container logs are viewable from a single interface, and all monitoring endpoints are accessible only via SSH tunnel
**Depends on**: Phase 34
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04
**Success Criteria** (what must be TRUE):
  1. Prometheus is scraping /metrics at 60s intervals and retaining 7 days of data without exceeding 256MB RAM
  2. A Grafana dashboard shows active lobbies, connected player count, WebSocket connections, and error rates with data flowing in real-time
  3. Logs from every Docker container (app, postgres, nginx, prometheus, grafana) are viewable from a single location without SSH-ing into individual containers
  4. Grafana and Prometheus ports (3000, 9090) are bound to 127.0.0.1 — the dashboards are not accessible from the public internet without an SSH tunnel
**Plans**: TBD

Plans:
- [ ] 35-01: Add Prometheus and Grafana containers to docker-compose.yml (bound to 127.0.0.1, memory-limited, 60s scrape interval, 7-day retention)
- [ ] 35-02: Configure Grafana dashboards for game metrics (active lobbies, players, WebSocket connections, error rates), document SSH tunnel access procedure
- [ ] 35-03: Configure Docker log aggregation (Loki or structured docker logs viewer), verify all container logs accessible from single interface

---

### Phase 36: Disaster Recovery

**Goal**: A complete database restore from S3 backup has been executed successfully, Let's Encrypt certificate renewal has been verified in staging, and a runbook documents every critical recovery procedure
**Depends on**: Phase 35
**Requirements**: DR-01, DR-02, DR-03
**Success Criteria** (what must be TRUE):
  1. A pg_restore from an S3 backup file completes successfully and the restored data is queryable — the full restore path is proven to work
  2. Let's Encrypt certificate renewal completes without errors in the staging environment (verified before the cert expires in production)
  3. The incident runbook exists and covers restart, restore, rollback, and at least three common failure scenarios with step-by-step recovery instructions
**Plans**: TBD

Plans:
- [ ] 36-01: Execute end-to-end pg_restore test from S3 backup (download, restore, verify data integrity), document exact commands
- [ ] 36-02: Force certificate renewal in staging environment, verify renewal automation works, set Prometheus alert for cert expiry under 14 days
- [ ] 36-03: Write incident response runbook (restart procedure, restore from backup, rollback to prior image, common failures: OOM, disk full, DB connection exhaustion, cert expiry)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 32 → 33 → 34 → 35 → 36

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 30/30 | Complete | 2026-02-02 |
| 7-14 | v1.2 | 21/21 | Complete | 2026-02-03 |
| 15-20 | v1.3 | 28/28 | Complete | 2026-02-11 |
| 21-25 | v2.0 | 23/23 | Complete | 2026-02-19 |
| 26-29 | v3.0 | 9/9 | Complete | 2026-02-20 |
| 30 | v3.1 | 2/2 | Complete | 2026-02-20 |
| 31 | v3.1 | 1/2 (1 deferred) | Complete | 2026-02-24 |
| 32. Infrastructure Foundation | v4.0 | 3/3 | Complete | 2026-03-02 |
| 33. Production Hardening | v4.0 | 0/2 | Not started | - |
| 34. CI/CD Pipeline | v4.0 | 0/3 | Not started | - |
| 35. Observability | v4.0 | 0/3 | Not started | - |
| 36. Disaster Recovery | v4.0 | 0/3 | Not started | - |

**Total: 7 milestones shipped, 32 phases complete, 117 plans (1 deferred) + 4 phases remaining for v4.0**

---
*Roadmap created: 2026-02-11*
*Last updated: 2026-03-02 — Phase 33 planned (2 plans)*
