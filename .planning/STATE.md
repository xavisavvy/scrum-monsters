# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** v4.0 Hosting & Deployment — Phase 33: Production Hardening

## Current Position

Phase: 33 of 36 (Production Hardening) -- COMPLETE
Plan: 2 of 2 in current phase (33-01, 33-02 complete)
Status: Phase 33 complete, ready for Phase 34
Last activity: 2026-03-03 — 33-02 complete (infrastructure provisioned, all 4 success criteria verified live)

Progress: [███░░░░░░░] 33% (v4.0, 5/15 plans complete)

## Performance Metrics

**Velocity (all shipped milestones):**
- Total plans completed: 117
- Total milestones shipped: 7

**By Milestone:**

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 Domain Separation | 1-6 | 30 | Complete | 2026-02-02 |
| v1.2 SDLC Best Practices | 7-14 | 21 | Complete | 2026-02-03 |
| v1.3 Game Progression | 15-20 | 28 | Complete | 2026-02-11 |
| v2.0 UI Redesign & Mobile | 21-25 | 23 | Complete | 2026-02-19 |
| v3.0 Production Optimization | 26-29 | 9 | Complete | 2026-02-20 |
| v3.1 Tech Debt Cleanup | 30-31 | 4/5 (1 deferred) | Complete | 2026-02-24 |
| v4.0 Hosting & Deployment | 32-36 | 5/15 | In Progress | — |

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Key decisions for v4.0:
- AWS Lightsail $5/mo recommended (58% headroom for 2x growth)
- Docker Compose sidecar PostgreSQL (not managed DB — saves $15/mo)
- Nginx Proxy Manager for TLS (GUI-based, built-in Let's Encrypt)
- GitHub OIDC for AWS auth (no stored long-lived access keys)
- Prometheus memory limits required (256MB cap — 1GB VPS constraint)
- Staging auto-deploy on push to main; prod is manual workflow_dispatch only
- OAUTH_CALLBACK_BASE_URL env var controls OAuth callback URL (replaces Replit runtime detection) [32-01]
- DATABASE_URL missing in production calls process.exit(1) — fail-fast, no silent in-memory fallback [32-01]
- @neondatabase/serverless removed — app uses postgres driver directly, neon was dead code [32-01]
- Port 5000 internal only — NPM proxies 443 → app:5000; no direct public internet access to app port [32-02]
- deploy.sh uses --no-deps on final up — postgres and NPM never restart during code deploys [32-02]
- drizzle-kit push runs on every deploy (idempotent) — schema always current without migration management [32-02]
- NPM port 81 removed from Lightsail firewall after TLS setup; use SSH tunnel for future admin access [32-03]
- Lightsail static IP: 34.199.135.244, instance: scrummonsters-prod [32-03]
- VPS reboot auto-restart verified working via systemd unit [32-03]
- OAUTH_CALLBACK_BASE_URL is orphaned after Auth0 migration — clean up in Phase 33 (replace with BASE_URL) [32-03 verification]
- io.close() must be called explicitly in graceful shutdown — server.close() does NOT close WebSocket connections (Socket.IO 4.x confirmed) [33-01]
- stop_grace_period: 45s = 30s Node.js force-exit + 15s Docker buffer — prevents SIGKILL race [33-01]
- GHCR image pull on VPS, build in CI — 1GB VPS cannot reliably build TypeScript/Vite (600-800MB peak) [33-01]
- APP_IMAGE_TAG env var controls rollback — sha-XXXXXX tag pinning without touching docker-compose.prod.yml [33-01]
- postgres-backup-s3:17 sidecar for daily automated backups — version matches postgres:17-alpine for pg_dump compatibility [33-01]
- Custom pg17 backup sidecar replaces eeshugerman/postgres-backup-s3 — upstream lacks :17 tag, pg_dump v16 refuses Postgres 17 server [33-02]
- Route 53 + CloudWatch + SNS for uptime alerting instead of UptimeRobot — AWS-native, 30s interval, no third-party dependency [33-02]
- IAM backup user has GetObject + ListBucket in addition to PutObject — enables restore verification and backup listing [33-02]

### Pending Todos

- (DONE in 33-01) Clean up OAUTH_CALLBACK_BASE_URL → BASE_URL in docker-compose.prod.yml
- (DONE in 33-02) Provision S3 bucket scrummonsters-backups with 30-day lifecycle policy
- (DONE in 33-02) Set up GHCR auth on VPS via PAT with read:packages scope
- (DONE in 33-02) Configure uptime alerting via Route 53 + CloudWatch + SNS (replaced UptimeRobot)

### Blockers/Concerns

- (RESOLVED in 33-02) Graceful shutdown verified: 2.566s clean exit with io.close() drain — 30s window adequate
- [Phase 35] Prometheus cardinality audit of server/metrics.ts required before enabling in production (high-cardinality labels exhaust 1GB RAM)

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 33-02-PLAN.md — Phase 33 Production Hardening complete (all 4 criteria verified)
Resume file: None
Next action: Plan Phase 34

---
*State initialized: 2026-02-11*
*Last updated: 2026-03-03 — 33-02 complete (2/2 tasks, all 4 Phase 33 success criteria verified live)*
