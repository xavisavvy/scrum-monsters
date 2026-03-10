# ScrumMonsters Operations Runbook

Covers: initial VPS setup, deploy procedure, and what deploy.sh does step by step.

## Quick Reference

| Task | Command |
|------|---------|
| Deploy latest code | `./deploy.sh` |
| SSH to VPS | `ssh -i ~/.ssh/lightsail_scrummonsters ubuntu@<static-ip>` |
| View app logs | SSH in, then: `docker compose -f docker-compose.prod.yml logs -f app` |
| Restart stack | SSH in, then: `cd /opt/scrummonsters && sudo systemctl restart scrummonsters` |
| NPM admin UI | SSH tunnel: `ssh -L 81:localhost:81 ubuntu@<ip>` then visit http://localhost:81 |
| Check app health | `curl https://scrummonsters.com/api/health` |
| Monitoring UIs | SSH tunnel: `ssh -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 -L 9999:127.0.0.1:9999 ubuntu@<ip>` |
| Rollback to prior version | SSH in, then: `APP_IMAGE_TAG=sha-XXXXXX docker compose -f docker-compose.prod.yml pull app && docker compose -f docker-compose.prod.yml up -d --no-deps app` |
| Trigger manual backup | SSH in, then: `docker compose -f docker-compose.prod.yml exec postgres-backup sh -c '/backup.sh'` |
| View backup logs | SSH in, then: `docker compose -f docker-compose.prod.yml logs -f postgres-backup` |

---

## Part 1: Initial VPS Setup (one-time)

This section covers provisioning a fresh AWS Lightsail instance and getting the stack running for the first time. You only do this once.

### 1.1 Generate SSH Key

Generate a new Ed25519 SSH key pair for Lightsail access:

```bash
ssh-keygen -t ed25519 -C "lightsail-scrummonsters" -f ~/.ssh/lightsail_scrummonsters
chmod 600 ~/.ssh/lightsail_scrummonsters
```

The public key (`~/.ssh/lightsail_scrummonsters.pub`) will be uploaded to Lightsail in the next step.

### 1.2 Create Lightsail Instance

1. Go to [AWS Lightsail Console](https://lightsail.aws.amazon.com)
2. Click **Create instance**
3. Select:
   - Region: **US East (N. Virginia)** — `us-east-1`
   - Platform: **Linux/Unix**
   - Blueprint: **OS Only → Ubuntu 22.04 LTS**
   - Instance plan: **$5/mo** (1 GB RAM, 1 vCPU, 40 GB SSD, 2 TB transfer)
4. Under **SSH key pair**, choose **Upload new** and paste the contents of `~/.ssh/lightsail_scrummonsters.pub`
5. Name the instance: `scrummonsters`
6. Click **Create instance**

### 1.3 Attach Static IP

1. In Lightsail console, go to **Networking → Static IPs**
2. Click **Create static IP**
3. Attach it to the `scrummonsters` instance
4. Note the static IP address — you will need it for `deploy.sh` and Route 53

Update `deploy.sh` with your static IP:
```bash
REMOTE_HOST="<your-static-ip>"
```

### 1.4 Configure Lightsail Firewall

In the Lightsail console, go to your instance → **Networking** tab → **IPv4 Firewall**.

Remove all default rules and add only:

| Protocol | Port | Description |
|----------|------|-------------|
| TCP | 22 | SSH |
| TCP | 80 | HTTP (required for Let's Encrypt HTTP-01 challenge) |
| TCP | 443 | HTTPS |
| TCP | 81 | NPM admin UI (TEMPORARY — remove after TLS setup) |

> **Do NOT skip port 80.** Let's Encrypt uses HTTP-01 challenge and requires port 80 to be open, even after you have HTTPS. Do not close it after TLS setup.

> **Port 81 (NPM admin)** should be open ONLY during initial TLS setup. Remove it from the Lightsail firewall once your certificates are issued. Access NPM admin via SSH tunnel after that.

### 1.5 SSH Into the Instance

```bash
ssh -i ~/.ssh/lightsail_scrummonsters ubuntu@<static-ip>
```

### 1.6 Install Docker

Run the following commands on the VPS to install Docker Engine and the Compose plugin via the official Docker apt repository:

```bash
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

# Add ubuntu user to docker group (so docker works without sudo)
sudo usermod -aG docker $USER

# Enable Docker to start on boot
sudo systemctl enable docker
```

Log out and back in for the group change to take effect:
```bash
exit
ssh -i ~/.ssh/lightsail_scrummonsters ubuntu@<static-ip>
```

Verify Docker works without sudo:
```bash
docker run --rm hello-world
```

### 1.7 Create Application Directory and Clone Repo

```bash
sudo mkdir -p /opt/scrummonsters
sudo chown ubuntu:ubuntu /opt/scrummonsters
cd /opt/scrummonsters
git clone https://github.com/<your-org>/ScrumMonsters.git .
```

### 1.8 Create .env File

Create the secrets file. **This file must never be committed to git.**

```bash
nano /opt/scrummonsters/.env
```

Paste the following template and fill in all values:

```bash
# /opt/scrummonsters/.env — chmod 600, never commit to git

# Database
POSTGRES_USER=scrummonsters
POSTGRES_PASSWORD=<generate: openssl rand -base64 32>
POSTGRES_DB=scrummonsters
DATABASE_URL=postgresql://scrummonsters:<same-password-as-above>@postgres:5432/scrummonsters

# App
NODE_ENV=production
PORT=5000
SESSION_SECRET=<generate: openssl rand -base64 48>
ALLOWED_ORIGINS=https://scrummonsters.com
BASE_URL=https://scrummonsters.com

# App image tag (default: latest, set to sha-XXXXXX for rollback)
APP_IMAGE_TAG=latest

# OAuth providers (optional — remove lines if not using)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=

# Upstash Redis (optional — remove lines if not using)
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=

# S3 Backup (required for postgres-backup sidecar)
BACKUP_S3_ACCESS_KEY_ID=<from AWS IAM user>
BACKUP_S3_SECRET_ACCESS_KEY=<from AWS IAM user>
BACKUP_S3_BUCKET=<your-backup-bucket-name>
```

Generate strong secrets before filling in:
```bash
openssl rand -base64 32   # for POSTGRES_PASSWORD
openssl rand -base64 48   # for SESSION_SECRET
```

Secure the file:
```bash
chmod 600 /opt/scrummonsters/.env
```

> **Important:** The `DATABASE_URL` password must exactly match `POSTGRES_PASSWORD`. Docker Compose uses both — `POSTGRES_PASSWORD` to initialize the PostgreSQL container, and `DATABASE_URL` to connect from the app.

### 1.9 Create systemd Service

Create the systemd unit file that starts the Docker Compose stack on boot:

```bash
sudo nano /etc/systemd/system/scrummonsters.service
```

Paste the following content exactly:

```ini
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
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable scrummonsters
sudo systemctl start scrummonsters
```

Check that it started:
```bash
sudo systemctl status scrummonsters
docker compose -f /opt/scrummonsters/docker-compose.prod.yml ps
```

### 1.10 Initialize the Database Schema

Run the Drizzle schema push to create all tables on the fresh database:

```bash
cd /opt/scrummonsters
docker compose -f docker-compose.prod.yml run --rm app npm run db:push
```

This reads the TypeScript schema in `shared/schema.ts` and creates the correct tables. It is idempotent — safe to run multiple times.

### 1.11 Verify the App is Running

Before setting up DNS and TLS, verify the app responds:

```bash
curl http://<static-ip>:5000/api/health
```

Expected response: `{"status":"ok"}` (or similar JSON with uptime info).

If the health check fails, check app logs:
```bash
docker compose -f docker-compose.prod.yml logs app
```

---

## Part 2: DNS and TLS Setup (one-time)

After the app is running and responding on port 5000, set up the domain and HTTPS.

### 2.1 Create Route 53 A Record

1. Go to [AWS Route 53 Console](https://console.aws.amazon.com/route53/)
2. Click **Hosted zones** → `scrummonsters.com`
3. Click **Create record**:
   - **Record name:** (leave blank — this is the apex/root domain)
   - **Record type:** A
   - **Value:** `<your Lightsail static IP>`
   - **TTL:** 300
   - **Routing policy:** Simple routing
4. Click **Create records**

DNS propagation is usually minutes for Route 53 but can take up to 48 hours globally. Check with:
```bash
dig scrummonsters.com A +short
```

### 2.2 Access NPM Admin UI

Temporarily open port 81 in the Lightsail firewall (if not already done in Part 1), then:

1. Open `http://<static-ip>:81` in your browser
2. Log in with default credentials:
   - Email: `admin@example.com`
   - Password: `changeme`
3. You will be immediately prompted to change your email and set a new password. Do this now.

### 2.3 Create Proxy Host

In NPM, click **Hosts → Proxy Hosts → Add Proxy Host**:

- **Domain Names:** `scrummonsters.com`
- **Scheme:** `http`
- **Forward Hostname / IP:** `app` (the Docker Compose service name)
- **Forward Port:** `5000`
- **Block Common Exploits:** checked
- **Websockets Support:** checked (required for Socket.IO)

Click **Save**.

### 2.4 Request Let's Encrypt Certificate

On the proxy host you just created, click the three-dot menu → **Edit**, then go to the **SSL** tab:

- **SSL Certificate:** Request a new SSL certificate
- **Force SSL:** checked
- **HTTP/2 Support:** checked
- Click **Save**

NPM will automatically complete the Let's Encrypt HTTP-01 challenge. Port 80 must be open (it is — you set it in Part 1).

> **Warning:** Do not close port 80 — Let's Encrypt HTTP-01 renewal requires it to remain open permanently. NPM auto-renews certificates; the renewal also uses port 80.

### 2.5 Verify HTTPS

```bash
curl https://scrummonsters.com/api/health
```

You should get a valid JSON response over HTTPS. Also verify WebSocket works by opening the app in a browser and checking the Network tab for a 101 Switching Protocols response on the `/socket.io/` connection.

### 2.6 Remove Port 81 from Lightsail Firewall

Once TLS is configured and working:

1. Go to Lightsail console → your instance → Networking tab
2. Remove the TCP port 81 rule from the IPv4 Firewall

From now on, access NPM admin via SSH tunnel only:
```bash
ssh -L 81:localhost:81 -i ~/.ssh/lightsail_scrummonsters ubuntu@<static-ip>
# Then open http://localhost:81 in your browser
```

---

## Part 3: What deploy.sh Does (Step by Step)

`deploy.sh` is a one-command deploy script that runs from your local machine and executes commands on the VPS over SSH. Here is what each step does and why.

### Step 1/4: git pull origin main

```bash
cd /opt/scrummonsters && git pull origin main
```

Pulls the latest code from the `main` branch on GitHub into the VPS working directory. This is the source of truth — the VPS always runs exactly what is in the `main` branch.

**Why this order:** Code must be updated before building the Docker image, so the build picks up the latest changes.

### Step 2/4: docker compose pull app

```bash
docker compose -f docker-compose.prod.yml pull app
```

Pulls the pre-built `app` container image from GitHub Container Registry (GHCR). The image was already built and pushed by the `docker.yml` GitHub Actions workflow when the commit landed on `main`.

**Why pull instead of build:** Building TypeScript/Vite on the 1 GB Lightsail instance uses 600-800 MB of RAM, leaving little headroom. Pulling a pre-built image takes seconds and uses negligible memory.

**Why only the `app` service:** `postgres` and `nginx-proxy-manager` are third-party images with no custom build step. Pulling them would restart services unnecessarily and would reset any config NPM has stored.

**Image source:** `ghcr.io/xavisavvy/scrum-monsters` — tagged with `latest` and `sha-XXXXXXX` (short commit SHA). The `APP_IMAGE_TAG` env var controls which tag is used (default: `latest`).

### Step 3/4: docker compose run --rm app npm run db:push

```bash
docker compose -f docker-compose.prod.yml run --rm app npm run db:push
```

Runs `drizzle-kit push` inside a temporary app container. This compares the TypeScript schema in `shared/schema.ts` against the live PostgreSQL database and applies any missing tables or columns.

**Why it's safe to run on every deploy:** `drizzle-kit push` is idempotent — it only adds missing schema elements, never drops existing data. Running it repeatedly on an already-up-to-date database is a no-op.

**Why `--rm`:** Creates a one-off container that is automatically removed after the command completes. The long-running `app` service is not affected.

### Step 4/4: docker compose up -d --no-deps app

```bash
docker compose -f docker-compose.prod.yml up -d --no-deps app
```

Restarts the `app` container with the newly built image.

- `-d`: Detached mode — runs in the background
- `--no-deps`: Skips starting or restarting dependency services (`postgres`, `nginx-proxy-manager`). This keeps the database and reverse proxy running throughout the deploy, resulting in minimal downtime — only the app container itself restarts.

**Result:** The old app container is stopped, replaced by the new one. Postgres and NPM keep running continuously.

---

## Part 4: OAuth Setup (one-time)

After the domain is live with HTTPS at `https://scrummonsters.com`, update the OAuth application settings so Google/GitHub will accept callbacks to your production URL.

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. Click your OAuth 2.0 Client ID for ScrumMonsters
3. Under **Authorized redirect URIs**, add:
   ```
   https://scrummonsters.com/api/auth/google/callback
   ```
4. Click **Save**

### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers) → **OAuth Apps**
2. Click your ScrumMonsters OAuth App
3. Update **Authorization callback URL** to:
   ```
   https://scrummonsters.com/api/auth/github/callback
   ```
4. Click **Update application**

### Set OAuth Credentials in .env

Add the OAuth credentials to `/opt/scrummonsters/.env` on the VPS (uncomment the lines you set up):

```bash
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

Then restart the app to pick up the new environment:
```bash
cd /opt/scrummonsters
docker compose -f docker-compose.prod.yml up -d --no-deps app
```

Verify OAuth works by visiting `https://scrummonsters.com` and signing in with Google or GitHub.

---

---

## Part 5: Rollback Procedure

If a deploy introduces a regression, roll back to a prior image tag in under 5 minutes.

### 5.1 Find Available Tags

List images already downloaded on the VPS:

```bash
docker image ls ghcr.io/xavisavvy/scrum-monsters --format "table {{.Tag}}\t{{.CreatedAt}}"
```

To see all published tags, visit the [GitHub Packages page](https://github.com/xavisavvy/scrum-monsters/pkgs/container/scrum-monsters). Tags are in the format `sha-XXXXXXX` (short commit SHA) and `latest`.

### 5.2 Roll Back

**Option A — Inline (temporary, reverts on next deploy):**

```bash
cd /opt/scrummonsters
APP_IMAGE_TAG=sha-XXXXXX docker compose -f docker-compose.prod.yml pull app
APP_IMAGE_TAG=sha-XXXXXX docker compose -f docker-compose.prod.yml up -d --no-deps app
```

**Option B — Persist in .env (survives future `./deploy.sh` runs):**

```bash
# Edit .env and set: APP_IMAGE_TAG=sha-XXXXXX
nano /opt/scrummonsters/.env
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d --no-deps app
```

### 5.3 Verify Rollback

```bash
curl https://scrummonsters.com/api/health
docker compose -f docker-compose.prod.yml logs --tail=50 app
```

### 5.4 Roll Forward

Once the fix is deployed via GitHub Actions and you are ready to return to latest:

```bash
# Remove APP_IMAGE_TAG from .env (or set it back to latest)
nano /opt/scrummonsters/.env
./deploy.sh
```

---

## Part 6: Database Backups

### 6.1 How It Works

The `postgres-backup-s3` sidecar container runs `pg_dump` at 2am UTC daily (cron: `0 2 * * *`). It uploads a gzipped SQL dump to the configured S3 bucket under the `scrummonsters/` prefix. Backups are retained for 7 days locally; configure S3 Lifecycle Policy for longer retention (see Part 02 of Phase 33 for provisioning steps).

### 6.2 Trigger Manual Backup

```bash
docker compose -f docker-compose.prod.yml exec postgres-backup sh -c '/backup.sh'
```

### 6.3 View Backup Logs

```bash
docker compose -f docker-compose.prod.yml logs -f postgres-backup
```

### 6.4 Restore From Backup

Full restore procedure (downloading from S3, restoring into PostgreSQL, verifying data integrity) is covered in Phase 36: Disaster Recovery. Do not attempt a restore without following that runbook.

---

## Part 7: GHCR Authentication

The VPS must authenticate to GitHub Container Registry once to pull private images. This is a one-time setup.

### 7.1 Create a GitHub PAT

1. Go to [GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Set expiration to **No expiration** (or your org policy)
4. Select scope: **read:packages** only
5. Click **Generate token** and copy it immediately

### 7.2 Log In on the VPS

```bash
echo "YOUR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Replace `YOUR_PAT` with the token from step 7.1 and `YOUR_GITHUB_USERNAME` with your GitHub username. Docker saves the credentials to `~/.docker/config.json`.

### 7.3 Verify

```bash
docker pull ghcr.io/xavisavvy/scrum-monsters:latest
```

If this succeeds without an authentication error, the VPS is authorized to pull images.

---

## Part 8: Monitoring Access

All monitoring services are bound to `127.0.0.1` on the VPS and are **not accessible from the public internet**. Access them via SSH tunnel.

### 8.1 Open SSH Tunnel

Open a single SSH tunnel that forwards all three monitoring ports:

```bash
ssh -i ~/.ssh/lightsail_scrummonsters \
  -L 3001:127.0.0.1:3001 \
  -L 9090:127.0.0.1:9090 \
  -L 9999:127.0.0.1:9999 \
  ubuntu@34.199.135.244
```

Leave this terminal open while accessing the monitoring UIs.

### 8.2 Access Monitoring UIs

With the SSH tunnel active, open these URLs in your browser:

| Service | URL | Purpose |
|---------|-----|---------|
| Grafana | http://localhost:3001 | Metrics dashboards (active lobbies, players, WebSocket connections, error rates) |
| Prometheus | http://localhost:9090 | Raw metrics queries and scrape target status |
| Dozzle | http://localhost:9999 | Real-time Docker container log viewer |

### 8.3 Grafana Credentials

- **Username:** `admin`
- **Password:** See `GRAFANA_ADMIN_PASSWORD` in `/opt/scrummonsters/.env` on the VPS

To retrieve the password:
```bash
ssh -i ~/.ssh/lightsail_scrummonsters ubuntu@34.199.135.244 "grep GRAFANA_ADMIN_PASSWORD /opt/scrummonsters/.env"
```

### 8.4 Services Overview

| Service | Internal Port | Tunnel Port | Image | Purpose |
|---------|--------------|-------------|-------|---------|
| Prometheus | 9090 | 9090 | prom/prometheus | Scrapes /metrics at 60s intervals, 7-day retention |
| Grafana | 3000 (mapped to 3001) | 3001 | grafana/grafana-oss | Pre-built ScrumQuest dashboard with 10 metric panels |
| Dozzle | 8080 (mapped to 9999) | 9999 | amir20/dozzle | Shows logs from all Docker containers in one UI |

### 8.5 Memory Limits

| Service | Memory Limit | Typical Usage |
|---------|-------------|---------------|
| Prometheus | 128 MB | 40-60 MB |
| Grafana | 128 MB | 80-100 MB |
| Dozzle | 32 MB | 15-20 MB |

Total monitoring overhead: ~150-180 MB of the 1 GB VPS budget.

---

## Part 9: Incident Response

This section covers how to restart services, restore a database, roll back to a prior image, and diagnose common failures. Follow these procedures step-by-step during an incident.

### 9.1 Restart Procedures

#### Full Stack Restart

Restart all containers (app, postgres, nginx-proxy-manager, monitoring, backup):

```bash
cd /opt/scrummonsters
sudo systemctl restart scrummonsters
```

Or equivalently with Docker Compose:

```bash
cd /opt/scrummonsters
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

> **Note:** A full stack restart will briefly disconnect all active WebSocket sessions. Players will need to reconnect (the client handles this automatically via reconnection logic).

#### App-Only Restart

Restart only the Node.js application container. Keeps the database, NPM reverse proxy, and monitoring services running:

```bash
docker compose -f docker-compose.prod.yml restart app
```

Use this when the app is misbehaving but the database and proxy are healthy.

#### Single Service Restart

Restart any individual service by name:

```bash
docker compose -f docker-compose.prod.yml restart <service-name>
```

Valid service names:

| Service | Description |
|---------|-------------|
| `app` | Node.js application |
| `postgres` | PostgreSQL database |
| `postgres-backup` | Automated S3 backup sidecar |
| `nginx-proxy-manager` | Reverse proxy and TLS termination |
| `prometheus` | Metrics collection |
| `grafana` | Metrics dashboards |
| `dozzle` | Real-time log viewer |
| `blackbox-exporter` | TLS and endpoint probe exporter |

#### Post-Restart Verification

After any restart, verify the stack is healthy:

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Check app health endpoint
curl https://scrummonsters.com/api/health
```

Expected: all containers show `Up` status, health check returns HTTP 200 with JSON body.

---

### 9.2 Restore Database from S3 Backup

Use this procedure to restore the PostgreSQL database from a backup stored in S3. This is a destructive operation — the current database will be dropped and replaced.

#### Prerequisites

- SSH access to the VPS
- `aws` CLI available on the host (installed during initial setup)
- The restore script at `/opt/scrummonsters/docker/postgres-backup/restore-from-s3.sh`
- Environment variables configured in `/opt/scrummonsters/.env` (BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY, POSTGRES_USER, POSTGRES_DB)

#### Step 1: List Available Backups

```bash
source /opt/scrummonsters/.env
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
aws s3 ls s3://${BACKUP_S3_BUCKET}/scrummonsters/ --region us-east-1
```

Backups are named `scrummonsters_<timestamp>.sql.gz`. Pick the backup you want to restore.

#### Step 2: Run the Restore Script

```bash
cd /opt/scrummonsters
./docker/postgres-backup/restore-from-s3.sh scrummonsters/<filename>
```

Example:

```bash
./docker/postgres-backup/restore-from-s3.sh scrummonsters/scrummonsters_2026-03-09T02:00:00.sql.gz
```

#### What the Restore Script Does

The script performs these steps automatically:

1. **Downloads** the backup file from S3 to `/tmp/restore.sql.gz`
2. **Stops** the app container (prevents writes during restore)
3. **Drops and recreates** the database (connects to the `postgres` admin database to avoid active connection errors on the target database)
4. **Restores** via `gunzip | psql` — decompresses the backup and pipes it directly into PostgreSQL
5. **Verifies** data integrity by checking table count and user count
6. **Restarts** the app container and checks the health endpoint

> **CRITICAL:** The restore uses `psql` (not `pg_restore`) because backups are created by `pg_dump` in plain-text SQL format. Using `pg_restore` on a plain-text dump will fail.

#### Step 3: Post-Restore Verification

The script verifies automatically, but you can also check manually:

```bash
# Check table counts
docker compose -f docker-compose.prod.yml exec postgres psql -U scrummonsters -d scrummonsters -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"

# Check row counts in key tables
docker compose -f docker-compose.prod.yml exec postgres psql -U scrummonsters -d scrummonsters -c \
  "SELECT COUNT(*) FROM users;"

# Check app health
curl https://scrummonsters.com/api/health
```

> **Cross-reference:** See Part 6 (Database Backups) for the backup schedule (daily at 2am UTC) and how to trigger a manual backup.

---

### 9.3 Rollback to Prior Image

When to rollback: app is crash-looping after a deploy, health checks are failing, or users report a regression introduced by the latest release.

> **Cross-reference:** See Part 5 (Rollback Procedure) for the full rollback workflow including finding tags and rolling forward. This section provides the quick incident-response version.

#### Quick Rollback

Find the last known-good image tag:

```bash
docker image ls ghcr.io/xavisavvy/scrum-monsters --format "table {{.Tag}}\t{{.CreatedAt}}"
```

Roll back by setting `APP_IMAGE_TAG` inline:

```bash
APP_IMAGE_TAG=sha-XXXXXX docker compose -f docker-compose.prod.yml pull app
APP_IMAGE_TAG=sha-XXXXXX docker compose -f docker-compose.prod.yml up -d --no-deps app
```

Replace `sha-XXXXXX` with the tag of the known-good image.

#### Timing

A rollback takes under 2 minutes: the image pull is near-instant if it was previously downloaded, and the container restart takes seconds.

#### After Rollback

1. Verify: `curl https://scrummonsters.com/api/health`
2. Investigate the issue in the bad release
3. Fix, merge to main, and let CI/CD deploy the fix
4. Remove the pinned `APP_IMAGE_TAG` from `.env` (or set it back to `latest`) to resume normal deploys

---

### 9.4 Common Failure Scenarios

Each scenario includes **Symptoms**, **Diagnosis**, **Fix**, and **Verify** steps.

#### Scenario 1: OOM Kill

**Symptoms:**
- Container stops unexpectedly
- App unresponsive, health check failing
- Other containers may be affected

**Diagnosis:**

```bash
# Check kernel OOM killer logs
dmesg | grep -i oom

# Check if specific container was OOM-killed
docker inspect <container-name> | grep OOMKilled

# Check current memory usage of all containers
docker stats --no-stream
```

**Fix:**

1. Identify which container was killed from the `dmesg` output
2. If the app container was killed, restart it:
   ```bash
   docker compose -f docker-compose.prod.yml up -d app
   ```
3. If OOM kills are recurring, review memory limits. Consider reducing Prometheus retention (`--storage.tsdb.retention.size`) or lowering Grafana's memory limit. The total stack should stay under 900 MB on the 1 GB VPS.

**Verify:**

```bash
docker stats --no-stream
# All containers should be running, total memory under 900 MB
docker compose -f docker-compose.prod.yml ps
curl https://scrummonsters.com/api/health
```

---

#### Scenario 2: Disk Full

**Symptoms:**
- Database write errors in app logs
- Backup failures (postgres-backup logs show S3 upload errors or pg_dump failures)
- Container creation fails with "no space left on device"

**Diagnosis:**

```bash
# Check filesystem usage
df -h

# Check Docker disk usage
docker system df

# Check Docker data directory size
du -sh /var/lib/docker/
```

**Fix:**

1. Prune unused Docker resources:
   ```bash
   docker system prune -f
   docker image prune -a -f
   ```
   > **Warning:** `docker image prune -a -f` removes ALL unused images, including old rollback tags. Only run this if you do not need to roll back to a prior version.

2. Check for leftover restore files:
   ```bash
   ls -lah /tmp/restore*
   rm -f /tmp/restore*
   ```

3. If Prometheus data is large, consider reducing retention:
   ```bash
   # Check Prometheus data size
   docker compose -f docker-compose.prod.yml exec prometheus du -sh /prometheus
   ```

**Verify:**

```bash
df -h
# Root partition should show >20% free space
```

---

#### Scenario 3: Database Connection Exhaustion

**Symptoms:**
- App logs show "too many connections" errors
- New WebSocket connections fail
- Existing games may still work (already-established connections are unaffected)

**Diagnosis:**

```bash
# Check total connection count
docker compose -f docker-compose.prod.yml exec postgres psql -U scrummonsters -d scrummonsters -c \
  "SELECT count(*) FROM pg_stat_activity;"

# Check connections grouped by state
docker compose -f docker-compose.prod.yml exec postgres psql -U scrummonsters -d scrummonsters -c \
  "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
```

**Fix:**

Restart the app container to release all connections:

```bash
docker compose -f docker-compose.prod.yml restart app
```

If the problem recurs frequently, investigate for connection leaks in the application code (connections not being returned to the pool).

**Verify:**

```bash
# Connection count should drop after restart
docker compose -f docker-compose.prod.yml exec postgres psql -U scrummonsters -d scrummonsters -c \
  "SELECT count(*) FROM pg_stat_activity;"

# New connections should work
curl https://scrummonsters.com/api/health
```

---

#### Scenario 4: TLS Certificate Expiry

**Symptoms:**
- Browser shows security warning when visiting scrummonsters.com
- HTTPS connections fail or are rejected
- Prometheus `TLSCertExpiringSoon` alert fires (configured at 14 days warning, 7 days critical)

**Diagnosis:**

```bash
echo | openssl s_client -connect scrummonsters.com:443 -servername scrummonsters.com 2>/dev/null | openssl x509 -noout -dates
```

Check the `notAfter` date. If it is in the past or within 7 days, the certificate needs renewal.

**Fix:**

1. Verify port 80 is open in the Lightsail firewall (required for Let's Encrypt HTTP-01 challenge — do NOT close this port)

2. Check NPM renewal logs:
   ```bash
   docker compose -f docker-compose.prod.yml logs nginx-proxy-manager | grep -i "renew\|certbot\|certificate"
   ```

3. If NPM auto-renewal failed, manually re-request the certificate:
   - Open an SSH tunnel to NPM admin:
     ```bash
     ssh -L 81:localhost:81 ubuntu@34.199.135.244
     ```
   - Open `http://localhost:81` in your browser
   - Go to **SSL Certificates**, delete the expired certificate, and request a new one
   - Ensure **Force SSL** and **HTTP/2 Support** are checked

4. Do NOT close port 80 after renewal — Let's Encrypt HTTP-01 requires it permanently for future renewals

**Verify:**

```bash
# Check new certificate dates
echo | openssl s_client -connect scrummonsters.com:443 -servername scrummonsters.com 2>/dev/null | openssl x509 -noout -dates

# Browser should load without security warnings
curl https://scrummonsters.com/api/health
```

---

#### Scenario 5: App Crash Loop

**Symptoms:**
- Health check fails repeatedly
- Container restarts every ~30 seconds
- `docker ps` shows the app container in a restarting state

**Diagnosis:**

```bash
# Check recent app logs for startup errors
docker compose -f docker-compose.prod.yml logs --tail=100 app
```

Common causes: database connection failure, missing environment variables, uncaught exceptions in new code.

**Fix:**

1. **If caused by a recent deploy:** Roll back to the prior image (see Section 9.3):
   ```bash
   APP_IMAGE_TAG=sha-XXXXXX docker compose -f docker-compose.prod.yml pull app
   APP_IMAGE_TAG=sha-XXXXXX docker compose -f docker-compose.prod.yml up -d --no-deps app
   ```

2. **If the database is down:** Check and restart PostgreSQL first:
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres pg_isready
   # If not ready:
   docker compose -f docker-compose.prod.yml restart postgres
   # Wait for postgres to be healthy, then restart app:
   docker compose -f docker-compose.prod.yml restart app
   ```

3. **If environment variables are missing or wrong:**
   ```bash
   docker compose -f docker-compose.prod.yml config
   ```
   This shows the resolved compose config with all env vars substituted. Check that `DATABASE_URL`, `SESSION_SECRET`, and other required variables are present and correct.

**Verify:**

```bash
# App should be running (not restarting)
docker ps

# Health check should return 200
curl https://scrummonsters.com/api/health
```

---

*End of Part 9: Incident Response*

---

*Runbook version: Phase 36 — Disaster Recovery*
*Last updated: 2026-03-09*
