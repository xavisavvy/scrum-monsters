/**
 * Report Generator for ScrumQuest Hosting Analysis
 *
 * Generates markdown reports from profiling data and cost analysis.
 */

import { ProfileReport } from './run-profile';
import { CostAnalysis, HostingOption } from './cost-analyzer';

/**
 * Bottleneck mitigation guidance map
 */
const MITIGATION_TEXT: Record<string, string> = {
  'memory-high': 'Consider upgrading to the next tier, or investigate memory-heavy lobby state. Run `node --max-old-space-size=384` to cap heap and force GC.',
  'cpu-high': 'Profile with `0x` or `clinic flame` to identify hot paths. Common culprits: JSON serialization of large lobby state, combat calculations.',
  'event-loop': 'Investigate synchronous operations in hot paths. Move heavy computation to setImmediate() or worker threads.',
  'event-loop-blocking': 'Critical — blocking operations detected. Use `blocked-at` package to identify exact call sites. Likely candidates: JSON.stringify on large objects, synchronous file I/O.',
  'cold-start': 'Connection storm protection needed. Consider staggered reconnection with exponential backoff in Socket.IO client config.'
};

/**
 * Format a HostingOption row for the comparison table
 */
function formatOptionRow(opt: HostingOption): string {
  const cost = `$${opt.monthlyCost.toFixed(2)}`;
  const ram = `${opt.ramMB}MB`;
  const cpu = `${opt.cpuVCPU}`;
  const meets = opt.meetsRequirements ? '✓' : '✗';
  const headroom = opt.headroom2x >= 0 ? `${opt.headroom2x.toFixed(0)}%` : 'Insufficient';
  const ws = opt.websocketSupport === 'native' ? '✓ Native' : opt.websocketSupport === 'config-required' ? '⚙ Config' : 'Limited';
  const deploy = opt.autoDeployGit ? '✓ Git' : '✗ Manual';

  return `| ${opt.platform} | ${opt.tier} | ${cost} | ${ram} | ${cpu} | ${meets} | ${headroom} | ${ws} | ${deploy} |`;
}

/**
 * Generate migration path instructions for recommended platform
 */
function generateMigrationPath(recommendation: HostingOption): string {
  const migrations: Record<string, string> = {
    'Render': `1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set build command: \`npm run build\`
4. Set start command: \`npm run start\`
5. Add environment variables:
   - \`DATABASE_URL\` (PostgreSQL connection string)
   - \`SESSION_SECRET\` (random string for session signing)
   - \`NODE_ENV=production\`
6. Deploy — Render auto-detects Dockerfile or Node.js buildpack
7. Enable auto-deploy on Git push for continuous deployment`,

    'Railway': `1. Install Railway CLI: \`npm i -g @railway/cli\`
2. Login: \`railway login\`
3. Initialize project: \`railway init\`
4. Set environment variables:
   - \`railway variables set DATABASE_URL=<postgres-url>\`
   - \`railway variables set SESSION_SECRET=<random-string>\`
   - \`railway variables set NODE_ENV=production\`
5. Deploy: \`railway up\`
6. Connect GitHub repo for auto-deploy on push`,

    'Fly.io': `1. Install Fly CLI: \`curl -L https://fly.io/install.sh | sh\`
2. Login: \`fly auth login\`
3. Launch app: \`fly launch\` (generates fly.toml)
4. Update fly.toml for sticky sessions:
   \`\`\`toml
   [http_service]
     force_https = true
     sticky_sessions = true
   \`\`\`
5. Set secrets:
   - \`fly secrets set DATABASE_URL=<postgres-url>\`
   - \`fly secrets set SESSION_SECRET=<random-string>\`
6. Deploy: \`fly deploy\`
7. Connect GitHub Actions for CI/CD`,

    'Replit': `Already deployed on Replit Core. Current configuration:
1. Project URL: [your-replit-url]
2. Environment variables already configured
3. Auto-deploy on Git push enabled
4. Note: Consider migrating to a cheaper platform to save $18-20/mo`,

    'AWS Lightsail': `1. Create Lightsail instance (Ubuntu 22.04 LTS)
2. SSH into instance: \`ssh ubuntu@<instance-ip>\`
3. Install Node.js 20+: \`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\`
4. Install dependencies: \`sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx\`
5. Clone repository: \`git clone <repo-url> /var/www/scrumquest\`
6. Install app dependencies: \`cd /var/www/scrumquest && npm ci\`
7. Build application: \`npm run build\`
8. Configure nginx as reverse proxy (see docs/deployment/nginx.conf)
9. Setup SSL with Let's Encrypt: \`sudo certbot --nginx -d yourdomain.com\`
10. Create systemd service for Node.js app (see docs/deployment/scrumquest.service)
11. Start service: \`sudo systemctl enable scrumquest && sudo systemctl start scrumquest\`
12. Note: Manual deployment — no auto-deploy from Git`
  };

  return migrations[recommendation.platform] || 'Migration path not documented for this platform.';
}

/**
 * Generate complete hosting analysis markdown report
 */
export function generateReport(profile: ProfileReport, costAnalysis: CostAnalysis): string {
  const date = new Date(profile.timestamp).toISOString().split('T')[0];
  const users = profile.config.users;
  const duration = profile.config.duration;

  // Overall metrics
  const peakRSS = profile.overall.peakRSSMB.toFixed(1);
  const peakHeap = profile.overall.peakHeapMB.toFixed(1);
  const avgCPU = profile.overall.avgCPUPercent.toFixed(1);
  const peakCPU = profile.overall.peakCPUPercent.toFixed(1);
  const eventLoopUtil = (profile.overall.eventLoopUtilization * 100).toFixed(1);
  const bandwidthGB = (profile.overall.estimatedBandwidthMBPerMonth / 1024).toFixed(2);
  const wsConnections = users;

  // Scenario breakdowns
  const coldStart = profile.scenarios.coldStart;
  const steadyState = profile.scenarios.steadyState;
  const teardown = profile.scenarios.teardown;

  // Cost analysis
  const rec = costAnalysis.recommendation;
  const recText = rec
    ? `**${rec.platform} ${rec.tier}** at **$${rec.monthlyCost.toFixed(2)}/month**`
    : 'No suitable option found within budget';

  // Build markdown sections
  const markdown = `# ScrumQuest Hosting Analysis Report

**Generated:** ${date}
**Test Configuration:** ${users} concurrent WebSocket users, ${duration}s steady state duration

## Executive Summary

**Measured Resource Usage (Steady State):**
| Metric | Value |
|--------|-------|
| Peak RSS Memory | ${peakRSS} MB |
| Peak Heap Memory | ${peakHeap} MB |
| Avg CPU Usage | ${avgCPU}% |
| Peak CPU Usage | ${peakCPU}% |
| Event Loop Utilization | ${eventLoopUtil}% |
| Estimated Bandwidth | ${bandwidthGB} GB/month |
| WebSocket Connections | ${wsConnections} |

**Recommendation:** ${recText}

${costAnalysis.recommendationReason}

## Resource Profile by Scenario

### Cold Start (0 to ${users} users in 10s)
| Metric | Value |
|--------|-------|
| Peak RSS | ${coldStart.peakRSSMB.toFixed(1)} MB |
| Peak CPU | ${coldStart.peakCPUPercent.toFixed(1)}% |
| Event Loop Util | ${(coldStart.eventLoopUtilization * 100).toFixed(1)}% |

### Steady State (${users} users for ${duration}s)
| Metric | Value |
|--------|-------|
| Peak RSS | ${steadyState.peakRSSMB.toFixed(1)} MB |
| Avg CPU | ${steadyState.avgCPUPercent.toFixed(1)}% |
| Event Loop Util | ${(steadyState.eventLoopUtilization * 100).toFixed(1)}% |
| Bandwidth | ${steadyState.estimatedBandwidthMB.toFixed(1)} MB |

### Teardown (connections draining)
| Metric | Value |
|--------|-------|
| Peak RSS | ${teardown.peakRSSMB.toFixed(1)} MB |
| Avg CPU | ${teardown.avgCPUPercent.toFixed(1)}% |

## Cost Comparison

| Platform | Tier | Monthly Cost | RAM | CPU | Meets Needs | 2x Headroom | WebSocket | Auto-Deploy |
|----------|------|--------------|-----|-----|-------------|-------------|-----------|-------------|
${costAnalysis.options.map(formatOptionRow).join('\n')}

**Budget range:** $${(profile.config as any).budget?.min || 5}-$${(profile.config as any).budget?.max || 20}/month

### Within Budget Options

${costAnalysis.withinBudget.length > 0
  ? costAnalysis.withinBudget.map(opt => {
      const headroom = opt.headroom2x >= 0 ? `${opt.headroom2x.toFixed(0)}%` : 'Insufficient';
      return `**${opt.platform} ${opt.tier}** - $${opt.monthlyCost.toFixed(2)}/mo
- Resources: ${opt.ramMB}MB RAM, ${opt.cpuVCPU} vCPU
- Meets requirements: ${opt.meetsRequirements ? 'Yes' : 'No'}
- 2x growth headroom: ${headroom}
- WebSocket: ${opt.websocketSupport}
- Git auto-deploy: ${opt.autoDeployGit ? 'Yes' : 'No'}
- ${opt.notes}`;
    }).join('\n\n')
  : 'No options within budget range.'
}

## Performance Bottlenecks

${profile.overall.bottlenecks.length > 0
  ? profile.overall.bottlenecks.map(b => {
      const mitigation = MITIGATION_TEXT[b.type] || 'Investigate and optimize this area.';
      return `### ${b.type.toUpperCase()} — Severity: ${b.severity.toUpperCase()}
${b.description}

**Mitigation:** ${mitigation}`;
    }).join('\n\n')
  : `No critical performance bottlenecks detected at ${users} concurrent users.`
}

${rec ? `## Recommendation Details

### Why ${rec.platform} ${rec.tier}?

${costAnalysis.recommendationReason}

**Key advantages:**
- **Cost-effective:** $${rec.monthlyCost.toFixed(2)}/month fits well within the $5-20 budget
- **Growth headroom:** ${rec.headroom2x.toFixed(0)}% capacity remaining for 2x traffic growth
- **WebSocket support:** ${rec.websocketSupport === 'native' ? 'Native sticky sessions built-in' : 'Configurable (requires fly.toml or nginx setup)'}
- **Deployment:** ${rec.autoDeployGit ? 'Zero-config Git auto-deploy' : 'Manual deployment required'}
- **Resources:** ${rec.ramMB}MB RAM, ${rec.cpuVCPU} vCPU — sufficient for current and projected load

### Migration Path

${generateMigrationPath(rec)}

### Database Recommendation

Pair with **Neon PostgreSQL** free tier:
- 100 compute-hours/month (roughly 3.3 hours/day always-on)
- 0.5GB storage
- Auto-suspend after 5 minutes idle
- Perfect for hobby/side project with intermittent usage

**Fallback:** If Neon limits are exceeded, upgrade to:
- Render PostgreSQL at $7/mo (512MB RAM, 1GB storage)
- Supabase Pro at $25/mo (8GB database size, dedicated CPU)

### Cost Projection

| Scenario | Monthly Cost | Annual Cost |
|----------|-------------|-------------|
| Current (Replit Core) | $25.00 | $300.00 |
| Recommended (${rec.platform} ${rec.tier}) | $${rec.monthlyCost.toFixed(2)} | $${(rec.monthlyCost * 12).toFixed(2)} |
| **Annual Savings** | - | **$${(300 - rec.monthlyCost * 12).toFixed(2)}** |

**With Database:**
- ${rec.platform} ${rec.tier}: $${rec.monthlyCost.toFixed(2)}/mo
- Neon PostgreSQL: $0/mo (free tier)
- **Total: $${rec.monthlyCost.toFixed(2)}/mo** (vs $25/mo on Replit)
` : ''}
---

*Generated by ScrumQuest profiling infrastructure*
*Pricing verified as of February 2026*
`;

  return markdown;
}
