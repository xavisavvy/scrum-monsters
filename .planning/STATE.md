# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** v4.0 Hosting & Deployment — Phase 33: Production Hardening

## Current Position

Phase: 33 of 36 (Production Hardening)
Plan: 0 of 3 in current phase (not yet planned)
Status: Ready for planning
Last activity: 2026-03-02 — Phase 32 complete, verified, all 3 plans shipped

Progress: [██░░░░░░░░] 20% (v4.0, 3/15 plans complete)

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

### Pending Todos

- Clean up OAUTH_CALLBACK_BASE_URL → BASE_URL in docker-compose.prod.yml (orphaned after Auth0 migration)

### Blockers/Concerns

- [Phase 33] Graceful shutdown SIGTERM drain with active Socket.IO games needs live-game testing — 30s window may need tuning
- [Phase 35] Prometheus cardinality audit of server/metrics.ts required before enabling in production (high-cardinality labels exhaust 1GB RAM)

## Session Continuity

Last session: 2026-03-02
Stopped at: Phase 32 complete and verified. Ready for Phase 33 planning.
Resume file: None
Next action: `/gsd:plan-phase 33`

---
*State initialized: 2026-02-11*
*Last updated: 2026-03-02 — Phase 32 complete (3/3 plans, verification passed 4/4)*
