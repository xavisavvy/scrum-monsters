# Future Enhancements

Ideas and features to consider for future milestones. Not yet scheduled.

## Infrastructure

- **ARGOCD_AUTH_TOKEN Configuration (ARGO-01)**: Configure the `ARGOCD_AUTH_TOKEN` GitHub repository secret for the production rollback workflow (`.github/workflows/rollback.yml`). Blocked until ArgoCD is deployed on a Kubernetes cluster — currently hosting on Replit with no ArgoCD server. The workflow is `workflow_dispatch` only, so it won't fire accidentally. When ready: generate token from ArgoCD server, add as GitHub repo secret, verify with dry-run rollback. See deferred plan: `.planning/phases/31-dependency-lifecycle-polish/31-02-PLAN.md`.

## Combat

- **Boss Reanimation by Spectators**: Allow spectators to reanimate a defeated boss by healing it back above 0 HP. Requires resetting `boss.defeated = false` and `boss.currentHealth > 0` in `gameState.attackBoss()` (server/gameState.ts). Currently the dead-boss guard (`defeated || currentHealth <= 0`) blocks all interactions including spectator heals once the boss dies. Implementation would need a new "reanimate" threshold or mechanic separate from normal spectator healing.
