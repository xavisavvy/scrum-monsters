# Stack Research: Hosting Optimization & PostgreSQL Setup

**Domain:** Full-stack TypeScript WebSocket application hosting optimization
**Researched:** 2026-02-19
**Confidence:** HIGH

## Recommended Stack

### Hosting Platform

| Technology | Pricing | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Render.com** | $7/month starter | Primary production hosting | Native WebSocket support without timeouts, persistent connections, $30/100GB bandwidth (reduced in 2025), service-based scaling, no arbitrary connection limits |
| **Railway** | $5/month + usage | Alternative/development | PostgreSQL included in credits, one-click database setup, pay-per-use model ($0.10/GB egress), excellent DX, but no permanent free tier |
| **Fly.io** | Variable (complex pricing) | Global low-latency needs | Best for multi-region deployments, edge compute, WebSocket support, but pricing requires spreadsheet planning |
| **AWS Lightsail** | $5/month (1 vCPU, 0.5GB RAM, 1TB transfer) | Budget-constrained production | Predictable pricing, Node.js blueprint, WebSocket support, data overage $0.09/GB, 3-month free trial on select bundles |

### Managed PostgreSQL

| Service | Free Tier | Paid Starting | Purpose | Why Recommended |
|---------|-----------|---------------|---------|-----------------|
| **Neon** | 100 CU-hours/mo, 0.5GB storage, 5GB egress | $19/month (Launch) | Primary database | Serverless autoscaling, scale-to-zero (huge cost savings), 2025 pricing cuts (storage $0.35/GB-month), branches for testing, HTTP API, connection pooling built-in |
| **Supabase** | 0.5GB storage, 500MB database, 50K MAU | $25/month (Pro) | Alternative with auth | Includes auth/realtime/storage, fixed compute instances, higher base cost but bundled features |
| **Railway PostgreSQL** | Included in $5/month credits | $5/month + usage | Development/staging | One-click setup, usage-based pricing, excellent for ephemeral environments |

### Resource Profiling Tools

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| **clinic.js** | Latest | CPU/memory/event loop profiling | Deep performance analysis, identifying bottlenecks, memory leaks, event loop delays |
| **autocannon** | Latest | HTTP load testing | Quick benchmarks, integration with clinic.js via `--autocannon` flag, programmatic API |
| **prom-client** | ^15.1.3 (already installed) | Prometheus metrics | Production monitoring, custom Socket.IO connection metrics, already integrated in app |
| **PM2** | Latest | Process management & monitoring | Production deployments, memory limit auto-restart, real-time dashboard, zero-downtime reloads |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **postgres** | ^3.4.8 (installed) | PostgreSQL driver | Already using with Drizzle ORM, excellent connection pooling, prepared statement control |
| **connect-pg-simple** | ^10.0.0 (installed) | PostgreSQL session store | Production session persistence, already configured in server/index.ts |
| **artillery** | Latest | Advanced load testing | Complex scenarios, serverless distributed testing, YAML-based test definitions |
| **socket.io-prometheus** | Latest | Socket.IO metrics exporter | Tracking concurrent connections, room counts, event throughput for monitoring |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Grafana + Prometheus + Loki** | Observability stack | Industry standard 2026, pre-configured dashboards for Node.js, log aggregation with Loki, already have k8s/infrastructure/monitoring/ setup |
| **k6** | Load testing | Already have tests/load/ setup, native WebSocket support, but Socket.IO requires custom extension (see Pitfalls) |

## Installation

```bash
# Production dependencies (if adding new tools)
npm install pm2 -g                    # Global install for production

# Development dependencies
npm install -D clinic autocannon artillery socket.io-prometheus

# Optional: For advanced profiling
npm install -D 0x                     # Flamegraph profiling
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Render.com** | Replit ($20/month Core) | Use Replit if: already deployed there, need integrated AI agent, value dev environment + hosting bundle. Cost: $20/mo base + $1/mo autoscale deployments |
| **Render.com** | DigitalOcean App Platform ($3/month starter) | Use DO if: need K8s integration path, already use DO infrastructure, comfortable with more hands-on setup. WebSocket support confirmed via wss:// |
| **Neon PostgreSQL** | Supabase | Use Supabase if: need built-in auth/realtime/storage, prefer fixed compute instances, want all-in-one backend platform |
| **Neon PostgreSQL** | Railway PostgreSQL | Use Railway if: hosting app on Railway (reduces egress costs), prefer operational simplicity, okay with higher costs at scale |
| **clinic.js** | Node.js built-in profiler | Use built-in if: can't install dependencies, need zero-overhead baseline, comfortable with Chrome DevTools for analysis |
| **autocannon** | artillery | Use artillery if: need complex multi-step scenarios, serverless distributed load testing, prefer YAML config over programmatic |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Heroku** | Expensive at scale ($7/dyno + $9/Postgres = $16/mo minimum), free tier removed, better alternatives exist | Render, Railway, or Fly.io |
| **In-memory session store** | Data loss on restart, doesn't work with multiple instances | connect-pg-simple (already installed) with PostgreSQL |
| **Generic WebSocket tools for Socket.IO load testing** | Socket.IO protocol differs from standard WebSocket (handshake issues, bad handshake errors) | Use Socket.IO-specific extensions for k6 or autocannon with custom logic |
| **Always-on PostgreSQL for development** | Wastes money when not coding | Neon with scale-to-zero (1-minute idle timeout configurable) |
| **AWS RDS for small projects** | Minimum ~$15/month, no free tier, over-engineered for this scale | Neon (serverless) or Railway (usage-based) |
| **Synchronous heap snapshots in production** | Performance impact, can cause timeouts | PM2 profiling with throttling, scheduled during maintenance windows |

## Stack Patterns by Budget

**Budget: $5-10/month (Development/Low Traffic)**
- Railway Hobby ($5/month) with included PostgreSQL
- Neon Free tier (100 CU-hours, scale-to-zero)
- clinic.js + autocannon for local profiling
- Use existing k6 tests for load validation

**Budget: $15-20/month (Production Ready)**
- Render.com Web Service ($7/month) + Neon Launch ($19/month but likely under with scale-to-zero) = ~$10-15/mo actual
- PM2 for process management
- Prometheus + Grafana (existing k8s setup)
- socket.io-prometheus for connection metrics

**Budget: $20+/month (High Availability)**
- Render.com with auto-scaling + Neon Scale tier
- Multiple regions via Fly.io (if latency critical)
- Full observability stack (Prometheus + Loki + Grafana)
- Artillery for distributed load testing

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| postgres@^3.4.8 | drizzle-orm@^0.45.1 | Already installed and working, ensure `max` connections configured based on hosting platform limits |
| prom-client@^15.1.3 | socket.io@^4.8.3 | Already installed, use socket.io-prometheus for easier integration |
| clinic.js | Node.js 18+ | Works with current tsx@^4.21.0 dev setup |
| PM2 | Node.js 18+ | Cluster mode requires same Node version across workers |

## Configuration Best Practices

### PostgreSQL Connection Pooling

```typescript
// For Neon (serverless)
const client = postgres(process.env.DATABASE_URL, {
  max: 10,              // Limit based on Neon plan (Free: shared, Launch: 100 max)
  idle_timeout: 20,     // Close idle connections after 20s
  connect_timeout: 10,  // Fail fast on connection issues
  prepare: false,       // Disable prepared statements for serverless compatibility
});

// For Railway/traditional hosting
const client = postgres(process.env.DATABASE_URL, {
  max: 20,                      // Higher limit for dedicated instances
  idle_timeout: 30,             // Keep connections longer
  connectionTimeoutMillis: 2000,
  prepare: true,                // Enable for performance
});
```

### PM2 Memory Management

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'scrumquest',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '500M',  // Auto-restart if memory exceeds limit
    env: {
      NODE_ENV: 'production',
    },
  }],
};
```

### Prometheus Metrics for Socket.IO

```typescript
// Add to server/metrics.ts
import { register } from 'prom-client';
import socketIOPrometheus from 'socket.io-prometheus';

// Apply to Socket.IO instance
socketIOPrometheus(io, {
  collectDefaultMetrics: true,
  checkForNewNamespaces: true,
});

// Metrics endpoint already exists at /metrics
```

## Resource Estimation (for 10 concurrent users)

Based on existing app structure and typical Socket.IO usage:

| Resource | Expected Usage | Notes |
|----------|---------------|-------|
| **RAM** | 150-300MB | Express + Socket.IO + in-memory state, measure with `process.memoryUsage().rss` |
| **CPU** | <10% (0.1 vCPU) | Mostly idle, spikes during combat calculations, React Three Fiber renders client-side |
| **Bandwidth** | ~5GB/month | 10 users × 50KB/session × 10 sessions/user/month, WebSocket is efficient |
| **Database** | <100MB | User profiles, stats, estimation history, sessions table |
| **Connections** | 5-10 concurrent | PostgreSQL connections (session store + queries), use pooling |

**Scaling implications:**
- 100 users: ~1.5GB RAM, ~50GB bandwidth/month
- 1000 users: Need horizontal scaling (PM2 cluster + Redis for shared state)

## Monitoring Strategy

### Development Phase
1. Use clinic.js for one-time profiling sessions
2. Run autocannon against local server to establish baselines
3. Execute existing k6 load tests (tests/load/websocket/game-flow.test.js)
4. Monitor with `process.memoryUsage()` in health endpoint

### Production Phase
1. PM2 for process monitoring and auto-restart
2. Prometheus + Grafana (existing k8s setup) for metrics
3. socket.io-prometheus for connection tracking
4. Loki for log aggregation (existing k8s/infrastructure/monitoring/)
5. Set PM2 memory limit to 80% of platform RAM allocation

## Sources

### Hosting Platforms
- [Render.com Pricing](https://render.com/pricing) — WebSocket support, 2026 pricing
- [Render WebSocket Documentation](https://render.com/docs/websocket) — Persistent connection details, no timeouts
- [Railway Pricing 2026](https://railway.com/pricing) — $5/month Hobby tier, PostgreSQL included
- [Railway Pricing Plans Documentation](https://docs.railway.com/reference/pricing/plans) — Free tier limits, usage credits
- [Fly.io Pricing](https://fly.io/pricing/) — Complex pricing model, global deployment
- [AWS Lightsail Pricing](https://aws.amazon.com/lightsail/pricing/) — Node.js blueprint, WebSocket support
- [DigitalOcean App Platform Pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) — WebSocket support confirmed
- [Replit Pricing](https://replit.com/pricing) — Core plan $20/month, 4 vCPUs, 8GB RAM
- [Replit Deployment Pricing Docs](https://docs.replit.com/billing/deployment-pricing) — Autoscale deployments $1/month

### Managed PostgreSQL
- [Neon Pricing 2026](https://neon.com/pricing) — Free tier, Launch $19/month, scale-to-zero
- [Neon Plans Documentation](https://neon.com/docs/introduction/plans) — 100 CU-hours free tier, connection limits
- [Neon Serverless Postgres Pricing Analysis](https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/) — 2025 pricing cuts, storage $0.35/GB-month
- [Supabase vs Neon Comparison](https://www.bytebase.com/blog/neon-vs-supabase/) — Feature comparison, pricing models
- [Top Managed PostgreSQL Services](https://seenode.com/blog/top-managed-postgresql-services-compared/) — 2025 edition comparison

### Resource Profiling
- [clinic.js Official Site](https://clinicjs.org/) — Memory profiling, autocannon integration
- [clinic.js GitHub](https://github.com/clinicjs/node-clinic) — Documentation, usage examples
- [Tracking Memory Allocation in Node.js](https://nearform.com/insights/tracking-memory-allocation-node-js/) — Flamegraph analysis
- [Node.js Memory Profiling Guide](https://oneuptime.com/blog/post/2026-01-26-nodejs-memory-leak-profiling/view) — 2026 best practices
- [PM2 Monitoring Documentation](https://pm2.keymetrics.io/docs/usage/monitoring/) — Real-time dashboard, metrics
- [PM2 Memory Limit Reload](https://pm2.keymetrics.io/docs/usage/memory-limit/) — Auto-restart configuration
- [Optimize Node.js for Production 2026](https://forwardemail.net/en/blog/docs/optimize-nodejs-performance-production-monitoring-pm2-health-checks) — PM2 best practices

### Load Testing
- [k6 WebSocket Documentation](https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/) — Native WebSocket support
- [k6 Socket.IO Issue #3097](https://github.com/grafana/k6/issues/3097) — Socket.IO compatibility challenges
- [autocannon npm package](https://www.npmjs.com/package/autocannon) — HTTP/1.1 and HTTP/2 benchmarking
- [artillery vs autocannon comparison](https://npmtrends.com/artillery-vs-autocannon-vs-grinder-vs-jmeter-vs-loadtest) — Feature comparison, download stats
- [Load Testing Node.js Apps](https://v-checha.medium.com/load-testing-tools-for-node-js-developers-98291ed75a4b) — Tool comparison guide

### Monitoring & Observability
- [prom-client GitHub](https://github.com/siimon/prom-client) — Prometheus client for Node.js
- [socket.io-prometheus GitHub](https://github.com/shamil/socket.io-prometheus) — Socket.IO metrics collector
- [Custom Metrics with Prometheus](https://oneuptime.com/blog/post/2026-01-06-nodejs-custom-metrics-prometheus/view) — prom-client examples
- [Grafana Node.js Observability Dashboard](https://grafana.com/grafana/dashboards/24439-nodejs-observability/) — Pre-configured dashboard
- [Prometheus, Loki, Grafana Integration 2026](https://johal.in/cloud-native-observability-stack-prometheus-grafana-loki-and-tempo-integration-for-full-stack-monitoring-2026-3/) — Full stack monitoring

### Database Connection Pooling
- [Drizzle ORM PostgreSQL Best Practices](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717) — Connection pool configuration
- [Drizzle ORM with Node.js](https://oneuptime.com/blog/post/2026-02-03-nodejs-drizzle-orm/view) — 2026 usage guide
- [postgres.js connection pooling discussion](https://www.answeroverflow.com/m/1154016477381414932) — Best practices, max connections

---
*Stack research for: Hosting optimization and PostgreSQL setup*
*Researched: 2026-02-19*
*Confidence: HIGH — All hosting platforms verified with 2026 pricing, PostgreSQL services confirmed with current free tier limits, profiling tools actively maintained*
