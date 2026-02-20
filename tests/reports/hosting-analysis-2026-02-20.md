# ScrumQuest Hosting Analysis Report

**Generated:** 2026-02-20
**Test Configuration:** 50 concurrent WebSocket users, 60s steady state duration

## Executive Summary

**Measured Resource Usage (Steady State):**
| Metric | Value |
|--------|-------|
| Peak RSS Memory | 155.2 MB |
| Peak Heap Memory | 102.5 MB |
| Avg CPU Usage | 21.0% |
| Peak CPU Usage | 70.1% |
| Event Loop Utilization | 20.0% |
| Estimated Bandwidth | 17.11 GB/month |
| WebSocket Connections | 50 |

**Recommendation:** **AWS Lightsail $5 tier** at **$5.00/month**

AWS Lightsail $5 tier at $5.00/mo provides 1024MB RAM with 58% headroom for 2x growth, WebSocket support (config required), and manual deployment setup.

## Resource Profile by Scenario

### Cold Start (0 to 50 users in 10s)
| Metric | Value |
|--------|-------|
| Peak RSS | 155.2 MB |
| Peak CPU | 70.1% |
| Event Loop Util | 40.0% |

### Steady State (50 users for 60s)
| Metric | Value |
|--------|-------|
| Peak RSS | 128.7 MB |
| Avg CPU | 20.1% |
| Event Loop Util | 20.0% |
| Bandwidth | 4.0 MB |

### Teardown (connections draining)
| Metric | Value |
|--------|-------|
| Peak RSS | 117.3 MB |
| Avg CPU | 7.5% |

## Cost Comparison

| Platform | Tier | Monthly Cost | RAM | CPU | Meets Needs | 2x Headroom | WebSocket | Auto-Deploy |
|----------|------|--------------|-----|-----|-------------|-------------|-----------|-------------|
| AWS Lightsail | $3.50 tier | $3.50 | 512MB | 1 | ✓ | 39% | ⚙ Config | ✗ Manual |
| Fly.io | shared-cpu-1x (512MB) | $3.57 | 512MB | 1 | ✓ | 39% | ⚙ Config | ✓ Git |
| AWS Lightsail | $5 tier | $5.00 | 1024MB | 1 | ✓ | 58% | ⚙ Config | ✗ Manual |
| Render | Starter | $7.00 | 512MB | 0.5 | ✓ | 16% | ✓ Native | ✓ Git |
| Fly.io | shared-cpu-1x (1GB) | $7.12 | 1024MB | 1 | ✓ | 58% | ⚙ Config | ✓ Git |
| AWS Lightsail | $10 tier | $10.00 | 2048MB | 1 | ✓ | 58% | ⚙ Config | ✗ Manual |
| Railway | Hobby | $14.04 | 8192MB | 8 | ✓ | 95% | ✓ Native | ✓ Git |
| Render | Standard | $25.00 | 2048MB | 1 | ✓ | 58% | ✓ Native | ✓ Git |
| Replit | Core | $25.00 | 8192MB | 4 | ✓ | 89% | ✓ Native | ✓ Git |

**Budget range:** $5-$20/month

### Within Budget Options

**AWS Lightsail $5 tier** - $5.00/mo
- Resources: 1024MB RAM, 1 vCPU
- Meets requirements: Yes
- 2x growth headroom: 58%
- WebSocket: config-required
- Git auto-deploy: No
- More RAM headroom, still manual setup required

**Render Starter** - $7.00/mo
- Resources: 512MB RAM, 0.5 vCPU
- Meets requirements: Yes
- 2x growth headroom: 16%
- WebSocket: native
- Git auto-deploy: Yes
- Zero-config deployment, Dockerfile or buildpack, free SSL, sticky sessions built-in

**Fly.io shared-cpu-1x (1GB)** - $7.12/mo
- Resources: 1024MB RAM, 1 vCPU
- Meets requirements: Yes
- 2x growth headroom: 58%
- WebSocket: config-required
- Git auto-deploy: Yes
- Higher RAM tier, good for global deployment

**AWS Lightsail $10 tier** - $10.00/mo
- Resources: 2048MB RAM, 1 vCPU
- Meets requirements: Yes
- 2x growth headroom: 58%
- WebSocket: config-required
- Git auto-deploy: No
- Highest RAM tier in budget range, manual operations overhead

**Railway Hobby** - $14.04/mo
- Resources: 8192MB RAM, 8 vCPU
- Meets requirements: Yes
- 2x growth headroom: 95%
- WebSocket: native
- Git auto-deploy: Yes
- Usage-based pricing can be cheap or expensive depending on utilization

## Performance Bottlenecks

No critical performance bottlenecks detected at 50 concurrent users.

## Recommendation Details

### Why AWS Lightsail $5 tier?

AWS Lightsail $5 tier at $5.00/mo provides 1024MB RAM with 58% headroom for 2x growth, WebSocket support (config required), and manual deployment setup.

**Key advantages:**
- **Cost-effective:** $5.00/month fits well within the $5-20 budget
- **Growth headroom:** 58% capacity remaining for 2x traffic growth
- **WebSocket support:** Configurable (requires fly.toml or nginx setup)
- **Deployment:** Manual deployment required
- **Resources:** 1024MB RAM, 1 vCPU — sufficient for current and projected load

### Migration Path

1. Create Lightsail instance (Ubuntu 22.04 LTS)
2. SSH into instance: `ssh ubuntu@<instance-ip>`
3. Install Node.js 20+: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -`
4. Install dependencies: `sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx`
5. Clone repository: `git clone <repo-url> /var/www/scrumquest`
6. Install app dependencies: `cd /var/www/scrumquest && npm ci`
7. Build application: `npm run build`
8. Configure nginx as reverse proxy (see docs/deployment/nginx.conf)
9. Setup SSL with Let's Encrypt: `sudo certbot --nginx -d yourdomain.com`
10. Create systemd service for Node.js app (see docs/deployment/scrumquest.service)
11. Start service: `sudo systemctl enable scrumquest && sudo systemctl start scrumquest`
12. Note: Manual deployment — no auto-deploy from Git

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
| Recommended (AWS Lightsail $5 tier) | $5.00 | $60.00 |
| **Annual Savings** | - | **$240.00** |

**With Database:**
- AWS Lightsail $5 tier: $5.00/mo
- Neon PostgreSQL: $0/mo (free tier)
- **Total: $5.00/mo** (vs $25/mo on Replit)

---

*Generated by ScrumQuest profiling infrastructure*
*Pricing verified as of February 2026*
