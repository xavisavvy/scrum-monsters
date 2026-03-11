# Architecture Patterns: Docker + Lightsail Deployment

**Project:** ScrumQuest
**Researched:** 2026-02-24

---

## System Architecture

### Deployment Topology (Single-Instance Lightsail)

```
┌─ GitHub (Main Branch) ─────────────────────────────────────────┐
│                                                                  │
│  Push → CI workflow (lint, test, build)                         │
│    ↓                                                             │
│  Docker build → Push to GHCR                                    │
│    ↓                                                             │
│  CD workflow trigger (manual for prod, auto for staging)        │
│    ↓                                                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
            ┌─ AWS Account (us-east-1) ─────────────┐
            │                                        │
            │  ┌─ Lightsail Micro Instance ────┐   │
            │  │ (1 vCPU, 1GB RAM, 30GB disk)  │   │
            │  │                                │   │
            │  │  ┌─────────────────────────┐  │   │
            │  │  │  Docker Compose Stack  │  │   │
            │  │  │                         │  │   │
            │  │  │ ┌─────────────────────┐│  │   │
            │  │  │ │  scrumquest-app     ││  │   │
            │  │  │ │  (Node.js 22-slim)  ││  │   │
            │  │  │ │  :5000 (internal)   ││  │   │
            │  │  │ └─────────────────────┘│  │   │
            │  │  │         ↓ (tcp)        │  │   │
            │  │  │ ┌─────────────────────┐│  │   │
            │  │  │ │  postgres-16        ││  │   │
            │  │  │ │  (Session storage)  ││  │   │
            │  │  │ │  :5432 (internal)   ││  │   │
            │  │  │ └─────────────────────┘│  │   │
            │  │  │                         │  │   │
            │  │  │ ┌─────────────────────┐│  │   │
            │  │  │ │  redis-7            ││  │   │
            │  │  │ │  (Cache + sessions) ││  │   │
            │  │  │ │  :6379 (internal)   ││  │   │
            │  │  │ └─────────────────────┘│  │   │
            │  │  │                         │  │   │
            │  │  │ ┌─────────────────────┐│  │   │
            │  │  │ │  prometheus         ││  │   │
            │  │  │ │  :9090 (localhost)  ││  │   │
            │  │  │ └─────────────────────┘│  │   │
            │  │  │                         │  │   │
            │  │  │ ┌─────────────────────┐│  │   │
            │  │  │ │  grafana            ││  │   │
            │  │  │ │  :3000 (localhost)  ││  │   │
            │  │  │ └─────────────────────┘│  │   │
            │  │  │                         │  │   │
            │  │  │ ┌─────────────────────┐│  │   │
            │  │  │ │  certbot-renewer    ││  │   │
            │  │  │ │  (TLS automation)   ││  │   │
            │  │  │ └─────────────────────┘│  │   │
            │  │  └─────────────────────────┘  │   │
            │  │                                │   │
            │  └────────────────────────────────┘   │
            │           ↑            ↑              │
            │         HTTPS        SSH              │
            │        :443         :22              │
            │                                        │
            │  ┌─ Route 53 (DNS) ─────────────────┐ │
            │  │  scrumquest.com → Lightsail IP  │ │
            │  └────────────────────────────────┐ │
            │                                        │
            │  ┌─ Let's Encrypt Certificates ───┐  │
            │  │  (renewed via certbot cron)    │  │
            │  └────────────────────────────────┘  │
            │                                        │
            └────────────────────────────────────────┘
                        ↓
                 ┌─ S3 Bucket ────────┐
                 │ (pg_dump backups)  │
                 │ (retention: 30d)   │
                 └────────────────────┘
```

---

## Network Architecture

### Container Network (`scrumquest` bridge network)

```
┌──────────────────────────────────────────────────┐
│  Docker Bridge Network: scrumquest               │
│                                                  │
│  ┌──────────────┐    ┌──────────────┐           │
│  │ app:5000     │◄──►│ postgres:5432│           │
│  │              │    │              │           │
│  └──────────────┘    └──────────────┘           │
│         ▲ WebSocket
│         │ Game events                           │
│         │                                       │
│  ┌──────────────┐    ┌──────────────┐           │
│  │ app:5000     │◄──►│ redis:6379   │           │
│  │              │    │              │           │
│  └──────────────┘    └──────────────┘           │
│                      Session store
│
│  ┌──────────────┐
│  │ prometheus:9090
│  │              │
│  │ (scrapes)    │
│  │ app:/metrics │
│  └──────────────┘
│
│  ┌──────────────┐    ┌──────────────┐
│  │ grafana:3000 │◄──►│ prometheus   │
│  │              │    │              │
│  └──────────────┘    └──────────────┘
└──────────────────────────────────────────────────┘

All internal; DNS resolution via docker-compose service names
```

### External Access

```
Internet
  │
  └─ 443 (HTTPS) ──► Lightsail Public IP ──┐
                                            │
                                            ▼ (reverse proxy on host OS)

                                       app:5000 (HTTP)

  └─ 22 (SSH) ─────► Lightsail Public IP
                          ↓ (browser SSH or key-based)
                     Shell → Docker inspect/logs
                     SSH tunnels → prometheus:9090, grafana:3000
```

---

## Data Flow

### WebSocket Connection Lifecycle

```
Client Browser                           ScrumQuest Server
    │                                           │
    ├─ connect() ──────────────────────────────┤
    │                                    socket.io handshake
    │                                    join lobby
    │                                    gameState[lobbyId] = {players: []}
    │                                           │
    ├─ estimate_vote_placed ───────────────────┤
    │                                    emit lobby_updated
    │  (receives lobby_updated) ◄──────────────┤
    │                                    broadcast to all players
    │                                           │
    ├─ reveal_estimates ───────────────────────┤
    │                                    calculate consensus
    │                                    store in PostgreSQL
    │                                           │
    └─ disconnect() ───────────────────────────┤
                                         cleanup gameState
                                         redis session expires (TTL)
```

### Metrics Collection Flow

```
App (prom-client library)
  │
  └─ Exposes /metrics endpoint
      Counter: game_lobbies_total
      Gauge: active_players
      Histogram: websocket_message_latency_ms
      │
      └─ Prometheus container scrapes every 15s
          │
          ├─ Time-series database (emptyDir volume)
          │
          └─ Grafana queries PromQL
              │
              └─ Displays dashboards (via SSH tunnel)
                  - Active players over time
                  - WebSocket errors
                  - Database connection pool
```

### Backup Flow (Daily)

```
PostgreSQL (postgres:5432)
  │
  ├─ 02:00 UTC: Docker cron container triggers
  │
  └─ pg_dump → scrumquest_YYYYMMDD_HHMMSS.sql.gz
      │
      ├─ Store locally in volume (short-term)
      │
      └─ Upload to S3
          s3://scrumquest-backups/scrumquest_YYYYMMDD_HHMMSS.sql.gz
          │
          └─ S3 lifecycle policy auto-deletes after 30 days
```

---

## Component Responsibilities

| Component | Responsibility | Health Check | Restart Policy |
|-----------|-----------------|-------------|-----------------|
| **app** | Game state, WebSocket events, API endpoints | GET /api/health (200 OK) | unless-stopped |
| **postgres** | Player data, game history, user sessions | pg_isready query | unless-stopped |
| **redis** | Session store, cache, socket.io adapters | redis-cli ping | unless-stopped |
| **prometheus** | Scrapes app metrics, stores time-series data | GET /-/ready (200 OK) | unless-stopped |
| **grafana** | Queries Prometheus, serves dashboards | GET /api/health (200 OK) | unless-stopped |
| **certbot-renewer** | Auto-renews Let's Encrypt certificates | (background process; no health check) | unless-stopped |

---

## Deployment Flow (CI/CD)

### Staging Deployment (Auto on Main)

```
1. Developer pushes code to main branch
   ↓
2. GitHub Actions CI workflow
   ├─ npm run lint
   ├─ npm run check (TypeScript)
   ├─ npm run test
   └─ npm run build
       ↓
3. GitHub Actions Docker workflow
   ├─ docker build (multi-stage)
   ├─ docker push → ghcr.io/username/scrumquest:SHA
   └─ docker tag → ghcr.io/username/scrumquest:latest
       ↓
4. GitHub Actions Lightsail deploy workflow (auto)
   ├─ AWS CLI lightsail push-container-image
   └─ AWS CLI create-container-service-deployment (staging service)
       ↓
5. Lightsail pulls image from GHCR
   ├─ Create temporary container with new version
   ├─ Health check passes
   └─ Switch traffic to new container
       ↓
6. Old container kept for quick rollback (5 minutes)
```

### Production Deployment (Manual Trigger)

```
1. Team member clicks GitHub Actions workflow_dispatch
   └─ Input: "staging" or "production" environment
   └─ Input (optional): rollback_version (e.g., "v1.2.0")
       ↓
2. GitHub Actions Lightsail deploy workflow (manual)
   ├─ If rollback_version set:
   │  └─ aws lightsail create-container-service-deployment \
   │     --image ghcr.io/.../scrumquest:v1.2.0
   │
   └─ If latest:
      └─ aws lightsail create-container-service-deployment \
         --image ghcr.io/.../scrumquest:latest
          ↓
3. Lightsail deployment happens (2-5 minutes)
   ├─ Spin up new container
   ├─ Health check required to pass
   ├─ Gradually shift traffic (no instant cutover)
   └─ Old version stays for 5 minutes before termination
       ↓
4. Post-deploy smoke tests (Playwright E2E)
   ├─ Create lobby
   ├─ Estimate story points
   ├─ Verify metrics endpoint
   └─ Check error logs
```

### Rollback Procedure

```
If production deployment fails health checks:

Option 1: Automatic Rollback (by Lightsail)
  └─ After 5 minutes of failed health checks,
     Lightsail reverts to previous container version

Option 2: Manual Rollback (by Team)
  └─ GitHub Actions workflow_dispatch with:
     environment: "production"
     rollback_version: "previous-sha" (from docker image history)
       ↓
  Result: 2-5 minutes downtime (container restart time)
```

---

## Failure Modes & Recovery

### Container Crashes

**Scenario:** app container OOM kills or segfault

```
Recovery Time: ~30 seconds
  1. Docker detects exit code != 0
  2. restart: unless-stopped triggers restart
  3. Health check runs at start_period=15s
  4. Traffic resumed when health check passes
```

**Monitoring:** Prometheus `container_restart_count` metric

---

### PostgreSQL Connection Pool Exhaustion

**Scenario:** Too many WebSocket clients, postgres pool full (max 20)

```
Impact: New connections fail; existing continue
Recovery:
  1. Identify in logs: "connection pool limit reached"
  2. Increase pool size in DATABASE_URL: `connectionLimit=30`
  3. Redeploy app
  4. Monitor: `pg_stat_activity` shows active connections

Prevention:
  - Configure connection pool idle timeout (60s default)
  - Monitor active connections via Prometheus
  - Alert if connections > 80% of max
```

---

### Disk Space Running Out (30GB Lightsail limit)

**Scenario:** PostgreSQL + logs + Docker images fill disk (rare at <50 users)

```
Prevention (primary):
  1. Docker log rotation: --log-opt max-size=100m
  2. Prometheus retention: --storage.tsdb.retention.time=7d
  3. Monitor: $ df -h (via SSH)

Recovery (if disk full):
  1. SSH to Lightsail instance
  2. $ docker system prune -a --volumes  (deletes unused containers/images)
  3. $ sudo journalctl --vacuum=100M  (trim system logs)
  4. $ ls -lh /var/lib/docker/volumes/*/  (check volume sizes)
```

---

### TLS Certificate Renewal Failure

**Scenario:** Let's Encrypt cert expires (90-day renewal window)

```
Prevention:
  1. Certbot cron runs every 12 hours
  2. Renews certificates 30 days before expiry
  3. Logs renewal attempts: docker logs certbot-renewer

Monitoring:
  1. Manual check: $ openssl s_client -connect scrumquest.com:443 -showcerts
     └─ Shows expiry date
  2. Prometheus alert: if cert expiry < 14 days, page on-call

Recovery (manual):
  1. SSH to instance
  2. $ docker exec certbot-renewer certbot renew --force-renewal
  3. Restart app if needed: $ docker-compose restart app
```

---

### Network Isolation Failure (Redis/Postgres Unreachable)

**Scenario:** Docker network bridge broken (extremely rare)

```
Symptoms:
  1. App logs: "ECONNREFUSED redis:6379"
  2. Prometheus: scrape failures from app

Recovery:
  1. $ docker-compose down
  2. $ docker network rm scrumquest  (force remove)
  3. $ docker-compose up -d  (recreates network)
  4. Verify: $ docker network inspect scrumquest
```

---

## Scalability Paths

### Current (Single-Instance, ~50 Users)

```
Lightsail Micro ($10/mo)
├─ 1 vCPU
├─ 1GB RAM
└─ ~30GB disk
```

### Phase 1: More Users (100-200 Users)

```
Option A: Vertical Scale (Simple)
  └─ Lightsail Small ($20/mo)
      ├─ 2 vCPU
      ├─ 2GB RAM
      └─ ~40GB disk

      Requires: docker-compose up -d (pull latest image, restart)
      Downtime: 2-3 minutes

Option B: Horizontal Scale (Complex)
  └─ Multi-node Lightsail + Docker Swarm OR Kubernetes
      ├─ Load balancer (distribute traffic)
      ├─ Shared PostgreSQL (RDS or managed)
      ├─ Shared Redis (ElastiCache or managed)
      └─ 2-3 app instances

      Requires: Full re-architecture
      Cost: $50+/mo
      Recommendation: Stay with Micro/Small until 200+ users
```

### Phase 2: 500+ Concurrent Users

```
Lightsail Containers + RDS + ElastiCache
├─ Lightsail Containers Medium ($160/mo, 2 vCPU, 2GB)
├─ RDS PostgreSQL Micro ($15/mo minimum)
├─ ElastiCache Redis Micro ($0.014/hour, ~$10/mo)
└─ Auto-scaling rules based on memory/CPU

Requires: Migrate to managed services; new infrastructure
Cost: $200+/mo
Timeline: 2-3 months of engineering
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Secrets in docker-compose.yml

**What goes wrong:** Passwords, OAuth tokens, API keys committed to GitHub

```yaml
# ❌ DON'T
services:
  app:
    environment:
      DATABASE_URL: postgresql://user:password@postgres:5432/db
      GOOGLE_CLIENT_SECRET: xyz123
```

**Instead:**
```yaml
# ✅ DO
services:
  app:
    environment:
      - DATABASE_URL=${DATABASE_URL}  # From .env file (local)
      # or from AWS Secrets Manager at deploy time
```

---

### Anti-Pattern 2: Public Prometheus/Grafana

**What goes wrong:** Metrics exposed without authentication; reveals internal IP addresses, request patterns

```
❌ DO NOT: ports: ["0.0.0.0:3000:3000"]  # Grafana on 3000, public
✅ DO:     ports: ["127.0.0.1:3000:3000"]  # Localhost only
           # Access via SSH tunnel: ssh -L 3000:localhost:3000 ubuntu@instance
```

---

### Anti-Pattern 3: No Health Checks in docker-compose

**What goes wrong:** Unhealthy containers stay "running"; app appears up but non-functional

```yaml
# ❌ DON'T: No healthcheck
services:
  app:
    build: .
    # Missing healthcheck!

# ✅ DO: Define healthcheck
services:
  app:
    build: .
    healthcheck:
      test: ["CMD", "wget", "--tries=1", "--spider", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

---

### Anti-Pattern 4: Single Point of Failure (No Backups)

**What goes wrong:** PostgreSQL container deleted; 5 years of game history gone

```yaml
# ❌ DON'T: No backup strategy
services:
  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data  # Only on disk; no offsite backup

# ✅ DO: Regular backups
# + pg_dump to S3 nightly (see backup flow above)
# + test restore from backup quarterly
```

---

### Anti-Pattern 5: Immediate Production Deployments

**What goes wrong:** Bug in main branch deployed directly to prod; 50 users affected

```
❌ DON'T:
  Push to main → Auto-deploy to prod immediately

✅ DO:
  Push to main → Auto-deploy to staging → Manual promote to prod
  (or: auto-deploy staging, manual trigger for prod via GitHub Actions)
```

---

## Monitoring Metrics

### SLI (Service Level Indicators)

| Metric | Target | How Measured |
|--------|--------|--------------|
| **Availability** | 99.5% uptime | Prometheus uptime / total time |
| **Request latency** | P95 < 200ms | Prometheus histogram quantile |
| **WebSocket latency** | P95 < 500ms | Custom app metrics (Socket.IO event timing) |
| **Error rate** | < 0.5% 5xx errors | Prometheus: errors / total requests |
| **Database queries** | P95 < 50ms | PostgreSQL slow query log |

### Key Dashboards (Grafana)

1. **System Health**
   - CPU usage %
   - Memory usage MB
   - Disk usage %
   - Network in/out Mbps

2. **Application**
   - Active WebSocket connections
   - Lobbies created (per hour)
   - Estimation votes (per minute)
   - Request latency (histogram)
   - 5xx error rate

3. **Database**
   - Active connections / max
   - Query latency (slow queries)
   - Cache hit rate (if using)

4. **Infrastructure**
   - Docker container restarts
   - TLS certificate expiry days
   - Backup job completion status

---

## Runbooks (Quick Reference)

### Runbook 1: Emergency Rollback

```bash
# 1. Identify previous good version
aws lightsail get-container-service-deployments \
  --service-name scrumquest-prod --region us-east-1 | jq '.deployments[] | .version'

# 2. Trigger rollback workflow
# GitHub Actions > Deploy to Lightsail > Run workflow > Production + rollback_version=SHA

# OR manual:
aws lightsail create-container-service-deployment \
  --service-name scrumquest-prod \
  --containers 'app={"image":"ghcr.io/org/scrumquest:PREVIOUS_SHA"}' \
  --region us-east-1

# 3. Monitor health
watch -n 5 'aws lightsail get-container-service-deployments --service-name scrumquest-prod --region us-east-1 | jq ".deployments[0].state"'

# Done when state = ACTIVE
```

---

### Runbook 2: Check PostgreSQL Connectivity

```bash
# SSH to Lightsail instance
ssh -i lightsail.pem ubuntu@instance-ip

# Connect to postgres container
docker-compose exec postgres psql -U scrumquest -d scrumquest -c "SELECT NOW();"

# If fails, check logs
docker-compose logs postgres

# Restart if needed
docker-compose restart postgres
docker-compose logs postgres  # verify startup
```

---

### Runbook 3: View Monitoring Dashboards

```bash
# SSH with local port forwarding
ssh -i lightsail.pem -L 3000:localhost:3000 -L 9090:localhost:9090 ubuntu@instance-ip

# Open browser
# Grafana: http://localhost:3000 (admin/PASSWORD)
# Prometheus: http://localhost:9090

# Ctrl+C to close tunnel
```

---

