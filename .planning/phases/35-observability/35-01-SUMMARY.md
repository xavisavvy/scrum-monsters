---
phase: 35-observability
plan: 01
subsystem: infra
tags: [prometheus, grafana, dozzle, metrics, docker-compose, prom-client]

# Dependency graph
requires:
  - phase: 33-production-hardening
    provides: docker-compose.prod.yml with app/postgres/nginx services
  - phase: 30-logging
    provides: server/metrics.ts with prom-client metrics definitions
provides:
  - GET /metrics endpoint serving Prometheus-format text
  - Cardinality-safe HTTP route normalization in metricsMiddleware
  - WebSocket connection gauge updated on connect/disconnect
  - Prometheus service scraping app:5000/metrics at 60s intervals
  - Grafana service with auto-provisioned datasource and dashboard
  - Dozzle service for real-time Docker log viewing
affects: [35-observability remaining plans, production deployment]

# Tech tracking
tech-stack:
  added: [prom/prometheus, grafana/grafana-oss, amir20/dozzle]
  patterns: [normalizeRoute for cardinality-safe labels, monitoring ports localhost-only]

key-files:
  created: [docker/prometheus/prometheus.yml]
  modified: [server/routes.ts, server/metrics.ts, server/websocket.ts, docker-compose.prod.yml]

key-decisions:
  - "Metrics endpoint placed before rate limiter so Prometheus scrapes are never throttled"
  - "metricsMiddleware placed after /metrics route to avoid self-referential noise"
  - "normalizeRoute catch-all returns /other for SPA routes, /static/* for asset files"
  - "All monitoring ports bound to 127.0.0.1 — access via SSH tunnel only"
  - "Prometheus 7d retention + 512MB size cap fits 1GB VPS memory budget"

patterns-established:
  - "Route normalization: dynamic segments replaced with :param placeholders to prevent label explosion"
  - "Monitoring services localhost-only: use SSH tunnel for remote access"

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 35 Plan 01: Metrics Endpoint & Monitoring Infrastructure Summary

**Wired dead prom-client metrics to GET /metrics with cardinality-safe route normalization, added Prometheus/Grafana/Dozzle to docker-compose with localhost-only ports and memory limits**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T22:53:41Z
- **Completed:** 2026-03-09T22:59:05Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Activated 15+ existing Prometheus metrics by wiring GET /metrics endpoint into Express routes
- Fixed high-cardinality label explosion in metricsMiddleware with normalizeRoute() function
- Added WebSocket connection gauge updates on connect/disconnect events
- Added Prometheus, Grafana, and Dozzle services to docker-compose.prod.yml with memory limits

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire /metrics endpoint and fix cardinality** - `84cff65` (feat) - from prior execution, server changes bundled with Grafana dashboard
2. **Task 2: Add monitoring services to docker-compose and Prometheus config** - `a198ae1` (feat)

## Files Created/Modified
- `server/routes.ts` - Added /metrics GET endpoint and metricsMiddleware() registration
- `server/metrics.ts` - Added normalizeRoute() function, replaced raw req.path in middleware
- `server/websocket.ts` - Added updateWebsocketMetrics() calls on connect/disconnect
- `docker-compose.prod.yml` - Added prometheus, grafana, dozzle services with memory limits
- `docker/prometheus/prometheus.yml` - Prometheus scrape config targeting app:5000/metrics

## Decisions Made
- Metrics endpoint placed before rate limiter so Prometheus can always scrape reliably
- metricsMiddleware registered after /metrics route to avoid measuring the metrics endpoint itself
- normalizeRoute maps dynamic paths (/join/:id, /room/:id) to fixed labels, static files to /static/*, unknown routes to /other
- All three monitoring services bound to 127.0.0.1 only (no public internet access)
- Prometheus configured with 7d retention and 512MB size cap to fit 1GB VPS constraint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 server changes already committed by prior agent**
- **Found during:** Task 1
- **Issue:** A prior execution attempt had already committed the server/routes.ts, server/metrics.ts, and server/websocket.ts changes in commit 84cff65 (under incorrect 35-02 scope)
- **Fix:** Verified changes matched plan spec exactly, skipped redundant commit
- **Files modified:** None (already committed)
- **Verification:** git diff HEAD showed no changes, TypeScript compiled, all 615 tests passed

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change. Prior agent work was correctly incorporated.

## Issues Encountered
- Prior incomplete execution left commits 1648785 and 84cff65 with 35-02 scope names that actually contained 35-01 work (server metrics wiring + Grafana files). Changes were verified correct and reused rather than duplicated.

## User Setup Required
None - no external service configuration required. Monitoring services will start automatically with `docker compose up -d`.

## Next Phase Readiness
- Metrics endpoint ready for Prometheus scraping in production
- Grafana provisioning (datasource + dashboard) already created by prior agent in 35-02 commits
- Dozzle ready for Docker log viewing via SSH tunnel
- Production deploy needed to activate monitoring stack

## Self-Check: PASSED

- All 5 key files exist on disk
- Commit 84cff65 found (Task 1 server changes)
- Commit a198ae1 found (Task 2 docker-compose + prometheus config)
- SUMMARY.md exists at .planning/phases/35-observability/35-01-SUMMARY.md

---
*Phase: 35-observability*
*Completed: 2026-03-09*
