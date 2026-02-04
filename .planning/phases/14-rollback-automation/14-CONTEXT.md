# Phase 14: Rollback Automation - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

GitHub workflow to trigger ArgoCD rollback to previous version, with production rollbacks requiring manual approval via environment protection. Rollback actions are recorded in GitHub Actions history for audit. This phase covers deployment recovery, not deployment itself.

</domain>

<decisions>
## Implementation Decisions

### Rollback Triggers
- Auto-rollback + manual trigger (both supported)
- Auto triggers on: ArgoCD sync failure OR health endpoint failure
- 2-minute health check wait after deploy before deciding to rollback
- Cooldown period after rollback: Claude's discretion based on best practices

### Environment Strategy
- Unified workflow for all environments (single workflow with env parameter)
- Same rollback process for dev/staging/prod
- Only difference: Production requires manual approval via GitHub environment protection
- Any repo maintainer can approve production rollbacks

### Rollback Scope
- Component-level rollback supported (Claude decides components based on Kustomize structure)
- Previous version only (N-1) — no deep version history
- App-only rollback — database migrations stay applied (safer)
- Post-rollback health verification required
- Dry-run mode to preview what would be rolled back
- Retry once automatically if rollback itself fails, then alert
- Rate limiting: max rollbacks per time period to prevent storms

### Audit & Notifications
- Notifications via GitHub Actions only (no external Slack integration)
- Detailed audit log: who, when, to-version, reason, trigger type, duration
- Rollback history committed to repo (not just workflow logs)
- Summary comment posted on original PR/commit that caused the rollback

### Claude's Discretion
- Cooldown period after rollback (if any)
- Which components are independently rollbackable (analyze Kustomize structure)
- Specific rate limit values
- Rollback history file format and location

</decisions>

<specifics>
## Specific Ideas

- Post-rollback health check confirms the rolled-back version is actually working
- Linking rollback back to the causing PR/commit creates accountability trail
- Dry-run mode helps operators understand impact before committing to rollback

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-rollback-automation*
*Context gathered: 2026-02-03*
