---
phase: 34-cicd-pipeline
plan: "02"
subsystem: infra
tags: [aws-oidc, iam, ssh-deploy-key, github-secrets, github-environments]

requires:
  - phase: 33-production-hardening
    provides: VPS at 34.199.135.244 with SSH access via lightsail_scrummonsters key

provides:
  - SSH deploy key (ed25519) authorized on VPS for GitHub Actions deploys
  - AWS OIDC identity provider for token.actions.githubusercontent.com
  - IAM role github-actions-scrummonsters scoped to repo:xavisavvy/scrum-monsters
  - GitHub repo secrets SSH_PRIVATE_KEY and AWS_OIDC_ROLE_ARN
  - GitHub environments staging and production

affects: [34-cicd-pipeline/03]

tech-stack:
  added: [aws-oidc, iam-web-identity]
  patterns:
    - OIDC federation eliminates stored AWS access keys — GitHub Actions assumes IAM role via short-lived token
    - Dedicated SSH deploy key (ed25519) separate from Lightsail default key — revocable without affecting admin access
    - GitHub environments provide deployment protection and audit trail

key-files:
  created:
    - .planning/phases/34-cicd-pipeline/iam-trust-policy.json
  modified: []

key-decisions:
  - "ed25519 SSH key type chosen over RSA — smaller, faster, modern default"
  - "IAM role has no permission policies — OIDC proves identity only; actual AWS ops use existing backup IAM user creds on VPS"
  - "StringLike with repo:xavisavvy/scrum-monsters:* allows any ref — strictly scoping to main would block workflow_dispatch"
  - "GitHub environments created without protection rules — workflow_dispatch already provides manual gating for production"

patterns-established:
  - "OIDC federation pattern: GitHub Actions -> sts:AssumeRoleWithWebIdentity -> IAM role scoped to specific repo"
  - "SSH deploy key rotation: generate new ed25519 key, add to VPS authorized_keys, set GitHub secret, revoke old"

duration: 8min
completed: 2026-03-04
---

# Phase 34 Plan 02: Infrastructure Provisioning Summary

**AWS OIDC identity provider, IAM role, SSH deploy key, GitHub secrets and environments — all prerequisites for deploy-lightsail.yml**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04
- **Completed:** 2026-03-04
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Generated ed25519 SSH deploy key pair at `~/.ssh/github-actions-deploy` and authorized public key on VPS
- Created AWS OIDC identity provider for `token.actions.githubusercontent.com` with audience `sts.amazonaws.com`
- Created IAM role `github-actions-scrummonsters` with trust policy scoped to `repo:xavisavvy/scrum-monsters:*`
- Set GitHub repo secrets: `SSH_PRIVATE_KEY` (deploy key) and `AWS_OIDC_ROLE_ARN` (role ARN)
- Created GitHub environments: `staging` and `production`

## Task Commits

1. **Task 1: Generate SSH deploy key and IAM trust policy JSON** - `1449ca8` (feat)
2. **Task 2: Provision AWS OIDC, IAM role, SSH key on VPS, GitHub secrets** - manual provisioning (checkpoint)

## Verification

- SSH deploy key verified: `ssh -i ~/.ssh/github-actions-deploy ubuntu@34.199.135.244 "echo ok"` succeeds
- GitHub secrets visible in repo Settings > Secrets: `SSH_PRIVATE_KEY`, `AWS_OIDC_ROLE_ARN`
- GitHub environments visible: `staging`, `production`
- AWS OIDC provider and IAM role created via console

## Decisions Made

- IAM role has zero permission policies — it only proves GitHub Actions identity via OIDC; the VPS already has its own AWS credentials for S3 backups
- StringLike condition on sub claim allows any ref (not just main) to prevent blocking workflow_dispatch triggers
- No environment protection rules added — workflow_dispatch already gates production deploys

## Deviations from Plan

- Steps A, D, E automated via CLI (SSH, `gh secret set`, `gh api`) instead of manual console work
- Steps B, C done via AWS Console as planned (IAM CLI permissions not available)

## Issues Encountered

None.

## Self-Check: PASSED

All provisioned resources verified: SSH key connects, secrets exist, environments created.

---
*Phase: 34-cicd-pipeline*
*Completed: 2026-03-04*
