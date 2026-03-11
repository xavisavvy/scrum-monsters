# Domain Pitfalls: Docker, VPS Deployment, CI/CD, and On-Instance Monitoring

**Domain:** Deploying Node.js/Socket.IO real-time app to single VPS with Docker Compose, GitHub Actions CI/CD, and on-instance Prometheus/Grafana monitoring.

**Researched:** 2026-02-24

**Confidence:** HIGH (existing codebase analysis + verified sources on deployment patterns, WebSocket scaling, Docker best practices)

---

## Critical Pitfalls

Mistakes that cause major outages, data loss, or architecture rewrites.

### Pitfall 1: Graceful Shutdown Not Implemented — WebSocket Connections Dropped on Deploys

**What goes wrong:**
When Docker receives SIGTERM signal (deployment/restart), if app doesn't handle it, process gets killed immediately. Hundreds of concurrent WebSocket connections are terminated abruptly, players see "connection lost", lobby states become inconsistent, and in-memory game state is lost.

**Why it happens:**
- npm/yarn in CMD wraps the Node process and doesn't forward SIGTERM to child process
- No signal handlers in server/index.ts for SIGTERM/SIGINT
- No connection draining timeout before exit
- Dockerfile uses `CMD ["npm", "start"]` instead of direct node execution

**Consequences:**
- Player data loss (unsaved game scores/lobby state)
- Inconsistent database state (partially written transactions)
- Cascading failures as clients reconnect and retry operations
- Deployments appear to hang because connections don't close

**Prevention:**
1. **Use direct Node execution in Dockerfile:**
   ```dockerfile
   # Bad - npm doesn't forward signals
   CMD ["npm", "start"]

   # Good - direct execution
   CMD ["node", "dist/index.js"]
   ```

2. **Implement SIGTERM handler in server/index.ts:**
   ```typescript
   process.on('SIGTERM', async () => {
     httpLogger.info('SIGTERM received, starting graceful shutdown');

     // Stop accepting new connections
     server.close(() => {
       httpLogger.info('HTTP server closed');
     });

     // Drain existing WebSocket connections (notify clients to reconnect)
     io.on('connection', (socket) => {
       socket.emit('server_shutting_down', { message: 'Server restarting, please reconnect' });
       socket.disconnect(true);
     });

     // Force exit after timeout (30s for graceful drain)
     setTimeout(() => {
       httpLogger.warn('Graceful shutdown timeout, forcing exit');
       process.exit(0);
     }, 30000);
   });
   ```

3. **Set docker-compose stop grace period:**
   ```yaml
   services:
     app:
       stop_grace_period: 45s  # Docker waits 45s before SIGKILL
   ```

4. **Test locally:**
   ```bash
   docker-compose up
   # In another terminal:
   docker-compose kill -s SIGTERM app
   # Should see logs showing graceful shutdown
   ```

**Detection:**
- CI/CD deployments pause for 30+ seconds (expected while draining connections)
- Test: Send SIGTERM and check if connections close cleanly
- Monitor: Check logs during deployments for "graceful shutdown" message

**Phase:** Phase 7 (CI/CD Foundations) — Must be done BEFORE Docker deployment.

---

### Pitfall 2: Memory Leak in Socket.IO Under High Connection Volume

**What goes wrong:**
As concurrent players connect, memory usage climbs continuously without dropping. Within hours on a 1GB VPS, kernel OOM killer terminates the Node process entirely, causing complete service outage.

**Why it happens:**
- Socket.IO has documented issues where disconnected connections aren't fully cleaned up from memory
- In-memory game state (gameState.lobbies, gameState.players) grows indefinitely
- Redis connection leaks if not closed on disconnect
- Prometheus metrics accumulate memory if tracking per-player labels (cardinality explosion)
- No Docker memory limits set (container uses all available RAM)

**Consequences:**
- Unplanned outages during peak play times
- Service unavailable to all players (not graceful degradation)
- Lost revenue and frustrated players
- Post-mortem requires memory profiling

**Prevention:**
1. **Set Docker memory limits in docker-compose:**
   ```yaml
   services:
     app:
       deploy:
         resources:
           limits:
             memory: 512M  # Container killed if exceeds this
           reservations:
             memory: 256M  # Minimum guaranteed
   ```
   This ensures app container dies before exhausting VPS (other services survive).

2. **Implement connection cleanup in socketHandlers.ts:**
   ```typescript
   socket.on('disconnect', () => {
     // Remove player from all lobbies immediately
     gameState.removePlayerFromLobbies(socket.id);

     // Clean up timers/intervals associated with this socket
     clearInterval(playerTimers.get(socket.id));
     playerTimers.delete(socket.id);

     socketLogger.debug(`Player disconnected: ${socket.id}`);
   });
   ```

3. **Implement periodic state cleanup:**
   ```typescript
   // Every 5 minutes, clean old/inactive lobbies
   setInterval(() => {
     const now = Date.now();
     gameState.lobbies.forEach((lobby, id) => {
       if (lobby.status === 'idle' && (now - lobby.lastActive) > 10 * 60 * 1000) {
         gameState.lobbies.delete(id);
         httpLogger.info(`Cleaned inactive lobby: ${id}`);
       }
     });
   }, 5 * 60 * 1000);
   ```

4. **Monitor memory with Prometheus:**
   ```typescript
   // Add to metrics.ts
   const nodeMemory = new prom.Gauge({
     name: 'nodejs_memory_bytes',
     help: 'Node.js memory usage',
     labelNames: ['type'],
   });

   setInterval(() => {
     const mem = process.memoryUsage();
     nodeMemory.labels('rss').set(mem.rss);
     nodeMemory.labels('heapUsed').set(mem.heapUsed);
   }, 10000);
   ```

**Detection:**
- Grafana dashboard shows monotonically increasing memory over hours
- `docker stats` shows container approaching 512MB
- App becomes sluggish before OOM (GC pauses increase)
- Alert: Set threshold at 80% memory usage

**Phase:** Phase 8 (Docker Deployment) and Phase 9 (Observability) — monitoring dashboards critical.

---

### Pitfall 3: TLS Certificate Expiration Breaks Deployment

**What goes wrong:**
Let's Encrypt certificate expires after 90 days. Renewal automation failed silently. HTTPS connections start failing. Players can't connect to the game. Issue only discovered when users report outage.

**Why it happens:**
- No automated renewal process set up (manual renewal forgotten)
- Renewal script fails but no alert configured
- Docker volume not persisted on host (certificate lost on restart)
- Reverse proxy (nginx) not configured to reload certificates after renewal
- No monitoring for certificate expiration dates

**Consequences:**
- Complete service unavailability for HTTPS clients
- Trust warnings in browsers
- Players can't play the game
- 30+ minutes to diagnose and fix

**Prevention:**
1. **Use Caddy reverse proxy** (automatic TLS) instead of manual nginx + certbot:
   ```yaml
   services:
     caddy:
       image: caddy:alpine
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile
         - caddy_data:/data      # Persist certificates
         - caddy_config:/config
       command: caddy run --watch
       restart: unless-stopped

     app:
       image: scrumquest:latest
       ports:
         - "5000:5000"
   ```

   Caddyfile:
   ```
   scrumquest.example.com {
       reverse_proxy app:5000
   }
   ```

   Caddy automatically obtains and renews certificates, handles HTTP→HTTPS redirect.

2. **OR automated certbot renewal with persistence:**
   ```yaml
   services:
     certbot:
       image: certbot/certbot:latest
       volumes:
         - /etc/letsencrypt:/etc/letsencrypt  # Persist on host
         - /var/www/certbot:/var/www/certbot
       entrypoint: /bin/sh -c "trap exit TERM; while :; do certbot renew --non-interactive --agree-tos --email admin@example.com --webroot -w /var/www/certbot -d scrumquest.example.com; sleep 24h & wait $${!}; done"
       restart: unless-stopped
   ```

3. **Monitor certificate expiration:**
   ```typescript
   setInterval(() => {
     try {
       const cert = fs.readFileSync('/etc/letsencrypt/live/scrumquest.example.com/cert.pem');
       // Parse cert and check expiry date
       // Log warning if < 30 days remaining
     } catch (err) {
       httpLogger.error({ err }, 'Failed to check certificate');
     }
   }, 24 * 60 * 60 * 1000);  // Daily
   ```

**Detection:**
- Test: `openssl s_client -connect scrumquest.example.com:443 | grep -A2 Validity`
- Set Prometheus alert for cert expiry < 30 days
- Test renewal in staging environment first

**Phase:** Phase 8 (Docker Deployment) — Must decide: Caddy or certbot before going live.

---

### Pitfall 4: PostgreSQL Connection Exhaustion on App Restart

**What goes wrong:**
After deploying a new version, PostgreSQL reports "too many connections" error. New connections from app can't be created. App crashes. Service is down until PostgreSQL restarted manually.

**Why it happens:**
- App creates connections but doesn't close them properly on shutdown
- Drizzle ORM/pg pool not receiving graceful shutdown signal
- Docker killed app before connections drained
- No connection pooling layer (each Node process opens 5-10 direct connections)
- Multiple app instances each exhaust connection limits

**Consequences:**
- Service outage lasting 5-30 minutes (manual PG restart required)
- Data loss if app had uncommitted transactions
- Cascading failures if other services depend on the app

**Prevention:**
1. **Implement proper database connection cleanup:**
   ```typescript
   // server/storage.ts
   async function closeDatabase() {
     if (db && typeof db.end === 'function') {
       try {
         await db.end();
         httpLogger.info('Database connections closed');
       } catch (err) {
         httpLogger.error({ err }, 'Error closing database');
       }
     }
   }

   process.on('SIGTERM', async () => {
     httpLogger.info('SIGTERM: Closing database connections');
     await closeDatabase();
     process.exit(0);
   });
   ```

2. **Add connection pooling layer (PgBouncer):**
   ```yaml
   services:
     pgbouncer:
       image: pgbouncer/pgbouncer:latest
       environment:
         DATABASES_HOST: postgres
         DATABASES_PORT: 5432
         DATABASES_USER: scrumquest
         DATABASES_PASSWORD: scrumquest
         DATABASES_DBNAME: scrumquest
         PGBOUNCER_POOL_MODE: transaction
         PGBOUNCER_MAX_CLIENT_CONN: 1000
         PGBOUNCER_DEFAULT_POOL_SIZE: 25
       ports:
         - "6432:6432"
       depends_on:
         postgres:
           condition: service_healthy

     app:
       environment:
         # Connect to PgBouncer instead of PostgreSQL directly
         DATABASE_URL: postgres://scrumquest:scrumquest@pgbouncer:6432/scrumquest
   ```

3. **Monitor connection count:**
   ```typescript
   setInterval(async () => {
     try {
       const result = await db.execute(
         sql`SELECT count(*) as count FROM pg_stat_activity`
       );
       metrics.pgConnections.set(result[0].count);
     } catch (err) {
       httpLogger.warn({ err }, 'Failed to check PG connections');
     }
   }, 30000);
   ```

**Detection:**
- Logs show "too many connections" error from PostgreSQL
- `psql -c "SELECT count(*) FROM pg_stat_activity;"`
- Monitor: pg_stat_activity count in Prometheus
- Alert if connections > 80% of max_connections (default 100)

**Phase:** Phase 8 (Docker Deployment) — connections must be managed before going to production.

---

### Pitfall 5: Monitoring Stack Consumes All Available Memory on 1GB VPS

**What goes wrong:**
Prometheus and Grafana running on the same 1GB VPS as the app. After a few days, entire server becomes unresponsive. Prometheus consuming 400MB+, Grafana dashboards take 10+ seconds to load, app gets starved of resources.

**Why it happens:**
- Prometheus scrapes high-cardinality metrics (per-player connection gauge = millions of time series)
- No retention policy configured (keeps all data indefinitely)
- Grafana dashboard queries are expensive (range queries on massive datasets)
- No resource limits set on monitoring containers
- Metrics not cleaned up when players disconnect (stale label values)

**Consequences:**
- Entire server becomes unusable
- Debugging ability lost (dashboards too slow to load)
- Monitoring causes the problem it's supposed to alert on
- Resource contention causes false alerts

**Prevention:**
1. **Run monitoring on separate VPS** (STRONGLY RECOMMENDED):
   - VPS #1 (1GB, $5/mo): App + PostgreSQL + Redis
   - VPS #2 (2GB, $10/mo): Prometheus + Grafana + Loki
   - Even $10/mo extra prevents this pitfall entirely

2. **If monitoring must be on-instance, set strict resource limits:**
   ```yaml
   services:
     prometheus:
       deploy:
         resources:
           limits:
             memory: 256M
           reservations:
             memory: 128M

     grafana:
       deploy:
         resources:
           limits:
             memory: 256M
           reservations:
             memory: 128M
   ```

3. **Configure Prometheus retention:**
   ```yaml
   prometheus:
     command:
       - '--storage.tsdb.retention.time=7d'   # Only keep 7 days
       - '--storage.tsdb.retention.size=500MB'  # Cap disk usage
   ```

4. **Reduce metric cardinality:**
   ```typescript
   // DON'T do this:
   const playerConnected = new prom.Gauge({
     name: 'player_connected',
     labelNames: ['playerId'],  // Creates metric for EVERY player!
   });

   // DO THIS instead:
   const totalPlayersConnected = new prom.Gauge({
     name: 'total_players_connected',
   });

   setInterval(() => {
     totalPlayersConnected.set(gameState.getConnectedPlayerCount());
   }, 30000);
   ```

5. **Increase scrape interval:**
   ```yaml
   global:
     scrape_interval: 60s   # Don't scrape every 15 seconds
     evaluation_interval: 60s
   ```

**Detection:**
- `docker stats` shows Prometheus/Grafana using > 30% of RAM
- Grafana dashboards load slowly (> 3s)
- Prometheus UI is unresponsive
- App performance degrades when dashboards are open

**Phase:** Phase 9 (Observability) — Make explicit decision before building monitoring dashboards.

---

## Moderate Pitfalls

Mistakes that cause downtime, data loss, or significant rework.

### Pitfall 6: Missing Health Checks — Load Balancer Routes to Dead Containers

**What goes wrong:**
Container crashes and Docker restarts it. During restart (10-30 seconds), app is unreachable, but load balancer still routes traffic to restarting instance, causing request failures.

**Why it happens:**
- No HEALTHCHECK in Dockerfile
- Health check endpoint doesn't check dependencies (database, Redis)
- Health check timeout too short (app starts but dependencies aren't ready)

**Consequences:**
- Request failures while container restarts
- Intermittent player disconnections
- Load balancer sees mixed success/failure

**Prevention:**
1. **Add health check in Dockerfile:**
   ```dockerfile
   HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
     CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1
   ```

2. **Implement comprehensive /api/health endpoint:**
   ```typescript
   app.get('/api/health', async (req, res) => {
     try {
       // Check database
       await db.execute(sql`SELECT 1`);

       // Check Redis
       await redis.ping();

       // Check game state initialized
       if (!gameState.isInitialized()) {
         return res.status(503).json({ status: 'initializing' });
       }

       res.json({ status: 'healthy', timestamp: new Date().toISOString() });
     } catch (err) {
       httpLogger.error({ err }, 'Health check failed');
       res.status(503).json({ status: 'unhealthy', error: err.message });
     }
   });
   ```

**Detection:**
- `docker-compose ps` shows "unhealthy" in STATUS column
- Test: Stop Redis, restart container, health check should fail
- Monitor: `docker stats` shows container restarting frequently

**Phase:** Phase 8 (Docker Deployment).

---

### Pitfall 7: Secrets Exposed in Image or Logs

**What goes wrong:**
Production secrets (DATABASE_URL, SESSION_SECRET) baked into Docker image or printed in logs. Anyone with access to image or logs has database credentials.

**Why it happens:**
- `.env` file copied into Docker image during build
- Full environment logged on startup
- Error stack traces include sensitive values
- Secrets passed as build ARG instead of runtime ENV

**Consequences:**
- Production database accessible to attackers
- Session keys compromised
- OAuth credentials stolen
- Compliance violations (GDPR, SOC2)

**Prevention:**
1. **Don't bake secrets into image:**
   ```dockerfile
   # Bad
   COPY .env .

   # Good - no secrets in Dockerfile
   ```

2. **Pass secrets at runtime via docker-compose:**
   ```yaml
   app:
     image: scrumquest:latest
     environment:
       - NODE_ENV=production
       - DATABASE_URL=${DATABASE_URL}
       - SESSION_SECRET=${SESSION_SECRET}
   ```

   File: `.env.production.local` (not in git):
   ```
   DATABASE_URL=postgres://user:pass@postgres:5432/scrumquest
   SESSION_SECRET=long-random-string
   ```

3. **Don't log environment variables:**
   ```typescript
   // Bad
   httpLogger.info(process.env);

   // Good
   httpLogger.info({
     NODE_ENV: process.env.NODE_ENV,
   }, 'Environment initialized');
   ```

**Detection:**
- `docker inspect scrumquest | grep -A20 Env` should not show credentials
- Search logs for "postgresql://" or "SESSION_SECRET"

**Phase:** Phase 8 (Docker Deployment) - Security essentials.

---

### Pitfall 8: No Rollback Strategy for Deployments

**What goes wrong:**
New version has a bug. Deployed to production. Players can't create lobbies. No way to rollback quickly. Manually revert code, rebuild, redeploy (20+ minutes downtime).

**Why it happens:**
- No semantic versioning on images
- Docker image tag overwrites `latest` on each build
- CI/CD pipeline doesn't preserve previous working versions
- No documented rollback procedure

**Consequences:**
- Extended outage (20-60 minutes)
- Lost revenue
- Players may uninstall game

**Prevention:**
1. **Tag images with semantic versions and commit SHAs:**
   ```yaml
   # .github/workflows/docker.yml
   - name: Build and push
     uses: docker/build-push-action@v5
     with:
       tags: |
         scrumquest:latest
         scrumquest:v${{ github.event.release.tag_name }}
         scrumquest:${{ github.sha }}
   ```

2. **Keep image history on registry (don't delete old tags)**

3. **Create rollback script:**
   ```bash
   # scripts/rollback.sh
   #!/bin/bash
   VERSION=$1
   docker pull scrumquest:${VERSION}
   docker-compose down app
   docker-compose up -d --no-deps scrumquest:${VERSION} app
   ```

4. **Document runbook:**
   ```
   ## Emergency Rollback
   If prod breaks:
   1. Check previous version: docker ps | grep scrumquest
   2. Rollback: ./scripts/rollback.sh v1.0.1
   3. Verify: curl https://scrumquest.example.com/api/health
   ```

**Detection:**
- Test: Deploy broken version, attempt rollback, measure time
- Verify: `docker images scrumquest | head -10` shows 10+ tags

**Phase:** Phase 7 (CI/CD Foundations).

---

### Pitfall 9: Database Migrations Not Coordinated with Deployments

**What goes wrong:**
Schema change deployed. Migration script fails or gets skipped. App writes new format, old code still reads old format. Data corruption or runtime errors.

**Why it happens:**
- Migration not part of deployment process
- Migrations run before code, or after (order matters)
- No validation migrations ran successfully before starting app

**Consequences:**
- Database corruption
- Runtime errors ("column doesn't exist")
- Incomplete rollback

**Prevention:**
1. **Run migrations before app starts:**
   ```yaml
   services:
     app:
       depends_on:
         migrate:
           condition: service_completed_successfully

     migrate:
       image: scrumquest:latest
       command: npm run db:migrate
       environment:
         - DATABASE_URL
         - NODE_ENV=production
   ```

2. **Validate schema before starting:**
   ```typescript
   // server/index.ts
   async function validateDatabase() {
     const tables = await db.execute(sql`
       SELECT tablename FROM pg_tables WHERE schemaname='public'
     `);
     const actualTables = tables.map(t => t.tablename);
     const expectedTables = ['users', 'lobbies', 'sessions'];

     for (const table of expectedTables) {
       if (!actualTables.includes(table)) {
         httpLogger.fatal(`Missing table: ${table}`);
         process.exit(1);
       }
     }
   }

   await validateDatabase();
   ```

3. **Use drizzle-kit migrate (not db:push) in production**

**Detection:**
- Verify: `SELECT * FROM drizzle_migrations;`
- Test: Deploy schema change, verify `db:migrate` completes

**Phase:** Phase 8 (Docker Deployment).

---

## Minor Pitfalls

Mistakes that cause performance issues or extra debugging work.

### Pitfall 10: No Log Aggregation — Can't Diagnose Production Issues

**What goes wrong:**
Player reports an issue. SSH into VPS, try to tail logs, but error is already gone. Logs mixed between app/database/redis/nginx. Can't find root cause.

**Why it happens:**
- Logs only on container (lost on restart)
- No structured logging (hard to grep)
- Multiple services logging to stdout (hard to correlate)
- No log aggregation tool

**Consequences:**
- Can't diagnose production issues
- Debugging takes 10x longer

**Prevention:**
1. **Use structured logging (JSON) with Pino:**
   ```typescript
   httpLogger.info({ playerId, lobbyId, action: 'join' }, 'Player joined');
   ```

2. **Persist logs to host volume:**
   ```yaml
   app:
     volumes:
       - ./logs:/app/logs
   ```

3. **Better: Use Loki for log aggregation:**
   ```yaml
   loki:
     image: grafana/loki:latest
     ports:
       - "3100:3100"
     volumes:
       - loki_data:/loki

   app:
     logging:
       driver: loki
       options:
         loki-url: http://loki:3100/loki/api/v1/push
   ```

**Detection:**
- Try to find a specific error in production logs
- If it takes > 5 minutes, logging isn't sufficient

**Phase:** Phase 9 (Observability).

---

### Pitfall 11: Socket.IO Reconnection Issues (Single Server)

**What goes wrong:**
Player has intermittent network. Socket.IO reconnects, but session state was lost. Player sees "not in this lobby" error.

**Why it happens:**
- No session persistence (game state is in-memory only)
- No Redis adapter for Socket.IO
- reconnection_delay too short

**Prevention:**
1. **Use Redis adapter (for future scaling):**
   ```typescript
   import { createAdapter } from '@socket.io/redis-adapter';

   io.adapter(createAdapter(pubClient, subClient));
   ```

2. **Persist game state to database:**
   ```typescript
   async function createLobby(players) {
     const lobbyId = generateId();
     await db.insert(lobbies).values({ id: lobbyId, players });
     gameState.lobbies.set(lobbyId, ...);
   }
   ```

3. **Load on reconnect:**
   ```typescript
   socket.on('rejoin_lobby', async (lobbyId) => {
     let lobby = gameState.lobbies.get(lobbyId);
     if (!lobby) {
       lobby = await db.query.lobbies.findFirst({ where: eq(lobbies.id, lobbyId) });
     }
     socket.emit('lobby_state', lobby);
   });
   ```

**Phase:** Phase 3 (Game State Management) — persistence strategy needed.

---

### Pitfall 12: Reverse Proxy Not Configured for WebSocket

**What goes wrong:**
Players can't connect over HTTPS. Works locally, broken in production behind nginx.

**Why it happens:**
- Nginx not configured to upgrade HTTP to WebSocket
- Missing `Upgrade` and `Connection` headers
- Timeouts too short for long-lived connections

**Prevention:**
1. **Configure nginx for WebSocket:**
   ```nginx
   upstream app {
     server app:5000;
   }

   server {
     listen 443 ssl http2;

     location / {
       proxy_pass http://app;

       # WebSocket support
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";

       # Long-lived timeouts
       proxy_read_timeout 86400;
       proxy_send_timeout 86400;

       # Disable buffering
       proxy_buffering off;
     }
   }
   ```

2. **Or use Caddy (automatic):**
   ```caddyfile
   scrumquest.example.com {
     reverse_proxy app:5000
   }
   ```

**Detection:**
- Test: `curl -i https://scrumquest.example.com/api/health` works, WebSocket fails
- Check nginx logs for "upgrade" errors

**Phase:** Phase 8 (Docker Deployment).

---

## Phase-Specific Warnings

| Phase | Warning | Mitigation |
|-------|---------|-----------|
| Phase 7: CI/CD | Graceful shutdown not implemented | Use `CMD ["node", "dist/index.js"]`, add SIGTERM handler |
| Phase 7: CI/CD | No image versioning strategy | Add semantic version + commit SHA tags |
| Phase 7: CI/CD | No health checks | Implement /api/health checking all dependencies |
| Phase 7: CI/CD | Reverse proxy misconfigured | Configure WebSocket upgrade headers |
| Phase 8: Docker Deployment | Secrets in environment | Pass secrets at runtime, don't log them |
| Phase 8: Docker Deployment | TLS renewal not automated | Use Caddy or automated certbot |
| Phase 8: Docker Deployment | Connection pooling missing | Add PgBouncer, graceful shutdown |
| Phase 8: Docker Deployment | Database migrations not coordinated | Run migrations before app starts |
| Phase 9: Observability | Monitoring consumes all memory | Separate VPS or strict resource limits |
| Phase 9: Observability | Socket.IO memory leak | Set Docker memory limits, clean up disconnects |
| Phase 9: Observability | No log aggregation | Use Loki or persist to volume |

---

## Summary of Highest-Priority Pitfalls

1. **Graceful shutdown** (Phase 7) - Prevents data loss
2. **Health checks** (Phase 7) - Prevents routing to dead containers
3. **Memory limits** (Phase 8) - Prevents OOM kills
4. **TLS automation** (Phase 8) - Prevents certificate expiration
5. **Connection pooling** (Phase 8) - Prevents "too many connections"
6. **Monitoring isolation** (Phase 9) - Prevents monitoring from breaking app

---

## Sources

- [WebSockets: The Complete Guide for 2026 | DevToolbox](https://devtoolbox.dedyn.io/blog/websocket-complete-guide)
- [Deploy Your Node.js Application on a VPS: Step-By-Step Guide](https://monovm.com/blog/node-js-on-vps/)
- [Memory usage | Socket.IO Documentation](https://socket.io/docs/v4/memory-usage/)
- [The Complete Guide to Docker Resource Limits](https://eastondev.com/blog/en/posts/dev/20251218-docker-resource-limits-guide/)
- [Prometheus & Grafana: The Complete Monitoring Guide for 2026](https://devtoolbox.dedyn.io/blog/prometheus-grafana-complete-guide)
- [Docker Compose: The Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/docker-compose-complete-guide)
- [GitHub Actions CI/CD: The Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/github-actions-cicd-complete-guide)
- [Automating TLS certificate management in Docker](https://smallstep.com/blog/automate-docker-ssl-tls-certificates/)
- [PostgreSQL Connection Pooling with PgBouncer](https://oneuptime.com/blog/post/2026-02-02-postgresql-pgbouncer-pooling/)
- [How to Set Up Docker Health Checks That Actually Work](https://oneuptime.com/blog/post/2026-01-06-docker-health-checks/)
- [4 Ways to Securely Store & Manage Secrets in Docker](https://blog.gitguardian.com/how-to-handle-secrets-in-docker/)
- [How to Configure WebSocket with Load Balancers](https://oneuptime.com/blog/post/2026-01-24-websocket-load-balancer-configuration/)
- [How to Handle Docker Container Graceful Shutdown](https://oneuptime.com/blog/post/2026-01-16-docker-graceful-shutdown-signals/)
- [Graceful shutdown with Node.js and Kubernetes](https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/)

---

*Deployment pitfalls research for: ScrumQuest — Docker, VPS, CI/CD, and on-instance monitoring*
*Researched: 2026-02-24*
*Confidence: HIGH (existing codebase + verified sources)*
