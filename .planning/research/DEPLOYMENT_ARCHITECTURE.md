# Deployment Architecture Research: Docker, Lightsail, CI/CD, and Observability

**Project:** ScrumQuest (Real-time multiplayer scrum poker with JRPG-style boss battles)
**Research Date:** 2026-02-24
**Confidence Level:** HIGH (verified against existing codebase + official sources)

---

## I. EXECUTIVE SUMMARY

ScrumQuest's new deployment stack adds Docker containerization and AWS Lightsail single-instance hosting while preserving the existing TypeScript monorepo architecture. The constraint is tight: 1GB RAM on Lightsail ($5/month tier) must run application + PostgreSQL + Redis + Prometheus + Loki + Grafana simultaneously. The solution uses Docker Compose orchestration with aggressive memory limits (683 MB container requests, 141 MB safety margin). CI/CD via GitHub Actions builds multi-stage Docker images and pushes to AWS ECR, then a deployment script orchestrates pulling and starting containers on Lightsail. On-instance monitoring (Prometheus metrics scraping + Loki log aggregation) captures game telemetry and operational logs. PostgreSQL backups via pg_dump cron run daily at 2 AM UTC with 7-day retention. Replit compatibility is preserved—no breaking code changes, only deployment-side additions.

### Key Architecture Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Orchestration | Docker Compose (not Kubernetes) | Single instance; Compose is simpler, lower overhead |
| Registry | AWS ECR (not Docker Hub) | Faster pulls on AWS, private by default, integrated with Lightsail |
| Database | PostgreSQL container with named volume | Persistent across restarts, backup-friendly, existing session store uses it |
| Session Storage | PostgreSQL (connect-pg-simple) | Survives container restarts, no additional Redis dependency for sessions |
| Cache Layer | Redis optional, rate-limiting only | Can run without it; Compose allows easy enable/disable |
| Metrics | Prometheus + Promtail → Loki (all on-instance) | No external SaaS; 7-day retention fits 1GB; Grafana included |
| Logs | Loki single-binary with filesystem storage | 24h chunk rotation, searchable via Grafana; Promtail forwards stdout |
| Reverse Proxy | Nginx on host (not in Compose) | Simpler TLS management, Certbot renewal, lower resource footprint |
| WebSocket Transport | WebSocket-only (no polling) | Single instance: no sticky sessions needed, no Redis adapter required |
| Backup Strategy | Host-level pg_dump cron | Flexible retention, compression, S3 archival in future phases |

---

## II. DEPLOYMENT TOPOLOGY & RESOURCE BUDGET

### Infrastructure Diagram

```
┌─ AWS Lightsail Instance (us-east-1, 1GB RAM, 1 vCPU, 1.6 TB storage, $5/mo) ─┐
│                                                                              │
│ ┌─ Docker Daemon ──────────────────────────────────────────────────────┐   │
│ │  ┌─ Docker Compose Network (bridge) ────────────────────────────┐   │   │
│ │  │                                                               │   │   │
│ │  │  ┌─ scrumquest (app) ─────────┐  ┌─ postgres ──────────┐   │   │   │
│ │  │  │ Node.js 20, Express         │  │ PostgreSQL 16       │   │   │   │
│ │  │  │ React Three Fiber client    │  │ alpine              │   │   │   │
│ │  │  │ Socket.IO WebSocket server  │  │                     │   │   │   │
│ │  │  │                             │  │ Memory: 200M limit  │   │   │   │
│ │  │  │ Memory: 128M limit          │  │ shared_buffers=64M  │   │   │   │
│ │  │  │ NODE_OPTIONS:               │  │ max_connections=20  │   │   │   │
│ │  │  │  --max-old-space-size=64    │  │                     │   │   │   │
│ │  │  │                             │  │ Health: pg_isready  │   │   │   │
│ │  │  │ Port: 5000 (internal)       │  │ Port: 5432          │   │   │   │
│ │  │  │                             │  │ Volume:             │   │   │   │
│ │  │  │ Health: /api/health/readyz  │  │   postgres_data:/   │   │   │   │
│ │  │  │                             │  │   var/lib/pgsql/    │   │   │   │
│ │  │  │ Graceful shutdown: 30s      │  │                     │   │   │   │
│ │  │  │ SIGTERM handler             │  │ Restart: always     │   │   │   │
│ │  │  │ (existing)                  │  │                     │   │   │   │
│ │  │  │                             │  │ Depends on: none    │   │   │   │
│ │  │  │ Restart: always             │  └─────────────────────┘   │   │   │
│ │  │  │ Depends on: postgres,       │                            │   │   │
│ │  │  │   redis (service_healthy)   │  ┌─ redis ────────────┐   │   │   │
│ │  │  └─────────────────────────────┘  │ Redis 7 alpine    │   │   │   │
│ │  │                                    │                    │   │   │   │
│ │  │                                    │ Memory: 50M limit  │   │   │   │
│ │  │                                    │ maxmemory=40M      │   │   │   │
│ │  │  ┌─ prometheus ────────────────┐  │ maxmemory-policy:  │   │   │   │
│ │  │  │ Prometheus 2.x              │  │   allkeys-lru       │   │   │   │
│ │  │  │                             │  │                    │   │   │   │
│ │  │  │ Memory: 100M limit          │  │ Health: redis-cli  │   │   │   │
│ │  │  │ Retention: 7d (compressed)  │  │ Port: 6379         │   │   │   │
│ │  │  │                             │  │ Volume:            │   │   │   │
│ │  │  │ Port: 9090 (internal)       │  │   redis_data:/data │   │   │   │
│ │  │  │                             │  │                    │   │   │   │
│ │  │  │ Scrape targets:             │  │ Restart: always    │   │   │   │
│ │  │  │   - app:5000/metrics (15s)  │  │ Depends on: none   │   │   │   │
│ │  │  │   - node-exp:9100 (15s)     │  └────────────────────┘   │   │   │
│ │  │  │                             │                            │   │   │
│ │  │  │ Volume:                     │  ┌─ loki ─────────────┐   │   │   │
│ │  │  │   prometheus_data:          │  │ Loki 2.x           │   │   │   │
│ │  │  │   /prometheus               │  │                    │   │   │   │
│ │  │  └─────────────────────────────┘  │ Memory: 75M limit  │   │   │   │
│ │  │                                    │ Mode: single-      │   │   │   │
│ │  │  ┌─ loki ────────────────────┐   │   binary           │   │   │   │
│ │  │  │ (see separate diagram)     │  │ Storage: /loki/    │   │   │   │
│ │  │  └────────────────────────────┘  │   chunks (24h)    │   │   │   │
│ │  │                                    │                    │   │   │   │
│ │  │  ┌─ promtail ────────────────┐   │ Port: 3100         │   │   │   │
│ │  │  │ (see separate diagram)     │  │ (internal)         │   │   │   │
│ │  │  └────────────────────────────┘  │                    │   │   │   │
│ │  │                                    │ Restart: always    │   │   │   │
│ │  │  ┌─ grafana ─────────────────┐   │ Depends on: none   │   │   │   │
│ │  │  │ Grafana 10.x              │  └────────────────────┘   │   │   │
│ │  │  │                           │                            │   │   │
│ │  │  │ Memory: 80M limit         │  ┌─ node-exporter ───┐   │   │   │
│ │  │  │                           │  │ Node Exporter     │   │   │   │
│ │  │  │ Port: 3000 (internal)    │  │                   │   │   │   │
│ │  │  │                           │  │ Memory: 20M       │   │   │   │
│ │  │  │ Datasources:              │  │                   │   │   │   │
│ │  │  │   - prometheus:9090       │  │ Port: 9100        │   │   │   │
│ │  │  │   - loki:3100             │  │ (scraped by prom) │   │   │   │
│ │  │  │                           │  │                   │   │   │   │
│ │  │  │ Auth:                     │  │ Restart: always   │   │   │   │
│ │  │  │   GF_SECURITY_ADMIN_USER  │  │ Depends on: none  │   │   │   │
│ │  │  │   GF_SECURITY_ADMIN_PASS  │  └───────────────────┘   │   │   │
│ │  │  │                           │                            │   │   │
│ │  │  │ Volume:                   │  ┌─ Volumes ─────────┐   │   │   │
│ │  │  │   grafana_storage:        │  │ postgres_data     │   │   │   │
│ │  │  │   /var/lib/grafana        │  │ redis_data        │   │   │   │
│ │  │  │                           │  │ prometheus_data   │   │   │   │
│ │  │  │ Restart: always           │  │ loki_data         │   │   │   │
│ │  │  │ Depends on: none          │  │ grafana_storage   │   │   │   │
│ │  │  └───────────────────────────┘  └───────────────────┘   │   │   │
│ │  └───────────────────────────────────────────────────────────┘   │   │
│ └──────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│ ┌─ Host-Level Services ─────────────────────────────────────────┐   │
│ │                                                                 │   │
│ │  Nginx Reverse Proxy (30M) ──────────────────────────────────┐│   │
│ │  │ Listen: 0.0.0.0:80 (redirect to 443)                    ││   │
│ │  │ Listen: 0.0.0.0:443 (TLS)                                ││   │
│ │  │                                                            ││   │
│ │  │ Upstream app: 127.0.0.1:5000                              ││   │
│ │  │ Upstream grafana: 127.0.0.1:3000                          ││   │
│ │  │                                                            ││   │
│ │  │ Server: scrumquest.example.com                            ││   │
│ │  │   Location / → proxy_pass app:5000                        ││   │
│ │  │   WebSocket upgrade headers, X-Forwarded-*               ││   │
│ │  │                                                            ││   │
│ │  │ Server: grafana.scrumquest.example.com                    ││   │
│ │  │   Location / → proxy_pass grafana:3000                    ││   │
│ │  │   Basic auth (ops team)                                   ││   │
│ │  │                                                            ││   │
│ │  │ TLS: /etc/letsencrypt/live/scrumquest.example.com/       ││   │
│ │  │      fullchain.pem, privkey.pem                           ││   │
│ │  │      (Certbot auto-renewal daily)                        ││   │
│ │  └──────────────────────────────────────────────────────────┘│   │
│ │                                                                │   │
│ │  Cron Jobs (Host) ────────────────────────────────────────┐  │   │
│ │  │                                                         │  │   │
│ │  │  0 2 * * * /scripts/backup-postgres.sh                 │  │   │
│ │  │  └─ docker exec scrumquest-postgres pg_dump           │  │   │
│ │  │     -U scrumquest scrumquest | gzip > /backups/...    │  │   │
│ │  │     (Daily 2 AM UTC)                                   │  │   │
│ │  │                                                         │  │   │
│ │  │  0 3 * * * find /backups -mtime +7 -delete            │  │   │
│ │  │  └─ Cleanup old backups (7-day retention)             │  │   │
│ │  │                                                         │  │   │
│ │  │  0 2 * * * certbot renew --quiet                       │  │   │
│ │  │  └─ TLS certificate renewal (Let's Encrypt)           │  │   │
│ │  │                                                         │  │   │
│ │  └─────────────────────────────────────────────────────────┘  │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ ┌─ Storage ─────────────────────────────────────────────────────┐   │
│ │ /data/postgres/        (PostgreSQL data)                      │   │
│ │ /data/redis/           (Redis RDB snapshots)                  │   │
│ │ /data/prometheus/      (TSDB blocks)                          │   │
│ │ /data/loki/            (Log chunks)                           │   │
│ │ /data/grafana/         (Dashboards, auth)                     │   │
│ │ /backups/              (Daily pg_dump files)                  │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Memory Budget (1024 MB Total)

```
┌─ OS / systemd ─────────────────────────── 150 MB ┐
├─ Docker daemon ─────────────────────────── 50 MB ├
├─ Available for containers ───────────── 824 MB ├
│  ├─ Container Reservations (guaranteed):     │
│  │  ├─ app:64 MB                              │
│  │  ├─ postgres:100 MB                        │
│  │  ├─ redis:25 MB                            │
│  │  ├─ prometheus:50 MB                       │
│  │  ├─ loki:40 MB                             │
│  │  ├─ promtail:15 MB                         │
│  │  ├─ grafana:40 MB                          │
│  │  └─ node-exporter:10 MB                    │
│  │  ├─ TOTAL RESERVED: 344 MB                │
│  │                                            │
│  ├─ Container Limits (hard ceiling):     │
│  │  ├─ app:128 MB (2x reservation)            │
│  │  ├─ postgres:200 MB (2x reservation)       │
│  │  ├─ redis:50 MB (2x reservation)           │
│  │  ├─ prometheus:100 MB (2x reservation)     │
│  │  ├─ loki:75 MB (~2x reservation)           │
│  │  ├─ promtail:30 MB (2x reservation)        │
│  │  ├─ grafana:80 MB (2x reservation)         │
│  │  └─ node-exporter:20 MB (2x reservation)   │
│  │  ├─ TOTAL LIMITS: 683 MB                   │
│  │                                            │
│  └─ Reserve / Swap Buffer ─────────── 141 MB  │
└────────────────────────────────────────────────┘

Safety Analysis:
- If 1 container exceeds limit → OOM killed by kernel
- If 2+ containers combined hit 824 MB → system pressure, swapping (slow)
- 141 MB buffer allows ~17% overage before critical impact
- Critical: Monitor actual usage weekly; tune limits based on telemetry
```

---

## III. DATA FLOW: CI/CD DEPLOYMENT PIPELINE

### Pipeline Stages

```
Stage 1: Local Development
  Developer edits code, commits to feature branch
    ↓
Stage 2: GitHub PR / Pre-merge Testing
  git push → GitHub Actions ci.yml
    ├─ npm ci (install dependencies)
    ├─ npm run lint (ESLint)
    ├─ npm run check (TypeScript)
    ├─ npm run test (Vitest)
    ├─ npm run test:e2e (Playwright)
    └─ npm run build (vite + esbuild to dist/)
  ✓ All checks pass
    ↓
Stage 3: Main Branch Deployment Trigger
  Developer: git merge (or push directly to main)
    ↓
Stage 4: GitHub Actions deploy-docker.yml
  Trigger: git push to main

  Step 1: Build Docker image
    docker build --platform linux/amd64 -t scrumquest:latest .
    (Multi-stage: builder → npm ci + npm run build; runner → copy dist)

  Step 2: Login to AWS ECR
    aws ecr get-login-password --region us-east-1 |
      docker login --username AWS --password-stdin <ECR_URI>

  Step 3: Tag and push image
    docker tag scrumquest:latest <ECR_URI>/scrumquest:latest
    docker tag scrumquest:latest <ECR_URI>/scrumquest:<GIT_SHA>
    docker push <ECR_URI>/scrumquest:latest
    docker push <ECR_URI>/scrumquest:<GIT_SHA>

  Step 4: Deploy to Lightsail (manual approval)
    Trigger: workflow_dispatch with environment=staging|prod
    OR: Auto-deploy to staging on push
    ↓
Stage 5: Lightsail Deployment Script (SSH)
  GitHub Actions secret: LIGHTSAIL_PRIVATE_KEY, LIGHTSAIL_HOST

  SSH to lightsail instance:
    ssh -i <key> ubuntu@<host>

    Step 1: Pull latest image from ECR
      aws ecr get-login-password --region us-east-1 | \
        docker login --username AWS --password-stdin <ECR_URI>
      docker-compose pull

    Step 2: Run database migrations (if needed)
      docker-compose run --rm app npm run db:migrate

    Step 3: Orchestrate service restart
      docker-compose down
      docker-compose up -d
      (Compose waits for health checks, respects depends_on)

    Step 4: Verify deployment
      curl http://localhost:5000/api/health/readyz
      (Expect 200 + "ok" status)
    ↓
Stage 6: Live Observability
  App running:
    - Prometheus scrapes :5000/metrics every 15s
    - Logs stream to stdout → Docker captures
    - Promtail tails app logs → Loki
    - Grafana dashboards update in real-time
    - Alerts fire if thresholds breached
    ↓
Stage 7: Daily Maintenance (Cron)
  2:00 AM UTC: pg_dump backup
    docker exec scrumquest-postgres-1 pg_dump \
      -U scrumquest scrumquest | gzip > /backups/scrumquest-$(date +%Y%m%d).sql.gz

  3:00 AM UTC: Backup cleanup (keep 7 latest)
    find /backups -mtime +7 -delete

  2:00 AM UTC: TLS cert renewal
    certbot renew --quiet
    (Nginx reloaded automatically on success)
```

### Deployment Frequency & Strategy

- **Staging:** Auto-deploy on every main push (no approval needed)
- **Production:** Manual workflow_dispatch trigger + optional approval gate
- **Rollback:** Previous image in ECR (tagged by commit SHA); docker-compose pull :SHA, restart
- **Monitoring:** First 15 mins post-deploy, watch Prometheus dashboards for anomalies

---

## IV. COMPONENT BOUNDARIES & INTEGRATION POINTS

### 1. Application Container (scrumquest)

**Responsibility:**
- Serve React frontend (client-side SPA build artifact)
- WebSocket server for real-time game sync (Socket.IO)
- REST API endpoints (/api/auth, /api/user, /api/health)
- Game logic: lobbies, estimations, combat phases

**Memory Constraints:**
- Limit: 128 MB hard ceiling
- Reservation: 64 MB guaranteed
- V8 Heap: NODE_OPTIONS=--max-old-space-size=64 (64 MB heap)
- Vendor bundle: 863 KB loaded once at startup
- Session/game state in memory: 1-5 MB typical, <10 MB under stress (50+ players)

**Health Checks:**
- Existing: GET /api/health/readyz (comprehensive check including database)
- Existing: GET /api/health/livez (simple heartbeat for liveness)
- Docker uses readyz for service readiness
- Compose waits: depends_on postgres,redis with condition: service_healthy

**Graceful Shutdown (Existing Handler Reused):**
```typescript
// server/index.ts: gracefulShutdown() function
const gracefulShutdown = async (signal: string) => {
  // 1. Notify connected WebSocket clients: "Server shutting down in 15s"
  //    Clients will reconnect after 10s pause
  // 2. Close /api/* endpoints (return 503 Service Unavailable)
  // 3. Drain database connection pool
  // 4. Clean up Redis (if used)
  // 5. Flush session store to PostgreSQL
  // 6. Close HTTP server
  // 7. Exit process

  // Force exit at 30s timeout (Docker will SIGKILL at 10s by default)
  const forceExitTimeout = setTimeout(() => process.exit(1), 30000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**Docker Integration:**
```yaml
app:
  image: scrumquest:latest
  container_name: scrumquest-app
  ports:
    - "5000:5000"
  environment:
    - NODE_ENV=production
    - DATABASE_URL=postgresql://scrumquest:${DB_PASSWORD}@postgres:5432/scrumquest
    - SESSION_SECRET=${SESSION_SECRET}
    - REDIS_URL=redis://redis:6379
  healthcheck:
    test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/api/health/readyz"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 15s
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  restart: unless-stopped
  stop_signal: SIGTERM
  stop_grace_period: 30s  # Match existing SIGTERM handler
  deploy:
    resources:
      limits:
        memory: 128M
      reservations:
        memory: 64M
```

**Logging:**
- Existing: Pino logger outputs JSON to stdout
- Docker captures stdout → /var/lib/docker/containers/<id>/
- Promtail tails stdout → Loki
- No file-based logs inside container

### 2. PostgreSQL Container

**Responsibility:**
- Persist user/profile data
- Store OAuth account links
- Session store via connect-pg-simple
- Estimation history, class mastery progress

**Memory Tuning (200 MB limit):**
```yaml
postgres:
  image: postgres:16-alpine
  container_name: scrumquest-postgres
  environment:
    - POSTGRES_USER=scrumquest
    - POSTGRES_PASSWORD=${DB_PASSWORD}
    - POSTGRES_DB=scrumquest
    # Custom PostgreSQL tuning for 200 MB container:
    - POSTGRES_INITDB_ARGS=-c shared_buffers=64MB -c effective_cache_size=128MB -c maintenance_work_mem=32MB -c work_mem=2MB -c max_connections=20
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U scrumquest -d scrumquest"]
    interval: 10s
    timeout: 5s
    retries: 5
  volumes:
    - postgres_data:/var/lib/postgresql/data
  ports:
    - "5433:5432"  # Host port for local psql access
  restart: always
  deploy:
    resources:
      limits:
        memory: 200M
      reservations:
        memory: 100M
```

**Connection Pool:**
- App uses Drizzle ORM with pooled connections
- Max pool size: 10 connections (default)
- PostgreSQL max_connections: 20 (total capacity)
- Session pruning: 15 min interval, 7-day TTL

**Backup Strategy:**
```bash
# Host cron: 0 2 * * * /scripts/backup-postgres.sh
#!/bin/bash
BACKUP_DIR=/backups
TIMESTAMP=$(date +%Y%m%d)
docker exec scrumquest-postgres pg_dump \
  -U scrumquest \
  -d scrumquest \
  --no-owner \
  --format=plain \
  | gzip > $BACKUP_DIR/scrumquest-$TIMESTAMP.sql.gz

# Compress: ~5 GB database → 500 MB gzipped (90% reduction)
# Retention: 7-day cleanup
# 0 3 * * * find /backups -mtime +7 -delete
```

**Volume Persistence:**
- Named volume postgres_data → /var/lib/postgresql/data
- Host mount point: /data/postgres/ (used by backup script)
- Survives container restart, image update, even cluster restart

### 3. Redis Container (Optional)

**Responsibility:**
- Rate limiting counters (express-rate-limit + redis store)
- Leaderboard caching (if implemented)
- Session cache (optional; primary is PostgreSQL)

**Memory Tuning (50 MB limit):**
```yaml
redis:
  image: redis:7-alpine
  container_name: scrumquest-redis
  command: redis-server --appendonly yes --maxmemory 40M --maxmemory-policy allkeys-lru
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
  volumes:
    - redis_data:/data
  ports:
    - "6379:6379"  # Host port for redis-cli access
  restart: always
  deploy:
    resources:
      limits:
        memory: 50M
      reservations:
        memory: 25M
```

**RDB Persistence:**
- appendonly=yes → AOF (Append-Only File) in addition to RDB
- More durable but slightly higher overhead
- Redis data persists across restarts via volume
- Rate limiting state survives deployment

**Eviction Policy:**
- maxmemory-policy=allkeys-lru: Evict least-recently-used keys when limit hit
- Alternative: allkeys-lfu (least-frequently-used) if leaderboards are expensive
- Guarantees: No OOM killer on Redis; graceful degradation

### 4. Prometheus (Metrics Collection)

**Responsibility:**
- Scrape app /metrics endpoint every 15s
- Scrape node-exporter :9100 every 15s
- Store time-series data locally (TSDB)
- Expose /api/v1/query endpoint for Grafana

**Memory Budget (100 MB limit):**
```yaml
prometheus:
  image: prom/prometheus:latest
  container_name: scrumquest-prometheus
  ports:
    - "9090:9090"
  volumes:
    - prometheus_data:/prometheus
    - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.path=/prometheus'
    - '--storage.tsdb.retention.time=7d'
    - '--storage.tsdb.retention.size=90MB'  # Hard limit to fit in 1GB instance
  deploy:
    resources:
      limits:
        memory: 100M
      reservations:
        memory: 50M
```

**Prometheus Configuration:**
```yaml
# infra/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: lightsail
    instance: production

scrape_configs:
  # Application metrics
  - job_name: 'scrumquest'
    static_configs:
      - targets: ['app:5000']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'app'

  # System metrics
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'lightsail-host'

  # PostgreSQL (if postgres_exporter added later)
  # - job_name: 'postgres'
  #   static_configs:
  #     - targets: ['postgres-exporter:9187']
```

**Retention Strategy:**
- 15-second scrape intervals × ~100 metrics × 10080 minutes (7 days) = ~15 million data points
- Typical size: ~200 MB for 7 days (varies by metric cardinality)
- Set hard limit to 90 MB to prevent disk exhaustion
- Prometheus auto-compacts old blocks

**Scaling Beyond 1GB:**
- Future: Move Prometheus to separate small instance (costs $2-5/mo)
- Implement long-term storage (S3 + Thanos) for historical analysis
- Current: 7-day rolling window sufficient for debugging recent issues

### 5. Loki (Log Aggregation)

**Responsibility:**
- Ingest logs from Promtail
- Index and store log streams
- Expose LogQL query API for Grafana

**Memory Budget (75 MB limit):**
```yaml
loki:
  image: grafana/loki:latest
  container_name: scrumquest-loki
  ports:
    - "3100:3100"
  volumes:
    - loki_data:/loki
    - ./infra/loki/loki-config.yml:/etc/loki/local-config.yaml:ro
  command: -config.file=/etc/loki/local-config.yaml
  environment:
    - LOKI_CONFIG_LOADER_DEFER_CONFIG=true
  deploy:
    resources:
      limits:
        memory: 75M
      reservations:
        memory: 40M
```

**Loki Configuration (Single-Binary Mode):**
```yaml
# infra/loki/loki-config.yml
auth_enabled: false  # No auth for single-instance

ingester:
  chunk_idle_period: 3m
  chunk_retain_period: 1m
  max_chunk_age: 1h
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h  # Reject logs older than 7 days
  ingestion_rate_mb: 10  # Limit ingestion rate to prevent DoS
  ingestion_burst_size_mb: 20

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h  # Daily index rotation

storage_config:
  filesystem:
    directory: /loki/chunks  # Chunk storage
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    shared_store: filesystem
    cache_location: /loki/boltdb-shipper-cache
```

**Log Retention:**
- Chunks rotate daily (24h period)
- Loki auto-compacts old chunks
- Filesystem storage: ~50 MB/day at typical log volume
- Total: ~1.2 GB for 24 days (can trim if space-constrained)

**Log Labels (for Grafana filtering):**
```yaml
# Added by Promtail scrape config
job: scrumquest
env: production
instance: lightsail
service: app | postgres | redis  # source
level: info | warn | error | fatal  # log level
```

### 6. Promtail (Log Forwarding)

**Responsibility:**
- Tail application log files
- Ship logs to Loki with labels
- Minimal overhead for log transport

**Memory Budget (30 MB limit):**
```yaml
promtail:
  image: grafana/promtail:latest
  container_name: scrumquest-promtail
  volumes:
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - /var/run/docker.sock:/var/run/docker.sock
    - ./infra/promtail/promtail-config.yml:/etc/promtail/config.yaml:ro
  command: -config.file=/etc/promtail/config.yaml
  depends_on:
    - loki
  deploy:
    resources:
      limits:
        memory: 30M
      reservations:
        memory: 15M
```

**Promtail Configuration:**
```yaml
# infra/promtail/promtail-config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # Docker containers via Docker socket
  - job_name: docker
    docker: {}
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: 'container'
      - source_labels: ['__meta_docker_container_labels_com_docker_compose_service']
        target_label: 'service'
    pipeline_stages:
      - match:
          selector: '{service="app"}'
          stages:
            - json:
                expressions:
                  level: level
                  message: message
      - labels:
          job: scrumquest
          env: production

  # File-based logs (if app writes to /logs volume)
  - job_name: files
    static_configs:
      - targets: [localhost]
        labels:
          job: scrumquest
          __path__: /logs/*.log
    pipeline_stages:
      - json:
          expressions:
            timestamp: timestamp
            level: level
            component: component
            message: message
      - labels:
          job: scrumquest
          env: production
```

**Log Aggregation Flow:**
```
App stdout → Docker daemon → /var/lib/docker/containers/<id>/
    ↓
Promtail reads via Docker socket + file tailing
    ↓
Parse JSON (Pino format)
    ↓
Add labels (job, env, service, level)
    ↓
Push to Loki :3100
    ↓
Loki stores in filesystem, chunks rotate daily
    ↓
Grafana queries via LogQL
    ↓
Operators search errors, trace player issues, monitor health
```

### 7. Grafana (Visualization & Alerting)

**Responsibility:**
- Create dashboards (game metrics, system health, errors)
- Define alerting rules
- User authentication (single admin account + optional ops users)

**Memory Budget (80 MB limit):**
```yaml
grafana:
  image: grafana/grafana:latest
  container_name: scrumquest-grafana
  ports:
    - "3000:3000"
  environment:
    - GF_SECURITY_ADMIN_USER=admin
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    - GF_SECURITY_DISABLE_BRUTE_FORCE_LOGIN_PROTECTION=false
    - GF_SECURITY_COOKIE_SECURE=true
    - GF_SECURITY_COOKIE_SAMESITE=lax
    - GF_USERS_ALLOW_SIGN_UP=false  # Disable public registration
    - GF_SERVER_ROOT_URL=https://grafana.example.com/
  volumes:
    - grafana_storage:/var/lib/grafana
    - ./infra/grafana/provisioned-dashboards:/etc/grafana/provisioning/dashboards:ro
    - ./infra/grafana/provisioned-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml:ro
  depends_on:
    - prometheus
    - loki
  deploy:
    resources:
      limits:
        memory: 80M
      reservations:
        memory: 40M
```

**Datasource Configuration (Provisioned):**
```yaml
# infra/grafana/provisioned-datasources.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
    editable: true
```

**Default Dashboards:**
1. **ScrumQuest Overview**
   - Active lobbies (gauge)
   - Players online (gauge)
   - Estimation votes/min (graph)
   - Combat phase distribution (pie)
   - Error rate % (graph)

2. **System Health**
   - CPU usage % (from node-exporter)
   - Memory usage % (from node-exporter)
   - Disk usage % (from node-exporter)
   - Network I/O (bytes/sec from node-exporter)

3. **Error Logs**
   - Error count by level (Loki search: {level="error" OR level="fatal"})
   - Error trends (last 24h)
   - Recent errors (table with timestamp, component, message)

4. **WebSocket Connections**
   - Concurrent connections (gauge)
   - Connection rate/min (graph)
   - Disconnection reasons (bar chart)
   - Transport type (WebSocket vs polling)

**Access Control:**
- Admin user: Full edit access (ops team)
- Viewer user: Read-only dashboards (if multi-user setup)
- Public dashboard: Disabled (no unauthenticated access)

### 8. Node Exporter (System Metrics)

**Responsibility:**
- Export system-level metrics (CPU, memory, disk, network, filesystem)
- Zero application dependencies

**Memory Budget (20 MB limit):**
```yaml
node-exporter:
  image: prom/node-exporter:latest
  container_name: scrumquest-node-exporter
  ports:
    - "9100:9100"
  command:
    - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
  volumes:
    - /proc:/host/proc:ro
    - /sys:/host/sys:ro
    - /:/rootfs:ro
  network_mode: host  # Required to scrape host metrics
  deploy:
    resources:
      limits:
        memory: 20M
      reservations:
        memory: 10M
```

**Metrics Exposed (sampled):**
- `node_cpu_seconds_total{cpu, mode}` (CPU usage)
- `node_memory_MemAvailable_bytes` (Available RAM)
- `node_memory_MemTotal_bytes` (Total RAM)
- `node_filesystem_avail_bytes{mountpoint}` (Disk free)
- `node_network_receive_bytes_total{device}` (Network I/O)
- `node_load1` (Load average)

### 9. Nginx Reverse Proxy (Host-Level)

**Responsibility:**
- Terminate TLS connections
- Route traffic to app + Grafana
- Apply rate limiting / authentication
- Provide domain name resolution

**Installation & Configuration:**
```bash
# Host: sudo apt-get install nginx certbot python3-certbot-nginx

# /etc/nginx/sites-available/scrumquest.conf
upstream app {
  server 127.0.0.1:5000;
  keepalive 32;  # Reuse connections
}

upstream grafana {
  server 127.0.0.1:3000;
}

server {
  listen 80;
  server_name scrumquest.example.com grafana.scrumquest.example.com;
  return 301 https://$host$request_uri;  # Redirect HTTP → HTTPS
}

server {
  listen 443 ssl http2;
  server_name scrumquest.example.com;

  ssl_certificate /etc/letsencrypt/live/scrumquest.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/scrumquest.example.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;

  client_max_body_size 10M;

  location / {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;  # WebSocket long-lived
    proxy_send_timeout 86400;
    proxy_buffering off;  # Disable buffering for WebSocket
  }

  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }
}

server {
  listen 443 ssl http2;
  server_name grafana.scrumquest.example.com;

  ssl_certificate /etc/letsencrypt/live/scrumquest.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/scrumquest.example.com/privkey.pem;

  auth_basic "Grafana Admin";
  auth_basic_user_file /etc/nginx/.htpasswd;  # htpasswd -c .htpasswd admin

  location / {
    proxy_pass http://grafana/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

**TLS Certificate Management:**
```bash
# Initial setup (Certbot auto-renewal)
sudo certbot certonly --nginx -d scrumquest.example.com

# Auto-renewal cron job (Certbot installs this automatically)
0 2 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"

# Or manual renewal
sudo certbot renew --quiet
sudo systemctl reload nginx
```

**WebSocket Support:**
- Upgrade header forwarding: Essential for Socket.IO transport negotiation
- Connection keep-alive: Prevents proxy from timing out long-lived WebSocket
- Buffering disabled: Allows real-time push from server

### 10. Host-Level Cron Jobs

**Backup Job (Daily 2 AM):**
```bash
#!/bin/bash
# /scripts/backup-postgres.sh
set -e

BACKUP_DIR=/backups
TIMESTAMP=$(date +%Y%m%d)
CONTAINER=scrumquest-postgres-1

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Perform dump
docker exec $CONTAINER pg_dump \
  -U scrumquest \
  -d scrumquest \
  --no-owner \
  --format=plain \
| gzip > $BACKUP_DIR/scrumquest-$TIMESTAMP.sql.gz

# Verify backup
if [ -f $BACKUP_DIR/scrumquest-$TIMESTAMP.sql.gz ]; then
  echo "Backup successful: scrumquest-$TIMESTAMP.sql.gz"
  ls -lh $BACKUP_DIR/scrumquest-$TIMESTAMP.sql.gz
else
  echo "Backup failed" >&2
  exit 1
fi
```

**Cron Entry:**
```bash
0 2 * * * /scripts/backup-postgres.sh >> /var/log/scrumquest-backup.log 2>&1
0 3 * * * find /backups -mtime +7 -delete  # Cleanup after 7 days
0 2 * * * certbot renew --quiet  # TLS cert renewal
```

**Backup Rotation:**
- Keep 7 most recent backups
- Oldest automatically deleted after 7 days
- Manual upload to S3 for long-term archival (future phase)

---

## V. PATTERNS & ANTI-PATTERNS

### Patterns to Follow

#### Pattern 1: Health Checks for Service Readiness
- **What:** Define HEALTHCHECK in Dockerfile + container health check in Compose
- **When:** Every service with a startup/readiness state
- **Example:**
```yaml
app:
  healthcheck:
    test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/api/health/readyz"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 15s  # Allow 15s for app startup
  depends_on:
    postgres:
      condition: service_healthy  # Wait for DB before starting app
```
- **Rationale:** Prevents race conditions (app tries to connect to unready DB, fails, crashes)

#### Pattern 2: Memory Limits Prevent Cascading OOM Kills
- **What:** Set hard memory limits for all containers
- **When:** Running on resource-constrained instances (1GB)
- **Example:**
```yaml
deploy:
  resources:
    limits:
      memory: 128M  # Hard ceiling; container OOM-killed if exceeded
    reservations:
      memory: 64M   # Guaranteed minimum (soft reservation)
```
- **Rationale:** With 1GB total, unbounded containers cause OOM killer to cascade. Limits isolate failure

#### Pattern 3: Volumes for Persistence Across Restarts
- **What:** Use named volumes for stateful data
- **When:** Any service holding state (DB, cache, metrics, logs)
- **Example:**
```yaml
volumes:
  postgres_data:
  redis_data:
  prometheus_data:

services:
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data  # Persists on host
```
- **Rationale:** Images are immutable; data lives in volumes. Container restart doesn't lose state

#### Pattern 4: Logging to Stdout for Aggregation
- **What:** Log to stdout; Docker captures to /var/lib/docker/containers/<id>/
- **When:** All containers; no file-based logs inside containers
- **Example (Already in ScrumQuest):**
```typescript
// Pino configured to output JSON to stdout in production
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty'
  }
});
```
- **Rationale:** Centralized logging via Promtail → Loki; no disk I/O inside container; searchable via Grafana

#### Pattern 5: Non-Root User in Containers
- **What:** RUN adduser (non-root), USER (switch to non-root)
- **When:** Always, unless root unavoidable
- **Example (Already in Dockerfile):**
```dockerfile
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 scrumquest
USER scrumquest
```
- **Rationale:** If container compromised, attacker doesn't get root on host

#### Pattern 6: Graceful Shutdown with Signal Handlers
- **What:** SIGTERM → cleanup (close connections, flush logs) → exit
- **When:** Node.js and all long-lived services
- **Example (Already in server/index.ts):**
```typescript
const gracefulShutdown = async (signal: string) => {
  const forceExitTimeout = setTimeout(() => process.exit(1), 30000);
  try {
    // Close connections, notify clients, etc.
    server.close(() => process.exit(0));
  } catch (err) {
    process.exit(1);
  }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```
- **Docker stop flow:**
  1. `docker stop <container>` sends SIGTERM
  2. App has 30s to clean up (docker stop --time=30s)
  3. After 30s, Docker sends SIGKILL (forced exit)
  4. Container stops

#### Pattern 7: Environment Variable Injection for Secrets
- **What:** Store secrets in .env on host, Compose injects via env_file
- **When:** Passwords, API keys, session secrets
- **Example:**
```bash
# Host: /home/ubuntu/.env (not in repo, 0600 permissions)
DATABASE_URL=postgresql://scrumquest:${DB_PASSWORD}@postgres:5432/scrumquest
SESSION_SECRET=<random 32+ char string>
GRAFANA_ADMIN_PASSWORD=<random>
```
- **Compose reads:**
```yaml
env_file:
  - .env
```
- **Rationale:** Image is artifact; secrets are runtime config (12-factor app)

#### Pattern 8: Automated Backups with Cron
- **What:** Host-level cron runs pg_dump daily, stores gzipped backups
- **When:** Production database; schedule off-peak
- **Example:**
```bash
0 2 * * * docker exec scrumquest-postgres-1 pg_dump -U scrumquest scrumquest | gzip > /backups/scrumquest-$(date +\%Y\%m\%d).sql.gz
0 3 * * * find /backups -mtime +7 -delete  # Cleanup
```
- **Rationale:** Database state protected; compressed backups fit in 1GB instance; rotation prevents disk exhaustion

### Anti-Patterns to Avoid

#### Anti-Pattern 1: Storing Secrets in Docker Image
- **What:** Hardcoding DATABASE_URL, API keys, or session secret in Dockerfile/Compose/.env that gets baked into image
- **Why Bad:** Anyone with image (Docker Hub, leaked artifact) can extract secrets; violates least privilege
- **Instead:** Use Compose env_file pointing to host .env (not in repo), or AWS Secrets Manager

#### Anti-Pattern 2: No Health Checks (Zombie Containers)
- **What:** Container crashes but orchestrator sees it as "running"; doesn't restart
- **Why Bad:** Service degraded but no alert. Player loses WebSocket connection, hangs on reconnect
- **Instead:** Define HEALTHCHECK in Dockerfile + condition: service_healthy in Compose

#### Anti-Pattern 3: Unbounded Memory Usage (OOM Kills)
- **What:** Not setting memory limits; one container consumes all RAM, killing others
- **Why Bad:** On 1GB instance, memory pressure cascades. Game crashes due to DB OOM, not app bug
- **Instead:** Set limits for all containers, monitor actual usage, tune based on traffic

#### Anti-Pattern 4: Persistent Logs Inside Container
- **What:** App logs to /var/log/app.log inside container; on restart, logs lost
- **Why Bad:** Can't audit errors after restart. Debugging production issues impossible
- **Instead:** Log to stdout (Docker captures), OR mount log volume + Promtail ships to Loki

#### Anti-Pattern 5: Hot-Swapping Docker Images Without Restart
- **What:** `docker pull latest; docker exec app kill -0 $PID` (try to update without restart)
- **Why Bad:** Node.js won't pick up new code without restart. Race conditions possible
- **Instead:** `docker-compose pull && docker-compose up -d` (full restart, respects health checks)

#### Anti-Pattern 6: PostgreSQL Container Without Memory Limits
- **What:** Running PostgreSQL with default shared_buffers (25% of available RAM)
- **Why Bad:** On 1GB instance, PostgreSQL claims 256 MB; combined with app+redis, causes OOM pressure
- **Instead:** Set shared_buffers=64MB, effective_cache_size=128MB, work_mem=2MB explicitly

#### Anti-Pattern 7: Manual SSH-and-Deploy (No Automation)
- **What:** Developer SSH into Lightsail, manually running docker-compose commands
- **Why Bad:** Error-prone, no audit trail, inconsistent across environments, hard to rollback
- **Instead:** GitHub Actions workflow → SSH deployment script with error handling + rollback

#### Anti-Pattern 8: No Monitoring (Flying Blind)
- **What:** Deploying to Lightsail with no observability; relying on manual health checks
- **Why Bad:** Can't detect issues until player reports. No metrics to debug slow responses
- **Instead:** Run Prometheus + Grafana stack on-instance, export game metrics, ship logs to Loki

---

## VI. SCALABILITY CONSIDERATIONS

### Current Capacity (1 Lightsail Instance, 1GB RAM)

| Metric | 1-10 Players | 50-100 Players | 500+ Players |
|--------|--------------|----------------|--------------|
| **Memory (App)** | 64MB heap sufficient | Monitor GC, may hit 100MB | Need horizontal scale |
| **Memory (DB)** | 200MB fine | Increase shared_buffers if slow queries | Separate RDS instance |
| **Memory (Redis)** | 50MB fine | Monitor evictions | Managed ElastiCache |
| **Bandwidth (Ingress)** | <10 Mbps | ~50 Mbps peak | Lightsail 5 Gbps cap; use CDN |
| **Storage (Logs)** | ~50 MB/day | ~200 MB/day | Archive to S3 after 24h |
| **Storage (Metrics)** | ~100 MB/week | ~500 MB/week | Compress/archive Prometheus data |
| **WebSocket Connections** | Single OK | Single OK (~500 concurrent) | Multi-instance needed |
| **DB Connections** | Pool 10 fine | Consider 20-30 | Increase pool or PgBouncer |
| **TLS Handshakes** | Negligible | Negligible | Nginx connection pooling helps |

### Scaling Signals (When to Expand)

1. **Memory Pressure**
   - Metric: `node_memory_MemAvailable_bytes` trending <100 MB
   - Signal: OOM killer logs in dmesg
   - Action: Move to 2GB instance ($10/mo), or horizontal scaling

2. **CPU Throttling**
   - Metric: `node_cpu_seconds_total` approach 80%+ sustained
   - Signal: App response times increase 2x+
   - Action: Upgrade instance vCPU, or horizontal scaling with load balancer

3. **WebSocket Connections**
   - Metric: `scrumquest_websocket_connections` (Prometheus metric)
   - Limit: ~500 concurrent per instance (tuning-dependent)
   - Action: Deploy app tier horizontally; use Redis adapter + sticky sessions

4. **Database Connection Pool**
   - Metric: app logs showing "pool exhaustion", clients timeout
   - Limit: PostgreSQL max_connections=20 currently
   - Action: Increase pool size, OR use PgBouncer connection pooling middleware

5. **Storage Exhaustion**
   - Metric: `/` filesystem >80% usage
   - Cause: Prometheus old data, Loki chunks, backups
   - Action: Increase instance storage (Lightsail supports up to 640 GB), OR archive to S3

### Horizontal Scaling Strategy (Future Phases)

**Phase: Multi-Instance Deployment**
- App tier: 2-3 instances behind AWS NLB (Network Load Balancer)
- Load balancing: Round-robin, with sticky sessions OR WebSocket-only transport
- Database: Move to AWS RDS (managed, auto-backup, failover)
- Cache: AWS ElastiCache Redis (managed, replication)
- Observability: Centralized Prometheus on separate small instance; Loki with S3 storage

**Architecture:**
```
NLB (sticky sessions)
├── App Instance 1 (Lightsail 1GB)
│   └── Redis Adapter → shared Redis (ElastiCache)
├── App Instance 2 (Lightsail 1GB)
│   └── Redis Adapter → shared Redis
└── App Instance 3 (Lightsail 1GB)
    └── Redis Adapter → shared Redis

Shared PostgreSQL (RDS)
Shared Redis (ElastiCache)
Shared Prometheus (small Lightsail)
Shared Loki (small Lightsail)
```

---

## VII. REPLIT COMPATIBILITY

**Goal:** No breaking code changes; containerization is deployment-only.

### What Remains Unchanged

- **npm run dev:** Still works on Replit (Nix runtime includes Node 20)
- **In-memory storage fallback:** Without DATABASE_URL, app uses MemStorage (no data loss)
- **Socket.IO + Express:** Unchanged code, works in Replit and containers
- **File structure:** No moving of source files; same directory layout

### What Changes (Deployment-Only)

- **Dockerfile:** Already in repo, not run on Replit (ignored by .replit)
- **docker-compose.yml:** New, not run on Replit (not in .replit runtime)
- **GitHub Actions:** New CI/CD workflows (external to Replit)
- **Nginx, Prometheus, Loki:** Only on Lightsail instance (not on Replit)

### Deployment Path

```
Replit Development:
  npm run dev
  ├─ Node 20 from Nix (redis, postgres optional)
  ├─ In-memory storage (no DATABASE_URL)
  └─ Works unchanged

GitHub → Lightsail Production:
  git push main
  → GitHub Actions ci.yml (lint, test, build)
  → docker build (multi-stage)
  → aws ecr push
  → Lightsail: docker-compose pull && up -d
  → PostgreSQL + observability stack
  → Zero Replit code changes
```

### Compatibility Checklist

- [x] Replit .replit file unchanged (no Docker requirement)
- [x] package.json scripts unchanged (npm run dev still works)
- [x] Source code unchanged (no imports moved)
- [x] In-memory storage still functional (no DATABASE_URL in dev)
- [x] Socket.IO + Express code unchanged
- [x] Dockerfile uses existing multi-stage build (no new npm packages)

---

## VIII. NEW FILES & CONFIGURATIONS

### Files to Create (Repo-Level)

| File | Purpose | Location |
|------|---------|----------|
| **docker-compose.yml** | Primary: app + postgres + redis + prometheus + loki + promtail + grafana + node-exporter | Repo root |
| **docker-compose.override.yml** (optional) | Local dev overrides (port forwarding, debug flags, .env) | Repo root, gitignored |
| **.github/workflows/deploy-docker.yml** | New: Build Docker image, push to ECR, trigger Lightsail deploy | .github/workflows/ |
| **infra/nginx/default.conf** | Reverse proxy config (TLS, app + Grafana routing) | infra/nginx/ |
| **infra/prometheus/prometheus.yml** | Prometheus scrape configs + retention | infra/prometheus/ |
| **infra/loki/loki-config.yml** | Loki storage config (single-binary mode) | infra/loki/ |
| **infra/promtail/promtail-config.yml** | Promtail scrape job definitions | infra/promtail/ |
| **infra/grafana/provisioned-datasources.yml** | Grafana datasource config (Prometheus + Loki) | infra/grafana/ |
| **infra/grafana/provisioned-dashboards/** | Default dashboard JSON files | infra/grafana/provisioned-dashboards/ |
| **.env.example** | Environment variable template (no secrets, for reference) | Repo root |
| **.gitignore** | Update: ignore .env, docker-compose.override.yml, etc. | Repo root |
| **scripts/deploy-lightsail.sh** | SSH deployment script (pull + docker-compose up) | scripts/ |
| **scripts/backup-postgres.sh** | Backup script (pg_dump + gzip) | scripts/ |
| **docs/DEPLOYMENT.md** | Runbook: Lightsail setup, TLS, first deploy, troubleshooting | docs/ |
| **docs/MONITORING.md** | Monitoring guide: Prometheus queries, Grafana dashboards, alerting | docs/ |

### Files to Modify (Minimal Changes)

| File | Change | Reason |
|------|--------|--------|
| **.gitignore** | Add `.env` (secrets), `docker-compose.override.yml` | Prevent secret commits |
| **Dockerfile** | None (already in repo and production-ready) | Use as-is |
| **package.json** | None (or add `docker:build` script for convenience) | Existing setup works |

---

## IX. DEPLOYMENT ROADMAP

### Phase 1: Foundation (Week 1-2)
- [ ] Create docker-compose.yml with core services (app, postgres, redis)
- [ ] Test locally with docker-compose up
- [ ] Create Lightsail instance (1GB instance)
- [ ] SSH setup + key pair generation
- [ ] Deploy manually: docker-compose pull && up -d

### Phase 2: Observability (Week 2-3)
- [ ] Add Prometheus + Node Exporter to Compose
- [ ] Add Loki + Promtail to Compose
- [ ] Add Grafana with provisioned dashboards
- [ ] Create default dashboards (game metrics, system health, error logs)

### Phase 3: CI/CD Automation (Week 3-4)
- [ ] Create AWS ECR repository
- [ ] Create GitHub Actions deploy-docker.yml workflow
- [ ] Test: Push code → build image → push to ECR → deploy to Lightsail
- [ ] Add manual approval gate for production

### Phase 4: Backup & Maintenance (Week 4-5)
- [ ] Create backup script (pg_dump + cron)
- [ ] Test restore procedure
- [ ] Create TLS cert renewal cron
- [ ] Document runbook (docs/DEPLOYMENT.md)

### Phase 5: Validation & Hardening (Week 5-6)
- [ ] Load test: Verify 1GB RAM budget holds for 50-100 players
- [ ] Security audit: Check HTTPS, secrets management, auth
- [ ] Rollback test: Verify previous image can be deployed
- [ ] Monitoring alerts: Set thresholds for CPU, memory, errors

---

## X. SOURCES & REFERENCES

### Official Documentation
- [AWS Lightsail Container Services](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html)
- [Docker Compose Specification](https://compose-spec.io/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Prometheus Operator Best Practices](https://prometheus-operator.dev/)

### Community References
- [Docker Compose Complete Guide 2026](https://devtoolbox.dedyn.io/blog/docker-compose-complete-guide)
- [Docker Compose Production](https://www.compilenrun.com/docs/devops/docker/docker-compose/docker-compose-production/)
- [Socket.IO Using Multiple Nodes](https://socket.io/docs/v4/using-multiple-nodes/)
- [Scaling Socket.IO: Real-world Challenges](https://ably.com/topic/scaling-socketio)
- [GitHub Actions Docker Build & Push](https://oneuptime.com/blog/post/2026-01-27-push-aws-ecr-github-actions/view)
- [Prometheus + Grafana + Loki Docker Compose Setup](https://susi.dev/blog/prometheus-grafana-loki-with-docker-compose)
- [Automated PostgreSQL Backups with Docker](https://serversinc.io/blog/automated-postgresql-backups-in-docker-complete-guide-with-pg-dump/)
- [kartoza/docker-pg-backup](https://github.com/kartoza/docker-pg-backup)

---

**Research Confidence:** HIGH
**Last Updated:** 2026-02-24
**Status:** Ready for roadmap + phase planning
