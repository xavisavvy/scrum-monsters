# Requirements: ScrumQuest

**Defined:** 2026-02-20
**Core Value:** Focused estimation that doesn't bore people — voting distraction-free, waiting fun

## v3.1 Requirements

Requirements for tech debt cleanup. Each maps to roadmap phases.

### ArgoCD Operations

- [ ] **ARGO-01**: Production rollback workflow has valid ARGOCD_AUTH_TOKEN secret configured and tested

### Logging Hygiene

- [ ] **LOG-01**: All operational console.log statements migrated to appropriate Pino logger calls (httpLogger, socketLogger, gameLogger, dbLogger)
- [ ] **LOG-02**: ESLint no-console rule upgraded from warn to error with build passing

### Dependency Cleanup

- [ ] **DEP-01**: zod-validation-error package removed without breaking any imports or functionality

### Client Lifecycle

- [ ] **LIFE-01**: Client handles server_shutdown WebSocket event with user-facing notification before disconnect

## Future Requirements

None — tech debt milestone has no deferred items.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replacing console.log in test files | Test files use console for debugging, not operational logging |
| Adding new Pino log categories | Existing 4 loggers (http, socket, game, db) sufficient |
| ArgoCD UI/dashboard changes | Secret configuration only, no ArgoCD config changes |
| Full graceful shutdown redesign | server_shutdown handler is the missing piece, shutdown itself works |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOG-01 | Phase 30 | Pending |
| LOG-02 | Phase 30 | Pending |
| DEP-01 | Phase 31 | Pending |
| LIFE-01 | Phase 31 | Pending |
| ARGO-01 | Phase 31 | Pending |

**Coverage:**
- v3.1 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0

**100% requirement coverage achieved**

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after roadmap creation*
