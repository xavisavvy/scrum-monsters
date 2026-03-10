---
phase: 36-disaster-recovery
plan: "02"
subsystem: infra
tags: [tls, blackbox-exporter, prometheus, letsencrypt, monitoring]

requires:
  - phase: 35-observability
    provides: Prometheus + Grafana monitoring stack
provides:
  - Blackbox Exporter probing scrummonsters.com HTTPS
  - Prometheus alert rules for TLS cert expiry (14-day warning, 7-day critical)
  - Verified Let's Encrypt renewal mechanism via NPM
affects: [36-03-incident-runbook]

tech-stack:
  added: [prom/blackbox-exporter]
  patterns: [Blackbox Exporter relabel for external target probing]

key-files:
  created:
    - docker/blackbox/blackbox.yml
    - docker/prometheus/alerts.yml
  modified:
    - docker/prometheus/prometheus.yml
    - docker-compose.prod.yml

key-decisions:
  - "Blackbox Exporter on 127.0.0.1:9115 — not publicly accessible, SSH tunnel only"
  - "32MB memory limit for Blackbox Exporter — actual usage ~14MB"
  - "14-day warning + 7-day critical alert thresholds with 1h for: duration to avoid flapping"
  - "Certificate expires May 31 2026 — ~82 days of headroom, NPM handles auto-renewal"

patterns-established:
  - "Prometheus alert rules in docker/prometheus/alerts.yml"
  - "External service probing via Blackbox Exporter relabel pattern"

duration: ~5min
completed: 2026-03-10
---

# Plan 36-02: TLS Certificate Monitoring Summary

**Blackbox Exporter probing HTTPS with Prometheus alert rules for 14-day/7-day cert expiry thresholds, Let's Encrypt renewal verified**

## Performance

- **Tasks:** 2 (1 auto, 1 checkpoint)
- **Files modified:** 4

## Accomplishments
- Added Blackbox Exporter service with https_2xx probe module for scrummonsters.com
- Created Prometheus alert rules: TLSCertExpiringSoon (14d) and TLSCertExpiryCritical (7d)
- Deployed to VPS — probe_success=1, blackbox-tls target UP, alerts loaded (inactive)
- Verified cert expiry: May 31 2026 (~82 days), NPM auto-renewal confirmed
- Total stack memory ~230MB — well within 1GB budget

## Task Commits

1. **Task 1: Add Blackbox Exporter and Prometheus alert rules** - `ceb3b79` (feat)
2. **Task 2: Deploy cert monitoring and verify TLS renewal** - Human-verified checkpoint (approved)

## Files Created/Modified
- `docker/blackbox/blackbox.yml` - HTTPS probe module configuration
- `docker/prometheus/alerts.yml` - TLS cert expiry alert rules (warning + critical)
- `docker/prometheus/prometheus.yml` - Added rule_files and blackbox-tls scrape job
- `docker-compose.prod.yml` - Added blackbox-exporter service, alerts.yml mount on prometheus

## Decisions Made
- Blackbox Exporter bound to 127.0.0.1 — consistent with all monitoring ports being SSH-tunnel-only
- 32MB memory limit sufficient (actual ~14MB)
- 1h for: duration on alerts prevents transient probe failures from firing

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TLS monitoring active, cert expiry alerting in place
- DR-02 requirement satisfied
- Ready for 36-03 incident runbook to reference cert renewal procedures

---
*Phase: 36-disaster-recovery*
*Completed: 2026-03-10*
