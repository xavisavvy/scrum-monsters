---
phase: 32-infrastructure-foundation
plan: "03"
subsystem: infra
tags: [lightsail, aws, route53, nginx-proxy-manager, tls, letsencrypt, docker, systemd, deployment]

# Dependency graph
requires:
  - "32-01: Replit code stripped, env validation hardened"
  - "32-02: docker-compose.prod.yml, deploy.sh, runbook.md created"
provides:
  - "Live production at https://scrummonsters.com with valid Let's Encrypt TLS"
  - "Auto-restarting Docker Compose stack via systemd on VPS reboot"
  - "DNS A record: scrummonsters.com → 34.199.135.244 (Lightsail static IP)"
  - "NPM reverse proxy: 443 → app:5000 with WebSocket support"
  - "Production .env with secrets on VPS only (not in git)"
affects: [33-production-hardening, 34-ci-cd-pipeline, 35-observability, 36-disaster-recovery]

# Tech tracking
tech-stack:
  added:
    - "AWS Lightsail Micro ($5/mo, Ubuntu 22.04 LTS, us-east-1)"
    - "Let's Encrypt TLS via Nginx Proxy Manager (auto-renewal)"
    - "Route 53 A record (TTL 300)"
    - "systemd oneshot unit for Docker Compose auto-start"
  patterns:
    - "NPM port 81 access via SSH tunnel only (removed from public firewall after TLS setup)"
    - "VPS reboot → systemd → docker compose up -d → app healthy in ~2 min"

key-files:
  created:
    - "/opt/scrummonsters/.env (on VPS)"
    - "/etc/systemd/system/scrummonsters.service (on VPS)"
  modified: []

key-decisions:
  - "Lightsail static IP 34.199.135.244 attached to scrummonsters-prod instance"
  - "Port 81 removed from Lightsail firewall after TLS setup — NPM admin only via SSH tunnel"
  - "VPS reboot auto-restart verified: app comes back up within 2-3 minutes without manual intervention"

patterns-established:
  - "Production deploy target: ubuntu@34.199.135.244 via SSH key ~/.ssh/lightsail_scrummonsters"
  - "NPM admin access: ssh -L 81:localhost:81 ubuntu@34.199.135.244"

# Metrics
duration: manual (human checkpoint plan)
completed: 2026-03-02
---

# Phase 32 Plan 03: Provision Lightsail, DNS, and HTTPS Summary

**ScrumMonsters live at https://scrummonsters.com on Lightsail Micro with Let's Encrypt TLS, Route 53 DNS, NPM reverse proxy with WebSocket support, and systemd auto-restart surviving VPS reboot**

## Performance

- **Duration:** Manual (human checkpoint plan spanning multiple sessions)
- **Started:** 2026-02-25
- **Completed:** 2026-03-02
- **Checkpoints:** 2/2 complete
- **Files modified:** 0 (all infrastructure provisioning, no code changes)

## Accomplishments

- Lightsail Micro instance (scrummonsters-prod) running Ubuntu 22.04 LTS with static IP 34.199.135.244
- Route 53 A record: scrummonsters.com → 34.199.135.244 (TTL 300)
- Nginx Proxy Manager proxying 443 → app:5000 with WebSocket Support and Force SSL enabled
- Let's Encrypt certificate issued (valid Mar 2 – May 31, 2026, auto-renewing)
- Docker Compose 3-service stack running: app, postgres:17-alpine, nginx-proxy-manager
- systemd unit scrummonsters.service enabled — stack auto-starts on VPS reboot
- Production .env on VPS with generated secrets (chmod 600), not in git
- Port 81 removed from Lightsail firewall — NPM admin only accessible via SSH tunnel
- Database healthy with Drizzle schema pushed

## Verification Results

| Check | Result |
|-------|--------|
| `curl -sI https://scrummonsters.com` | HTTP/1.1 200 OK |
| `/api/health` | `{"status":"ok","checks":{"database":{"healthy":true}}}` |
| DNS (8.8.8.8) | Resolves to 34.199.135.244 |
| TLS certificate | Let's Encrypt E7, CN=scrummonsters.com, valid through May 31 |
| Lobby loads | Full landing page with bosses, features, CTA buttons |
| WebSocket | Connected, status shows "Online" |
| Console errors | None |
| VPS reboot test | App back up automatically, lobby loads, WebSocket connects |
| Port 81 | Removed from Lightsail firewall |

## Decisions Made

- Static IP 34.199.135.244 — permanent address for DNS and deploy.sh
- Port 81 removed post-TLS setup as planned — future NPM access via SSH tunnel only
- VPS reboot confirmed working — systemd unit properly configured with RemainAfterExit

## Deviations from Plan

None — both checkpoints executed as specified in the plan.

## Issues Encountered

None.

## Next Phase Readiness

- Production infrastructure fully operational — ready for Phase 33 (Production Hardening)
- deploy.sh REMOTE_HOST already set to 34.199.135.244
- Docker Compose stack is the target for graceful shutdown (SIGTERM drain) work in Phase 33
- S3 backup sidecar can be added to docker-compose.prod.yml in Phase 33

## Self-Check: PASSED

All verification criteria from the plan confirmed:
- [x] https://scrummonsters.com returns HTTP 200 with valid TLS (no browser warnings)
- [x] Lobby loads with full functionality (same experience as Replit)
- [x] WebSocket connects (101 upgrade, "Online" status)
- [x] VPS reboot: stack auto-restarts without manual intervention
- [x] .env on VPS only, not in git
- [x] Database healthy

---
*Phase: 32-infrastructure-foundation*
*Completed: 2026-03-02*
