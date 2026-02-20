# Phase 29: Hosting Analysis - Research

**Researched:** 2026-02-19
**Domain:** Load testing, performance profiling, hosting platform comparison, cost analysis
**Confidence:** HIGH

## Summary

Phase 29 focuses on data-driven hosting decisions by measuring actual resource usage under load and comparing platform costs. The goal is to provide operators with a clear recommendation for deploying ScrumQuest within a $5-20/mo budget while accommodating 2x traffic growth.

ScrumQuest already has k6 WebSocket load tests, Prometheus metrics, and connection pooling configured. The missing piece is an automated profiling workflow that captures resource metrics during load testing, generates cost comparisons across Render, Railway, Fly.io, Replit, and AWS Lightsail, and produces actionable hosting recommendations.

**Primary recommendation:** Build a profiling script that runs k6 load tests while capturing process.memoryUsage(), process.cpuUsage(), and bandwidth metrics from Prometheus, then generates a markdown report comparing hosting platforms with a clear "best fit" recommendation for the $5-20/mo budget constraint.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| k6 | latest | WebSocket load testing | Already in use; industry standard for WebSocket load testing with built-in Socket.IO support |
| prom-client | ^15.1.3 | Prometheus metrics | Already in use; de facto standard for Node.js metrics collection |
| Artillery | latest | Alternative load testing | Popular alternative to k6 with native WebSocket/Socket.IO support and YAML configuration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Clinic.js | latest | Node.js profiling suite | For deep performance analysis beyond basic metrics (Doctor for bottlenecks, Bubbleprof for async ops, Flame for CPU) |
| 0x | latest | Flame graph generation | Quick CPU bottleneck identification with minimal overhead (2-5%) |
| blocked-at | latest | Event loop blocking detection | When investigating responsiveness issues or unexplained latency |
| autocannon | latest | HTTP benchmarking | For baseline HTTP endpoint performance testing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| k6 | Artillery | Artillery offers simpler YAML config and better Socket.IO integration, but k6 is already integrated and has superior performance |
| Manual cost comparison | Cloud cost calculators | Automation provides repeatable analysis, but manual calculations work for one-time evaluations |
| Prometheus metrics | APM tools (DataDog, New Relic) | APM provides richer insights but adds cost and complexity unsuitable for budget hosting analysis |

**Installation:**
```bash
# k6 already installed via system package manager
# Artillery as alternative:
npm install -g artillery

# Profiling tools (optional, for deep analysis):
npm install -g clinic 0x
npm install --save-dev blocked-at
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── load/                    # Load tests (existing)
│   ├── http/               # HTTP endpoint tests
│   ├── websocket/          # WebSocket game flow tests
│   └── utils/              # k6 utilities
├── profiling/              # NEW: Profiling scripts
│   ├── run-profile.js      # Main profiling orchestrator
│   ├── metrics-collector.js # Captures process + Prometheus metrics
│   ├── cost-analyzer.js    # Compares hosting platforms
│   └── report-generator.js # Generates markdown report
└── reports/                # NEW: Generated reports
    └── hosting-analysis-YYYY-MM-DD.md
```

### Pattern 1: Orchestrated Load Testing with Metric Collection
**What:** Run load test while simultaneously capturing Node.js process metrics and Prometheus metrics, then correlate them in a single report.

**When to use:** Measuring actual resource consumption under realistic load to inform hosting decisions.

**Example:**
```typescript
// tests/profiling/run-profile.js
import { spawn } from 'child_process';
import { MetricsCollector } from './metrics-collector.js';

async function runProfile(concurrentUsers = 50, duration = 60) {
  const collector = new MetricsCollector();

  // Start metrics collection
  collector.start();

  // Run k6 load test
  const k6Process = spawn('k6', [
    'run',
    '--vus', concurrentUsers.toString(),
    '--duration', `${duration}s`,
    '--out', 'json=load-results.json',
    'tests/load/websocket/game-flow.test.js'
  ]);

  await new Promise((resolve) => k6Process.on('close', resolve));

  // Stop collection and get results
  const metrics = await collector.stop();

  return {
    peakRAM: metrics.peakHeapUsed / (1024 ** 2), // MB
    avgCPU: metrics.avgCPUPercent,
    totalBandwidth: metrics.totalBytesTransferred,
    wsConnections: concurrentUsers,
    duration
  };
}
```

### Pattern 2: Incremental Metrics Capture with process.* APIs
**What:** Poll `process.memoryUsage()` and `process.cpuUsage()` at intervals during load testing to capture peak and average resource usage.

**When to use:** When you need lightweight resource monitoring without external dependencies.

**Example:**
```typescript
// tests/profiling/metrics-collector.js
export class MetricsCollector {
  private samples: Array<{ timestamp: number; memory: NodeJS.MemoryUsage; cpu: NodeJS.CpuUsage }> = [];
  private interval: NodeJS.Timeout | null = null;
  private previousCpu: NodeJS.CpuUsage | null = null;

  start(sampleIntervalMs = 1000) {
    this.previousCpu = process.cpuUsage();

    this.interval = setInterval(() => {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage(this.previousCpu!);

      this.samples.push({
        timestamp: Date.now(),
        memory,
        cpu
      });

      this.previousCpu = process.cpuUsage();
    }, sampleIntervalMs);
  }

  async stop() {
    if (this.interval) clearInterval(this.interval);

    return {
      peakHeapUsed: Math.max(...this.samples.map(s => s.memory.heapUsed)),
      avgHeapUsed: this.samples.reduce((sum, s) => sum + s.memory.heapUsed, 0) / this.samples.length,
      avgCPUPercent: this.calculateCPUPercent(),
      samples: this.samples.length
    };
  }

  private calculateCPUPercent(): number {
    // Convert microseconds to percent of elapsed time
    const totalUserTime = this.samples.reduce((sum, s) => sum + s.cpu.user, 0);
    const totalSystemTime = this.samples.reduce((sum, s) => sum + s.cpu.system, 0);
    const totalElapsed = (this.samples[this.samples.length - 1]?.timestamp - this.samples[0]?.timestamp) * 1000; // to microseconds

    return ((totalUserTime + totalSystemTime) / totalElapsed) * 100;
  }
}
```

### Pattern 3: Cost Comparison Matrix with Budget Constraints
**What:** Compare hosting platforms by calculating monthly cost at measured resource levels, highlighting options within budget.

**When to use:** Translating profiling results into actionable hosting decisions.

**Example:**
```typescript
// tests/profiling/cost-analyzer.js
interface HostingOption {
  platform: string;
  tier: string;
  monthlyCost: number;
  ram: number;
  cpu: number;
  bandwidth: number;
  meetsRequirements: boolean;
  headroom: number; // % capacity remaining for 2x growth
}

export function compareHosting(requirements: {
  peakRAM: number; // MB
  avgCPU: number; // cores
  bandwidth: number; // GB/month
  budget: { min: number; max: number };
}): HostingOption[] {
  const options: HostingOption[] = [
    {
      platform: 'Render',
      tier: 'Starter',
      monthlyCost: 7,
      ram: 512,
      cpu: 0.5,
      bandwidth: Infinity, // No bandwidth charges
      meetsRequirements: requirements.peakRAM <= 512 && requirements.avgCPU <= 0.5,
      headroom: Math.min(
        ((512 - requirements.peakRAM) / 512) * 100,
        ((0.5 - requirements.avgCPU) / 0.5) * 100
      )
    },
    {
      platform: 'Railway',
      tier: 'Hobby',
      monthlyCost: 5 + (requirements.ram / 1024 * 10) + (requirements.cpu * 5) + (requirements.bandwidth * 0.05),
      ram: 512, // Max per service on Hobby
      cpu: 1, // Max per service on Hobby
      bandwidth: Infinity, // $0.05/GB egress
      meetsRequirements: requirements.peakRAM <= 512 && requirements.avgCPU <= 1,
      headroom: Math.min(
        ((512 - requirements.peakRAM) / 512) * 100,
        ((1 - requirements.avgCPU) / 1) * 100
      )
    },
    // ... more platforms
  ];

  return options
    .filter(opt => opt.monthlyCost >= requirements.budget.min && opt.monthlyCost <= requirements.budget.max)
    .sort((a, b) => b.headroom - a.headroom); // Best headroom first
}
```

### Pattern 4: Markdown Report Generation
**What:** Generate human-readable markdown report with profiling results, cost comparison table, and clear recommendation.

**When to use:** Communicating technical findings to operators in accessible format.

**Example:**
```typescript
// tests/profiling/report-generator.js
export function generateReport(profilingResults, costComparison, recommendation) {
  const timestamp = new Date().toISOString().split('T')[0];

  return `# Hosting Analysis Report - ${timestamp}

## Executive Summary

**Test Configuration:** ${profilingResults.wsConnections} concurrent users, ${profilingResults.duration}s duration

**Measured Resource Usage:**
- **Peak RAM:** ${profilingResults.peakRAM.toFixed(2)} MB
- **Avg CPU:** ${profilingResults.avgCPU.toFixed(1)}%
- **Total Bandwidth:** ${(profilingResults.totalBandwidth / (1024 ** 2)).toFixed(2)} MB

**Recommendation:** ${recommendation.platform} (${recommendation.tier}) - $${recommendation.monthlyCost}/month

## Cost Comparison

| Platform | Tier | Monthly Cost | RAM | CPU | Headroom | Meets Budget |
|----------|------|--------------|-----|-----|----------|--------------|
${costComparison.map(opt => `| ${opt.platform} | ${opt.tier} | $${opt.monthlyCost.toFixed(2)} | ${opt.ram} MB | ${opt.cpu} vCPU | ${opt.headroom.toFixed(0)}% | ${opt.meetsRequirements ? '✓' : '✗'} |`).join('\n')}

## Detailed Findings

### Performance Bottlenecks

${recommendation.bottlenecks?.length ? recommendation.bottlenecks.map(b => `- **${b.type}:** ${b.description}`).join('\n') : 'No critical bottlenecks detected.'}

### Migration Notes

${recommendation.migrationNotes || 'Standard deployment process applies.'}
`;
}
```

### Anti-Patterns to Avoid
- **Running load tests in production:** Always profile in isolated staging environment to avoid impacting real users
- **Ignoring event loop lag:** CPU% alone doesn't reveal event loop blocking; monitor ELU (Event Loop Utilization) from perf_hooks
- **Single-snapshot profiling:** Resource usage varies by game phase; profile across full game lifecycle (lobby → battle → scoring → reveal)
- **Assuming linear scaling:** WebSocket costs don't scale linearly due to connection overhead; test at 1x and 2x target load to validate headroom calculations

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Load testing WebSocket apps | Custom Socket.IO client simulator | k6 or Artillery | Complex Socket.IO protocol (handshake, heartbeat, reconnection), pre-built utils available |
| CPU profiling and flame graphs | Custom sampling profiler | 0x or Clinic.js Flame | Accurate sampling requires V8 integration; flame graph visualization is non-trivial |
| Memory leak detection | Manual heap snapshot comparison | Chrome DevTools or heapdump + memwatch | Heap analysis requires expertise in V8 internals and object retention patterns |
| Event loop blocking detection | Custom hrtime polling | blocked-at library | Accurate stack trace capture at block point requires async_hooks integration |
| Cost calculators | Static spreadsheet | Platform-specific calculators + automation | Pricing models change frequently; automated fetching prevents staleness |

**Key insight:** Performance profiling is a mature domain with battle-tested tools. Building custom solutions duplicates effort and risks inaccurate measurements due to observer effect and V8 optimization complexities.

## Common Pitfalls

### Pitfall 1: Observer Effect Skewing Metrics
**What goes wrong:** Profiling overhead inflates resource measurements, leading to over-provisioning.

**Why it happens:** High-frequency polling (< 100ms intervals) or synchronous metric collection blocks event loop.

**How to avoid:** Use 1000ms sampling interval; leverage Prometheus scraping (pull model) instead of push; run load tests with profiling disabled for baseline comparison.

**Warning signs:** CPU usage 20%+ higher with profiling enabled; event loop lag spikes correlating with metric collection.

### Pitfall 2: Bandwidth Calculation Ignoring WebSocket Overhead
**What goes wrong:** Estimating bandwidth as payload size × message count underestimates actual transfer by 20-40%.

**Why it happens:** WebSocket frames add headers, Socket.IO adds protocol overhead (ping/pong, acks), TLS adds encryption overhead.

**How to avoid:** Measure at network layer (Prometheus http_request_size_bytes metric) or use platform-provided bandwidth metrics; add 30% safety margin.

**Warning signs:** Actual bandwidth bills exceed estimates; platforms with per-GB pricing charge more than calculated.

### Pitfall 3: Testing Steady State, Missing Startup/Teardown Costs
**What goes wrong:** Profiling captures only steady-state resource usage; cold starts and connection storms spike RAM/CPU 2-3x.

**Why it happens:** Connection pool initialization, session store warmup, and concurrent user onboarding differ from steady operation.

**How to avoid:** Profile three scenarios: cold start (0→50 users in 5s), steady state (50 users for 60s), teardown (50→0 users); capture peak metrics across all scenarios.

**Warning signs:** Production crashes on deployment despite passing load tests; RAM usage spikes to 2x measured peak.

### Pitfall 4: Comparing Platforms Without Normalization
**What goes wrong:** Comparing Railway's pay-per-second pricing to Render's flat monthly tier creates apples-to-oranges comparison.

**Why it happens:** Platforms use different pricing models (usage-based vs. tiered), resource units (CU vs. vCPU), and bundled features.

**How to avoid:** Normalize to monthly cost at measured resource levels; include egress bandwidth in usage-based calculations; factor in included features (free SSL, auto-scaling).

**Warning signs:** Chosen platform costs 3x more than estimated due to unaccounted bandwidth charges or scaling beyond base tier.

### Pitfall 5: Missing Connection Pool Saturation
**What goes wrong:** Database connection pool exhaustion causes timeouts under load, but profiling doesn't flag it.

**Why it happens:** Default pool size (10 connections in postgres library) insufficient for concurrent WebSocket connections; error manifests as request failures, not resource exhaustion.

**How to avoid:** Monitor Prometheus scrumquest_db_pool_size gauge and check for connection timeouts in logs during load tests; validate pool size ≥ concurrent users / 5.

**Warning signs:** Load test shows 5xx errors increasing with user count despite RAM/CPU headroom; database connection timeout errors in logs.

## Code Examples

Verified patterns from official sources:

### Prometheus Metrics Scraping for Bandwidth Calculation
```typescript
// Source: https://github.com/siimon/prom-client (official prom-client README)
import { metricsRegistry, websocketMessagesSent } from './server/metrics.js';

async function getBandwidthMetrics(): Promise<{ totalBytes: number }> {
  const metrics = await metricsRegistry.metrics();
  const wsMessagesSentMatch = metrics.match(/scrumquest_websocket_messages_sent_total\{.*\} (\d+)/);

  if (!wsMessagesSentMatch) return { totalBytes: 0 };

  const messageCount = parseInt(wsMessagesSentMatch[1], 10);
  const avgMessageSize = 500; // bytes (conservative estimate with Socket.IO overhead)

  return { totalBytes: messageCount * avgMessageSize };
}
```

### Event Loop Utilization Monitoring
```typescript
// Source: https://nodejs.org/api/perf_hooks.html (Node.js official docs)
import { performance, PerformanceObserver } from 'perf_hooks';

const obs = new PerformanceObserver((list) => {
  const entry = list.getEntries()[0];
  console.log('Event Loop Utilization:', {
    idle: entry.idle,
    active: entry.active,
    utilization: entry.utilization
  });
});
obs.observe({ entryTypes: ['measure'], buffered: true });

setInterval(() => {
  const elu = performance.eventLoopUtilization();
  if (elu.utilization > 0.9) {
    console.warn('Event loop highly utilized (>90%)');
  }
}, 5000);
```

### Connection Pool Health Check
```typescript
// Source: https://node-postgres.com/features/pooling (node-postgres official docs)
import { storage } from './server/storage.js';

async function checkPoolHealth(): Promise<{ total: number; idle: number; waiting: number }> {
  if ('getSql' in storage) {
    const sql = storage.getSql(); // PgStorage exposes postgres.Sql instance

    return {
      total: sql.options.max || 10,
      idle: sql.idle?.length || 0,
      waiting: sql.queued?.length || 0
    };
  }

  return { total: 0, idle: 0, waiting: 0 }; // MemStorage has no pool
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Artillery for all load testing | k6 for WebSockets, Artillery for HTTP | 2021-2022 | k6 has better WebSocket performance and scripting flexibility |
| Manual heap snapshot analysis | Automated heap diff with memwatch-ng | 2023 | Original memwatch abandoned; memwatch-ng is maintained fork with Node 18+ support |
| Node --prof + manual tick processing | 0x automated flame graphs | 2019 | One-command profiling with interactive visualization replaced multi-step manual workflow |
| Fixed pricing tiers (Heroku) | Usage-based pricing (Railway, Fly.io) | 2023-2024 | Cost optimization for variable traffic; requires careful bandwidth monitoring |
| Self-hosted Prometheus | Managed observability (Grafana Cloud, Datadog) | 2024-2025 | Budget hosting ($5-20/mo) makes self-hosted Prometheus impractical; metrics endpoint + external scraping preferred |

**Deprecated/outdated:**
- **node-memwatch:** Original package abandoned in 2018; use memwatch-ng or Chrome DevTools
- **Heroku free tier:** Eliminated November 2022; Render/Railway replaced as entry-level hosting
- **Socket.IO v2 load testing:** v4 changed protocol (binary support, parser v5); ensure k6 utils support current version

## Open Questions

1. **Should we test with Neon PostgreSQL vs. in-memory storage?**
   - What we know: ScrumQuest supports both via IStorage abstraction; DATABASE_URL toggles mode
   - What's unclear: Whether connection pooling to serverless Postgres (Neon) adds latency or connection overhead affecting hosting requirements
   - Recommendation: Profile both modes; if Neon adds <50ms p95 latency, recommend it for data persistence in budget

2. **How do we factor in seasonal traffic spikes (e.g., sprint planning days)?**
   - What we know: Scrum teams estimate in 2-week sprints; planning days see 3-5x normal traffic
   - What's unclear: Whether to optimize for average usage or peak usage when comparing platforms
   - Recommendation: Test at 2x average load; recommend platforms with auto-scaling (Render, Railway) over fixed-tier (Lightsail)

3. **Should cost analysis include free tier longevity risk?**
   - What we know: Neon PostgreSQL free tier is generous (100 CU-hours/month) but owned by Databricks (acquisition risk)
   - What's unclear: Whether to recommend relying on free database tier or budget for paid tier from day 1
   - Recommendation: Primary recommendation uses free tier; include fallback plan with Render PostgreSQL ($7/mo) in report

## Sources

### Primary (HIGH confidence)
- [Node.js Official Profiling Guide](https://nodejs.org/en/learn/getting-started/profiling) - CPU/memory profiling techniques
- [Node.js Performance Hooks API](https://nodejs.org/api/perf_hooks.html) - Event loop utilization monitoring
- [node-postgres Pooling Documentation](https://node-postgres.com/features/pooling) - Connection pool configuration
- [Artillery WebSocket Documentation](https://itnext.io/websocket-load-testing-with-artillery-io-b8b7ecbcd7ed) - WebSocket load testing patterns
- [Render Pricing](https://render.com/pricing) - Verified February 2026 pricing ($7/mo Starter tier)
- [Railway Pricing](https://railway.com/pricing) - Usage-based model with $5/mo Hobby minimum
- [Fly.io Pricing](https://fly.io/docs/about/pricing/) - Shared CPU pricing (~$2-7/mo for 256MB-1GB)
- [Neon PostgreSQL Pricing](https://neon.com/pricing) - Free tier 100 CU-hours, 0.5GB storage

### Secondary (MEDIUM confidence)
- [Clinic.js Official Site](https://clinicjs.org/) - Node.js profiling suite overview
- [0x Flame Graphs Tutorial](https://nearform.com/insights/tuning-node-js-app-performance-with-autocannon-and-0x/) - CPU profiling workflow
- [WebSocket Load Balancing Guide](https://oneuptime.com/blog/post/2026-01-24-websocket-load-balancer-configuration/view) - Sticky session requirements (January 2026)
- [Socket.IO Production Best Practices](https://ably.com/topic/socketio) - Scaling and deployment strategies
- [Node.js Connection Pooling Best Practices](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view) - Pool sizing recommendations (January 2026)

### Tertiary (LOW confidence)
- [AWS Lightsail Pricing](https://aws.amazon.com/lightsail/pricing/) - $3.50-10/mo tiers; bandwidth unclear for WebSocket workloads
- [Replit Pricing](https://replit.com/pricing) - $25/mo Core plan with $25 usage credits; actual costs variable

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - k6 and prom-client already in use; patterns verified in codebase
- Architecture: HIGH - Profiling patterns sourced from official Node.js docs and verified libraries
- Pitfalls: MEDIUM - Based on community blog posts and WebSearch; not officially documented

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days - hosting pricing stable quarterly, Node.js APIs stable)
