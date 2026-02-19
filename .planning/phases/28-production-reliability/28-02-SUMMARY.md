---
phase: 28-production-reliability
plan: 02
subsystem: health-checks
tags: [kubernetes, reliability, database, health-probes]
dependency-graph:
  requires:
    - 27-02 (session persistence with database health check foundation)
  provides:
    - Split Kubernetes health probes (livez/readyz)
    - Database connectivity verification with timeout
    - Backward-compatible health endpoint
  affects:
    - Kubernetes deployment manifests (liveness/readiness probes)
    - Production traffic routing behavior
tech-stack:
  added: []
  patterns:
    - Kubernetes-standard split health probes (livez = liveness, readyz = readiness)
    - Database health check with 3-second timeout using Promise.race
    - Type-safe instanceof check for PgStorage vs MemStorage
key-files:
  created: []
  modified:
    - server/routes.ts (split health endpoints with DB check helper)
    - k8s/base/deployment.yaml (updated probe paths)
    - k8s/deployment.yaml (updated probe paths)
decisions:
  - Split health probes prevent restart loops from transient DB issues (livez never checks DB)
  - 3-second timeout balances responsiveness with network variability
  - Backward-compatible /api/health delegates to readyz for existing monitoring
  - In-memory storage reports healthy for readiness (valid configuration)
metrics:
  duration: 132s
  completed: 2026-02-19
---

# Phase 28 Plan 02: Kubernetes Health Probes Summary

**One-liner:** Split health endpoints into livez (heartbeat) and readyz (DB connectivity with 3s timeout) for Kubernetes-standard traffic management.

## What Was Built

### Split Health Check Endpoints

**Three endpoints implemented:**

1. **`/api/health/livez`** - Simple heartbeat for Kubernetes liveness probe
   - Returns `{ status: 'ok', timestamp }` always
   - Never checks database
   - Prevents container restarts from transient DB issues

2. **`/api/health/readyz`** - Comprehensive readiness check for Kubernetes readiness probe
   - Checks database connectivity with 3-second timeout
   - Returns 200 when DB healthy, 503 when DB unreachable
   - In-memory storage mode reports healthy (valid configuration)
   - Response: `{ status: 'ok'|'not_ready', checks: { database: { healthy, message? } }, timestamp }`

3. **`/api/health`** - Backward-compatible endpoint
   - Delegates to readyz logic
   - Preserves existing monitoring/scripts

### Database Health Check Implementation

```typescript
async function checkReadiness(): Promise<{ status: number; body: object }> {
  const checks: Record<string, { healthy: boolean; message?: string }> = {};

  if (storage instanceof PgStorage) {
    try {
      const sql = storage.getSql();
      await Promise.race([
        sql`SELECT 1 as health`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database health check timeout (3s)')), 3000)
        ),
      ]);
      checks.database = { healthy: true };
    } catch (error) {
      checks.database = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  } else {
    checks.database = { healthy: true, message: 'in-memory storage' };
  }

  const isReady = Object.values(checks).every((check) => check.healthy);
  return {
    status: isReady ? 200 : 503,
    body: {
      status: isReady ? 'ok' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    },
  };
}
```

**Key design choices:**
- `instanceof PgStorage` check for type-safe DB detection (not env var)
- `Promise.race` for 3-second timeout (prevents hanging health checks)
- Returns 503 when DB unreachable (stops traffic routing)
- In-memory storage always healthy (valid fallback config)

### Kubernetes Deployment Updates

**Both manifests updated:**
- `k8s/base/deployment.yaml`
- `k8s/deployment.yaml`

**Probe configuration:**
```yaml
livenessProbe:
  httpGet:
    path: /api/health/livez  # Changed from /api/health
    port: 5000
  initialDelaySeconds: 15
  periodSeconds: 20
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/health/readyz  # Changed from /api/health
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3
```

**Behavior:**
- **Liveness failure** (3 consecutive at 20s intervals = 60s) → Kubernetes restarts container
- **Readiness failure** (3 consecutive at 10s intervals = 30s) → Kubernetes stops routing traffic (pod stays running)
- **With 3s DB timeout:** Allows up to 9 seconds of DB downtime before traffic stops (10s period - 3s timeout check = 7s + 3s timeout)

## Deviations from Plan

None - plan executed exactly as written.

## Testing Evidence

### TypeScript Compilation
```bash
npx tsc --noEmit
# PASSED: Zero errors
```

### Production Build
```bash
npm run build
# PASSED: Client and server built successfully
```

### Endpoint Verification
```bash
# Verified all three endpoints exist
grep "'/api/health/livez'" server/routes.ts    # FOUND: line 85
grep "'/api/health/readyz'" server/routes.ts   # FOUND: line 91
grep "'/api/health'" server/routes.ts          # FOUND: line 97 (backward compat)

# Verified DB check implementation
grep "SELECT 1 as health" server/routes.ts     # FOUND: line 56
grep "3000" server/routes.ts                   # FOUND: line 58 (3s timeout)
grep "503" server/routes.ts                    # FOUND: line 74 (unhealthy status)
```

### Kubernetes Manifest Verification
```bash
# Verified probe updates in both manifests
grep "/api/health/livez" k8s/base/deployment.yaml   # FOUND: line 45
grep "/api/health/readyz" k8s/base/deployment.yaml  # FOUND: line 53
grep "/api/health/livez" k8s/deployment.yaml        # FOUND: line 42
grep "/api/health/readyz" k8s/deployment.yaml       # FOUND: line 50
```

## Impact

### Production Behavior Changes

**Before:** Single `/api/health` endpoint for both liveness and readiness
- Database connection issues triggered container restarts
- Transient DB issues caused restart loops
- No differentiation between "pod broken" vs "DB temporarily down"

**After:** Split endpoints with proper semantics
- `/api/health/livez` - Liveness probe (never checks DB, prevents restart loops)
- `/api/health/readyz` - Readiness probe (checks DB, stops traffic routing when DB down)
- `/api/health` - Backward compatible (delegates to readyz)

**Result:** Kubernetes can now distinguish between:
1. Pod is healthy but DB is down → Stop routing traffic, keep pod running
2. Pod is broken → Restart container

### Traffic Routing Logic

With 3-second timeout and 10-second period:
- **DB down for < 9s:** No impact (falls within one probe period)
- **DB down for 30s:** Traffic stops routing (3 consecutive failures)
- **Pod process crash:** Container restarts after 60s (3 liveness failures at 20s intervals)

This prevents:
- Unnecessary container churn from brief DB hiccups
- User requests hitting pods with broken DB connections
- Cascading failures from routing traffic to unhealthy pods

## Self-Check: PASSED

### Created Files
None (all modifications to existing files)

### Modified Files
```bash
[ -f "C:/Users/Preston/git/ScrumMonsters/server/routes.ts" ] && echo "FOUND: server/routes.ts" || echo "MISSING: server/routes.ts"
# FOUND: server/routes.ts

[ -f "C:/Users/Preston/git/ScrumMonsters/k8s/base/deployment.yaml" ] && echo "FOUND: k8s/base/deployment.yaml" || echo "MISSING: k8s/base/deployment.yaml"
# FOUND: k8s/base/deployment.yaml

[ -f "C:/Users/Preston/git/ScrumMonsters/k8s/deployment.yaml" ] && echo "FOUND: k8s/deployment.yaml" || echo "MISSING: k8s/deployment.yaml"
# FOUND: k8s/deployment.yaml
```

### Commits Exist
```bash
git log --oneline --all | grep -q "c13e1df" && echo "FOUND: c13e1df" || echo "MISSING: c13e1df"
# FOUND: c13e1df (Task 1: Split health endpoints with DB check)

git log --oneline --all | grep -q "f87d30a" && echo "FOUND: f87d30a" || echo "MISSING: f87d30a"
# FOUND: f87d30a (Task 2: Update Kubernetes probes)
```

All files exist, all commits verified.
