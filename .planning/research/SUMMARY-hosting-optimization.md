# Research Summary: Hosting Optimization & PostgreSQL Setup

**Domain:** Full-stack TypeScript WebSocket application infrastructure
**Researched:** 2026-02-19
**Overall confidence:** HIGH

## Executive Summary

ScrumQuest is currently deployed on Replit ($20/month Core plan) with in-memory storage. This research evaluates cost-optimized hosting alternatives, managed PostgreSQL options, and resource profiling strategies to support migration to production-ready infrastructure within a $5-20/month budget.

**Key findings:** Render.com ($7/month) paired with Neon PostgreSQL (free tier with scale-to-zero) provides the best value for WebSocket applications. The combination costs ~$10-15/month actual usage vs. current $20/month, while adding persistent sessions, automated backups, and better observability. Railway ($5/month + usage) offers a compelling development alternative with PostgreSQL included. Both platforms natively support WebSocket persistent connections without arbitrary timeouts.

**Critical insight:** Most cost overruns stem from misconfigured connection pools (causing "too many connections" errors) and missing idle timeouts (blocking scale-to-zero). The postgres.js driver already installed requires only configuration changes (max: 10, idle_timeout: 20, prepare: false for serverless) to avoid these pitfalls.

**Migration complexity:** LOW. The app already uses Drizzle ORM with PostgreSQL-compatible schema and has connect-pg-simple installed for session persistence. Primary changes are environment variables (DATABASE_URL, SESSION_SECRET) and graceful shutdown implementation (SIGTERM handler). No major code refactoring required.

## Key Findings

**Stack:** Render.com ($7/month) + Neon PostgreSQL (free tier → ~$0-5/month with scale-to-zero) + PM2 for process management + existing Prometheus/Grafana for monitoring. Alternative: Railway Hobby ($5/month all-in with PostgreSQL included) for development/staging.

**Architecture:** Single-instance deployment initially (10-100 users), PostgreSQL session persistence via connect-pg-simple (already installed), connection pool tuned to platform limits (max: 10 for Neon free tier), graceful shutdown via SIGTERM handler to prevent dropped WebSocket connections during deploys.

**Critical pitfall:** Connection pool exhaustion. Default postgres.js pool (10 connections) × multiple instances can exceed Neon free tier limits (shared pool) or Railway limits (97 connections). Solution: Calculate max per instance based on platform: `Math.floor(platformLimit / instanceCount / 2)` with 50% safety margin. Monitor with Prometheus metric: `postgres_connections_active / postgres_connections_max`.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 1: Database Setup & Migration (Week 1)**
   - Addresses: PostgreSQL schema creation, connection pooling configuration
   - Avoids: Connection exhaustion (configure max before migration), prepared statement errors (disable for serverless)
   - Dependencies: Drizzle schema already defined (shared/schema.ts), DATABASE_URL environment variable
   - Tasks: Create Neon project, run `npm run db:push`, verify tables, configure connection pool in server/storage.ts

2. **Phase 2: Platform Deployment (Week 1-2)**
   - Addresses: Render/Railway service setup, environment variable configuration, health check validation
   - Avoids: Abrupt shutdowns (implement SIGTERM handler), session loss (PostgreSQL session store)
   - Dependencies: DATABASE_URL from Phase 1, SESSION_SECRET generation
   - Tasks: Create platform account, link GitHub repo, set env vars, configure health check path, test deployment

3. **Phase 3: Production Hardening (Week 2)**
   - Addresses: Graceful shutdown, session persistence, backup verification
   - Avoids: Dropped connections on deploy, multi-instance session mismatch
   - Dependencies: Platform deployment from Phase 2
   - Tasks: Add SIGTERM handler, verify connect-pg-simple working, test manual database restore, PM2 setup (optional)

4. **Phase 4: Observability & Profiling (Week 3-4)**
   - Addresses: Resource usage monitoring, cost tracking, performance baselines
   - Avoids: Blind performance issues, cost overruns
   - Dependencies: Production deployment from Phase 3
   - Tasks: Install socket.io-prometheus, configure Grafana dashboard, run autocannon baseline tests, set up billing alerts

**Phase ordering rationale:**
- Database must exist before app deployment (schema creation first)
- Platform deployment can happen quickly once database ready (minimal code changes)
- Production hardening builds on working deployment (graceful shutdown tested in staging)
- Observability comes last (need production traffic to monitor)

**Research flags for phases:**
- Phase 1: Likely needs deeper research on connection pool sizing for specific traffic patterns (run load tests to determine optimal max)
- Phase 3: Standard patterns, unlikely to need research (graceful shutdown well-documented)
- Phase 4: May need deeper research on custom Socket.IO metrics (socket.io-prometheus integration with existing prom-client)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All platforms verified with 2026 pricing, WebSocket support confirmed via official docs, postgres.js already installed and compatible |
| Features | HIGH | Feature requirements straightforward (session persistence, health checks, graceful shutdown), all supported by chosen platforms |
| Architecture | HIGH | Patterns well-established (connection pooling, SIGTERM handling), existing app structure compatible (Express + Socket.IO + Drizzle) |
| Pitfalls | HIGH | Critical pitfalls documented with detection/recovery procedures, connection pool exhaustion reproduced in community discussions |

## Gaps to Address

**Areas where research was inconclusive:**
- **Optimal connection pool size for specific traffic patterns:** Research provides general guidance (max: 10-20), but actual optimal size depends on concurrent user count and query patterns. RECOMMENDATION: Start with conservative max: 10, run load tests (existing k6 tests in tests/load/), monitor `postgres_connections_active` metric, adjust based on 80% threshold.

- **PM2 cluster mode vs single instance for WebSocket apps:** Research confirms PM2 cluster works with Socket.IO (requires Redis adapter for shared state), but cost-benefit unclear at <100 users. RECOMMENDATION: Defer cluster mode until single instance CPU >80%, use platform auto-scaling instead (simpler, no Redis dependency).

- **Socket.IO load testing with k6:** Confirmed k6 doesn't support Socket.IO protocol out-of-box (GitHub issue #3097: "bad handshake"). Custom xk6 extension required (Go knowledge). RECOMMENDATION: Use autocannon with custom Socket.IO client logic for HTTP benchmarking, or defer Socket.IO-specific load testing until scale demands it (artillery as alternative).

**Topics needing phase-specific research later:**
- **Phase 4 (Observability):** Custom Prometheus metrics for Socket.IO rooms and events. socket.io-prometheus provides connection count, but may need custom metrics for game-specific events (phase transitions, boss damage). Investigate prom-client Counter/Histogram integration.

- **Post-MVP (Scaling):** Redis adapter for Socket.IO when scaling beyond single instance. Research didn't cover Redis setup on Render/Railway (Upstash Redis already in dependencies, but configuration unclear). Investigate when approaching 100 concurrent users.

- **Post-MVP (Cost optimization):** Egress bandwidth optimization strategies. Research confirmed costs ($0.10/GB Railway, $30/100GB Render), but didn't cover reduction techniques (compression, CDN for static assets). Investigate if bandwidth becomes >50% of costs.

## Cost Projections (10 concurrent users)

| Platform Combo | Monthly Cost | Notes |
|----------------|--------------|-------|
| **Railway Hobby + PostgreSQL** | $5-8/month | PostgreSQL included in credits, likely under $5 usage, pay-per-use egress ($0.10/GB), excellent for development |
| **Render + Neon Free** | $7-10/month | $7 Render instance + Neon free tier (likely $0-3 with scale-to-zero), best for production |
| **Render + Neon Launch** | $26/month | If Neon free tier exceeded (unlikely at <100 users), but includes 100 CU-hours compute |
| **Replit Core (current)** | $20/month | Already paying this, migration saves $10-13/month |
| **AWS Lightsail** | $5-8/month | $5 instance + overage bandwidth, but more hands-on setup required |

**At scale (100 users):** Render ($7) + Neon Launch ($19, likely <$15 actual with scale-to-zero) = ~$22/month. Still cheaper than current Replit with better observability.

**Break-even analysis:** Migration pays for itself in Month 1 (saves $10/month vs. Replit) while adding persistent sessions, automated backups, and monitoring capabilities.

## Resource Baseline Estimates

Based on app structure (Express + Socket.IO + in-memory lobbies + Drizzle ORM):

| Metric | Estimated Usage (10 users) | Measurement Method |
|--------|----------------------------|-------------------|
| **RAM** | 150-300MB | `process.memoryUsage().rss` in health endpoint, existing Prometheus metric |
| **CPU** | <10% (0.1 vCPU) | Platform dashboard, spikes during combat calculations |
| **Bandwidth** | ~5GB/month | 10 users × 50KB/session × 10 sessions/user/month, WebSocket efficient |
| **Database Size** | <100MB | User profiles (1KB each) + stats + sessions + estimation history |
| **PostgreSQL Connections** | 5-10 concurrent | Session store + query pool, monitor with `SELECT count(*) FROM pg_stat_activity` |
| **Socket.IO Connections** | 10 concurrent | Prometheus metric from socket.io-prometheus: `socketio_connected_total` |

**Validation strategy:**
1. Deploy to staging with 1 test user
2. Run existing load tests (tests/load/websocket/game-flow.test.js) with k6
3. Monitor Render dashboard + Prometheus metrics for 24 hours
4. Adjust connection pool based on actual usage (target: <80% of max)
5. Repeat at 10, 50, 100 simulated users (autocannon + k6)

## Recommended Next Steps

### Immediate (Before Migration)
1. **Generate SESSION_SECRET:** `openssl rand -base64 32` → save to .env
2. **Create Neon account:** Free tier, no credit card required for trial
3. **Test locally with PostgreSQL:** Docker Compose already has postgres service (npm run services:up)
4. **Verify schema migration:** `npm run db:push` against local PostgreSQL
5. **Review connection pool config:** Check server/storage.ts for max/idle_timeout settings

### Migration Week
1. **Day 1-2:** Database setup (Neon project, schema migration, connection pool tuning)
2. **Day 3-4:** Platform deployment (Render/Railway account, GitHub link, env vars, first deploy)
3. **Day 5:** Production hardening (SIGTERM handler, session persistence test, backup verification)
4. **Day 6-7:** Validation (health checks, load testing with autocannon, cost monitoring setup)

### Post-Migration
1. **Week 2:** Observability setup (socket.io-prometheus, Grafana dashboard, alerts)
2. **Week 3:** Performance baseline (run existing k6 tests, establish SLOs, document metrics)
3. **Week 4:** Cost review (analyze actual usage vs. projections, optimize if needed)

### Deferred (Until Scale Demands)
- PM2 cluster mode (wait until single instance CPU >80%)
- Multi-region deployment (wait until latency complaints >500ms)
- Redis session store (wait until >10K concurrent sessions)
- CDN for static assets (wait until bandwidth >50GB/month)
- Database read replicas (wait until database CPU >60%)

## Tools & Resources

### Essential (Install Now)
- **autocannon:** `npm install -D autocannon` — HTTP load testing, clinic.js integration
- **PM2:** `npm install -g pm2` — Production process management (optional for single instance)
- **socket.io-prometheus:** `npm install socket.io-prometheus` — WebSocket metrics export

### Optional (Install Later)
- **clinic.js:** `npm install -D clinic` — Deep profiling (CPU, memory, event loop)
- **artillery:** `npm install -D artillery` — Advanced load testing with YAML configs
- **0x:** `npm install -D 0x` — Flamegraph profiling (alternative to clinic.js)

### Monitoring Setup
- **Existing:** prom-client@^15.1.3, Prometheus + Grafana (k8s/infrastructure/monitoring/)
- **Add:** [Grafana Node.js Observability Dashboard](https://grafana.com/grafana/dashboards/24439-nodejs-observability/) — Pre-configured panels for Express + Socket.IO
- **Configure:** Prometheus scrape config to hit `/metrics` endpoint every 15s

### Documentation Links
- [Render Deployment Guide](https://render.com/docs/deploy-node-express-app)
- [Railway Quick Start](https://docs.railway.com/quick-start)
- [Neon Quick Start](https://neon.com/docs/get-started-with-neon/signing-up)
- [postgres.js Documentation](https://github.com/porsager/postgres)
- [Drizzle ORM Best Practices](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)

## Success Criteria

Migration is successful when:

- [ ] Application deployed to Render/Railway (public URL accessible)
- [ ] PostgreSQL database connected (users table exists, schema matches shared/schema.ts)
- [ ] Sessions persist across app restarts (login once, survives deploy)
- [ ] Health checks pass (platform marks instance healthy)
- [ ] WebSocket connections work (game lobby functional, no random disconnects)
- [ ] Graceful shutdown implemented (SIGTERM logs "graceful shutdown", no dropped connections)
- [ ] Connection pool configured (max based on platform limit, idle_timeout set)
- [ ] Cost monitoring enabled (platform billing alerts at $20 threshold)
- [ ] Prometheus metrics exporting (/metrics endpoint returns data)
- [ ] Load test baseline established (autocannon results documented, SLOs defined)
- [ ] Monthly cost < $15/month (lower than current Replit $20/month)

**Quality:** Migration should improve reliability (persistent sessions, automated backups), observability (Prometheus metrics, Grafana dashboards), and cost (lower monthly bill) without requiring major code refactoring. Existing app structure (Express + Socket.IO + Drizzle) is migration-ready with only configuration changes.

---
*Research Summary for: Hosting optimization and PostgreSQL setup*
*Researched: 2026-02-19*
*Confidence: HIGH — Comprehensive coverage of hosting platforms, database options, profiling tools, and migration patterns. All recommendations verified with 2026 pricing and official documentation.*
