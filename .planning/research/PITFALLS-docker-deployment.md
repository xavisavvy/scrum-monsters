# Domain Pitfalls: Docker Deployment to Single VPS

**Domain:** Production Docker Compose deployments to AWS Lightsail and self-managed VPS
**Researched:** 2026-02-24
**Scale:** 50-100 concurrent users, single VPS instance

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or service outages. Must address before production launch.

### Pitfall 1: Graceful Shutdown Not Implemented

**What goes wrong:**
- Deploy new version while users are in-game
- Docker sends SIGTERM to old container
- Old container stops immediately without draining WebSocket connections
- Active games crash mid-combat, users lose progress
- Players report data loss, churn to competitors

**Why it happens:**
- SIGTERM handler seems optional when you have only 50 users
- Single instance makes it easy to skip "enterprise" patterns
- Default Node.js behavior is to exit on SIGTERM without cleanup
- WebSocket connections are stateful—killing them mid-request is destructive

**Consequences:**
- User churn from dropped games
- Negative reviews ("Lost my progress during update")
- Degraded trust in product stability
- Each deploy is a production incident

**Prevention:**
- Implement SIGTERM handler in `server/index.ts` BEFORE production
- Handler should: (1) stop accepting new connections, (2) drain existing connections for 30s, (3) close cleanly
- Configure `stop_grace_period: 30s` in docker-compose.yml to match app timeout
- Code pattern:
  ```typescript
  const server = app.listen(PORT);
  let isShuttingDown = false;

  process.on('SIGTERM', async () => {
    isShuttingDown = true;
    const gracefulTimeout = setTimeout(() => process.exit(1), 30000);

    await new Promise(resolve => {
      server.close(resolve);
    });

    clearTimeout(gracefulTimeout);
    process.exit(0);
  });
  ```

**Detection:**
- Monitor logs for "connection reset by peer" errors during deploys
- Monitor metrics: spike in 502 errors during deployment window
- Users report disconnections during specific time windows
- `docker-compose logs app` shows abrupt exit without shutdown message

**Testing (before production launch):**
1. Start a game with multiple players actively estimating
2. Run `docker-compose up -d --build` (trigger deployment)
3. Monitor logs for graceful shutdown message + no connection reset errors
4. Verify game continues without crashes
5. Load test: Use autocannon with k6 to simulate 10 concurrent users during deploy

---

### Pitfall 2: No Database Backups

**What goes wrong:**
- Ransomware encrypts database or attacker drops tables
- Database corruption from disk error (rare but possible)
- App bug causes mass data deletion
- No backup exists, data is irrecoverable
- Users lose all progress, game is unplayable

**Why it happens:**
- "It won't happen to us"
- Manual backup requires discipline (forgotten regularly)
- Perceived complexity of automated backups (actually 30 minutes)
- Single-VPS has "good enough" feeling until disaster strikes

**Consequences:**
- Complete data loss (unrecoverable if no backups)
- RTO (Recovery Time Objective) = days (manual restore from git commits)
- RPO (Recovery Point Objective) = infinite (no way to recover)
- Game shutdown, user refunds, trust destroyed

**Prevention:**
- Implement automated daily backups BEFORE production launch
- Use postgres-backup-s3 Docker sidecar (30 min setup):
  ```yaml
  services:
    postgres-backup:
      image: eeshugerman/postgres-backup-s3:latest
      environment:
        POSTGRES_HOST: postgres
        POSTGRES_DB: scrumquest
        POSTGRES_USER: scrumquest
        POSTGRES_PASSWORD: scrumquest
        S3_BUCKET: your-backup-bucket
        S3_PREFIX: backups
        AWS_ACCESS_KEY_ID: your-key
        AWS_SECRET_ACCESS_KEY: your-secret
        SCHEDULE: "0 2 * * *"  # 2am daily
      depends_on:
        postgres:
          condition: service_healthy
  ```
- Or use pg_dump + cron (simpler but requires manual scheduling)
- Set backup retention: Keep 30 days of daily backups (auto-rotate old ones)
- Document restore process: How to restore from S3 backup to fresh database

**Detection:**
- Check S3 bucket: Missing backup files for past 7 days
- Run restore test: `pg_restore` command fails on latest backup
- Missing AWS credentials in docker-compose.yml environment
- Backup files are older than expected

**Testing (before production launch):**
1. Verify backup sidecar creates file in S3 within 1 hour
2. Create a fresh PostgreSQL database and restore from backup
3. Verify restored data matches production (run data integrity checks)
4. Document RTO/RPO: e.g., "15 min RTO (restore from S3), 24h RPO (daily backups)"

**Monitoring ongoing:**
- Alert if no backup file created in past 24h
- Monthly restore test: Extract backup, verify data integrity
- Track backup size trend: Alert if >1GB (indicates data bloat)

---

### Pitfall 3: Secrets Committed to Git

**What goes wrong:**
- DATABASE_URL committed to docker-compose.yml or .env
- GitHub (public repo) exposes database connection string
- SESSION_SECRET exposed
- OAuth credentials (Google, GitHub) in code
- Attacker accesses database directly, resets passwords, exfiltrates user data
- or attacker impersonates legitimate OAuth flows

**Why it happens:**
- .gitignore misconfigured or incomplete
- Developer commits .env file by mistake
- docker-compose.yml hardcodes secrets (works locally, disaster in production)
- No automated check before commit

**Consequences:**
- Database credentials exposed publicly
- Attacker gains full database access
- User password reset or account takeover possible
- OAuth token abuse (act as users, grant evil permissions)
- Security breach notification required (GDPR/CCPA liability)
- Loss of user trust

**Prevention:**
- BEFORE FIRST COMMIT: Verify `.gitignore` includes `.env`
- Run `git check-ignore .env` → should return nothing (indicating it's ignored)
- Never put secrets in docker-compose.yml; use environment variables from .env
- Use Docker Secrets for managed deployments: secrets mounted as files
- Add pre-commit hook to prevent secret patterns:
  ```bash
  # hooks/pre-commit
  if grep -r "DATABASE_URL\|SESSION_SECRET\|PRIVATE_KEY" --include="*.ts" --include="*.js" --include="*.yml" --include="*.yaml"; then
    echo "ERROR: Secrets detected in code"
    exit 1
  fi
  ```

**Detection:**
- Run `git log --all -p -- .env | head` → check if .env ever committed
- Run `grep -r "postgresql://" .` → check for hardcoded database URLs
- GitHub secret scanning alerts (if repo public, GitHub warns about exposed secrets)

**Testing (before production launch):**
1. Verify `.gitignore` blocks `.env`: Create .env file, run `git status` (should not appear)
2. Run pre-commit hook: Attempt to add hardcoded secret, should fail
3. Verify docker-compose.yml references .env: `docker-compose config` shows real values, not literals

---

### Pitfall 4: Single Point of Failure (Inherited, Not Preventable)

**What goes wrong:**
- Lightsail instance fails (disk error, network card failure, CPU overheat)
- Entire app + database goes down simultaneously
- No backup instance running
- RTO = wait for AWS to provision replacement instance (15-30 min)
- Or restore from backup (same 15-30 min)

**Why it happens:**
- Single-instance deployment by design (simplicity vs. redundancy trade-off)
- Statistically, <1% of hardware fails per year, but "it happens"
- Budget constraints prevent multi-region failover

**Consequences:**
- 99.9% uptime impossible (SLA ≤ 99.5%, or 4 hours downtime/year)
- Visible downtime windows during incidents
- Users can't estimate/plan
- In-progress games interrupted (but backed up in database)

**Prevention:**
- Accept this constraint as part of single-VPS architecture
- Implement monitoring + fast alerting: Downtime detected in <5 min
- Prepare recovery runbook: Restore database from backup, restart app
- Trade-off: Simplicity (single instance) vs. complexity (multi-region failover)
- When RTO tolerance <30 min, plan migration to managed Kubernetes or multi-region

**Detection:**
- Uptime monitoring detects no response from `/api/health` endpoint
- Alerts fire within 5 min (Healthchecks.io, AlertManager, or similar)
- S3 backups exist for recovery

**Mitigation:**
- Automated monitoring + email alerts (required, non-negotiable)
- Database backups with automated daily schedule (required)
- Runbook documenting restore process (required)
- RTO SLA: "Best effort recovery within 30 min"

---

### Pitfall 5: Database and App Competing for Same Disk

**What goes wrong:**
- Lightsail instance has 30GB disk shared between app + database
- App logs grow unchecked (or database grows with player data)
- Disk fills to 100% (usually detected at 90-95%)
- PostgreSQL refuses new writes: "no space left on device"
- App can't write sessions, leaderboards, or game state
- Appears as read-only database, game becomes unplayable

**Why it happens:**
- Single-instance VPS inherits shared storage
- No separate managed database with independent storage
- Log rotation misconfigured or missing
- Database growth underestimated

**Consequences:**
- App appears "stuck" (queries succeed but writes fail silently)
- Data consistency issues if writes partially succeed
- Recovery: Delete old logs or compress database (downtime)
- Product outage during disk cleanup

**Prevention:**
- Monitor disk usage continuously: Alert at 80%, critical at 90%
- Configure log rotation: Pino logs → daily rotation, keep 7 days
- Track database size: PostgreSQL max should be <50% of available disk
- Use managed PostgreSQL (Lightsail RDS, $15+/mo) to separate storage (RECOMMENDED)
- If keeping database on same instance:
  - Set `POSTGRES_INITDB_ARGS="-c max_wal_size=1GB"` to prevent WAL bloat
  - Set up `pg_dump` to external storage to avoid local disk growth
  - Clean up old backups automatically

**Detection:**
- `df -h` shows >80% usage on any partition
- PostgreSQL logs show "no space left on device"
- Prometheus metric for disk usage (monitor every 15 min)
- App logs show transaction failures or deadlocks

**Testing:**
1. Check disk usage: `docker exec app df -h`
2. Estimate growth: Log volume per day, database size, calculate runway
3. Set up log rotation and verify: `docker exec app ls -la /var/log/` shows dated files
4. Set up monitoring: Prometheus node-exporter for disk metrics

---

## Moderate Pitfalls

### Pitfall 6: Health Checks Not Configured

**What goes wrong:**
- App crashes but Docker doesn't know
- Container still marked as "running" in docker ps
- Reverse proxy still routes traffic to dead container
- Users see 502 Bad Gateway or hang waiting for timeout

**Why it happens:**
- Health check seems optional when single instance is stable
- Docker doesn't auto-restart without health check feedback

**Prevention:**
- HEALTHCHECK in Dockerfile (✅ already implemented)
- Health check in docker-compose.yml for all services (✅ already implemented)
- Both are required: Dockerfile for image, Compose for orchestration

**Detection:**
- `docker ps` shows `(unhealthy)` status
- Prometheus metric `up{job="app"}` goes to 0

---

### Pitfall 7: No Uptime Monitoring

**What goes wrong:**
- App goes down at 2am on Sunday
- You don't know until Monday morning user support emails arrive
- Outage window: 6+ hours undetected
- Lost revenue, user churn

**Why it happens:**
- Monitoring setup feels like overhead
- Single instance seems "reliable enough"

**Prevention:**
- Integrate with Healthchecks.io (free tier, 5-min checks)
- Or Prometheus AlertManager (requires setup, more powerful)
- Email alert within 5 min of downtime
- Daily uptime report (nice-to-have)

**Detection:**
- No alert email received during scheduled maintenance window

---

### Pitfall 8: Nginx Reverse Proxy Configuration Errors

**What goes wrong:**
- Nginx misconfiguration → traffic routes to wrong container
- WebSocket connections broken (Nginx doesn't forward Upgrade header)
- HTTPS redirect loop (Nginx misconfigured for SSL)
- Rate limiting too aggressive (blocks real users)

**Why it happens:**
- Manual Nginx config is error-prone
- WebSocket routing requires specific headers

**Prevention:**
- Use Nginx Proxy Manager (GUI, auto-generates config)
- If manual Nginx: Verify WebSocket headers are forwarded:
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
- Test: WebSocket connection via `websocat ws://localhost:5000` before production

**Detection:**
- WebSocket test fails: `websocat ws://yourdomain.com` hangs or fails
- Browser DevTools: WebSocket connection shows 502 or Upgrade failed

---

### Pitfall 9: Forgetting to Set stop_grace_period in docker-compose.yml

**What goes wrong:**
- Default Docker grace period: 10 seconds
- Graceful shutdown handler takes 30 seconds
- Docker sends SIGKILL after 10s, killing connections mid-drain
- Same effect as "Graceful Shutdown Not Implemented"

**Why it happens:**
- grace period setting is obscure
- Works locally without it (local deploys are less frequent)

**Prevention:**
- In docker-compose.yml, set: `stop_grace_period: 30s` for app service
- Must be ≥ graceful shutdown handler timeout

**Detection:**
- Logs show SIGKILL (exit code 137) after short delay

---

## Minor Pitfalls

### Pitfall 10: Environment Variable Names Hardcoded

**What goes wrong:**
- Code expects DATABASE_URL, but environment only has DB_URL
- Connection fails silently or with cryptic error

**Prevention:**
- Document all required environment variables in README or .env.example
- Add validation at startup: Check all required vars present
  ```typescript
  const requiredEnvVars = ['DATABASE_URL', 'SESSION_SECRET'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) throw new Error(`Missing ${envVar}`);
  }
  ```

**Detection:**
- App startup logs show "undefined" value or connection error to `undefined`

---

### Pitfall 11: Image Pulled from "latest" Tag

**What goes wrong:**
- docker-compose.yml uses `image: postgres:latest`
- New version released with breaking changes
- Next `docker-compose pull` gets new version, app breaks

**Prevention:**
- Always pin versions: `postgres:16-alpine` (not `postgres:latest`)
- Document version upgrades in changelog

**Detection:**
- Unexpected version bump in `docker images` list

---

### Pitfall 12: No Rolling Updates Strategy

**What goes wrong:**
- Simple `docker-compose down && docker-compose up` causes downtime
- All services stop simultaneously
- Even with graceful shutdown, you still have downtime window

**Prevention:**
- Use `docker-compose up -d --no-deps --build app` (update only app service)
- Database continues running, no downtime
- Or implement blue-green deployment (Phase 4)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation | Severity |
|-------|----------------|-----------|----------|
| **Phase 1** | TLS cert misconfiguration (wrong domain, self-signed) | Test with curl, verify cert chain matches domain | Medium |
| **Phase 1** | Systemd service file has wrong syntax, app doesn't auto-restart | Test with `sudo reboot`, verify running after 2 min | High |
| **Phase 2** | SIGTERM handler not implemented or tested | Deploy during active game, verify no crashes | Critical |
| **Phase 2** | postgres-backup-s3 credential error, no backups created | Check S3 bucket, verify IAM user has PutObject permission | Critical |
| **Phase 2** | Health check endpoint broken (returns 500), Docker kills healthy container | Test `/api/health` directly, verify it returns 200 | High |
| **Phase 3** | Prometheus scrape failing, no metrics collected | Check Prometheus targets page (`/targets`), verify scrape config | Medium |
| **Phase 4** | Blue-green deploy with sticky storage causes session conflicts | Ensure using PostgreSQL session store (not app memory) | High |

---

## Common Debugging Patterns

### "Docker says unhealthy but app works"
- Health check endpoint broken or slow
- Run manually: `curl http://localhost:5000/api/health` (should be <3 sec, return 200)
- Check logs: `docker-compose logs app | grep -i health`
- Increase timeout: `timeout: 10s` → `timeout: 15s`

### "Graceful shutdown hangs, deploy stuck"
- Check if server closing connections properly
- Add logs: `console.log('Shutting down...')` in SIGTERM handler
- Verify grace period: `stop_grace_period: 30s` matches app timeout
- Test locally: `docker-compose down` should complete in <30s

### "WebSocket connections keep dropping during deploy"
- Reverse proxy not forwarding Upgrade header
- Confirm Nginx has:
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
- Or test: `websocat ws://yourdomain.com/socket.io` (should connect)

### "Database fills disk after 1 week"
- Check what's growing: `SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database;`
- Common culprits: Transaction logs (WAL), session store bloat, old backups on disk
- Clean up: `docker exec postgres vacuumdb -U scrumquest scrumquest` (maintenance)

---

## Verification Checklist: Pitfall Prevention

Before production launch:

- [ ] **Graceful shutdown implemented:** SIGTERM handler in server/index.ts, stop_grace_period: 30s in docker-compose.yml, tested during active game
- [ ] **Database backups automated:** postgres-backup-s3 or pg_dump cron, S3 bucket has files from past 7 days, restore test successful
- [ ] **Secrets NOT in git:** .gitignore includes .env, git check-ignore .env returns nothing, no secrets in docker-compose.yml
- [ ] **Single point of failure accepted:** RTO/RPO documented, uptime monitoring configured, recovery runbook written
- [ ] **Disk usage monitored:** Alert at 80%, log rotation configured, database size forecast <50% disk
- [ ] **Health checks working:** docker ps shows (healthy), curl /api/health returns 200 in <3s, Dockerfile HEALTHCHECK present
- [ ] **Uptime alerts active:** Healthchecks.io or AlertManager configured, test alert email received within 5 min
- [ ] **Nginx reverse proxy tested:** curl https://yourdomain.com works, WebSocket test via websocat succeeds
- [ ] **stop_grace_period set:** docker-compose.yml specifies 30s timeout
- [ ] **Environment variables validated:** Code checks required vars at startup, .env.example documents all vars

---

## Recovery Runbook Template

Save this in your ops documentation:

```markdown
# Incident Response: App Down

## Detection
- Alert: Healthchecks.io or AlertManager email
- Verify: curl https://yourdomain.com returns 502 or times out

## Diagnosis
1. SSH to Lightsail instance
2. Check app status: docker-compose ps
   - If all services "Up": Problem might be network/reverse proxy
   - If app "Exited": Check logs: docker-compose logs app (last 50 lines)
3. Check disk: df -h (if >90%, database can't write)
4. Check postgres: docker-compose ps postgres (should show "healthy")

## Recovery (Choose One)

### Option A: Restart App (Most Common)
- docker-compose restart app
- Wait 2 min for health check to pass
- Verify: curl https://yourdomain.com

### Option B: Restart All Services
- docker-compose restart
- Wait 5 min for all to stabilize
- Verify: curl https://yourdomain.com

### Option C: Restore from Backup (Data Corruption)
- Download backup from S3
- docker-compose down
- docker volume rm postgres_data
- docker-compose up -d postgres (wait for healthy)
- Restore: docker exec postgres pg_restore -U scrumquest scrumquest < backup.dump
- docker-compose up -d

## Verification
- [ ] curl https://yourdomain.com returns 200
- [ ] docker-compose ps shows all (healthy)
- [ ] Users report game works
- [ ] Check logs for errors: docker-compose logs --tail 100

## Post-Incident
- [ ] Review logs for root cause
- [ ] Document what failed
- [ ] Add monitoring to prevent recurrence
- [ ] Test recovery runbook monthly
```

---

**Research completed:** 2026-02-24
**Confidence:** HIGH — Pitfalls derived from community post-mortems, best-practice documentation, and production failure patterns.
