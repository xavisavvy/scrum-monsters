# Roadmap: ScrumQuest

## Milestones

- ✅ **v1.0 Domain Separation** — Phases 1-6 (shipped 2026-02-02)
- ✅ **v1.2 SDLC Best Practices** — Phases 7-14 (shipped 2026-02-03)
- ✅ **v1.3 Game Progression** — Phases 15-20 (shipped 2026-02-11)
- ✅ **v2.0 UI Redesign & Mobile** — Phases 21-25 (shipped 2026-02-19)
- ✅ **v3.0 Production Optimization** — Phases 26-29 (shipped 2026-02-20)
- 🚧 **v3.1 Tech Debt Cleanup** — Phases 30-31 (in progress)

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

<details>
<summary>✅ v3.0 Production Optimization (Phases 26-29) — SHIPPED 2026-02-20</summary>

See `.planning/milestones/v3.0-ROADMAP.md`

- [x] Phase 26: Tech Debt Cleanup (2/2 plans) — completed 2026-02-19
- [x] Phase 27: Database Foundation (2/2 plans) — completed 2026-02-19
- [x] Phase 28: Production Reliability (2/2 plans) — completed 2026-02-19
- [x] Phase 29: Hosting Analysis (3/3 plans) — completed 2026-02-20

</details>

### 🚧 v3.1 Tech Debt Cleanup (In Progress)

**Milestone Goal:** Resolve all carried-forward tech debt items for a clean codebase baseline

#### Phase 30: Logging Cleanup
**Goal**: Migrate console.log to Pino structured logging and enforce with ESLint
**Depends on**: Phase 29
**Requirements**: LOG-01, LOG-02
**Success Criteria** (what must be TRUE):
  1. All operational console.log statements replaced with appropriate Pino logger calls (httpLogger, socketLogger, gameLogger, dbLogger)
  2. ESLint no-console rule upgraded from warn to error with clean build
  3. Test files retain console.log for debugging (excluded from no-console rule)
  4. CI pipeline passes with zero no-console violations
**Plans**: TBD

Plans:
- [ ] 30-01: TBD
- [ ] 30-02: TBD

#### Phase 31: Dependency & Lifecycle Polish
**Goal**: Remove unused dependencies, configure ArgoCD auth, implement server shutdown client handler
**Depends on**: Phase 30
**Requirements**: DEP-01, LIFE-01, ARGO-01
**Success Criteria** (what must be TRUE):
  1. zod-validation-error package removed with no broken imports or functionality
  2. Client displays user-facing notification on server_shutdown WebSocket event before disconnect
  3. Production ArgoCD rollback workflow has valid ARGOCD_AUTH_TOKEN secret configured and tested
  4. All three changes deployed and verified in development environment
**Plans**: TBD

Plans:
- [ ] 31-01: TBD
- [ ] 31-02: TBD
- [ ] 31-03: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 30/30 | Complete | 2026-02-02 |
| 7-14 | v1.2 | 21/21 | Complete | 2026-02-03 |
| 15-20 | v1.3 | 28/28 | Complete | 2026-02-11 |
| 21-25 | v2.0 | 23/23 | Complete | 2026-02-19 |
| 26-29 | v3.0 | 9/9 | Complete | 2026-02-20 |
| 30 | v3.1 | 0/2 | Not started | - |
| 31 | v3.1 | 0/3 | Not started | - |

**Total: 6 milestones shipped, 29 phases complete, 111 plans**
**Current: v3.1 Tech Debt Cleanup — 0/5 plans**

---
*Roadmap created: 2026-02-11*
*Last updated: 2026-02-20 — v3.1 Tech Debt Cleanup roadmap created*
