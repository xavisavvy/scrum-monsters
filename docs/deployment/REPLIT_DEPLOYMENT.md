# Replit Deployment Guide

## Replit-Specific Optimizations

This project has been optimized for Replit's hosting environment, including their autoscale deployment and proxy infrastructure.

## Key Replit-Specific Features

### 1. **Adaptive Timeout Configuration**

The application automatically detects when running on Replit and adjusts timeouts accordingly:

**Server-side** (`server/websocket.ts`):
- **Ping timeout**: 90 seconds (vs 60s local)
- **Ping interval**: 30 seconds (vs 25s local)
- **Connect timeout**: 60 seconds (vs 45s local)
- **Keep-alive timeout**: 95 seconds (vs 65s local)

**Client-side** (`client/src/lib/stores/useWebSocket.tsx`):
- **Connection timeout**: 60 seconds (vs 45s local)
- **Max reconnection attempts**: 12 (vs 8 local)
- **Transport fallback**: WebSocket → Polling

### 2. **Connection Monitoring**

Enhanced logging tracks:
- Total connections since startup
- Currently active connections
- Host-specific connection tracking
- Disconnect reason categorization
- Connection statistics logged every 5 minutes

### 3. **Health Check Endpoints**

**Basic Health Check**: `GET /api/health`
```json
{
  "status": "ok",
  "timestamp": "2026-01-16T12:00:00.000Z"
}
```

**WebSocket Health Check**: `GET /api/ws-health`
```json
{
  "status": "ok",
  "websocket": {
    "connected": 5,
    "lobbies": 2,
    "transports": ["websocket", "websocket", "polling", "websocket", "websocket"]
  },
  "timestamp": "2026-01-16T12:00:00.000Z"
}
```

## Environment Configuration

### Required Environment Variables (Production)

Create/update `.env` file in production:

```bash
# Required
NODE_ENV=production
SESSION_SECRET=your-super-secret-session-key-change-this
REPLIT_DEPLOYMENT=1  # Automatically set by Replit

# Recommended
ALLOWED_ORIGINS=https://scrummonsters.com,https://www.scrummonsters.com

# Optional (Database)
DATABASE_URL=postgresql://username:password@host:5432/database
```

### Replit Secrets

In Replit, set these as Secrets (not in `.env`):
1. `SESSION_SECRET` - Random secure string
2. `DATABASE_URL` - If using external PostgreSQL
3. `ALLOWED_ORIGINS` - Production domain(s)

## Deployment Configuration

The `.replit` file is already configured for autoscale deployment:

```toml
[deployment]
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
run = ["npm", "run", "start"]

[[ports]]
localPort = 5000
externalPort = 80
```

## Common Replit Issues & Solutions

### Issue 1: Hosts Timing Out

**Symptom**: Host connections drop after 30-60 seconds of inactivity

**Cause**: Replit proxy has aggressive timeout defaults

**Solution**: ✅ Fixed with 90s ping timeout and 95s keep-alive

**Verify Fix**:
```bash
# Check server logs for:
"🔌 WebSocket server initialized (Replit: Production)"
"   - Ping interval: 30000ms"
"   - Ping timeout: 90000ms"
```

### Issue 2: Container Sleep/Wake

**Symptom**: Connections drop when Replit container sleeps (free tier)

**Cause**: Replit containers sleep after inactivity on free/starter plans

**Solution**:
- ✅ Increased reconnection attempts (12 attempts = ~13 minutes)
- ✅ Exponential backoff with max 30s delay
- ✅ Auto-reconnection with stored tokens

**Mitigation**: Upgrade to Replit Autoscale for always-on deployment

### Issue 3: WebSocket Upgrade Failures

**Symptom**: Connections fall back to polling or fail entirely

**Cause**: Replit proxy may interfere with WebSocket upgrades

**Solution**: ✅ Enabled polling fallback and extended upgrade timeout (30s)

**Verify**: Check client console for transport type:
```
✅ Connected to server
   - Transport: websocket  ← Good
```

### Issue 4: CORS Errors

**Symptom**: Connection rejected with CORS error

**Cause**: Production domain not in allowed origins

**Solution**: ✅ Set `ALLOWED_ORIGINS` environment variable:
```bash
ALLOWED_ORIGINS=https://scrummonsters.com,https://www.scrummonsters.com
```

## Monitoring in Production

### Server Logs

Watch for these key indicators:

**Good Signs**:
```
✅ Player connected: abc123
   - Transport: websocket
   - Active connections: 5
```

**Warning Signs**:
```
❌ Player disconnected: abc123
   - Reason: ping timeout
   - Is Host: YES ⚠️
```

### Connection Statistics

Every 5 minutes, the server logs:
```
📊 Connection Statistics:
   - Total connections since start: 42
   - Currently active: 5
   - Host connections: 2
   - Active lobbies: 2
   - Disconnect reasons:
     - transport close: 8
     - ping timeout: 3
     - io client disconnect: 2
```

### Health Check Monitoring

Set up external monitoring (e.g., UptimeRobot, Pingdom) to:
1. Hit `/api/health` every 5 minutes
2. Alert if status ≠ `ok`
3. Optional: Parse `/api/ws-health` for WebSocket metrics

## Performance Tuning

### Recommended Replit Plan

For production use with multiple concurrent lobbies:

- **Starter/Hacker** (1 vCPU, 1GB RAM): Up to 10 concurrent users
- **Pro** (2 vCPU, 2GB RAM): Up to 30 concurrent users
- **Autoscale** (dynamic): Scales automatically, recommended for production

### Resource Usage

**Memory**: ~200-300MB base + ~10MB per active lobby

**CPU**: Low (< 5%) with 5-10 users, spikes during boss battles

**Network**: ~10KB/s per user (WebSocket traffic)

## Troubleshooting Commands

### Check Active Connections
```bash
curl https://scrummonsters.com/api/ws-health
```

### View Server Logs (Replit Shell)
```bash
# Show last 100 lines
npm run start 2>&1 | tail -100

# Follow logs in real-time
npm run start 2>&1 | grep -E "connected|disconnect|timeout"
```

### Test WebSocket Connection (Client Console)
```javascript
// Check current connection status
console.log(io.engine.transport.name); // Should be 'websocket'

// Check ping/pong timing
let start = Date.now();
socket.emit('ping', () => {
  console.log('Round trip:', Date.now() - start, 'ms');
});
```

## Rollback Plan

If issues persist after deployment:

1. **Revert timeout changes**:
   ```bash
   git revert HEAD~1
   git push
   ```

2. **Disable Replit optimizations** (temporary):
   ```bash
   # In server/websocket.ts, set:
   const isReplitDeployment = false;
   ```

3. **Force polling transport** (emergency):
   ```javascript
   // In client/src/lib/stores/useWebSocket.tsx:
   const socket = io(window.location.origin, {
     transports: ['polling'], // Force polling only
     // ...
   });
   ```

## Support Resources

- **Replit Docs**: https://docs.replit.com/hosting/deployments/about-deployments
- **Socket.IO Docs**: https://socket.io/docs/v4/
- **Project Issues**: https://github.com/[your-repo]/issues

## Changelog

### 2026-01-16: Replit Optimization
- Increased ping timeout to 90s for Replit production
- Extended keep-alive to 95s
- Added connection monitoring and statistics
- Implemented WebSocket health check endpoint
- Enhanced disconnect logging with reason tracking
- Increased reconnection attempts to 12
- Added transport fallback (websocket → polling)

---

**Questions?** Check server logs first, then open an issue with:
- Server logs showing disconnect
- Client console logs
- Health check response (`/api/ws-health`)
- Replit plan tier
