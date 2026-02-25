# Phase 32: Infrastructure Foundation - Research

**Researched:** 2026-02-24
**Domain:** AWS Lightsail VPS provisioning, Docker Compose production stack, Nginx Proxy Manager TLS, Route 53 DNS, systemd service management
**Confidence:** HIGH (stack is mature and well-documented; all key findings verified against official sources)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Custom domain setup**
- Domain: scrummonsters.com (root domain, no subdomain)
- Registrar/DNS: AWS Route 53 — A record pointing to Lightsail static IP
- No www redirect needed — root domain only
- Let's Encrypt TLS via Nginx Proxy Manager

**Replit coexistence**
- Phase out Replit entirely — no fallback, no dual-environment
- Strip all Replit config immediately in Phase 32 (.replit, replit.nix, any Replit-specific files)
- No data to migrate from Replit — clean start on Lightsail
- Researcher should check codebase for any Replit-specific code paths (environment detection, Replit auth, Replit DB references) and flag them for removal

**Database setup**
- PostgreSQL required in production — app should fail to start without DATABASE_URL (no in-memory fallback on Lightsail)
- Fresh database, no data migration
- In-memory fallback can remain for local development only

**Manual deploy process**
- SSH + git pull for Phase 32 (before CI/CD in Phase 34)
- Generate a new SSH key pair for Lightsail access
- Provide both a deploy.sh script and a written runbook
  - deploy.sh: one-command deploy (SSH in, pull, rebuild containers)
  - Runbook: step-by-step explanation of what the script does

### Claude's Discretion
- Database schema initialization approach (Drizzle push vs migration files)
- PostgreSQL data volume strategy (Docker named volumes vs bind mount — consider Phase 33 backup needs)
- PostgreSQL version (pick current stable)
- Lightsail region (pick based on cost/latency tradeoffs)

### Deferred Ideas (OUT OF SCOPE)
- App-wide rename from ScrumQuest to ScrumMonsters — branding/code rename across the entire codebase. Captures: all UI text, page titles, component names, README, package.json name, etc. Should be its own phase or added to backlog.
</user_constraints>

---

## Summary

ScrumMonsters needs to move from Replit to an AWS Lightsail $5/mo instance (1 GB RAM, 1 vCPU, 40 GB SSD, 2 TB transfer) running a three-container Docker Compose stack: the app itself, PostgreSQL 17, and Nginx Proxy Manager. Nginx Proxy Manager handles TLS termination via Let's Encrypt and proxies port 443 to the app on port 5000. A systemd unit wraps `docker compose up` so the stack restarts automatically on VPS reboot. DNS is handled by AWS Route 53 with a single A record at the apex pointing to the Lightsail static IP.

The codebase audit found extensive Replit-specific code scattered across five files: `server/index.ts`, `server/websocket.ts`, `server/auth/passport.ts`, `client/src/lib/stores/useWebSocket.tsx`, plus `vite.config.ts` (which imports `@replit/vite-plugin-runtime-error-modal`). All of these must be cleaned up as part of Phase 32. The app's env validation (`server/config/env.ts`) currently only warns when DATABASE_URL is missing in production — it must be hardened to fail fast instead. Redis is already optional (Upstash-based, no local Redis container needed), which simplifies the production stack significantly.

The discretion decisions recommend: PostgreSQL 17 (current stable, EOL November 2029), Docker named volumes for PostgreSQL data (better than bind mounts for backup/restore portability in Phase 33), `drizzle-kit push` for initial schema on a fresh database (simpler than migration files for a clean-start deployment), and `us-east-1` (N. Virginia) as the Lightsail region (lowest latency for US East Coast users; most AWS services co-located there).

**Primary recommendation:** Provision Lightsail in us-east-1, deploy the three-container stack (app + postgres + nginx-proxy-manager), strip all Replit code, enforce DATABASE_URL in production, and wrap startup with a systemd unit that uses `docker compose up -d` with `After=docker.service`.

---

## Codebase Audit: Replit-Specific Code to Remove

This is critical input for the planning tasks. All of the following must be removed or replaced.

### Files to Delete Entirely
| File | Reason |
|------|--------|
| `.replit` | Replit workflow config — delete |
| `replit.nix` | Does not exist in this repo (confirmed via glob) — no action needed |

### Code Changes Required

**`server/index.ts` (lines 134-138, 165-167)**
```typescript
// REMOVE: Replit-specific timeout branching
const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
server.keepAliveTimeout = isReplitDeployment ? 95000 : 65000;
server.headersTimeout = isReplitDeployment ? 96000 : 66000;

// REMOVE: Replit port logic
const isReplit = process.env.REPLIT_DEPLOYMENT === '1' || process.env.REPLIT_DEV_DOMAIN;
const port = isReplit ? 5000 : env.PORT;
```
Replace with: `server.keepAliveTimeout = 65000; server.headersTimeout = 66000;` and `const port = env.PORT;`

**`server/websocket.ts` (lines 54-100, 267-278)**
```typescript
// REMOVE: 6 occurrences of Replit environment detection:
const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
const isReplitPreview = process.env.REPLIT_DEV_DOMAIN && !isReplitDeployment;
// ...and all conditional branches derived from these
```
Replace with: simplified non-Replit timeout values (pingTimeout: 45000, pingInterval: 20000, connectTimeout: 30000)

**`server/auth/passport.ts` (lines 185-197)**
```typescript
// REMOVE: Replit callback URL detection
const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === "1";
const isReplitPreview = process.env.REPLIT_DEV_DOMAIN && !isReplitDeployment;
if (isReplitDeployment) { baseUrl = "https://scrummonsters.com"; }
else if (isReplitPreview) { baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`; }
else { baseUrl = "http://localhost:5000"; }
```
Replace with: read callback base URL from `OAUTH_CALLBACK_BASE_URL` env var (set to `https://scrummonsters.com` in .env); fall back to `http://localhost:5000`

**`client/src/lib/stores/useWebSocket.tsx` (lines 85, 107-132, 152, 197)**
```typescript
// REMOVE: Replit production detection based on .replit.dev / .repl.co hostnames
const isReplitProduction = window.location.hostname.includes('scrummonsters.com') ||
                           window.location.hostname.includes('.replit.dev') ||
                           window.location.hostname.includes('.repl.co');
// REMOVE: All conditional logic derived from isReplitProduction
// REMOVE: maxAttempts: 12 comment referencing "Replit containers can sleep"
```
Replace with: single timeout value (45000ms), remove extraHeaders block, use standard comment

**`vite.config.ts` (lines 4, 43)**
```typescript
// REMOVE:
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
// ...
runtimeErrorOverlay(),
```
Also remove `@replit/vite-plugin-runtime-error-modal` from `package.json` devDependencies.

**`server/config/env.ts` (line 16-19)**
```typescript
// CHANGE: warn → fail-fast for missing DATABASE_URL in production
if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
  // Currently: httpLogger.warn(...)
  // Change to: process.exit(1) after logging error
}
```

**`client/src/components/marketing/AboutPage.tsx`**
References to "Designed for Replit deployment" and "Built on Replit" — update to reference scrummonsters.com/AWS Lightsail. (Low priority for Phase 32, but should be flagged.)

---

## Standard Stack

### Core Infrastructure
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| AWS Lightsail | $5/mo plan | VPS hosting (1GB RAM, 1 vCPU, 40GB SSD) | Predictable billing; Micro plan has 58% headroom per prior analysis |
| Docker Engine | Latest stable (27.x as of 2025) | Container runtime | Official install via docker.com apt repo |
| Docker Compose v2 | Bundled via docker-compose-plugin | Multi-container orchestration | Included with docker-ce install; use `docker compose` (no hyphen) |
| PostgreSQL | 17-alpine | Relational database | Current stable (17.8), EOL Nov 2029; alpine image is minimal |
| Nginx Proxy Manager | jc21/nginx-proxy-manager:latest | Reverse proxy + TLS + Let's Encrypt | GUI-driven cert management; built-in auto-renewal |
| Ubuntu | 22.04 LTS (or 24.04 LTS) | VPS operating system | Long-term support, well-documented for Docker |

### Supporting Tools
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| systemd unit | OS built-in | Auto-start Docker Compose on boot | Required for INFRA-04 |
| AWS Route 53 | - | DNS hosting for scrummonsters.com | Locked decision |
| Lightsail static IP | - | Fixed IP for A record | Required before DNS setup |
| Lightsail firewall | - | Restrict traffic to ports 22, 80, 443 | Required for INFRA-01 |

### What is NOT in the Production Stack (Important)
- **No local Redis container** — The app uses Upstash Redis (REST API, no local container needed). Redis in the dev `docker-compose.yml` is local-dev only. If `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are not set, the app runs gracefully without Redis. For Phase 32, omit Redis from the production compose file.
- **No Kubernetes** — k8s manifests in the repo are for a future milestone. Phase 32 uses Docker Compose only.
- **No CI/CD pipeline** — Phase 34 concern. Phase 32 is SSH + git pull.

### Recommended PostgreSQL Version Decision (Claude's Discretion)
Use `postgres:17-alpine`. PostgreSQL 17 is current stable (17.8 as of Feb 2026), has a 5-year support window to Nov 2029, and the alpine image minimizes container footprint on the 1GB RAM instance.

### Recommended Volume Strategy Decision (Claude's Discretion)
Use Docker **named volumes** for PostgreSQL data:
- Named volumes are managed by Docker and portable across hosts
- Backup via `docker run --rm -v scrummonsters_postgres_data:/data -v /backups:/backup alpine tar czf /backup/pg-backup.tar.gz /data`
- Bind mounts (e.g., `./data/postgres:/var/lib/postgresql/data`) require correct host directory permissions and are harder to migrate
- Named volumes are the official Docker recommendation for production databases

### Recommended Schema Init Decision (Claude's Discretion)
Use **`drizzle-kit push`** for initial production setup, not migration files. Rationale:
- Fresh database (no data to preserve, no existing schema)
- The repo already has a `migrations/0000_sharp_midnight.sql` migration file but the schema has diverged (it's missing `class_mastery_progress` and the `total_xp`/`current_level` columns added to `user_profiles`)
- `drizzle-kit push` reads the current TypeScript schema as truth and creates the correct tables in one step
- Running `npm run db:push` inside the container after startup is reliable for a clean-start deployment
- If Phase 33 or later needs incremental migrations, generate migration files from the pushed state at that point

### Recommended Region Decision (Claude's Discretion)
Use **`us-east-1` (N. Virginia)**:
- Most AWS services co-located; lowest cross-service latency
- Standard pricing ($5/mo for Micro plan, $0.09/GB data transfer)
- Largest US East Coast user base within reasonable latency
- Asia Pacific regions have half the transfer allowance at same price

---

## Architecture Patterns

### Recommended Directory Structure on VPS

```
/opt/scrummonsters/           # Application root (owned by deploy user)
├── docker-compose.prod.yml   # Production compose file
├── .env                      # Secrets (chmod 600, never in git)
├── deploy.sh                 # One-command deploy script
└── runbook.md                # Step-by-step operations guide

/etc/systemd/system/
└── scrummonsters.service     # systemd unit for auto-start

/var/log/scrummonsters/       # Application logs (optional, Pino writes to stdout)
```

### Pattern 1: Production docker-compose.prod.yml

**What:** Three-service compose file — app, postgres, nginx-proxy-manager. No redis (Upstash handles that). Secrets via env var substitution from .env file.

**Key design decisions:**
- `docker compose --env-file .env up -d` loads secrets at runtime
- No hardcoded credentials in the compose file
- NPM (Nginx Proxy Manager) has its own SQLite database for proxy config persistence
- App container depends on postgres with healthcheck
- Named volumes for postgres data and NPM config

```yaml
# Source: Nginx Proxy Manager docs (nginxproxymanager.com/setup)
# and Docker Compose best practices

services:
  app:
    image: scrummonsters:latest   # or build: .
    restart: unless-stopped
    ports:
      - "5000:5000"              # NPM proxies this port
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      SESSION_SECRET: ${SESSION_SECRET}
      ALLOWED_ORIGINS: https://scrummonsters.com
      OAUTH_CALLBACK_BASE_URL: https://scrummonsters.com
      # Optional — omit if not using
      # UPSTASH_REDIS_REST_URL: ${UPSTASH_REDIS_REST_URL}
      # UPSTASH_REDIS_REST_TOKEN: ${UPSTASH_REDIS_REST_TOKEN}
      # GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      # GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      # GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      # GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx-proxy-manager:
    image: jc21/nginx-proxy-manager:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "81:81"    # Admin UI — restrict this port in Lightsail firewall after setup
    volumes:
      - npm_data:/data
      - npm_letsencrypt:/etc/letsencrypt
    environment:
      TZ: America/New_York

volumes:
  postgres_data:
  npm_data:
  npm_letsencrypt:
```

### Pattern 2: systemd Unit for Auto-Start

**What:** systemd service that starts the Docker Compose stack on boot and restarts it if it crashes.

```ini
# Source: Docker docs + bootvar.com systemd guide
# /etc/systemd/system/scrummonsters.service

[Unit]
Description=ScrumMonsters Docker Compose Application
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/scrummonsters
EnvironmentFile=/opt/scrummonsters/.env
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable with:
```bash
sudo systemctl daemon-reload
sudo systemctl enable scrummonsters
sudo systemctl start scrummonsters
```

**Critical:** `After=network-online.target` ensures Docker has network access before starting. Without this, container DNS resolution can fail on boot.

### Pattern 3: Docker Installation on Ubuntu (Official Method)

```bash
# Source: docs.docker.com/engine/install/ubuntu/
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add deploy user to docker group (no sudo required)
sudo usermod -aG docker $USER

# Enable Docker to start on boot
sudo systemctl enable docker
```

### Pattern 4: Lightsail Firewall Configuration

Lightsail has its OWN firewall separate from UFW/iptables. Configure it in the AWS console:
- Allow TCP port 22 (SSH)
- Allow TCP port 80 (HTTP — required for Let's Encrypt HTTP-01 challenge)
- Allow TCP port 443 (HTTPS)
- Remove all other default rules
- Port 81 (NPM admin UI) should NOT be exposed to the internet after initial setup; access via SSH tunnel

### Pattern 5: Route 53 A Record Setup

```
1. Create Lightsail static IP → attach to instance
2. Route 53 → Hosted zones → scrummonsters.com (hosted zone already exists if domain registered via Route 53)
3. Create record:
   - Record name: (empty — apex/root domain)
   - Type: A
   - Value: <Lightsail static IP>
   - TTL: 300
   - Routing: Simple
4. Wait up to 48 hours for DNS propagation (usually minutes for Route 53)
```

### Pattern 6: Nginx Proxy Manager — First-Time Setup

After `docker compose up -d`:
1. Access NPM admin UI at `http://<server-ip>:81`
2. Default credentials: `admin@example.com` / `changeme`
3. Immediately change email and password when prompted
4. Create a Proxy Host:
   - Domain: `scrummonsters.com`
   - Forward Hostname: `app` (Docker Compose service name)
   - Forward Port: `5000`
   - Enable "Block Common Exploits"
5. On the SSL tab: Request Let's Encrypt certificate, enable "Force SSL"
6. Let's Encrypt HTTP-01 challenge requires port 80 to be open (already in firewall rules)

### Anti-Patterns to Avoid

- **Hardcoding secrets in docker-compose.prod.yml** — use `${VAR}` substitution with .env file; .env must be in .gitignore (it already is)
- **Using Lightsail's built-in DNS instead of Route 53** — the user decided on Route 53; Lightsail's DNS is limited to 6 zones and fewer record types
- **Running as root in the Docker container** — the existing Dockerfile already creates a non-root user; preserve this
- **Exposing NPM admin port 81 permanently** — use only during initial setup, then remove from Lightsail firewall
- **Using `docker compose restart` policies combined with systemd restart** — creates conflicts; use `restart: unless-stopped` in compose and let systemd manage the top-level lifecycle
- **Running `npm run db:push` from the host** — must run from inside the container or with DATABASE_URL set; the Dockerfile build doesn't install drizzle-kit in the production image, so run it as a separate compose run command or add it to the container's start sequence

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS certificates | Custom certbot scripts | Nginx Proxy Manager (built-in Let's Encrypt) | NPM handles HTTP challenge, renewal, and Nginx config automatically |
| Reverse proxy config | Manual nginx.conf | Nginx Proxy Manager GUI | NPM generates correct upstream config, handles WebSocket upgrades |
| Database persistence | Custom backup scripts | Docker named volumes + pg_dump (Phase 33) | Named volumes handle container restart data; Docker manages permissions |
| Auto-restart on reboot | Cron @reboot | systemd unit | systemd has proper dependency ordering (After=docker.service) and restart semantics |
| Environment secrets | Vault, AWS Secrets Manager | .env file + chmod 600 | Sufficient for Phase 32; dedicated secrets management is a Phase 34+ concern |

**Key insight:** The entire TLS/reverse proxy problem is solved by Nginx Proxy Manager. Don't touch Nginx config files manually; let NPM's GUI generate them. This is especially important for WebSocket proxying (Socket.IO requires `Upgrade` and `Connection` header forwarding, which NPM handles automatically via its WebSocket support toggle).

---

## Common Pitfalls

### Pitfall 1: Lightsail Firewall vs UFW Confusion
**What goes wrong:** Configuring UFW (Ubuntu firewall) but not the Lightsail console firewall. Ports appear open on the instance but traffic is blocked at the AWS level.
**Why it happens:** Lightsail instances have their own AWS-managed firewall separate from the OS firewall.
**How to avoid:** Configure ONLY the Lightsail console firewall for Phase 32. Don't install or configure UFW. The Lightsail firewall is the authoritative access control.
**Warning signs:** `curl http://<ip>:80` from outside fails even though Docker containers are running.

### Pitfall 2: Port 80 Must Be Open for Let's Encrypt
**What goes wrong:** Let's Encrypt HTTP-01 challenge fails because port 80 is closed.
**Why it happens:** Some teams close port 80 and redirect to 443, but the redirect happens AFTER certificate acquisition.
**How to avoid:** Port 80 must be open in the Lightsail firewall BEFORE requesting certificates. NPM handles the redirect to 443 after cert is issued.
**Warning signs:** NPM shows "ACME challenge failed" or timeout during cert request.

### Pitfall 3: DATABASE_URL Must Fail Fast in Production
**What goes wrong:** App starts with in-memory storage silently. First player to join creates a lobby that disappears on restart.
**Why it happens:** `server/config/env.ts` currently only WARNS when DATABASE_URL is missing — it does not exit.
**How to avoid:** Change the `refine` in the env schema to call `process.exit(1)` (or throw) when `NODE_ENV === 'production'` and `DATABASE_URL` is missing. This is explicitly required by the user's locked decision.
**Warning signs:** App starts, logs show "Using in-memory storage" in production.

### Pitfall 4: Docker Compose Command Name (v1 vs v2)
**What goes wrong:** Scripts use `docker-compose` (v1, separate binary) but only Docker Compose v2 (`docker compose` plugin) is installed.
**Why it happens:** Docker Compose v1 is deprecated and not included in the `docker-compose-plugin` install.
**How to avoid:** Use `docker compose` (space, not hyphen) everywhere. In the systemd unit and deploy.sh, use `/usr/bin/docker compose`.
**Warning signs:** `command not found: docker-compose`.

### Pitfall 5: OAuth Callback URL Requires Production Domain
**What goes wrong:** OAuth sign-in (Google/GitHub) redirects to wrong URL (localhost or Replit domain).
**Why it happens:** After removing Replit detection logic, the OAuth callback URL must come from an env var (`OAUTH_CALLBACK_BASE_URL`) set to `https://scrummonsters.com`. This requires updating OAuth app settings in Google/GitHub developer consoles.
**How to avoid:** Set `OAUTH_CALLBACK_BASE_URL=https://scrummonsters.com` in .env. Update Google OAuth app authorized redirect URIs and GitHub OAuth app callback URL in their respective developer consoles.
**Warning signs:** OAuth redirect_uri_mismatch errors.

### Pitfall 6: SSH Key Generation for Lightsail
**What goes wrong:** Trying to use an existing RSA key with Lightsail, or using a key format Lightsail doesn't accept.
**Why it happens:** Lightsail expects the public key in OpenSSH format and has specific requirements.
**How to avoid:** Generate a new Ed25519 key pair: `ssh-keygen -t ed25519 -C "lightsail-scrummonsters" -f ~/.ssh/lightsail_scrummonsters`. Upload the public key via Lightsail console. Set restrictive permissions: `chmod 600 ~/.ssh/lightsail_scrummonsters`.
**Warning signs:** "Permission denied (publickey)" on first SSH attempt.

### Pitfall 7: npm run build Must Happen Inside Docker Build
**What goes wrong:** App container serves no static files (404 on all routes) because the Vite build wasn't run.
**Why it happens:** The production Docker image requires `npm run build` (which runs both Vite and esbuild) during the Docker build step.
**How to avoid:** The existing Dockerfile already runs `npm run build` in the builder stage. Ensure `docker compose build` or `docker build` is run before `docker compose up`.
**Warning signs:** Express starts but all routes 404; check `dist/public/` directory is populated.

### Pitfall 8: The Schema Drift Between migrations/ and schema.ts
**What goes wrong:** Running `drizzle-kit migrate` uses the old migration file, which is missing `class_mastery_progress` and new columns in `user_profiles` (`total_xp`, `current_level`).
**Why it happens:** A migration was generated from an older version of the schema, and new columns/tables were added to `schema.ts` without generating new migrations.
**How to avoid:** Use `drizzle-kit push` (`npm run db:push`) for this fresh-database deployment. It reads the current schema.ts directly and creates the correct tables. Do not run `drizzle-kit migrate` on a fresh database.
**Warning signs:** App logs "column does not exist" errors for `total_xp` or `current_level`.

### Pitfall 9: NPM WebSocket Proxy Configuration
**What goes wrong:** Socket.IO connections fail with 400/426 errors or fall back to long-polling only.
**Why it happens:** Nginx by default does not forward Upgrade and Connection headers needed for WebSocket handshake.
**How to avoid:** In NPM's proxy host settings, enable "WebSocket Support" toggle (it's a checkbox in the advanced proxy settings). NPM adds the required `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` headers automatically.
**Warning signs:** Socket.IO connects on polling transport but never upgrades to WebSocket; check browser Network tab for 101 Switching Protocols response.

---

## Code Examples

### .env File for Production

```bash
# /opt/scrummonsters/.env — chmod 600, never commit

# Database
POSTGRES_USER=scrummonsters
POSTGRES_PASSWORD=<generate: openssl rand -base64 32>
POSTGRES_DB=scrummonsters
DATABASE_URL=postgresql://scrummonsters:<password>@postgres:5432/scrummonsters

# App
NODE_ENV=production
PORT=5000
SESSION_SECRET=<generate: openssl rand -base64 48>
ALLOWED_ORIGINS=https://scrummonsters.com
OAUTH_CALLBACK_BASE_URL=https://scrummonsters.com

# OAuth (optional — remove lines if not using)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=

# Redis (optional — remove lines if not using Upstash)
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
```

### deploy.sh Script Pattern

```bash
#!/bin/bash
# deploy.sh — one-command deploy (run from local machine)
# Usage: ./deploy.sh
set -e

REMOTE_USER="ubuntu"
REMOTE_HOST="<static-ip>"
SSH_KEY="~/.ssh/lightsail_scrummonsters"
REMOTE_DIR="/opt/scrummonsters"

echo "Deploying to scrummonsters.com..."

ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
  set -e
  cd /opt/scrummonsters

  echo "[1/4] Pulling latest code..."
  git pull origin main

  echo "[2/4] Building Docker image..."
  docker compose -f docker-compose.prod.yml build app

  echo "[3/4] Running database migrations..."
  docker compose -f docker-compose.prod.yml run --rm app npm run db:push

  echo "[4/4] Restarting services..."
  docker compose -f docker-compose.prod.yml up -d --no-deps app

  echo "Deploy complete."
EOF
```

### Env Validation Hardening (server/config/env.ts)

```typescript
// Change the refine to fail-fast in production
}).refine((data) => {
  if (data.NODE_ENV === "production" && !data.DATABASE_URL) {
    // This exits the process immediately — no in-memory fallback in production
    httpLogger.error('DATABASE_URL is required in production. Set it in .env and restart.');
    process.exit(1);
  }
  return true;
});
```

### Auth Callback URL After Replit Removal (server/auth/passport.ts)

```typescript
// Replace the Replit-branching getCallbackURL with:
function getCallbackURL(provider: string): string {
  const baseUrl = process.env.OAUTH_CALLBACK_BASE_URL || 'http://localhost:5000';
  return `${baseUrl}/api/auth/${provider}/callback`;
}
```

### Running db:push on a Fresh Database

```bash
# Run once after first deploy to initialize schema
# From VPS, in /opt/scrummonsters:
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL="postgresql://scrummonsters:<password>@postgres:5432/scrummonsters" \
  app npm run db:push
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `docker-compose` (v1 binary) | `docker compose` (v2 plugin) | Docker 23+ | Always use space, not hyphen |
| Certbot standalone scripts | Nginx Proxy Manager GUI | 2020-2023 | NPM handles cert lifecycle; no manual renewal cron needed |
| Redis container in every stack | Upstash REST Redis | 2022-present | No local Redis needed; this app already uses Upstash |
| `COPY . .` then `npm install` in Dockerfile | Copy package.json first, `npm ci`, then `COPY . .` | Docker caching best practice | Better layer caching — existing Dockerfile already follows this |
| `db:migrate` for fresh DB | `db:push` for fresh DB | Drizzle team guidance | Push is simpler for clean-start; migrate for incremental changes |

**Deprecated/outdated in this codebase:**
- `REPLIT_DEPLOYMENT` env var: Replit-specific, remove all references
- `REPLIT_DEV_DOMAIN` env var: Replit-specific, remove all references
- `@replit/vite-plugin-runtime-error-modal`: Replit-specific dev tool, remove from vite.config.ts and package.json
- `docker-compose.yml` Redis service: Local dev only, must NOT appear in production compose

---

## Open Questions

1. **Does the user want the NPM admin port (81) accessible post-setup?**
   - What we know: Port 81 is needed for initial cert setup and any proxy changes
   - What's unclear: After initial setup, should port 81 be locked down to specific IPs or kept open?
   - Recommendation: Remove port 81 from Lightsail firewall after initial setup; access NPM admin via SSH tunnel when needed (`ssh -L 81:localhost:81 ubuntu@<ip>`)

2. **OAuth: Are Google/GitHub OAuth apps already configured for scrummonsters.com?**
   - What we know: The current OAuth callback URL logic points to the Replit domain or scrummonsters.com
   - What's unclear: Whether OAuth apps in Google Console / GitHub Settings already have `https://scrummonsters.com/api/auth/*/callback` as an authorized redirect URI
   - Recommendation: Add updating OAuth app redirect URIs to the deploy runbook as a required step

3. **Should the app be built on the VPS or should a pre-built image be pushed?**
   - What we know: Phase 32 is SSH + git pull; the existing Dockerfile is a multi-stage build
   - What's unclear: The 1GB RAM VPS may struggle with the TypeScript/Vite build (large node_modules, memory-intensive bundling)
   - Recommendation: Build on the VPS for Phase 32 (simpler, no registry needed). Monitor if the build fails OOM. If it does, build locally and push a tarball. Phase 34 (CI/CD) will solve this properly with GitHub Actions.

4. **`@neondatabase/serverless` in package.json dependencies — is it used?**
   - What we know: `@neondatabase/serverless` is listed in dependencies (not devDependencies) but grep finds zero imports in TypeScript source files
   - What's unclear: Whether it's a leftover dependency or used somewhere non-obvious
   - Recommendation: Flag for removal; it's not used and adds Docker image size. Should be removed in Phase 32 cleanup.

---

## Sources

### Primary (HIGH confidence)
- Official Docker Ubuntu install docs: https://docs.docker.com/engine/install/ubuntu/ — Docker apt repo method
- Nginx Proxy Manager official setup: https://nginxproxymanager.com/setup/ — docker-compose config, port requirements, default credentials
- AWS Lightsail Route 53 integration: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-using-route-53-to-point-a-domain-to-an-instance.html — A record creation steps
- AWS Lightsail regions: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html — region list
- PostgreSQL release announcement: https://www.postgresql.org/about/news/postgresql-182-178-1612-1516-and-1421-released-3235/ — version 17.8 current stable
- Drizzle push docs: https://orm.drizzle.team/docs/drizzle-kit-push — push vs migrate guidance
- Codebase audit: Direct reads of `server/index.ts`, `server/websocket.ts`, `server/auth/passport.ts`, `client/src/lib/stores/useWebSocket.tsx`, `vite.config.ts`, `server/redis.ts`, `server/config/env.ts`, `docker-compose.yml`, `Dockerfile`, `shared/schema.ts`, `migrations/0000_sharp_midnight.sql`

### Secondary (MEDIUM confidence)
- systemd unit pattern: https://bootvar.com/systemd-service-for-docker-compose/ — verified against Docker docs pattern
- NPM default credentials: https://1gbits.com/blog/nginx-proxy-manager-default-login/ — `admin@example.com` / `changeme` (consistent with NPM GitHub issues)
- Docker named volume backup: https://docs.docker.com/engine/storage/volumes/ — official Docker docs on volume management
- Lightsail $5 plan specs: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html — 1GB RAM, 1 vCPU, 40GB SSD, 2TB transfer

### Tertiary (LOW confidence)
- Lightsail region latency comparison: Based on general AWS knowledge that `us-east-1` has lowest cross-service latency for US East Coast. No specific Lightsail latency benchmarks found. Verify with https://awsspeedtest.com if precision matters.

---

## Metadata

**Confidence breakdown:**
- Replit code audit: HIGH — direct codebase read, all files reviewed
- Standard stack: HIGH — all verified against official docs
- Docker install commands: HIGH — from official Docker docs
- Nginx Proxy Manager config: HIGH — from official NPM docs
- Route 53 A record process: HIGH — from official AWS docs
- systemd unit pattern: MEDIUM — verified against Docker docs; bootvar.com article is secondary source
- Lightsail region recommendation: MEDIUM — general AWS knowledge, no Lightsail-specific latency data
- Schema drift finding: HIGH — direct read of migrations/ vs schema.ts comparison

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days — stack is stable; Lightsail pricing/regions rarely change)
