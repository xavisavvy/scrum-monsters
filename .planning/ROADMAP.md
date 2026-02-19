# Roadmap: ScrumQuest

## Milestones

- ✅ **v1.0 Domain Separation** — Phases 1-6 (shipped 2026-02-02)
- ✅ **v1.2 SDLC Best Practices** — Phases 7-14 (shipped 2026-02-03)
- ✅ **v1.3 Game Progression** — Phases 15-20 (shipped 2026-02-11)
- ✅ **v2.0 UI Redesign & Mobile** — Phases 21-25 (shipped 2026-02-19)
- 🚧 **v3.0 Production Optimization** — Phases 26-29 (in progress)

## Phases

<details>
<summary>✅ v1.0 Domain Separation (Phases 1-6) — SHIPPED 2026-02-02</summary>

See `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 SDLC Best Practices (Phases 7-14) — SHIPPED 2026-02-03</summary>

See `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Game Progression (Phases 15-20) — SHIPPED 2026-02-11</summary>

See `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 UI Redesign & Mobile (Phases 21-25) — SHIPPED 2026-02-19</summary>

See `.planning/milestones/v2.0-ROADMAP.md`

- [x] Phase 21: Production Security Hardening (5/5 plans) — completed 2026-02-18
- [x] Phase 22: JRPG Theme Foundation (6/6 plans) — completed 2026-02-18
- [x] Phase 23: Mobile UX Critical Path (5/5 plans) — completed 2026-02-18
- [x] Phase 24: Routing & SEO Infrastructure (4/4 plans) — completed 2026-02-18
- [x] Phase 25: Lobby Polish & Animations (3/3 plans) — completed 2026-02-19

</details>

### 🚧 v3.0 Production Optimization (In Progress)

**Milestone Goal:** Make ScrumQuest production-solid with optimized hosting costs, persistent PostgreSQL database, and all known tech debt resolved.

#### Phase 26: Tech Debt Cleanup
**Goal**: Resolve all known tech debt items before production database work
**Depends on**: Nothing (first phase of v3.0)
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04
**Success Criteria** (what must be TRUE):
  1. Developer runs `npm run check` and sees zero TypeScript errors in shared/schema.ts
  2. Social media previews display ScrumQuest branded 1200x630 OG image (not placeholder)
  3. Developer runs `npm install` without Husky v10 deprecation warnings
  4. Production build contains no debug console.log statements
**Plans**: 2 plans

Plans:
- [x] 26-01-PLAN.md — Upgrade Zod 3.x to 4.x for drizzle-zod compatibility (DEBT-01)
- [x] 26-02-PLAN.md — OG image replacement, console.log cleanup, Husky fix (DEBT-02, DEBT-03, DEBT-04)

#### Phase 27: Database Foundation
**Goal**: Production-ready PostgreSQL with connection pooling, persistent sessions, and validated environment configuration
**Depends on**: Phase 26
**Requirements**: DB-01, DB-02, DB-03, DB-04
**Success Criteria** (what must be TRUE):
  1. User earns XP in lobby A, server restarts, user joins lobby B and sees their accumulated XP and level
  2. User logs in with OAuth, server restarts, user refreshes browser and remains logged in without re-authenticating
  3. Database connection pool prevents exhaustion under load (200+ concurrent connections rejected gracefully, not timeout)
  4. Server startup fails fast with clear error message when DATABASE_URL is missing or malformed
  5. Estimation history survives server restarts (user can view past votes after restart)
**Plans**: TBD

Plans:
- [ ] 27-01: TBD

#### Phase 28: Production Reliability
**Goal**: Production-ready error handling, health monitoring, and graceful shutdown without data loss
**Depends on**: Phase 27
**Requirements**: REL-01, REL-02, REL-03
**Success Criteria** (what must be TRUE):
  1. Operator sends SIGTERM to server, all active WebSocket connections receive 30s warning, database pool closes cleanly without orphaned connections
  2. Health check endpoint returns 503 when database is unreachable (not 200 OK)
  3. Operator reads startup logs and immediately knows if server is using PostgreSQL or in-memory storage, connection pool size, and environment (dev/staging/prod)
  4. Server experiences unhandled promise rejection and logs error details without crashing entire process
**Plans**: TBD

Plans:
- [ ] 28-01: TBD

#### Phase 29: Hosting Analysis
**Goal**: Data-driven hosting recommendation based on actual resource usage and cost comparison
**Depends on**: Phase 28
**Requirements**: HOST-01, HOST-02, HOST-03
**Success Criteria** (what must be TRUE):
  1. Operator runs profiling script with 50 concurrent users and receives report showing peak RAM usage, CPU%, and bandwidth per WebSocket connection
  2. Operator reads cost comparison table showing monthly costs for Replit vs Railway vs Render vs Fly.io vs AWS Lightsail at measured resource levels
  3. Operator receives clear recommendation (platform + tier) that fits $5-20/mo budget with headroom for 2x traffic growth
  4. Profiling identifies performance bottlenecks (event loop blocking, memory leaks, connection pool saturation) with actionable mitigation steps
**Plans**: TBD

Plans:
- [ ] 29-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 26 → 27 → 28 → 29

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 30/30 | Complete | 2026-02-02 |
| 7-14 | v1.2 | 21/21 | Complete | 2026-02-03 |
| 15-20 | v1.3 | 28/28 | Complete | 2026-02-11 |
| 21-25 | v2.0 | 23/23 | Complete | 2026-02-19 |
| 26. Tech Debt Cleanup | v3.0 | 2/2 | Complete | 2026-02-19 |
| 27. Database Foundation | v3.0 | 0/0 | Not started | - |
| 28. Production Reliability | v3.0 | 0/0 | Not started | - |
| 29. Hosting Analysis | v3.0 | 0/0 | Not started | - |

**Total: 5 milestones (4 shipped, 1 in progress), 29 phases (26 shipped, 3 planned), 104 plans shipped**

---
*Roadmap created: 2026-02-11*
*Last updated: 2026-02-19 — Phase 26 Tech Debt Cleanup completed*
