# Requirements: ScrumQuest

**Defined:** 2026-02-19
**Core Value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun

## v3.0 Requirements

Requirements for Production Optimization milestone. Each maps to roadmap phases.

### Hosting Optimization

- [ ] **HOST-01**: User can see resource profiling report showing actual RAM, CPU, and bandwidth usage under load
- [ ] **HOST-02**: User can see cost comparison of Replit tiers vs Railway, Render, Fly.io, and AWS Lightsail for ScrumQuest's measured resource needs
- [ ] **HOST-03**: User receives a recommendation for optimal hosting configuration at $5-20/mo budget

### Database Setup

- [ ] **DB-01**: User data persists across server restarts via PostgreSQL (XP, stats, class mastery, estimation history)
- [ ] **DB-02**: PostgreSQL connection pool is configured with appropriate limits and timeouts
- [ ] **DB-03**: User sessions persist across server restarts via PostgreSQL session store
- [ ] **DB-04**: Environment variables are validated on startup with clear error messages for missing required values

### Production Reliability

- [ ] **REL-01**: Server gracefully shuts down on SIGTERM/SIGINT (drains WebSocket connections, closes DB pool)
- [ ] **REL-02**: Health check endpoint includes database connectivity verification
- [ ] **REL-03**: Server logs startup configuration (DB connected, pool size, env) for operational visibility

### Tech Debt

- [ ] **DEBT-01**: shared/schema.ts compiles without TypeScript errors (fix Zod/Drizzle compatibility)
- [ ] **DEBT-02**: Production OG image replaces placeholder (1200x630 branded ScrumQuest image)
- [ ] **DEBT-03**: Husky v10 deprecation warning resolved
- [ ] **DEBT-04**: Debug console.log removed from useSpriteAnimation.ts

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Database Operations

- **DBOPS-01**: Automated daily pg_dump backups with retention policy
- **DBOPS-02**: Database query optimization with indexes on frequently queried columns
- **DBOPS-03**: Automated cleanup of expired sessions and old estimation history
- **DBOPS-04**: Versioned Drizzle migrations with CI validation

### Performance & Scaling

- **PERF-01**: WebSocket compression (perMessageDeflate) for bandwidth reduction
- **PERF-02**: V8 garbage collection tuning for reduced GC pauses
- **PERF-03**: Redis adapter for horizontal Socket.IO scaling
- **PERF-04**: Clinic.js performance suite for automated bottleneck detection
- **PERF-05**: Prometheus custom Grafana dashboards for WebSocket metrics

### Error Handling

- **ERR-01**: Global unhandledRejection handler prevents process crashes
- **ERR-02**: Circuit breaker pattern for external dependencies (database, Redis)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Actual hosting migration | This milestone profiles and recommends; migration is a separate effort |
| Redis adapter / horizontal scaling | Only needed above 1000+ concurrent users |
| Serverless/Lambda deployment | WebSockets require long-lived connections, incompatible with serverless |
| Database read replicas | Premature optimization for current scale |
| Custom profiling tools | Clinic.js and built-in Node.js profiling are sufficient |
| VPC networking | Adds complexity with minimal security benefit at current scale |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOST-01 | Pending | Pending |
| HOST-02 | Pending | Pending |
| HOST-03 | Pending | Pending |
| DB-01 | Pending | Pending |
| DB-02 | Pending | Pending |
| DB-03 | Pending | Pending |
| DB-04 | Pending | Pending |
| REL-01 | Pending | Pending |
| REL-02 | Pending | Pending |
| REL-03 | Pending | Pending |
| DEBT-01 | Pending | Pending |
| DEBT-02 | Pending | Pending |
| DEBT-03 | Pending | Pending |
| DEBT-04 | Pending | Pending |

**Coverage:**
- v3.0 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after initial definition*
