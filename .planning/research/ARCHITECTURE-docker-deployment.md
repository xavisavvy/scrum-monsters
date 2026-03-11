# Architecture Patterns: Docker Deployment to Single VPS

**Domain:** Docker Compose deployments to AWS Lightsail and self-managed VPS
**Researched:** 2026-02-24
**Scale:** 50-100 concurrent users, single instance

---

## Recommended Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     AWS Lightsail VPS                       │
│                  (512MB-4GB RAM, 1-2 vCPU)                  │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │          Docker Compose Orchestration             │   │
│  │                                                    │   │
│  │  ┌──────────────┐  ┌──────────────────┐          │   │
│  │  │  Nginx Proxy │  │  ScrumQuest App  │          │   │
│  │  │  Manager     │──│  (Node.js)       │          │   │
│  │  │              │  │  Port: 5000      │          │   │
│  │  │ Port 80/443  │  │                  │          │   │
│  │  └──────────────┘  │ Entrypoint: dist/│          │   │
│  │       │            │  index.js        │          │   │
│  │       │            └──────────────────┘          │   │
│  │       │                     │                     │   │
│  │       │                     ├─→ (WebSocket)       │   │
│  │       └─────────────────────┘                     │   │
│  │                                                    │   │
│  │  ┌──────────────────┐  ┌──────────────────┐      │   │
│  │  │  PostgreSQL 16   │  │  Redis 7         │      │   │
│  │  │  Port: 5432      │  │  Port: 6379      │      │   │
│  │  │                  │  │                  │      │   │
│  │  │ Volume:          │  │ Volume:          │      │   │
│  │  │  postgres_data   │  │  redis_data      │      │   │
│  │  └──────────────────┘  └──────────────────┘      │   │
│  │                                                    │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  postgres-backup-s3 (Sidecar)            │    │   │
│  │  │  Runs daily pg_dump → S3                 │    │   │
│  │  │  Schedule: 0 2 * * * (2am UTC)           │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  │                                                    │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  Prometheus (optional, for monitoring)   │    │   │
│  │  │  Port: 9090                              │    │   │
│  │  │  Scrapes /metrics every 15s              │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  │                                                    │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  Dozzle (optional, for logs)             │    │   │
│  │  │  Port: 8080                              │    │   │
│  │  │  Real-time Docker container logs         │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  Systemd Service: scrumquest-docker.service               │
│  Auto-starts docker-compose on VPS reboot                │
└─────────────────────────────────────────────────────────────┘
         │                          │
         │                          └─→ PostgreSQL Logs → S3
         │
    HTTPS (TLS)                    AWS S3 Bucket
         │                          (Database Backups)
         │
  Custom Domain:                   AWS IAM User
  yourdomain.com                   (S3 credentials)
         │
  Route53 / Lightsail DNS
```

---

## Component Boundaries

| Component | Responsibility | Interface | Communicates With |
|-----------|---------------|-----------|------------------|
| **Nginx Proxy Manager** | TLS termination, reverse proxy routing, Let's Encrypt cert renewal | HTTP/HTTPS (ports 80, 443), GUI (port 81) | Internet (clients), App container (port 5000), Let's Encrypt API |
| **ScrumQuest App** | Game logic, WebSocket handling, session management, API endpoints | HTTP (port 5000), WebSocket upgrade | PostgreSQL (session store, user data), Redis (optional: session clustering), Nginx (reverse proxy) |
| **PostgreSQL** | Persistent data storage (users, games, estimations, sessions) | TCP (port 5432) | App (queries), postgres-backup-s3 (backups) |
| **Redis** | Session clustering, optional caching | TCP (port 6379) | App (session store if using Redis adapter) |
| **postgres-backup-s3** | Automated daily backups, S3 upload | TCP to PostgreSQL (5432), S3 API | PostgreSQL (pg_dump), AWS S3 API |
| **Prometheus** (optional) | Metrics collection, time-series storage | HTTP (port 9090) | App (/metrics endpoint), Grafana (queries) |
| **Dozzle** (optional) | Real-time Docker logs viewer | HTTP (port 8080), Docker socket | Docker daemon, browser clients |
| **Grafana** (optional) | Metrics visualization, alerting | HTTP (port 3000) | Prometheus (queries), email (alerts) |
| **Systemd Service** | VPS auto-start on reboot | systemd unit file | Docker daemon, docker-compose |

---

## Data Flow

### Request Flow (HTTPS)

```
User Browser
    │
    ├─ HTTPS Request (yourdomain.com)
    │
    ▼
Nginx Proxy Manager (Port 443)
    │ (TLS termination, forward to app)
    │
    ├─ HTTP Request (Port 5000, internal network)
    │
    ▼
ScrumQuest App
    │
    ├─ Query/update data
    │
    ▼
PostgreSQL (Port 5432)
    │
    └─ Response (user data, game state, session)
    │
    ▼
Nginx (reverse proxy response)
    │
    ├─ TLS encrypt
    │
    ▼
User Browser (HTTPS Response)
```

### WebSocket Flow

```
User Browser (ws:// upgrade request)
    │
    ├─ HTTP Upgrade Request (HTTPS)
    │
    ▼
Nginx Proxy Manager
    │ (Forward Upgrade headers: Connection: upgrade, Upgrade: websocket)
    │
    ▼
ScrumQuest App (WebSocket handler)
    │
    ├─ Establish persistent connection
    │
    ├─ Broadcast game state updates to all players
    │
    ├─ Query PostgreSQL for session data (on connect)
    │
    ├─ Cache game state in-memory (lobbies, combat)
    │
    ▼
PostgreSQL (persistent storage)
```

### Backup Flow

```
postgres-backup-s3 Container (Scheduled: 2am daily)
    │
    ├─ Connect to PostgreSQL
    │
    ▼
Execute pg_dump
    │
    ├─ Compress with gzip
    │
    ├─ Create timestamped filename: scrumquest_2026-02-24_020000.dump.gz
    │
    ▼
Upload to S3
    │
    ├─ AWS S3 API (PutObject)
    │
    ├─ IAM user credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    │
    ▼
S3 Bucket (Backup archive)
    │
    ├─ Retention: 30 days (auto-delete older)
    │
    └─ Accessible for restore operations
```

### Monitoring Flow

```
Prometheus (Port 9090)
    │
    ├─ Scrape /metrics every 15s
    │
    ▼
ScrumQuest App (Prometheus endpoint)
    │
    ├─ prom-client metrics (existing)
    │ ├─ socketio_connected_total
    │ ├─ http_request_duration_seconds
    │ ├─ process_memory_bytes_rss
    │ └─ ... (all standard Node.js metrics)
    │
    ├─ socket.io-prometheus (Socket.IO specific)
    │
    ├─ Custom game metrics (counters for events)
    │
    ▼
Prometheus Time-Series Database
    │
    ├─ Store metrics with timestamps
    │
    ├─ Query language (PromQL)
    │
    ▼
Grafana (Port 3000)
    │
    ├─ Visualize metrics in dashboards
    │
    ├─ Alert on thresholds
    │
    └─ Email alerts on incidents
```

---

## Deployment Process

### Standard Deployment (Rolling Update)

```
Developer
    │
    ├─ Push to GitHub
    │
    ├─ (Optional) Trigger CI/CD pipeline
    │ ├─ Run tests
    │ ├─ Build Docker image
    │ ├─ Push to registry (Docker Hub or ECR)
    │
    ▼
SSH to Lightsail VPS
    │
    ├─ cd /home/ubuntu/scrummonsters
    │
    ├─ git pull origin main
    │
    ├─ docker-compose build app  (rebuild image from Dockerfile)
    │
    ├─ docker-compose up -d --no-deps --build app  (update only app, database continues)
    │
    ├─ Wait 30s for health check (app drains existing connections)
    │
    ├─ Verify: curl https://yourdomain.com/api/health
    │
    ▼
Deployment Complete
    │
    └─ Old app container stopped (gracefully, if implemented)
        New app container running
        Users experience no downtime (WebSocket connections persist)
```

### Blue-Green Deployment (Optional, Phase 4+)

```
Running: Blue Container (app-blue)
    │
    ├─ Nginx routes all traffic to Blue
    │
    ├─ Database at postgres_data volume (shared)
    │
    ▼
Deploy: Build Green Container (app-green)
    │
    ├─ docker-compose build app-green
    │
    ├─ docker-compose up -d app-green (health checks pass)
    │
    ▼
Switch: Nginx routes to Green
    │
    ├─ docker exec nginx-proxy-manager update_config (route to app-green)
    │
    ├─ Old connections continue on Blue, new on Green
    │
    ├─ After 30s, stop Blue
    │
    ▼
Running: Green Container (now "Blue" for next deploy)
    │
    └─ Database unchanged (shared volume), sessions + state persist
```

---

## Persistence & State Management

### Session Storage

```
Type: PostgreSQL (via connect-pg-simple)
    │
    ├─ Rows: user_sessions table (users table for auth)
    │
    ├─ Schema (managed by Drizzle ORM):
    │ ├─ sid: session ID (string)
    │ ├─ sess: session data (JSON blob)
    │ ├─ expire: expiry timestamp
    │
    ├─ Durability: Survives app restart ✅
    │
    ├─ Multi-instance: Can share across multiple app instances (if needed later)
    │
    └─ Trade-off: Slower than Redis, but simpler (no Redis cluster dependency)
```

### Game State

```
Type: In-Memory + PostgreSQL
    │
    ├─ In-Memory (while game active):
    │ ├─ lobbies map (quick lookup, no DB queries per message)
    │ ├─ combat state (for active combat calculations)
    │ ├─ player positions (for WebSocket broadcasts)
    │ └─ Lost on app restart (acceptable, users rejoin lobby)
    │
    ├─ PostgreSQL (persistent):
    │ ├─ Game results (damage dealt, phase winner, final estimates)
    │ ├─ Player history (stats, level, achievements)
    │ ├─ Leaderboards (derived from history)
    │ └─ Preserved across app restarts, backup-safe
    │
    └─ Trade-off: In-memory lobbies mean reconnecting users rejoin empty lobby (feature, not bug)
```

### Backup & Recovery

```
Backup Source: PostgreSQL database
    │
    ├─ Format: pg_dump (SQL text or binary)
    │
    ├─ Compressed: gzip (95% reduction for text dumps)
    │
    ├─ Automated: postgres-backup-s3 container runs daily
    │
    ├─ Schedule: 0 2 * * * (2:00 AM UTC, low-traffic window)
    │
    ├─ Retention: 30 days (auto-delete older)
    │
    ├─ Location: S3 bucket (offsite, durable)
    │
    ├─ Encryption: S3 server-side encryption (optional, default)
    │
    ▼
Recovery Process (if needed):
    │
    ├─ Download backup from S3
    │
    ├─ docker-compose down (stop app)
    │
    ├─ docker volume rm postgres_data (delete current data)
    │
    ├─ docker-compose up -d postgres (start fresh database)
    │
    ├─ docker exec postgres pg_restore -U scrumquest < backup.dump.gz
    │
    ├─ docker-compose up -d app (restart app)
    │
    ├─ Verify: curl https://yourdomain.com (health check passes)
    │
    ├─ RTO: 15-30 min (mostly download + restore time)
    │
    └─ RPO: 24 hours (daily backups)
```

---

## Resource Allocation

### Lightsail Instance Sizing

| Metric | 50 Users | 100 Users | 200+ Users |
|--------|----------|-----------|-----------|
| **RAM** | 512MB | 1GB | 2-4GB |
| **vCPU** | 1 | 1-2 | 2+ |
| **Disk** | 30GB | 50GB | 100GB+ |
| **Monthly Cost** | $5 | $8-10 | $20-40 |
| **Estimated lifespan** | 6-12 months | 12-18 months | 18-24 months |

### Memory Usage Breakdown

```
Total: 512MB (Lightsail micro)
    │
    ├─ PostgreSQL: 150MB (base + cache)
    │
    ├─ Redis (optional): 50MB
    │
    ├─ Nginx Proxy Manager: 50MB
    │
    ├─ ScrumQuest App: 100-150MB (Node.js)
    │ ├─ Base: 50MB (V8, runtime)
    │ ├─ Lobbies: 30MB (50 active lobbies, ~600KB each)
    │ ├─ In-game state: 50MB (combat calculations, player data)
    │ └─ Growth: +10MB per 50 concurrent users
    │
    ├─ Prometheus (if running): 80MB
    │
    ├─ Dozzle (if running): 40MB
    │
    └─ System + Buffer: 50MB
```

### Scaling Path

```
Start: 50 users on $5 Micro (512MB) ✅
    │
    ├─ Monitor CPU + RAM via Prometheus
    │
    ├─ At 80% sustained RAM: Upgrade to $8 Small (1GB)
    │
    ├─ At 100+ users (200MB+ footprint): Consider managed PostgreSQL (Lightsail RDS, $15/mo)
    │   Benefit: Separates database from app memory, avoids same-disk competition
    │
    ├─ At 50+ concurrent users: Optimize Socket.IO with Redis adapter + multiple instances
    │   Cost: +$40/mo (extra instances) + Redis cluster
    │
    └─ At 200+ users: Evaluate managed Kubernetes or multi-region failover
        Cost: +$200+/mo, significant complexity increase
```

---

## Patterns to Follow

### Pattern 1: Graceful Shutdown with SIGTERM

**What:** App receives SIGTERM signal (from Docker), stops accepting connections, drains in-flight requests.

**When:** Every deployment, VPS shutdown, app updates.

**Why:** WebSocket connections are stateful. Abrupt termination = dropped games mid-combat = user churn.

**Implementation:**
```typescript
// server/index.ts
const server = app.listen(PORT);
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, starting graceful shutdown...');
  isShuttingDown = true;

  // Stop accepting new connections
  server.close(() => {
    console.log('Server closed to new connections');
  });

  // Drain existing connections for up to 30 seconds
  const gracefulTimeout = setTimeout(() => {
    console.log('Grace period expired, forcing exit');
    process.exit(1);
  }, 30000);

  // Wait for all connections to finish
  await new Promise(resolve => {
    // If using Express, you could wait for pending requests
    // For WebSocket, the server.close() above handles this
    server.once('close', resolve);
  });

  clearTimeout(gracefulTimeout);
  process.exit(0);
});
```

---

### Pattern 2: Health Check as Readiness Probe

**What:** `/api/health` endpoint returns 200 OK if app is healthy and ready for traffic.

**When:** Every 30 seconds (Docker health check), before directing traffic (reverse proxy).

**Why:** Detects app crashes, database disconnections, stuck event loops.

**Implementation:**
```typescript
// server/routes.ts
app.get('/api/health', async (req, res) => {
  try {
    // Check database connectivity
    await db.query('SELECT 1');

    // Check other dependencies (Redis, etc.)
    if (redis) {
      await redis.ping();
    }

    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'unavailable', error: error.message });
  }
});
```

**docker-compose.yml:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s  # Wait 10s after container start before checking
```

---

### Pattern 3: Environment Variable Injection

**What:** Docker uses `.env` file for secrets; app never sees hardcoded values.

**When:** Container startup.

**Why:** Separates configuration from code, enables same image across dev/staging/prod.

**Implementation:**
```yaml
# docker-compose.yml
services:
  app:
    environment:
      DATABASE_URL: ${DATABASE_URL}
      SESSION_SECRET: ${SESSION_SECRET}
      NODE_ENV: production
      REDIS_URL: redis://redis:6379  # Internal network address
```

```bash
# .env file (local only, not in git)
DATABASE_URL=postgresql://scrumquest:password@postgres:5432/scrumquest
SESSION_SECRET=your-secret-key-here
```

```typescript
// server/storage.ts
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL not set');
```

---

### Pattern 4: Automated Backup to Object Storage

**What:** Daily pg_dump to S3, with retention policy.

**When:** Off-peak hours (2am UTC).

**Why:** Protects against ransomware, data corruption, catastrophic hardware failure.

**Implementation:**
```yaml
# docker-compose.yml
services:
  postgres-backup-s3:
    image: eeshugerman/postgres-backup-s3:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_DB: scrumquest
      POSTGRES_USER: scrumquest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      S3_BUCKET: your-backup-bucket
      S3_PREFIX: backups
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      SCHEDULE: "0 2 * * *"  # 2am UTC daily
      BACKUP_KEEP_DAYS: 30   # Auto-delete older than 30 days
```

---

### Pattern 5: Reverse Proxy with TLS Termination

**What:** Nginx (or Nginx Proxy Manager) handles HTTPS, forwards HTTP to app internally.

**When:** Every request.

**Why:** Centralizes certificate management, offloads TLS encryption work, supports multiple domains.

**Implementation (with Nginx Proxy Manager, GUI-based):**
1. Run `docker-compose up -d nginx-proxy-manager`
2. Access GUI at `http://localhost:81`
3. Add proxy host:
   - Domain: `yourdomain.com`
   - Forward to: `http://app:5000`
   - SSL: Let's Encrypt (auto-renew)
   - WebSocket: Enable (required for Socket.IO)

**Alternative (manual Nginx config):**
```nginx
# /etc/nginx/sites-available/default
upstream app {
  server app:5000;
}

server {
  listen 80;
  server_name yourdomain.com;
  return 301 https://$server_name$request_uri;  # Redirect to HTTPS
}

server {
  listen 443 ssl http2;
  server_name yourdomain.com;

  ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

  location / {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";  # Critical for WebSocket
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Multiple Replicas Without Shared State

**What:** Running 2+ app instances without Redis adapter for Socket.IO.

**Why bad:** WebSocket connections tied to single instance. Load balancer routes user to instance A, but broadcasts from instance B are missed. Inconsistent state across replicas.

**Instead:** Single instance for <100 users. When scaling, add Redis adapter for session clustering.

---

### Anti-Pattern 2: Storing Secrets in docker-compose.yml

**What:** `DATABASE_URL=postgresql://...` hardcoded in docker-compose.yml in git.

**Why bad:** Anyone with git access sees production secrets.

**Instead:** Use .env file (not in git) or Docker Secrets (for Swarm).

---

### Anti-Pattern 3: Shared Database + App on Same VPS Without Monitoring Disk

**What:** Database grows unbounded, fills disk, app becomes read-only.

**Why bad:** Silently degraded service. Users can't save progress.

**Instead:** Monitor disk usage, set alerts at 80%, track database size growth. If >50% disk after 1 month, plan migration to managed PostgreSQL.

---

### Anti-Pattern 4: No Health Check

**What:** Docker restarts app based on process exit only. App can hang or deadlock without exiting.

**Why bad:** Users see 502s while app is still "running" in docker ps.

**Instead:** HEALTHCHECK in Dockerfile + health checks in docker-compose.yml. Both required.

---

## Scaling Milestones

| Users | App Size | Changes | Timeline |
|-------|----------|---------|----------|
| **50** | 512MB | Single instance, per ARCHITECTURE.md | Week 0 (current) |
| **100** | 1GB | Upgrade Lightsail to Small, monitor Redis usage | Month 3 |
| **200** | 2GB | Add Redis cluster OR multiple instances with session store | Month 6 |
| **500** | 4GB | Separate managed PostgreSQL (Lightsail RDS), monitor I/O | Month 12 |
| **1K+** | Multi-region | Multi-region failover, CDN, database replication | Year 2+ |

---

**Research completed:** 2026-02-24
**Confidence:** HIGH — Patterns derived from industry best practices and tested on production systems.
