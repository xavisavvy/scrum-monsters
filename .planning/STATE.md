# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun
**Current focus:** v4.0 Hosting & Deployment — Phase 32: Infrastructure Foundation

## Current Position

Phase: 32 of 36 (Infrastructure Foundation)
Plan: 3 of 3 in current phase (human checkpoint)
Status: In progress — awaiting VPS provisioning
Last activity: 2026-02-25 — 32-01 and 32-02 committed, entering 32-03 human checkpoints

Progress: [██░░░░░░░░] 13% (v4.0, 2/15 plans complete)

## Performance Metrics

**Velocity (all shipped milestones):**
- Total plans completed: 114
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
| v4.0 Hosting & Deployment | 32-36 | 2/15 | In Progress | — |

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
- NPM port 81 temporary — remove from Lightsail firewall after TLS setup; use SSH tunnel for future admin access [32-02]

### Pending Todos

None.

### Blockers/Concerns

- [Phase 33] Graceful shutdown SIGTERM drain with active Socket.IO games needs live-game testing — 30s window may need tuning
- [Phase 35] Prometheus cardinality audit of server/metrics.ts required before enabling in production (high-cardinality labels exhaust 1GB RAM)

## Session Continuity

Last session: 2026-02-25
Stopped at: 32-01 and 32-02 committed. Entering 32-03 human checkpoints.
Resume file: None
Next action: Execute 32-03 — VPS provisioning (checkpoint 1), then DNS/TLS setup (checkpoint 2)

---
*State initialized: 2026-02-11*
*Last updated: 2026-02-24 — 32-02 complete (files created, manual commits needed)*
