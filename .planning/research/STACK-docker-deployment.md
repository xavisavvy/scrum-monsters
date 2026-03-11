# Technology Stack: Docker Deployment to Single VPS

**Project:** ScrumQuest
**Researched:** 2026-02-24
**Scale:** 50-100 concurrent users, single VPS instance
**Budget:** $5-20/month

---

## Recommended Stack

### Infrastructure & Deployment

| Technology | Version | Purpose | Why | Trade-offs |
|-----------|---------|---------|-----|-----------|
| **AWS Lightsail** | Current | VPS hosting ($5-8/mo for 512MB micro) | Simplest managed VPS alternative, includes networking + security groups, static IP, easy scaling | Limited to AWS, no multi-cloud portability. Disk + RAM tied to instance (can't scale independently like managed DB) |
| **Docker** | 20.x+ | Containerization, reproducible deployments | Industry standard, excellent tooling, integrated with Lightsail | Slight overhead vs. bare metal, requires daemon management |
| **Docker Compose** | 2.x+ | Single-VPS orchestration | Simple configuration, no cluster complexity, perfect for <100 users | Not suitable for multi-server; use Kubernetes if scaling beyond single VPS |
| **Systemd** | Built-in to Linux | Auto-restart Docker Compose on VPS reboot | Standard OS service manager, reliable, no extra dependencies | Requires systemd service file (manual configuration) |

### Reverse Proxy & TLS

| Technology | Version | Purpose | Why | Trade-offs |
|-----------|---------|---------|-----|-----------|
| **Nginx Proxy Manager** | 2.10+ | Reverse proxy, TLS termination, Let's Encrypt automation | GUI-based (no config needed), auto-renews certificates, handles WebSocket upgrade headers | Heavier than plain Nginx, requires extra container (40MB RAM) |
| **Let's Encrypt** | Current | Free TLS certificates | Industry standard, auto-renewal, widely trusted | Requires valid domain + open ports 80/443 for ACME challenges |
| **Alternative: Nginx** | 1.24+ | Manual reverse proxy config | Lighter weight, full control | Requires manual certificate management (Certbot) and config debugging |

### Database & Storage

| Technology | Version | Purpose | Why | Trade-offs |
|-----------|---------|---------|-----|-----------|
| **PostgreSQL** | 16 | Primary database (sessions, user data, game history) | Mature, ACID compliant, great JSON support (sessions), proven at scale | On same VPS = single point of failure for disk. Solution: Managed RDS ($15+/mo) or accept risk with backups |
| **PostgreSQL (named volumes)** | Via Docker | Data persistence | Docker volumes are reliable, survive container restarts | Tied to single VPS. Multi-region requires manual replication |
| **Redis 7** | 7.x | Session clustering (optional), caching | Fast in-memory store, well-integrated with Express session middleware | Adds complexity if not needed at <100 users. Optional (use PostgreSQL session store for MVP) |
| **postgres-backup-s3** | Latest | Automated daily backups to S3 | Community-maintained, zero-config (set env vars), auto-rotate old backups | Community package (not official), requires S3 bucket + AWS credentials |
| **AWS S3** | Standard | Backup storage, offsite durability | Durable, cheap ($0.023/GB/mo), geographic redundancy | Requires AWS account + IAM setup |

### Monitoring & Observability

| Technology | Version | Purpose | Why | Trade-offs |
|-----------|---------|---------|-----|-----------|
| **Prometheus** | 2.x | Metrics collection, time-series database | Open-source, battle-tested, excellent for Node.js + Socket.IO | Requires scrape configuration, storage management |
| **prom-client** | 15.x | Node.js Prometheus exporter | Already installed in ScrumQuest, exports standard metrics | Minimal overhead, mature library |
| **socket.io-prometheus** | 0.x | Socket.IO-specific metrics | Captures connection count, room statistics | Optional but highly recommended for observability |
| **Dozzle** | Latest | Real-time Docker logs UI | Lightweight (40MB), zero-config, shows live container logs | Simpler than Loki, no log aggregation across containers |
| **Healthchecks.io** | Current | Uptime monitoring + alerts | Free tier sufficient for 1 service, email alerts on downtime | Limited to simple HTTP checks, not suitable for complex health logic |
| **Alternative: Prometheus AlertManager** | 0.x | Advanced alerting with rules | More powerful than Healthchecks.io, email + webhook support | Requires configuration, more complex setup |

### Application Layer (Existing)

| Technology | Version | Purpose | Current Status |
|-----------|---------|---------|-----------------|
| **Node.js** | 20.x | Runtime | Already running, optimized for WebSocket workloads |
| **Express** | 4.x | HTTP server framework | Stable, widely used, well-documented |
| **Socket.IO** | 4.x | WebSocket framework | Real-time game updates, excellent browser compatibility |
| **React** | 18.x | Client UI | Vite build tooling already integrated |
| **Drizzle ORM** | Latest | Type-safe database queries | PostgreSQL-compatible, migrations via Drizzle Kit |
| **Pino** | 8.x+ | Structured logging | JSON logs, excellent for production troubleshooting |
| **connect-pg-simple** | Latest | PostgreSQL session store | Already installed, persists sessions across app restarts |

---

## Alternative Technologies Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **VPS Provider** | AWS Lightsail | DigitalOcean, Linode, Hetzner | Lightsail integrates with AWS ecosystem (S3, IAM). Alternatives equally good for single VPS. |
| **Reverse Proxy** | Nginx Proxy Manager | Traefik | Traefik auto-discovers containers, but Nginx Proxy Manager is simpler for single-VPS (GUI, Let's Encrypt built-in). |
| **Reverse Proxy (alt)** | Nginx Proxy Manager | Caddy | Caddy auto-renews certs, but less documentation for Docker Compose. Nginx more battle-tested. |
| **Database** | PostgreSQL | MySQL 8 | PostgreSQL better for JSON (sessions), stronger consistency guarantees. MySQL also viable. |
| **Backups** | postgres-backup-s3 | Manual pg_dump cron | Automated sidecar eliminates human error. Manual cron forgotten after first month. |
| **Backup Storage** | AWS S3 | Local filesystem | S3 is offsite (survives VPS failure). Local filesystem only protects against app errors, not hardware failure. |
| **Monitoring (logs)** | Dozzle | Loki + Promtail | Loki is powerful but requires more setup. Dozzle is zero-config for single VPS. |
| **Monitoring (metrics)** | Prometheus | Datadog, New Relic | Datadog/NR cost $30+/mo. Prometheus free, self-hosted. |
| **Uptime alerts** | Healthchecks.io | Prometheus AlertManager | Healthchecks.io simpler (GUI, email alerts). AlertManager requires config. |
| **Process manager (optional)** | Systemd | PM2 | Systemd is OS-native, no extra dependencies. PM2 adds value for multi-process Node.js (not needed here). |
| **Container orchestration** | Docker Compose | Kubernetes | Compose perfect for <100 users. K8s 10x complexity, unnecessary at this scale. |

---

## Installation & Configuration

### Prerequisites

```bash
# On Lightsail VPS (Ubuntu 22.04 or similar):

# 1. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu  # Add user to docker group

# 2. Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. Verify installation
docker --version
docker-compose --version
```

### Core Deployment

```bash
# Clone ScrumQuest repository
git clone https://github.com/yourorg/scrummonsters.git
cd scrummonsters

# Create environment file (from .env.example)
cp .env.example .env

# Edit .env with production values:
# DATABASE_URL=postgresql://scrumquest:YOUR_PASSWORD@postgres:5432/scrumquest
# SESSION_SECRET=generate-with: openssl rand -base64 32
# AWS_ACCESS_KEY_ID=your-s3-key
# AWS_SECRET_ACCESS_KEY=your-s3-secret

# Build and start all services
docker-compose up -d

# Verify all services healthy
docker-compose ps  # All should show (healthy) or (running)

# Initialize database schema
docker-compose exec app npm run db:push
```

### Environment Variables (.env)

```bash
# .env (local only, not in git)

# Database
DATABASE_URL=postgresql://scrumquest:YOUR_PASSWORD@postgres:5432/scrumquest
POSTGRES_PASSWORD=YOUR_PASSWORD

# Session
SESSION_SECRET=generate-with: openssl rand -base64 32

# S3 Backups
S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-iam-key
AWS_SECRET_ACCESS_KEY=your-iam-secret

# Nginx Proxy Manager Database
NPM_DB_PASSWORD=your-npm-password

# Optional: OAuth (if enabling social login)
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-secret
# GITHUB_CLIENT_ID=your-github-client-id
# GITHUB_CLIENT_SECRET=your-github-secret
```

### Systemd Service (Auto-start on VPS Reboot)

```ini
# /etc/systemd/system/scrumquest-docker.service
[Unit]
Description=ScrumQuest Docker Compose Application
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/scrummonsters
ExecStart=/usr/bin/docker-compose -f docker-compose.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.yml down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Installation:**
```bash
# Copy service file
sudo cp scrumquest-docker.service /etc/systemd/system/

# Enable auto-start
sudo systemctl daemon-reload
sudo systemctl enable scrumquest-docker.service
sudo systemctl start scrumquest-docker.service

# Verify
sudo systemctl status scrumquest-docker.service
```

### Nginx Proxy Manager Setup (via GUI)

```
1. Access Nginx Proxy Manager GUI:
   http://<lightsail-ip>:81

2. Login with default credentials:
   Email: admin@example.com
   Password: changeme

3. Add Proxy Host:
   - Domain: yourdomain.com
   - Scheme: http
   - Forward Hostname: app
   - Forward Port: 5000
   - Enable SSL: Let's Encrypt
   - Force HTTPS: Yes
   - HTTP/2 Support: Yes
   - WebSocket Support: Yes

4. Configure DNS:
   - Route53 / Lightsail DNS → Point yourdomain.com to Lightsail public IP
   - Wait for ACME challenge (port 80 must be open)

5. Verify:
   curl https://yourdomain.com/api/health
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'scrumquest-app'
    static_configs:
      - targets: ['app:5000']
    metrics_path: '/metrics'

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

---

## Version Management

| Component | Current | Stability | EOL | Recommendation |
|-----------|---------|-----------|-----|-----------------|
| **Node.js** | 20.x | LTS | April 2026 | Upgrade to 22.x in Q4 2025 |
| **PostgreSQL** | 16 | Stable | Oct 2028 | Safe for production |
| **Redis** | 7.x | Stable | Dec 2028 | Safe for production |
| **Docker** | 26.x | Current | 2-3 years | Update regularly (security patches) |
| **Docker Compose** | 2.25+ | Current | N/A | Update regularly |

---

## Troubleshooting Common Issues

### "Can't connect to database"
```bash
# Check database is running and healthy
docker-compose ps postgres  # Should show (healthy)

# Check connection string
docker-compose exec app echo $DATABASE_URL

# Test connection manually
docker-compose exec app psql $DATABASE_URL -c "SELECT 1"
```

### "WebSocket connection fails"
```bash
# Verify Nginx is forwarding WebSocket headers
curl -I -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  https://yourdomain.com/socket.io/

# Check app is receiving WebSocket upgrade
docker-compose logs app | grep -i websocket

# If using Nginx Proxy Manager, ensure "WebSocket Support" enabled in GUI
```

### "Backups not created"
```bash
# Check postgres-backup-s3 logs
docker-compose logs postgres-backup-s3

# Verify S3 credentials
docker-compose exec postgres-backup-s3 env | grep AWS

# Check S3 bucket exists and is accessible
aws s3 ls s3://your-bucket-name --region us-east-1
```

### "Disk filling up"
```bash
# Check disk usage
docker exec app df -h

# Identify large items
docker exec postgres du -sh /var/lib/postgresql/data/*

# Set up log rotation if not already done
docker-compose logs app --tail 1000 | wc -l
```

---

## Dependency Graph

```
AWS Lightsail (infrastructure)
    └─ Docker Engine + Docker Compose
        ├─ ScrumQuest App (Node.js 20)
        │   ├─ Express (HTTP)
        │   ├─ Socket.IO (WebSocket)
        │   └─ Drizzle ORM (database access)
        ├─ PostgreSQL 16 (persistent storage)
        │   └─ postgres_data volume
        ├─ Redis 7 (optional session clustering)
        │   └─ redis_data volume
        ├─ Nginx Proxy Manager (TLS + reverse proxy)
        │   ├─ Let's Encrypt (free certificates)
        │   └─ npm-db (MariaDB for Nginx config storage)
        ├─ postgres-backup-s3 (automated backups)
        │   └─ AWS S3 (backup storage)
        ├─ Prometheus (metrics collection)
        │   └─ prom-client library (in app)
        └─ Dozzle (log viewer)

DNS:
    └─ Route53 / Lightsail DNS
        └─ yourdomain.com → Lightsail public IP
```

---

## Performance Baseline (Single VPS, 50 Users)

| Metric | Baseline | Threshold | Notes |
|--------|----------|-----------|-------|
| **RAM Usage** | 150-200MB | Alert at 80% (400MB on 512MB instance) | Upgrade instance if sustained >80% |
| **CPU Usage** | <10% | Alert at 60% sustained | Upgrade instance or optimize code if sustained >60% |
| **Database Connections** | 5-10 | Max 20 (instance limit) | Monitor with `SELECT count(*) FROM pg_stat_activity` |
| **WebSocket Connections** | <50 | Practical limit ~200 per instance | Socket.IO is efficient, CPU-bound not I/O-bound |
| **HTTP Response Time (p50)** | <100ms | Alert if >200ms | Indicates slow database or CPU saturation |
| **HTTP Response Time (p99)** | <500ms | Alert if >1000ms | Tail latency from garbage collection or spike |
| **Database Query Time** | <50ms (avg) | Alert if >200ms avg | Indicates missing indexes or data bloat |
| **Disk Usage** | <40GB total | Alert at 80% (32GB on 40GB instance) | Track database + logs + backups |

---

## Cost Breakdown

```
Monthly Costs (Estimate for 50 users):

Fixed Costs:
  Lightsail instance (512MB): $5/mo
  Domain registration: ~$1/mo (amortized from annual)
  ──────────────────────────────
  Subtotal: $6/mo

Variable Costs:
  S3 storage (backups): ~$1/mo (5-10GB at $0.023/GB)
  S3 data transfer (if using): ~$0.10/GB
  ──────────────────────────────
  Subtotal: ~$1-2/mo

Total: $7-8/mo (vs. $20/mo Replit)
Savings: ~$12-13/mo

Optional Upgrades:
  + Lightsail managed PostgreSQL: +$15/mo (separates database, safer)
  + Lightsail load balancer: +$10/mo (for zero-downtime deploys)
  + AWS CloudWatch monitoring: +$5-10/mo (if monitoring heavy)
  + Grafana Cloud: +$0-50/mo (depending on features)

Recommended: Base stack only ($7-8/mo) for MVP. Add managed PostgreSQL ($15/mo) if budget allows (total $22-23/mo, still cheaper than current Replit).
```

---

**Research completed:** 2026-02-24
**Confidence:** HIGH — All technologies verified with official documentation, current versions, and 2026 ecosystem status.

Next steps: Follow FEATURES.md for implementation phases, ARCHITECTURE.md for system design, PITFALLS.md for risks to prevent.
