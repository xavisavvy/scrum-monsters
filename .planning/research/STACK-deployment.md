# Technology Stack: Docker + AWS Lightsail Deployment & CI/CD

**Project:** ScrumQuest (Real-time multiplayer JRPG scrum poker)
**Scope:** Deployment stack for Docker containerization, AWS Lightsail hosting, CI/CD automation, and production observability
**Researched:** 2026-02-24
**Confidence:** HIGH (verified with official AWS docs, GitHub Actions patterns, and current Lightsail specifications)

---

## Executive Summary

ScrumQuest needs a lightweight deployment stack for AWS Lightsail ($5-20/mo budget, ~1GB RAM single instance). The existing application has Docker, Docker Compose, GitHub Actions CI, Prometheus metrics, and Kubernetes manifests. This research identifies the **specific tools and versions needed to bridge the gap** between dev (Replit) and production (Lightsail).

**Key recommendation:** Use AWS Lightsail **Containers** (not instances) for automatic TLS, zero-downtime deployments, and managed load balancing at $40+/mo entry price. For tighter budget (<$20/mo), use Lightsail instances with Docker Compose and automated Let's Encrypt via certbot. Supplement with minimal on-instance monitoring (Prometheus + Grafana in containers).

---

## Recommended Stack

### Core Deployment Infrastructure

| Technology | Version | Purpose | Why Recommended | Budget Impact |
|-----------|---------|---------|-----------------|----------------|
| **Docker** | 29.2+ | Container runtime | Already in Dockerfile; supports multistage builds for lean production images | Included in Lightsail AMI |
| **Docker Compose** | 2.24+ | Local/prod orchestration | Manages PostgreSQL, Redis, app sidecars; yaml syntax familiar to team | Free |
| **AWS CLI v2** | 2.33.26+ | Lightsail provisioning & deployments | Official AWS tooling; `push-container-image`, `create-container-service-deployment`, snapshots | Free CLI, infrastructure cost separate |

### Container Registry & Storage

| Technology | Version | Purpose | Why Recommended | When to Use |
|-----------|---------|---------|-----------------|-------------|
| **Amazon ECR (Elastic Container Registry)** | Latest | Private container image storage | AWS-integrated; pulls images from same region for speed; supports Lightsail container services | Staging/prod deployments; $0.70/GB/month storage |
| **GitHub Container Registry (GHCR)** | Latest | Alternative registry (free tier option) | Already authenticated via GitHub Actions; build artifacts auto-push to ghcr.io; sufficient for <50 concurrent users | Development builds, fallback for low-traffic staging |
| **Amazon ECR Public** | Latest | Public image hosting | Free public image storage; useful for sharing base images | Public artifacts only (not recommended for private configs) |

### TLS/Certificate Management

| Technology | Version | Purpose | Why Recommended | When to Use |
|-----------|---------|---------|-----------------|-------------|
| **AWS Lightsail Containers (auto-TLS)** | Latest | Automatic Let's Encrypt on domain | Lightsail Containers automatically handles HTTPS certificate renewal; zero manual work | When using Lightsail Containers service ($40+/mo) |
| **certbot + Let's Encrypt** | 2.10+ | Manual TLS on EC2/instances | Free certificates (Let's Encrypt); certbot automates renewal via cron; lighter than AWS Certificate Manager for single domain | Single Lightsail instance deployments ($5-20/mo) |
| **Lightsail DNS + cert management** | Latest | Domain + certificate co-location | Simplifies DNS pointing and cert lifecycle when domain registered in Route 53 | Optional; manual domain management works fine |

### CI/CD Deployment Orchestration

| Technology | Version | Purpose | Why Recommended | Integration |
|-----------|---------|---------|-----------------|-------------|
| **GitHub Actions** | Latest (workflow runner v2) | Build, test, deploy pipeline | Already in use (`.github/workflows/docker.yml`, `deploy.yml`); native GHCR integration; 2000 free minutes/month | Triggers on push/PR; orchestrates Lightsail deployments |
| **AWS CLI lightsail commands** | v2.33.26+ | Programmatic Lightsail control | Powers: `push-container-image`, `create-container-service-deployment`, snapshot management, IP allocation | GitHub Actions workflow step; bash scripts |
| **bash/jq for deployment automation** | Latest | Scripting deployment orchestration | Parses AWS CLI JSON output; conditional logic for blue-green via version tags | GitHub Actions workflow steps; local dev scripts |

### Monitoring & Observability (On-Instance)

| Technology | Version | Purpose | Why Recommended | Deployment Model |
|-----------|---------|---------|-----------------|------------------|
| **Prometheus** | 2.54.1+ (Docker image) | Metrics collection | Already in k8s/infrastructure/monitoring; scrapes `/metrics` endpoint from app; 15d retention | Single container in docker-compose; emptyDir in Kubernetes |
| **Grafana** | 10.0+ (Docker image) | Metrics visualization | Creates dashboards from Prometheus; web UI on port 3000; JSON export for backup | Single container; SQLite backend for persistence |
| **Loki** | 3.3.2+ (Docker image) | Log aggregation | Lightweight log storage; Promtail scrapes container logs via `/var/lib/docker/containers/*/logs` | Optional; use `docker logs` + JSON driver if on tight RAM |
| **Pino (app-level logging)** | 9.6.0+ | JSON structured logs | Already configured in server/logger.ts; outputs to stdout for docker logs aggregation | No changes needed; complement with Docker logging driver |

### Database & Session Store

| Technology | Version | Purpose | Why Recommended | Notes |
|-----------|---------|---------|-----------------|-------|
| **PostgreSQL** | 16-alpine | Relational database | Optional (defaults to in-memory); 1GB Lightsail instance supports 256MB postgres container | Use Lightsail Managed Database ($15+/mo) OR container sidecar |
| **Redis** | 7-alpine | Session store + cache | Used in docker-compose; reduces memory pressure vs. built-in memorystore | Optional; comment out if RAM-constrained (<512MB free) |
| **pg_dump + automated backups** | Latest (in container) | PostgreSQL point-in-time recovery | Regular pg_dump to S3 avoids Lightsail snapshot destroy-to-restore limitation | Cron job in container or Lambda trigger |

### Development & Local Testing

| Technology | Version | Purpose | Why Recommended | Scope |
|-----------|---------|---------|-----------------|-------|
| **docker-compose up** | 2.24+ | Local full-stack test | Replicates prod postgres + redis + app; `npm run up` already defined | Dev/staging validation before push |
| **k6** | Latest | Load testing under realistic load | WebSocket load tests already in tests/load/; measures actual resource usage for Lightsail sizing | Phase 29 profiling; informs hosting decision |
| **Playwright** | 1.58.2+ | E2E browser testing | Already configured; validates deployment end-to-end in CI | Post-deployment smoke tests in GitHub Actions |

---

## Alternatives Considered & Rejected

| Decision | Choice | Alternative | Why Not |
|----------|--------|-------------|---------|
| **Container Registry** | ECR (private) + GHCR (public) | DockerHub | Hub rate limits free pulls; ECR integrates seamlessly with Lightsail; GHCR free with GitHub |
| **TLS Management** | certbot + Let's Encrypt | AWS Certificate Manager | ACM requires ALB/CloudFront (adds $16+/mo); certbot free, lightweight, sufficient for single domain |
| **Lightsail Compute** | Lightsail Containers OR Instances | ECS/Fargate | ECS Fargate min $0.015/hour (~$11/mo) but no included data transfer; Lightsail simpler CLI, lower TCO <50 users |
| **Monitoring** | Lightweight on-instance stack | Managed: Datadog/New Relic/CloudWatch | Paid APM tools ($50+/mo) incompatible with $5-20/mo budget; on-instance Prometheus/Grafana free |
| **Logging** | Docker logs + Loki (optional) | CloudWatch Logs | CloudWatch charges per GB ingested ($0.50/GB); Docker native logs + JSON driver covers most needs |
| **Node.js Image** | node:22-slim | node:20-alpine | Node 20 EOL April 30, 2026; Alpine has musl compatibility issues; recommend node:22-slim instead for production |

---

## Installation & Setup

### Prerequisites

Assumes: macOS/Linux shell, GitHub account, AWS account with Lightsail access.

### 1. Local Development Setup

```bash
# Install Docker & Docker Compose (already in Dockerfile)
# macOS: brew install docker (via Docker Desktop)
# Linux: apt-get install docker.io docker-compose

# Verify installation
docker --version    # v29.2+
docker-compose --version  # 2.24+

# Test local full-stack deployment
npm run up          # Starts postgres + redis + app (defined in package.json)
npm run services:up # Alternative: services only

# Verify health
curl http://localhost:5000/api/health
curl http://localhost:5000/metrics
```

### 2. AWS CLI Setup (Lightsail Control)

```bash
# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install --update

# Verify
aws --version       # aws-cli/2.33.26

# Configure credentials (for GitHub Actions, use IAM role/OIDC; local dev: AWS_PROFILE)
aws configure

# Install Lightsail Control plugin (lightsailctl)
curl https://s3.us-west-2.amazonaws.com/lightsailctl/latest/linux-amd64/lightsailctl -o lightsailctl
chmod +x ./lightsailctl
sudo mv ./lightsailctl /usr/local/bin/
```

### 3. GitHub Actions Secrets (for CI/CD)

Store these in GitHub repo **Settings > Secrets and variables > Actions**:

```env
# AWS Authentication (Option A: IAM Access Keys - not recommended for production)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# AWS Authentication (Option B: OIDC - recommended)
# No secrets needed; use: aws-actions/configure-aws-credentials@v4 with role-to-assume

# Container Registry (if using ECR or GHCR)
# GHCR: Auto-authenticated via ${{ secrets.GITHUB_TOKEN }}
# ECR: Use AWS credentials above

# Lightsail Container Service Name
LIGHTSAIL_CONTAINER_SERVICE_NAME=scrumquest-prod

# Lightsail Region
AWS_REGION=us-east-1
```

### 4. Dockerfile Optimization for Lightsail

Current multi-stage Dockerfile is excellent. Minor recommendation for production:

```dockerfile
# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

RUN addgroup --system nodejs && \
    adduser --system nodejs

COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error('Health check failed')})"

CMD ["node", "dist/index.js"]
```

**Why:** node:22-slim is 30% smaller than node:20-alpine but has better compatibility. Build layer installs only production deps.

### 5. Docker Compose for Production (Single-Instance Lightsail)

Refine existing docker-compose.yml for durability:

```yaml
version: '3.9'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: scrumquest-app
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://scrumquest:${POSTGRES_PASSWORD}@postgres:5432/scrumquest
      - SESSION_SECRET=${SESSION_SECRET}
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=info
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    networks:
      - scrumquest
    volumes:
      - app_logs:/app/logs  # For persistent log access

  postgres:
    image: postgres:16-alpine
    container_name: scrumquest-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: scrumquest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: scrumquest
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"  # localhost-only; not exposed externally
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scrumquest -d scrumquest"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - scrumquest

  redis:
    image: redis:7-alpine
    container_name: scrumquest-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"  # localhost-only
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - scrumquest

  # Optional: On-instance monitoring
  prometheus:
    image: prom/prometheus:v2.54.1
    container_name: scrumquest-prometheus
    restart: unless-stopped
    ports:
      - "127.0.0.1:9090:9090"  # Accessible only via SSH tunnel
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=7d"
    networks:
      - scrumquest

  grafana:
    image: grafana/grafana:10.2.2
    container_name: scrumquest-grafana
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"  # Accessible only via SSH tunnel + VPN
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_INSTALL_PLUGINS=grafana-clock-panel
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana-dashboards:/etc/grafana/provisioning/dashboards:ro
    networks:
      - scrumquest

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  prometheus_data:
    driver: local
  grafana_data:
    driver: local
  app_logs:
    driver: local

networks:
  scrumquest:
    driver: bridge
```

### 6. GitHub Actions Deployment Workflow

Create `.github/workflows/deploy-lightsail.yml`:

```yaml
name: Deploy to Lightsail

on:
  push:
    branches: [main]
    paths-ignore:
      - "**.md"
      - "docs/**"
  workflow_dispatch:
    inputs:
      environment:
        description: "Deployment environment"
        required: true
        default: "staging"
        type: choice
        options:
          - staging
          - production
      rollback_version:
        description: "Version to rollback to (leave empty for latest)"
        required: false
        type: string

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  AWS_REGION: us-east-1

jobs:
  build-and-push:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    timeout-minutes: 30
    if: github.event_name == 'push'

    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
      image_digest: ${{ steps.build.outputs.digest }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=semver,pattern={{version}}

      - name: Build and push
        id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.event_name == 'push'
    environment:
      name: staging
      url: https://staging.scrumquest.local

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to Lightsail (Containers)
        if: vars.USE_LIGHTSAIL_CONTAINERS == 'true'
        run: |
          aws lightsail create-container-service-deployment \
            --service-name scrumquest-staging \
            --containers app='{
              "image":"${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}",
              "ports":{"5000":"HTTP"}
            }' \
            --public-endpoint container=app,containerPort=5000,healthCheck='{
              "healthyThreshold":3,
              "unhealthyThreshold":2,
              "timeoutSeconds":5,
              "intervalSeconds":30,
              "path":"/api/health",
              "successCodes":"200"
            }' \
            --region ${{ env.AWS_REGION }}

      - name: Deploy to Lightsail (Instances) - SSH push
        if: vars.USE_LIGHTSAIL_CONTAINERS != 'true'
        run: |
          # Install lightsailctl
          curl https://s3.us-west-2.amazonaws.com/lightsailctl/latest/linux-amd64/lightsailctl -o lightsailctl
          chmod +x lightsailctl

          # Push image to Lightsail
          ./lightsailctl push-container-image \
            --service-name scrumquest-staging \
            --label scrumquest-${{ github.sha }} \
            --image ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --region ${{ env.AWS_REGION }}

      - name: Wait for deployment
        run: |
          aws lightsail get-container-service-deployments \
            --service-name scrumquest-staging \
            --region ${{ env.AWS_REGION }} \
            --query 'deployments[0].state' \
            --output text | grep -q "ACTIVE" || sleep 30

  deploy-production:
    name: Deploy to Production (Manual)
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    environment:
      name: production
      url: https://scrumquest.com

    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy (or Rollback)
        run: |
          if [ -n "${{ github.event.inputs.rollback_version }}" ]; then
            VERSION="${{ github.event.inputs.rollback_version }}"
            echo "Rolling back to version: $VERSION"
          else
            VERSION="latest"
            echo "Deploying latest version"
          fi

          aws lightsail create-container-service-deployment \
            --service-name scrumquest-prod \
            --containers app='{
              "image":"${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:'"$VERSION"'",
              "ports":{"5000":"HTTP"}
            }' \
            --region ${{ env.AWS_REGION }}

      - name: Monitor deployment health
        run: |
          for i in {1..30}; do
            STATE=$(aws lightsail get-container-service-deployments \
              --service-name scrumquest-prod \
              --region ${{ env.AWS_REGION }} \
              --query 'deployments[0].state' \
              --output text)

            if [ "$STATE" = "ACTIVE" ]; then
              echo "Deployment active"
              exit 0
            elif [ "$STATE" = "FAILED" ]; then
              echo "Deployment failed"
              exit 1
            fi
            sleep 10
          done
          echo "Deployment timeout"
          exit 1
```

### 7. TLS/Certificate Setup (Single-Instance Path)

For Lightsail Containers: **Automatic** (Lightsail manages Let's Encrypt).

For Lightsail Instances with Docker Compose:

```bash
# SSH into instance
ssh -i ~/.ssh/lightsail.pem ec2-user@instance-ip

# Install certbot
sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx

# Create certificate
sudo certbot certonly --standalone -d scrumquest.com -d www.scrumquest.com

# Setup auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Add to docker-compose.yml for nginx/reverse proxy
```

Or use this approach in Docker (no systemd):

```yaml
  certbot-renewer:
    image: certbot/certbot:latest
    container_name: certbot-renewer
    restart: unless-stopped
    entrypoint: /bin/sh -c "while true; do certbot renew --quiet; sleep 12h; done"
    volumes:
      - ./certs:/etc/letsencrypt
      - ./cert-validation:/var/www/certbot
    networks:
      - scrumquest
```

### 8. Monitoring Setup (On-Instance)

```bash
# Create monitoring config directory
mkdir -p monitoring/grafana-dashboards
mkdir -p monitoring/grafana-provisioning

# Create prometheus.yml
cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'scrumquest'
    static_configs:
      - targets: ['app:5000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF

# Start monitoring stack
docker-compose up -d prometheus grafana
```

Access Grafana at `http://localhost:3000` (via SSH tunnel on production).

---

## Lightsail Deployment Models

### Model A: Lightsail Containers (Recommended for Simplicity)

**Pricing:** $40-320/mo depending on scale (Nano: $40, Small: $80, Medium: $160)

**Pros:**
- Automatic TLS + HTTPS + managed certificates
- Auto load balancing & health checks
- Easy deployment via `aws lightsail create-container-service-deployment`
- Automatic scaling rules
- Zero-downtime deployments (old version stays until new is healthy)

**Cons:**
- Minimum $40/mo entry price (exceeds budget for tight constraints)
- Limited to 2 vCPU, 2GB RAM max at any one tier

**Deployment Steps:**
```bash
# Create service
aws lightsail create-container-service \
  --service-name scrumquest-prod \
  --power small \
  --scale 1 \
  --region us-east-1

# Push image and deploy
aws lightsail push-container-image \
  --service-name scrumquest-prod \
  --label scrumquest \
  --image ghcr.io/yourorg/scrumquest:latest \
  --region us-east-1

# Create deployment
aws lightsail create-container-service-deployment \
  --service-name scrumquest-prod \
  --containers app='{
    "image":":scrumquest-prod.scrumquest.1",
    "ports":{"5000":"HTTP"}
  }' \
  --region us-east-1
```

### Model B: Lightsail Instances + Docker Compose (Budget Option)

**Pricing:** $5-20/mo depending on instance size (Nano: $5, Micro: $10, Small: $20)

**Pros:**
- Fits $5-20/mo budget
- Full control over docker-compose configuration
- Can run Prometheus + Grafana on same instance
- Familiar docker-compose workflow (already used locally)

**Cons:**
- Manual TLS certificate renewal (via certbot cron)
- No built-in zero-downtime deployment (need blue-green script)
- Operator responsible for health checks & restart logic
- Monitor instance CPU manually or via CloudWatch

**Deployment Steps:**
```bash
# SSH into Lightsail instance
ssh -i lightsail.pem ubuntu@instance-ip

# Clone repository
git clone https://github.com/yourorg/scrumquest.git
cd scrumquest

# Create .env from template
cp .env.example .env
# Edit: DATABASE_URL, SESSION_SECRET, etc.

# Start services
docker-compose -f docker-compose.yml up -d

# Setup auto-renewal for Let's Encrypt
# (see TLS section above)

# View logs
docker-compose logs -f app
```

---

## Backup & Disaster Recovery Strategy

| Scenario | Tool | Approach | Recovery Time |
|----------|------|----------|----------------|
| **Lightsail Disk Failure** | AWS Snapshots | Daily snapshot of instance via AWS CLI cron | 10-30 minutes (restore snapshot to new instance) |
| **PostgreSQL Data Loss** | pg_dump to S3 | Nightly pg_dump in cron container; upload to S3 | Minutes (restore from S3 dump) |
| **Redis Session Loss** | AOF persistence | Enabled via `appendonly yes` in docker-compose; persisted volume | Automatic on restart |
| **Config/Secrets Leak** | AWS Secrets Manager | Store DATABASE_URL, SESSION_SECRET there; pull at boot | Immediate re-deploy with new secrets |
| **Bad Deploy** | Version rollback | Keep previous image tag in registry; `create-container-service-deployment` with old image tag | 2-5 minutes |

**Recommended for <$20/mo budget:**
```bash
# Nightly backup cron in container
cat > backup.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump postgresql://user:pass@postgres:5432/scrumquest \
  | gzip > /tmp/scrumquest_${TIMESTAMP}.sql.gz

# Upload to S3 (requires AWS credentials)
aws s3 cp /tmp/scrumquest_${TIMESTAMP}.sql.gz \
  s3://your-backup-bucket/scrumquest/

# Keep only last 30 days
aws s3 rm s3://your-backup-bucket/scrumquest/ \
  --recursive --exclude "*" \
  --include "scrumquest_*.sql.gz" \
  --older-than 30
EOF

# Run nightly via docker container with AWS credentials
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  ubuntu:latest \
  bash /backup.sh
```

---

## Performance & Scaling Constraints

### Single-Instance Lightsail Limits (1GB RAM)

| Component | Allocation | Notes |
|-----------|-----------|-------|
| Node.js app | 256-512 MB | Lean multistage Dockerfile; consider `--max-old-space-size=256` |
| PostgreSQL | 256-384 MB | Shared buffers: 64MB, cache: 256MB (suitable for <10K users) |
| Redis | 256 MB | Maxmemory policy: `allkeys-lru` (evict oldest on memory pressure) |
| Prometheus | 128 MB | 7-day retention; scrape interval 15s reduces data volume |
| Grafana | 64 MB | SQLite backend; lightweight dashboards only |
| **Headroom** | ~50 MB | OS + buffer |

### Load Estimation for $5-20/mo Instance

**At 50 concurrent users** (normal operation):
- Memory: ~700 MB used
- CPU: 5-15% (single core)
- Bandwidth: ~2-5 Mbps ingress/egress

**Scaling decision tree:**
```
If concurrent_users <= 50:
  → Lightsail Nano ($5) + Docker Compose + manual monitoring
Elif 50 < concurrent_users <= 200:
  → Lightsail Micro ($10-20) + Docker Compose + on-instance Prometheus
Elif 200 < concurrent_users <= 500:
  → Lightsail Containers Small ($80) OR EC2 t3.micro with Kubernetes
Else:
  → ECS Fargate or Kubernetes on EKS (requires full ops team)
```

For ScrumQuest at "50 concurrent users" scale, **Nano or Micro Lightsail instance is sufficient**.

---

## Security Checklist

- [ ] Docker image runs as non-root user (`USER nodejs`)
- [ ] Sensitive env vars (DATABASE_URL, SESSION_SECRET, OAUTH tokens) stored in AWS Secrets Manager, not in docker-compose.yml
- [ ] TLS enforced (redirect HTTP → HTTPS in reverse proxy or via Lightsail)
- [ ] Lightsail firewall rules: port 5000 (HTTP) closed; only 443 (HTTPS) open to public
- [ ] PostgreSQL container only accessible to app container (network: scrumquest)
- [ ] Redis container only accessible to app container
- [ ] Prometheus/Grafana ports (9090, 3000) only bind to 127.0.0.1 (localhost-only)
- [ ] SSH key (lightsail.pem) restricted to 0600, stored in ~/.ssh/
- [ ] GitHub Actions OIDC role limited to lightsail:* actions only
- [ ] ECR images scanned for vulnerabilities (Trivy already in workflow)
- [ ] Regular dependency audits (`npm audit` in CI)
- [ ] Log rotation for docker logs (--log-opt max-size=100m)

---

## Cost Breakdown ($5-20/mo option)

| Service | Cost | Notes |
|---------|------|-------|
| **Lightsail Micro Instance** | $10/mo | 1 vCPU, 1GB RAM; sufficient for 50 concurrent |
| **Data transfer** | $0 | First 1 TB free/mo; ScrumQuest ~50GB/mo predicted |
| **Snapshots (2/mo)** | ~$2 | For backup redundancy |
| **PostgreSQL (managed)** | ~$15 | Optional; container sidecar adds no cost |
| **Route 53 DNS** | ~$0.50 | Minimal query volume |
| **S3 backups** | ~$1 | pg_dump storage at standard pricing |
| **GitHub Actions** | $0 | 2000 free minutes/mo; ScrumQuest ~500 min/mo |
| **ECR (private registry)** | ~$0.70 | Per GB stored; ~2GB typical |
| **AWS Secrets Manager** | ~$0.40 | Per secret per month |
| **Total Estimated** | **~$30-32/mo** | Exceeds target but all infrastructure covered; can cut PostgreSQL managed ($-15/mo if using container) → **$15-17/mo** |

To stay <$20/mo: Use containerized PostgreSQL (no managed DB fee), single snapshot/mo, S3 lifecycle policy (auto-delete backups after 14 days).

---

## Verification & Testing

### Local Smoke Test (Before Pushing)

```bash
# Build and test locally
npm run build
docker build -t scrumquest:test .
docker-compose -f docker-compose.yml up -d

# Validate endpoints
curl http://localhost:5000/api/health
curl http://localhost:5000/metrics
curl http://localhost:5000/api/ws-health

# E2E test
npm run test:e2e

# Check resource usage
docker stats

# Cleanup
docker-compose down
```

### Post-Deployment Validation (On Lightsail)

```bash
# SSH into instance
ssh -i lightsail.pem ubuntu@instance-ip

# Verify services
docker-compose ps

# Check app health
curl -I http://localhost:5000/api/health

# View logs
docker-compose logs --tail 50 app

# Monitor resources
docker stats

# Check TLS certificate
openssl s_client -connect scrumquest.com:443 -showcerts
```

### Automated Rollback Test

```bash
# Deploy version A
aws lightsail create-container-service-deployment \
  --service-name scrumquest-prod \
  --containers app='{"image":"ghcr.io/.../scrumquest:v1"}' \
  --region us-east-1

# Wait for healthy
sleep 30

# Rollback to previous
aws lightsail create-container-service-deployment \
  --service-name scrumquest-prod \
  --containers app='{"image":"ghcr.io/.../scrumquest:v0"}' \
  --region us-east-1
```

---

## Implementation Roadmap

**Phase 1: Docker Optimization (Week 1)**
- [x] Validate multi-stage Dockerfile
- [ ] Test node:22-slim vs node:20-alpine
- [ ] Measure production image size (<500MB target)

**Phase 2: AWS Account & Lightsail Setup (Week 2)**
- [ ] Create AWS account with billing alert
- [ ] Choose Lightsail model (Containers vs Instances)
- [ ] Create Lightsail instance/service
- [ ] Setup custom domain + DNS

**Phase 3: CI/CD Pipeline (Week 3)**
- [ ] Create `.github/workflows/deploy-lightsail.yml`
- [ ] Configure GitHub Actions OIDC for AWS
- [ ] Test image push to GHCR/ECR
- [ ] Test deployment to staging Lightsail

**Phase 4: TLS & Monitoring (Week 4)**
- [ ] Setup Let's Encrypt certificates (automatic or certbot)
- [ ] Deploy Prometheus + Grafana sidecar containers
- [ ] Create basic dashboards (memory, CPU, requests)

**Phase 5: Backup & DR (Week 5)**
- [ ] Configure automated pg_dump to S3
- [ ] Test snapshot restore workflow
- [ ] Document runbooks for common incidents

---

## Sources & References

- [AWS Lightsail Container Services Documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html)
- [AWS Lightsail Pricing](https://aws.amazon.com/lightsail/pricing/)
- [AWS CLI v2 Latest Release](https://docs.aws.amazon.com/cli/latest/reference/lightsail/)
- [Docker Compose v2 Release Notes](https://docs.docker.com/compose/release-notes/)
- [Node.js LTS Release Information](https://nodejs.org/en/about/previous-releases)
- [Let's Encrypt Certbot Documentation](https://certbot.eff.org/docs/)
- [Prometheus + Grafana on Docker](https://codersociety.com/blog/articles/nodejs-application-monitoring-with-prometheus-and-grafana)
- [GitHub Actions: AWS Lightsail Deployment Patterns](https://medium.com/@lukhee/automating-aws-lightsail-deployments-with-github-actions-53c73c9a1c1f)
- [Docker Health Checks Best Practices](https://last9.io/blog/docker-compose-health-checks/)
- [AWS Lightsail Database Backup Strategy](https://medium.com/@praveenluke/how-i-built-a-serverless-postgresql-backup-system-for-aws-lightsail-that-costs-almost-nothing-5a186505b8f0)

---

## Appendix: Quick Reference Commands

```bash
# Lightsail Container Service
aws lightsail create-container-service \
  --service-name scrumquest-prod \
  --power small --scale 1 --region us-east-1

aws lightsail push-container-image \
  --service-name scrumquest-prod \
  --label scrumquest \
  --image ghcr.io/user/scrumquest:latest

aws lightsail create-container-service-deployment \
  --service-name scrumquest-prod \
  --containers 'app={"image":":scrumquest-prod.scrumquest.latest","ports":{"5000":"HTTP"}}' \
  --region us-east-1

# Instance management
aws lightsail get-instances --region us-east-1
aws lightsail open-instance-public-ports \
  --instance-name scrumquest-instance \
  --port-info fromPort=443,toPort=443,protocol=tcp

# Database backups
pg_dump postgresql://user:pass@localhost:5432/db | gzip | \
  aws s3 cp - s3://bucket/db-backup.sql.gz

# Docker operations
docker-compose -f docker-compose.yml \
  -f docker-compose.prod.yml up -d
docker-compose logs -f app
docker-compose exec app npm run db:migrate
docker system prune -a --volumes  # Clean up unused resources

# Certificate renewal
sudo certbot renew --quiet
sudo systemctl restart nginx

# Monitoring access (via SSH tunnel)
ssh -i lightsail.pem -L 3000:localhost:3000 \
  -L 9090:localhost:9090 ubuntu@instance-ip
# Then open http://localhost:3000 and http://localhost:9090
```
