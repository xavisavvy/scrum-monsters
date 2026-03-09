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

*Runbook version: Phase 35 — Monitoring & Observability*
*Last updated: 2026-03-09*
