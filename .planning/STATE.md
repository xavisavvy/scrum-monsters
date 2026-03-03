# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** v4.0 Hosting & Deployment — Phase 33: Production Hardening

## Current Position

Phase: 33 of 36 (Production Hardening)
Plan: 1 of 3 in current phase (33-01 complete)
Status: In progress
Last activity: 2026-03-02 — 33-01 complete (graceful shutdown, GHCR image pull, backup sidecar, rollback runbook)

Progress: [███░░░░░░░] 27% (v4.0, 4/15 plans complete)

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
| v4.0 Hosting & Deployment | 32-36 | 3/15 | In Progress | — |

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

### Pending Todos

- (DONE in 33-01) Clean up OAUTH_CALLBACK_BASE_URL → BASE_URL in docker-compose.prod.yml
- Provision S3 bucket for postgres-backup-s3 sidecar (Plan 33-02)
- Set up GHCR auth on VPS via PAT with read:packages scope (Plan 33-02)
- Configure UptimeRobot uptime monitoring (Plan 33-02)

### Blockers/Concerns

- [Phase 33] Graceful shutdown SIGTERM drain with active Socket.IO games needs live-game testing — 30s window may need tuning
- [Phase 35] Prometheus cardinality audit of server/metrics.ts required before enabling in production (high-cardinality labels exhaust 1GB RAM)

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 33-01-PLAN.md (graceful shutdown, GHCR image, backup sidecar, rollback runbook)
Resume file: None
Next action: Execute 33-02-PLAN.md (infrastructure provisioning: S3 bucket, GHCR auth, UptimeRobot)

---
*State initialized: 2026-02-11*
*Last updated: 2026-03-02 — 33-01 complete (2/2 tasks, all verification passed)*
