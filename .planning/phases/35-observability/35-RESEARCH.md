# Phase 35: Observability - Research

**Researched:** 2026-03-09
**Domain:** Prometheus metrics scraping, Grafana dashboards, Docker log aggregation, security-scoped monitoring on 1GB VPS
**Confidence:** HIGH

---

## Summary

Phase 35 adds observability to the existing Docker Compose production stack on a 1GB RAM Lightsail VPS. The app already has a comprehensive `prom-client` metrics module (`server/metrics.ts`) with 15+ custom metrics (active lobbies, players, WebSocket connections, votes, combat stats, HTTP request duration), but it is **not wired up** -- neither imported by any file nor exposed on any route. Step one is activating the existing metrics code by adding a `/metrics` endpoint to `server/routes.ts` and importing the metrics helpers in `server/socketHandlers.ts` and `server/gameState.ts`.

Prometheus and Grafana run as additional Docker Compose services. The critical constraint is the 1GB VPS -- Prometheus idles at ~40-80MB with few metrics and Grafana at ~50-100MB, which is feasible if memory-limited. However, Loki (the standard Grafana log aggregation tool) idles at 300MB+ and can spike to 1.5GB, making it unsuitable for this environment. Instead, **Dozzle** (7MB image, ~8MB RAM) provides a real-time web UI for viewing all Docker container logs from a single interface -- exactly matching OBS-03 without the memory overhead.

A cardinality audit of the existing metrics is required before production deployment. The `route` label on `http_request_duration_seconds` and `http_requests_total` uses `req.route?.path || req.path`, which can produce unbounded cardinality from dynamic URL paths (e.g., `/join/ABC123`, `/room/daily-standup`). The `event_type` label on WebSocket message counters is also potentially high-cardinality depending on how many distinct Socket.IO event names exist. Both must be normalized to fixed route templates before Prometheus scrapes them in production.

**Primary recommendation:** Add Prometheus (128MB limit), Grafana (128MB limit), and Dozzle (32MB limit) to `docker-compose.prod.yml`, all bound to `127.0.0.1`. Wire up the existing metrics module to routes. Provision a Grafana dashboard via JSON file. Skip Loki entirely -- Dozzle covers the log viewing requirement at 1/40th the memory cost.

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Prometheus | 2.x (latest alpine) | Metrics scraping and storage | Industry standard for pull-based metrics; pairs with existing prom-client |
| Grafana OSS | 11.x (latest alpine) | Dashboard visualization | Industry standard for metrics visualization; auto-provisions from JSON |
| Dozzle | latest | Real-time Docker log viewer | 7MB image, ~8MB RAM, zero storage, web UI for all container logs |
| prom-client | ^15.1.3 (already installed) | Node.js Prometheus metrics | Already in package.json, metrics module fully written |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| Grafana provisioning YAML | N/A | Auto-configure datasources and dashboards on container start | Mount YAML + JSON into `/etc/grafana/provisioning/` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dozzle (log viewer) | Grafana Loki + Promtail | Loki needs 300MB-1.5GB RAM, impossible on 1GB VPS with other services |
| Dozzle | Docker Compose `logs` command via SSH | Works but no web UI, no search, no multi-container split view |
| Grafana provisioned JSON | Manual dashboard creation | Manual config lost on container recreation; provisioned = reproducible |
| Prometheus alpine | VictoriaMetrics | Lower memory but adds operational complexity for marginal gain at this scale |

**No new npm packages required.** `prom-client@^15.1.3` is already installed.

---

## Architecture Patterns

### Recommended File Structure

```
docker/
  prometheus/
    prometheus.yml           # Scrape config (60s interval, app target)
  grafana/
    provisioning/
      datasources/
        prometheus.yml       # Auto-configure Prometheus datasource
      dashboards/
        dashboard.yml        # Dashboard provider config
    dashboards/
      scrumquest.json        # Pre-built dashboard JSON
docker-compose.prod.yml      # Updated with prometheus, grafana, dozzle services
```

### Pattern 1: Prometheus Scrape Configuration

**What:** Prometheus pulls metrics from the app's `/metrics` endpoint at regular intervals.
**When to use:** Always -- this is the core of the monitoring stack.

```yaml
# docker/prometheus/prometheus.yml
global:
  scrape_interval: 60s
  evaluation_interval: 60s

scrape_configs:
  - job_name: 'scrumquest'
    static_configs:
      - targets: ['app:5000']
    metrics_path: '/metrics'
    scrape_timeout: 10s
```

### Pattern 2: Grafana Dashboard Provisioning

**What:** Grafana auto-loads datasources and dashboards from mounted YAML/JSON files on startup.
**When to use:** Always for reproducible, infrastructure-as-code dashboards.

```yaml
# docker/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

```yaml
# docker/grafana/provisioning/dashboards/dashboard.yml
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
```

### Pattern 3: Localhost-Only Binding

**What:** Monitoring services bind only to `127.0.0.1`, requiring SSH tunnel for access.
**When to use:** Always for security -- monitoring UIs must not be public.

```yaml
# In docker-compose.prod.yml
prometheus:
  ports:
    - "127.0.0.1:9090:9090"
grafana:
  ports:
    - "127.0.0.1:3001:3000"  # 3001 to avoid conflict if anything else uses 3000
dozzle:
  ports:
    - "127.0.0.1:9999:8080"
```

SSH tunnel command for access:
```bash
ssh -i ~/.ssh/lightsail_scrummonsters -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 -L 9999:127.0.0.1:9999 ubuntu@34.199.135.244
```

### Pattern 4: Docker Compose Memory Limits

**What:** Hard memory caps prevent monitoring services from starving the app.
**When to use:** Always on memory-constrained hosts.

```yaml
deploy:
  resources:
    limits:
      memory: 128M
    reservations:
      memory: 64M
```

Note: `deploy.resources` works in Docker Compose v2+ without Swarm mode.

### Anti-Patterns to Avoid

- **Unbounded `route` labels:** Using `req.path` directly creates a new time series for every unique URL. Use route templates like `/join/:lobbyId` instead of `/join/ABC123`.
- **Loki on 1GB VPS:** Loki's monolithic mode idles at 300MB+ and spikes to 1.5GB during queries. Use Dozzle instead.
- **Public monitoring ports:** Never bind Prometheus/Grafana to `0.0.0.0` -- attacker can query all metrics or use Grafana as attack surface.
- **No memory limits:** Prometheus will use as much memory as available. Without Docker limits, a cardinality spike can OOM-kill the app.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Metrics collection | Custom metrics endpoint | prom-client (already installed) | Standard format, default Node.js metrics included free |
| Metrics storage | Custom time-series DB | Prometheus | Battle-tested TSDB with 7-day retention, query language |
| Dashboard visualization | Custom charts | Grafana | Pre-built panels, alerting, community dashboards |
| Log aggregation UI | Custom log viewer | Dozzle | Real-time, searchable, multi-container, 7MB image |
| Dashboard config | Manual UI clicks | Grafana provisioning files | Reproducible across container restarts |

**Key insight:** The entire observability stack is commodity infrastructure. Every component has a standard, well-tested solution. The only custom work is (1) wiring the existing metrics module to routes and (2) creating the Grafana dashboard JSON.

---

## Common Pitfalls

### Pitfall 1: Metrics Module Exists But Isn't Wired Up
**What goes wrong:** The app has 15+ custom Prometheus metrics in `server/metrics.ts` but none are imported or used. No `/metrics` route exists. Prometheus would scrape an empty or 404 endpoint.
**Why it happens:** The metrics module was written (Phase 28/30) but the route registration and metric recording calls were deferred.
**How to avoid:** Phase 35 must: (1) Add `/metrics` GET route in `server/routes.ts`, (2) Import and call `metricsMiddleware()`, `updateLobbyMetrics()`, `updatePlayerMetrics()`, `updateWebsocketMetrics()` in the appropriate handlers.
**Warning signs:** `curl http://app:5000/metrics` returns 404 or empty response.

### Pitfall 2: High-Cardinality Label Explosion
**What goes wrong:** Prometheus memory grows unbounded because `route` label captures every unique URL path (e.g., `/join/ABC123`, `/room/daily-standup`), creating thousands of time series.
**Why it happens:** `metricsMiddleware()` uses `req.route?.path || req.path` -- the fallback to `req.path` includes dynamic segments.
**How to avoid:** Normalize routes before recording: replace `req.path` with route patterns. For the existing middleware, ensure `req.route.path` is always set (Express populates this on matched routes), or normalize known dynamic paths to templates.
**Warning signs:** `prometheus_tsdb_head_series` metric grows continuously; Prometheus OOM-killed.

### Pitfall 3: Grafana Port Conflict
**What goes wrong:** Grafana defaults to port 3000, which might conflict with other services or future needs.
**Why it happens:** Port 3000 is extremely common (React dev server, many web apps).
**How to avoid:** Map Grafana to `127.0.0.1:3001:3000` externally. Document the non-default port in SSH tunnel instructions.

### Pitfall 4: Prometheus Storage Fills Disk
**What goes wrong:** 7-day retention without size limits can fill the VPS disk if cardinality is high.
**Why it happens:** Prometheus retention is time-based by default; no size cap.
**How to avoid:** Set both `--storage.tsdb.retention.time=7d` AND `--storage.tsdb.retention.size=512MB` to cap storage. The size limit provides a safety valve.
**Warning signs:** Disk usage climbing steadily in `df -h`.

### Pitfall 5: Dozzle Requires Docker Socket Access
**What goes wrong:** Dozzle can't see any containers.
**Why it happens:** Dozzle needs `/var/run/docker.sock` mounted as a volume.
**How to avoid:** Add `volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro"]` to the Dozzle service. The `:ro` (read-only) mount limits exposure.
**Warning signs:** Dozzle UI shows "No containers found".

### Pitfall 6: Memory Budget Exceeded on 1GB VPS
**What goes wrong:** Adding Prometheus + Grafana + Dozzle causes the existing app or postgres to OOM.
**Why it happens:** 1GB total RAM shared across app (~200MB), postgres (~100MB), nginx-proxy-manager (~80MB), postgres-backup (~30MB), plus OS overhead (~150MB). Only ~440MB remain for monitoring.
**How to avoid:** Set hard memory limits: Prometheus 128MB, Grafana 128MB, Dozzle 32MB = 288MB total. Leaves ~150MB buffer. Monitor with `docker stats` after deployment.
**Warning signs:** `docker stats` shows containers approaching limits; OOM kills in `dmesg`.

---

## Code Examples

### Wiring the /metrics Endpoint (server/routes.ts)

```typescript
// Add to server/routes.ts imports
import { getMetrics, getMetricsContentType } from "./metrics.js";

// Add inside registerRoutes(), before WebSocket setup
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', getMetricsContentType());
    res.end(await getMetrics());
  } catch (err) {
    res.status(500).end(err);
  }
});
```

### Wiring Metrics Recording (server/socketHandlers.ts or server/websocket.ts)

```typescript
import {
  updateLobbyMetrics,
  updatePlayerMetrics,
  updateWebsocketMetrics,
  metricsMiddleware,
} from "./metrics.js";

// On connection/disconnection, update gauge:
updateWebsocketMetrics(io.sockets.sockets.size);

// On lobby create/destroy:
updateLobbyMetrics(lobbies.size);

// On player join/leave:
updatePlayerMetrics(totalPlayerCount);
```

### Normalizing Route Labels (Cardinality Fix)

```typescript
// In metricsMiddleware(), replace:
//   const route = req.route?.path || req.path;
// With:
function normalizeRoute(req: any): string {
  // Express populates req.route.path for matched routes (e.g., '/api/health')
  if (req.route?.path) return req.route.path;

  // Normalize known dynamic paths to templates
  const path = req.path;
  if (path.startsWith('/join/')) return '/join/:lobbyId';
  if (path.startsWith('/room/')) return '/room/:roomId';
  if (path.startsWith('/assets/')) return '/assets/*';

  // Static assets and SPA fallback -- group to reduce cardinality
  if (path.match(/\.(js|css|png|jpg|svg|woff2?|ico)$/)) return '/static/*';

  return path;
}
```

### Docker Compose Services

```yaml
# Add to docker-compose.prod.yml
prometheus:
  image: prom/prometheus:latest
  restart: unless-stopped
  ports:
    - "127.0.0.1:9090:9090"
  volumes:
    - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.retention.time=7d'
    - '--storage.tsdb.retention.size=512MB'
    - '--storage.tsdb.path=/prometheus'
  deploy:
    resources:
      limits:
        memory: 128M
      reservations:
        memory: 64M

grafana:
  image: grafana/grafana-oss:latest
  restart: unless-stopped
  ports:
    - "127.0.0.1:3001:3000"
  environment:
    GF_SECURITY_ADMIN_USER: admin
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}
    GF_USERS_ALLOW_SIGN_UP: "false"
  volumes:
    - grafana_data:/var/lib/grafana
    - ./docker/grafana/provisioning:/etc/grafana/provisioning:ro
    - ./docker/grafana/dashboards:/var/lib/grafana/dashboards:ro
  deploy:
    resources:
      limits:
        memory: 128M
      reservations:
        memory: 64M
  depends_on:
    - prometheus

dozzle:
  image: amir20/dozzle:latest
  restart: unless-stopped
  ports:
    - "127.0.0.1:9999:8080"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
  deploy:
    resources:
      limits:
        memory: 32M
      reservations:
        memory: 16M
```

### Grafana Dashboard JSON (Key Panels)

The dashboard JSON should include these panels based on existing metrics:

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Active Lobbies | `scrumquest_active_lobbies` | Stat/Gauge |
| Connected Players | `scrumquest_active_players` | Stat/Gauge |
| WebSocket Connections | `scrumquest_websocket_connections` | Stat/Gauge |
| HTTP Error Rate | `rate(http_requests_total{status_code=~"5.."}[5m])` | Time series |
| HTTP Request Duration | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` | Time series |
| Games Completed | `rate(scrumquest_games_completed_total[1h])` | Time series |
| Node.js Memory | `scrumquest_nodejs_heap_used_bytes` | Time series |
| Node.js Event Loop Lag | `scrumquest_nodejs_eventloop_lag_seconds` | Time series |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Promtail for log collection | Grafana Alloy (Promtail in maintenance mode) | 2024-2025 | Not relevant since we use Dozzle instead |
| Manual Grafana dashboard setup | Provisioning via YAML + JSON files | Grafana 5.0+ | Dashboards survive container recreation |
| Prometheus 1.x memory cache | Prometheus 2.x mmap-based TSDB | 2017+ | No built-in memory limit knob; use Docker limits |
| Docker logging driver for Loki | Promtail/Alloy container approach | 2024+ | Not relevant; using Dozzle |

---

## Memory Budget Analysis (1GB VPS)

| Service | Current RAM | Memory Limit | Notes |
|---------|-------------|-------------|-------|
| App (Node.js) | ~150-200MB | None set | Main application |
| PostgreSQL | ~80-100MB | None set | Database |
| Nginx Proxy Manager | ~60-80MB | None set | TLS termination |
| postgres-backup | ~20-30MB | None set | Runs daily cron |
| **Prometheus** | **~40-80MB** | **128MB** | New - metrics storage |
| **Grafana** | **~50-100MB** | **128MB** | New - dashboards |
| **Dozzle** | **~8-15MB** | **32MB** | New - log viewer |
| OS/kernel | ~100-150MB | N/A | System overhead |
| **Total estimated** | **~550-750MB** | | Buffer: 250-450MB |

This budget is tight but feasible. The key safety mechanisms are:
1. Hard Docker memory limits on all new services
2. Prometheus `--storage.tsdb.retention.size=512MB` caps disk too
3. Cardinality audit prevents unbounded metric growth

---

## Open Questions

1. **Grafana admin password management**
   - What we know: Can be set via `GF_SECURITY_ADMIN_PASSWORD` env var
   - What's unclear: Should it be added to `.env` on VPS, or is the default `admin` acceptable for tunnel-only access?
   - Recommendation: Add `GRAFANA_ADMIN_PASSWORD` to `.env` on VPS with a random password. Even behind SSH tunnel, defense-in-depth is good practice.

2. **Metrics endpoint authentication**
   - What we know: `/metrics` is currently unauthenticated (like `/api/health`)
   - What's unclear: Should it be restricted? Prometheus scrapes from within Docker network, so external access isn't needed.
   - Recommendation: No auth needed -- Prometheus accesses via Docker internal network (`app:5000`). The endpoint is not exposed externally since NPM only proxies to port 5000 for the main app routes. Optionally add a middleware that restricts `/metrics` to Docker network IPs only.

3. **deploy.sh and CI/CD updates**
   - What we know: Current `deploy.sh` and GitHub Actions workflow only manage app, postgres, nginx, backup containers
   - What's unclear: Should monitoring containers be managed by CI/CD deploy or manually started once?
   - Recommendation: Include monitoring services in `docker-compose.prod.yml` so they start with `docker compose up -d`. No special CI/CD changes needed -- they auto-start and auto-restart.

---

## Sources

### Primary (HIGH confidence)
- `server/metrics.ts` -- Full prom-client implementation, 15+ metrics, NOT wired to routes
- `server/routes.ts` -- No `/metrics` endpoint registered
- `server/logger.ts` -- Pino structured logging with component-scoped child loggers
- `docker-compose.prod.yml` -- Current production stack (app, postgres, npm, backup)
- `package.json` -- prom-client@^15.1.3 already installed

### Secondary (MEDIUM confidence)
- [Prometheus Storage Docs](https://prometheus.io/docs/prometheus/latest/storage/) -- Retention flags, TSDB behavior
- [Grafana Provisioning Docs](https://grafana.com/docs/grafana/latest/administration/provisioning/) -- Auto-configure datasources/dashboards
- [Grafana Loki Install Docs](https://grafana.com/docs/loki/latest/setup/install/docker/) -- Confirmed high memory requirements
- [Dozzle GitHub](https://github.com/amir20/dozzle) -- 7MB image, minimal RAM, Docker socket access
- [Better Stack - Prometheus Retention](https://betterstack.com/community/guides/monitoring/prometheus-storage-retention/) -- retention.time and retention.size flags

### Tertiary (LOW confidence)
- Community reports of Prometheus idle memory (40-80MB) -- varies by configuration, no official minimum stated
- Community reports of Grafana idle memory (50-100MB) -- official docs don't state minimum for Docker
- Loki monolithic mode memory (300MB-1.5GB idle) -- from GitHub issues and community forum; enough to rule it out

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Prometheus + Grafana is the canonical monitoring stack; prom-client already in place
- Architecture: HIGH -- Docker Compose patterns well-documented; provisioning is standard Grafana feature
- Pitfalls: HIGH -- Cardinality risks verified by examining actual metrics code; memory budget calculated from known VPS constraints
- Log aggregation: MEDIUM -- Dozzle recommended based on memory constraints; not the "standard" Grafana stack choice but the right one for 1GB VPS

**Critical finding:** `server/metrics.ts` is a dead module -- fully implemented but never imported. Phase 35 must wire it up before any monitoring works.

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, tools change slowly)
