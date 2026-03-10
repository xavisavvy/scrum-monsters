---
phase: 35-observability
plan: 03
subsystem: infra
tags: [prometheus, grafana, dozzle, docker, monitoring, ssh-tunnel, vps]

# Dependency graph
requires:
  - phase: 35-01
    provides: "Prometheus/Grafana/Dozzle services in docker-compose.prod.yml, /metrics endpoint"
  - phase: 35-02
    provides: "Grafana dashboard JSON and provisioning config"
provides:
  - "Live monitoring stack on VPS (Prometheus, Grafana, Dozzle)"
  - "SSH tunnel access instructions in runbook"
  - "Verified OBS-01 through OBS-04 requirements"
affects: [36-alerting, docs]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SSH tunnel for internal service access", "127.0.0.1 binding for security"]

key-files:
  created: []
  modified:
    - runbook.md

key-decisions:
  - "Healthcheck uses 127.0.0.1 not localhost — Alpine wget resolves to IPv6 [::1] but Node listens IPv4"
  - "Dashboard renamed ScrumQuest to ScrumMonsters to match project branding"

patterns-established:
  - "SSH tunnel pattern: -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 -L 9999:127.0.0.1:9999"

# Metrics
duration: ~45min
completed: 2026-03-09
---

# Phase 35 Plan 03: Deploy Monitoring Stack Summary

**Prometheus, Grafana, and Dozzle deployed to VPS with SSH-tunnel-only access, all OBS requirements verified live**

## Performance

- **Duration:** ~45 min (across multiple sessions with checkpoint)
- **Tasks:** 3/3
- **Files modified:** 1

## Accomplishments
- Deployed Prometheus, Grafana, and Dozzle to production VPS via docker-compose
- Verified Prometheus scraping app:5000/metrics at 60s intervals (target state UP)
- Verified Grafana health ok (v12.4.1) with ScrumMonsters dashboard showing live metrics
- Verified Dozzle HTTP 200, showing all container logs
- Confirmed all monitoring ports (9090, 3001, 9999) NOT accessible from public internet
- Verified memory within limits: Prometheus 43MB/128MB, Grafana 90MB/128MB, Dozzle 19MB/32MB
- Updated runbook with SSH tunnel access instructions
- Fixed healthcheck IPv6 resolution issue (localhost to 127.0.0.1)

## Task Commits

Each task was committed atomically:

1. **Task 1: Deploy monitoring stack to VPS and verify services** - deployed via SSH (no local commit — VPS deployment)
2. **Task 2: Update runbook with SSH tunnel access instructions** - `29b0578` (docs)
3. **Task 3: Verify monitoring stack via SSH tunnel** - checkpoint, user approved

**Post-deployment fix:** `f5be923` (fix) — healthcheck IPv6 resolution and dashboard branding

## Files Created/Modified
- `runbook.md` - Added Monitoring Access section with SSH tunnel commands, service table, memory limits table, and credentials reference

## Decisions Made
- **Healthcheck 127.0.0.1 over localhost:** Alpine's wget resolves `localhost` to IPv6 `[::1]`, but Node.js listens on IPv4 `0.0.0.0`. Changed healthcheck URL to `127.0.0.1` to fix false-unhealthy container status.
- **Dashboard branding:** Renamed Grafana dashboard from "ScrumQuest" to "ScrumMonsters" to match actual project name.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed healthcheck IPv6 resolution causing unhealthy container**
- **Found during:** Task 1 (deployment verification)
- **Issue:** Docker healthcheck using `wget -q http://localhost:5000/api/health` failed because Alpine wget resolved `localhost` to IPv6 `[::1]` but Node.js was listening on IPv4 only
- **Fix:** Changed healthcheck URL to `http://127.0.0.1:5000/api/health`
- **Files modified:** docker-compose.prod.yml
- **Verification:** Container shows healthy after recreate
- **Committed in:** f5be923

**2. [Rule 1 - Bug] Fixed dashboard branding mismatch**
- **Found during:** Task 1 (deployment verification)
- **Issue:** Grafana dashboard titled "ScrumQuest" but project is named "ScrumMonsters"
- **Fix:** Renamed dashboard title to "ScrumMonsters"
- **Files modified:** docker/grafana/dashboards/scrumquest-dashboard.json
- **Verification:** Dashboard shows correct name in Grafana UI
- **Committed in:** f5be923

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct operation and branding. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - Grafana admin password was auto-generated on VPS during deployment (stored in /opt/scrummonsters/.env).

## Next Phase Readiness
- All four OBS requirements (OBS-01 through OBS-04) verified on live VPS
- Phase 35 (Monitoring & Observability) is fully complete
- Ready for Phase 36 (final phase of v4.0)

## Self-Check: PASSED

- [x] runbook.md exists
- [x] 35-03-SUMMARY.md exists
- [x] Commit 29b0578 exists (runbook update)
- [x] Commit f5be923 exists (healthcheck + branding fix)

---
*Phase: 35-observability*
*Completed: 2026-03-09*
