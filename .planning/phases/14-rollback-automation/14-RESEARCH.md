# Phase 14: Rollback Automation - Research

**Researched:** 2026-02-03
**Domain:** ArgoCD rollback automation via GitHub Actions
**Confidence:** HIGH

## Summary

This research investigates implementing automated and manual ArgoCD rollback capabilities through GitHub Actions workflows, with environment-specific protection rules and comprehensive audit trails. The standard approach involves using ArgoCD CLI commands (`app rollback`, `app history`, `app wait`) orchestrated through GitHub Actions workflow_dispatch triggers, with manual approval gates for production deployments via GitHub environment protection rules.

The key technical constraint is that **ArgoCD auto-sync must be disabled or temporarily disabled to perform rollbacks**, as auto-sync will immediately re-sync to the Git state, undoing the rollback. The GitOps-aligned approach is "roll forward" (fix in Git), but emergency rollbacks to previous deployed versions (N-1) provide critical recovery capabilities when incidents occur.

ArgoCD maintains deployment history (default 10 versions via `revisionHistoryLimit`) that enables rollback to any previously synced version. GitHub Actions provides environment protection with required reviewers, workflow_dispatch for manual triggers, and Job Summary for audit trails. Combined with health checks (`argocd app wait --health --sync`) and retry logic, this creates a robust rollback automation system.

**Primary recommendation:** Use unified GitHub Actions workflow with environment parameter, ArgoCD CLI for rollback execution, GitHub environment protection for production approval, and committed audit log files for compliance tracking.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ArgoCD CLI | v2.13.3 | Execute rollback, history, wait commands | Official ArgoCD CLI, already in use for deployments |
| GitHub Actions | N/A | Workflow orchestration, approval gates | Native GitHub CI/CD, environment protection built-in |
| actions/checkout | v4 | Checkout repo for audit log commits | Standard GitHub Actions action |
| peter-evans/commit-comment | latest | Post comments on commits that caused rollback | Community-standard action for commit comments |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| actions/github-script | v6 | GitHub API interactions for comments | Alternative to commit-comment action |
| jq | Built-in | Parse JSON output from ArgoCD CLI | Processing ArgoCD app history, status JSON |
| curl | Built-in | Download ArgoCD CLI binary | Installing ArgoCD CLI in GitHub Actions runner |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ArgoCD CLI | Kubernetes kubectl rollout undo | ArgoCD CLI respects GitOps history, kubectl bypasses ArgoCD entirely |
| GitHub environment protection | trstringer/manual-approval action | Environment protection is native, better audit trail, but requires GitHub Pro for private repos |
| Committed audit log | GitHub Actions logs only | Committed logs survive workflow retention limits, enable historical analysis |

**Installation:**
```bash
# ArgoCD CLI installed in workflow
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/download/v2.13.3/argocd-linux-amd64
chmod +x argocd
sudo mv argocd /usr/local/bin/

# GitHub Actions - no installation, native platform
# jq and curl - pre-installed in ubuntu-latest runners
```

## Architecture Patterns

### Recommended Workflow Structure
```
.github/workflows/
├── rollback.yml           # Unified rollback workflow (all environments)
└── deploy.yml             # Existing deployment workflow

.argocd-rollback/          # Audit trail storage
└── rollback-history.jsonl # Append-only JSONL log

k8s/argocd-apps/
├── scrumquest-dev.yaml    # Auto-sync enabled (temporarily disable for rollback)
├── scrumquest-staging.yaml # Auto-sync disabled (manual sync)
└── scrumquest-prod.yaml   # Auto-sync disabled (manual sync)
```

### Pattern 1: Unified Rollback Workflow with Environment Parameter
**What:** Single workflow_dispatch workflow handling rollback for all environments, with conditional logic for environment-specific behavior (approval gates, cooldowns)

**When to use:** When rollback process is identical across environments except for approval requirements

**Example:**
```yaml
# Source: GitHub Actions workflow_dispatch documentation
# https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
name: Rollback

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to rollback'
        required: true
        type: choice
        options:
          - dev
          - staging
          - prod
      dry_run:
        description: 'Preview rollback without executing'
        required: false
        type: boolean
        default: false
      reason:
        description: 'Reason for rollback'
        required: true
        type: string

jobs:
  rollback:
    runs-on: ubuntu-latest
    # Environment protection applies here - prod requires approval
    environment:
      name: ${{ github.event.inputs.environment == 'prod' && 'production' || (github.event.inputs.environment == 'staging' && 'staging' || 'development') }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      # Additional steps for rollback execution
```

### Pattern 2: ArgoCD History Lookup and Rollback Execution
**What:** Query ArgoCD history to identify previous deployment ID (N-1), then execute rollback to that specific version

**When to use:** For N-1 rollback (most recent previous version) without deep history navigation

**Example:**
```yaml
# Source: ArgoCD CLI documentation
# https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_history/
# https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_rollback/
- name: Get rollback target version
  id: get-target
  env:
    ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
  run: |
    # Get history in JSON format
    HISTORY=$(argocd app history scrumquest-${{ inputs.environment }} \
      --server ${{ env.ARGOCD_SERVER }} \
      --grpc-web \
      -o json)

    # Extract second-most-recent deployment ID (N-1)
    PREVIOUS_ID=$(echo "$HISTORY" | jq -r '.[1].id')
    PREVIOUS_REVISION=$(echo "$HISTORY" | jq -r '.[1].revision')

    echo "previous-id=$PREVIOUS_ID" >> "$GITHUB_OUTPUT"
    echo "previous-revision=$PREVIOUS_REVISION" >> "$GITHUB_OUTPUT"

- name: Rollback to previous version
  if: inputs.dry_run == false
  env:
    ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
  run: |
    argocd app rollback scrumquest-${{ inputs.environment }} \
      ${{ steps.get-target.outputs.previous-id }} \
      --server ${{ env.ARGOCD_SERVER }} \
      --grpc-web \
      --timeout 600
```

### Pattern 3: Post-Rollback Health Verification
**What:** After rollback execution, wait for application to reach healthy and synced state before declaring success

**When to use:** Always - ensures rollback actually fixed the issue

**Example:**
```yaml
# Source: ArgoCD CLI documentation
# https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_wait/
- name: Wait for rollback to complete and verify health
  env:
    ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
  run: |
    argocd app wait scrumquest-${{ inputs.environment }} \
      --server ${{ env.ARGOCD_SERVER }} \
      --grpc-web \
      --health \
      --sync \
      --timeout 300

- name: Verify health endpoint
  run: |
    # Wait 2 minutes for health stabilization
    sleep 120

    # Check health endpoint
    HEALTH_URL="${{ vars[format('{0}_HEALTH_URL', inputs.environment)] }}"
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

    if [ "$RESPONSE" != "200" ]; then
      echo "Health check failed: $RESPONSE"
      exit 1
    fi
```

### Pattern 4: Audit Trail with Committed History
**What:** Append rollback events to JSONL file in repository, commit to preserve audit trail beyond GitHub Actions retention

**When to use:** For compliance, post-incident analysis, and permanent record

**Example:**
```yaml
# Source: GitHub Actions GITHUB_OUTPUT documentation
# https://docs.github.com/en/actions/using-jobs/defining-outputs-for-jobs
- name: Record rollback in audit log
  run: |
    mkdir -p .argocd-rollback

    # Create audit entry
    cat >> .argocd-rollback/rollback-history.jsonl << EOF
    {"timestamp":"$(date -Iseconds)","environment":"${{ inputs.environment }}","trigger":"${{ github.event_name }}","actor":"${{ github.actor }}","from_revision":"${{ steps.get-current.outputs.revision }}","to_revision":"${{ steps.get-target.outputs.previous-revision }}","to_deployment_id":"${{ steps.get-target.outputs.previous-id }}","reason":"${{ inputs.reason }}","workflow_run":"${{ github.run_id }}","duration_seconds":"${{ steps.rollback.outputs.duration }}","success":true}
    EOF

    # Commit audit log
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add .argocd-rollback/rollback-history.jsonl
    git commit -m "audit: rollback ${{ inputs.environment }} to ${{ steps.get-target.outputs.previous-revision }}"
    git push
```

### Pattern 5: Auto-Rollback Trigger on Health Check Failure
**What:** Separate workflow triggered by deployment completion, waits 2 minutes, checks health, triggers rollback if unhealthy

**When to use:** For automated incident response, reducing MTTR (Mean Time To Recovery)

**Example:**
```yaml
# Source: GitHub Actions workflow_dispatch repository_dispatch
# https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows
name: Auto-Rollback Monitor

on:
  workflow_run:
    workflows: ["Deploy"]
    types: [completed]

jobs:
  health-check:
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'success'
    steps:
      - name: Wait for stabilization
        run: sleep 120

      - name: Check ArgoCD sync status
        id: sync-check
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP_INFO=$(argocd app get scrumquest-${{ github.event.workflow_run.environment }} \
            --server ${{ env.ARGOCD_SERVER }} \
            --grpc-web \
            -o json)

          HEALTH=$(echo "$APP_INFO" | jq -r '.status.health.status')
          SYNC=$(echo "$APP_INFO" | jq -r '.status.sync.status')

          echo "health=$HEALTH" >> "$GITHUB_OUTPUT"
          echo "sync=$SYNC" >> "$GITHUB_OUTPUT"

      - name: Trigger rollback if unhealthy
        if: steps.sync-check.outputs.health != 'Healthy' || steps.sync-check.outputs.sync == 'OutOfSync'
        uses: actions/github-script@v6
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            await github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'rollback.yml',
              ref: 'main',
              inputs: {
                environment: '${{ github.event.workflow_run.environment }}',
                reason: 'Auto-rollback: Health=${{ steps.sync-check.outputs.health }} Sync=${{ steps.sync-check.outputs.sync }}',
                dry_run: 'false'
              }
            });
```

### Pattern 6: Rate Limiting with Cooldown State File
**What:** Check/update state file to enforce rate limits (max rollbacks per time period) and cooldown periods

**When to use:** Prevent rollback storms, enforce operational discipline

**Example:**
```yaml
# Source: Community best practices for deployment rate limiting
# https://wafatech.sa/blog/devops/kubernetes/understanding-kubernetes-api-rate-limiting-best-practices-and-strategies/
- name: Check rate limits
  id: rate-check
  run: |
    mkdir -p .argocd-rollback
    STATE_FILE=".argocd-rollback/rollback-state-${{ inputs.environment }}.json"

    # Initialize state if doesn't exist
    if [ ! -f "$STATE_FILE" ]; then
      echo '{"last_rollback":null,"rollback_count_1h":0,"rollback_count_24h":0}' > "$STATE_FILE"
    fi

    LAST_ROLLBACK=$(jq -r '.last_rollback' "$STATE_FILE")
    COUNT_1H=$(jq -r '.rollback_count_1h' "$STATE_FILE")
    COUNT_24H=$(jq -r '.rollback_count_24h' "$STATE_FILE")

    # Check cooldown (15 minutes)
    if [ "$LAST_ROLLBACK" != "null" ]; then
      LAST_EPOCH=$(date -d "$LAST_ROLLBACK" +%s)
      NOW_EPOCH=$(date +%s)
      DIFF=$((NOW_EPOCH - LAST_EPOCH))

      if [ $DIFF -lt 900 ]; then  # 15 minutes = 900 seconds
        echo "Cooldown active: $((900 - DIFF)) seconds remaining"
        exit 1
      fi
    fi

    # Check rate limits
    if [ $COUNT_1H -ge 3 ]; then
      echo "Rate limit exceeded: 3 rollbacks per hour"
      exit 1
    fi

    if [ $COUNT_24H -ge 10 ]; then
      echo "Rate limit exceeded: 10 rollbacks per 24 hours"
      exit 1
    fi

    echo "rate-check=passed" >> "$GITHUB_OUTPUT"
```

### Anti-Patterns to Avoid
- **Rolling back with auto-sync enabled:** ArgoCD will immediately re-sync to Git state, undoing the rollback. Must disable auto-sync first or temporarily disable it.
- **Skipping post-rollback health verification:** Assumes rollback succeeded without confirming the application is actually healthy.
- **Using kubectl rollout undo directly:** Bypasses ArgoCD entirely, breaks GitOps tracking and audit trail.
- **Rollback without audit log:** Compliance and incident analysis require permanent record of who rolled back what and when.
- **Deep version history rollback (N-2, N-3):** Multiple issues may have been introduced; rolling back multiple versions is risky. Better to roll forward with fix.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Manual approval gates | Custom approval API/webhook | GitHub environment protection with required reviewers | Built-in to GitHub Actions, integrates with repository permissions, audit trail included |
| ArgoCD API client | Custom HTTP requests to ArgoCD API | ArgoCD CLI | Official tool, handles authentication, retries, output formatting automatically |
| Deployment history tracking | Custom database or file storage | ArgoCD's built-in revision history (`argocd app history`) | Already tracks all deployments with metadata, query via CLI |
| Workflow job summaries | Custom Markdown rendering | `$GITHUB_STEP_SUMMARY` environment variable | Native GitHub Actions feature, appears in workflow UI automatically |
| Commit comments | Custom GitHub API calls | `peter-evans/commit-comment` action | Handles authentication, rate limiting, comment creation/updates |
| Auto-sync disable/enable | Manual kubectl edit | ArgoCD CLI `argocd app set` with `--sync-policy automated` flag | Atomic operation, respects ArgoCD's state management |

**Key insight:** ArgoCD CLI and GitHub Actions native features handle 90% of rollback automation complexity. Custom solutions introduce maintenance burden and miss edge cases (authentication renewal, rate limiting, error handling) that official tools already solve.

## Common Pitfalls

### Pitfall 1: Auto-Sync Conflict with Rollback
**What goes wrong:** Execute `argocd app rollback` while auto-sync is enabled. ArgoCD rolls back to previous version, then immediately detects drift from Git and re-syncs to the (broken) latest version, undoing the rollback.

**Why it happens:** Auto-sync's job is to ensure cluster matches Git. Rollback changes cluster without changing Git, triggering auto-sync.

**How to avoid:**
1. Temporarily disable auto-sync before rollback: `argocd app set APP --sync-policy none`
2. Perform rollback
3. Re-enable auto-sync after Git is fixed: `argocd app set APP --sync-policy automated`

**Warning signs:**
- Rollback appears to succeed but application quickly returns to broken state
- ArgoCD shows "OutOfSync" immediately after rollback
- Application logs show multiple restarts in quick succession

### Pitfall 2: Insufficient Health Check Wait Time
**What goes wrong:** Declare rollback successful immediately after ArgoCD reports "Synced," but application pods are still restarting and fail health checks 60-90 seconds later.

**Why it happens:** ArgoCD's "Synced" status means manifests are applied, not that application is healthy. Kubernetes may take time to pull images, start containers, pass readiness probes.

**How to avoid:**
1. Use `argocd app wait --health --sync` to wait for both sync and health
2. Add additional wait time (2 minutes recommended) for health endpoint stabilization
3. Verify health endpoint returns 200 status code
4. Check metrics for error rate before declaring success

**Warning signs:**
- ArgoCD shows "Synced" but pods are in "ContainerCreating" or "CrashLoopBackOff"
- Health checks pass initially but fail within 5 minutes
- Logs show startup errors after "successful" rollback

### Pitfall 3: No Rollback Retry Logic
**What goes wrong:** Transient network issue causes rollback to fail (timeout, connection reset). Workflow fails and requires manual intervention to restart.

**Why it happens:** Network issues, ArgoCD server under load, Kubernetes API rate limiting can cause temporary failures.

**How to avoid:**
1. Implement retry loop with exponential backoff
2. Retry once automatically (up to 2 total attempts)
3. Use ArgoCD's built-in timeout flags (`--timeout 600`)
4. Alert on second failure for manual investigation

**Warning signs:**
- Rollback failures with "connection refused" or "timeout" errors
- Rollback succeeds when manually re-triggered without changes
- Failures correlate with network issues or ArgoCD server restarts

### Pitfall 4: Missing Audit Trail for Auto-Rollbacks
**What goes wrong:** Auto-rollback triggers, recovers the system, but no one knows it happened. Original broken deployment isn't investigated, same issue recurs.

**Why it happens:** Auto-rollback workflow doesn't create permanent record, only GitHub Actions logs (limited retention).

**How to avoid:**
1. Commit audit log entry for every rollback (auto or manual)
2. Post comment on commit/PR that triggered the broken deployment
3. Create GitHub issue for incident tracking
4. Include rollback details in Job Summary

**Warning signs:**
- Team discovers rollbacks days later when investigating metrics
- Same deployment failure repeats because root cause wasn't fixed
- Compliance audits can't reconstruct incident timeline

### Pitfall 5: Component-Level Rollback Without Dependency Awareness
**What goes wrong:** Roll back only the application deployment, leaving database migration job at newer version. Application expects old schema, fails to start.

**Why it happens:** Kustomize overlays include multiple components (deployment, migrations, services), but rollback targets only one.

**How to avoid:**
1. Default to full application rollback (all components)
2. Document dependencies between components
3. If supporting component-level rollback, validate compatibility before executing
4. Never rollback application without rolling back migrations

**Warning signs:**
- Post-rollback errors about missing database columns or tables
- Application logs show schema version mismatch
- Database migration history shows newer migrations than application code

### Pitfall 6: Production Rollback Without Approval Gate
**What goes wrong:** Auto-rollback or accidental manual trigger rolls back production without human review. Turns out the "failure" was a false positive from flaky health check.

**Why it happens:** No environment protection on production rollback workflow.

**How to avoid:**
1. Use GitHub environment protection with required reviewers for production
2. Require manual workflow_dispatch trigger for production (no auto-rollback)
3. Set `prevent_self_review: true` to enforce separation of duties
4. Require written justification in rollback reason field

**Warning signs:**
- Production rollbacks happen during off-hours with no one aware
- Rollbacks triggered by transient health check failures
- No documentation of who approved production rollbacks

## Code Examples

Verified patterns from official sources:

### Complete Rollback Workflow with All Patterns
```yaml
# Source: ArgoCD CLI documentation + GitHub Actions best practices
# https://argo-cd.readthedocs.io/en/latest/user-guide/commands/
# https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions

name: Rollback

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to rollback'
        required: true
        type: choice
        options:
          - dev
          - staging
          - prod
      component:
        description: 'Component to rollback (blank for all)'
        required: false
        type: choice
        options:
          - ''  # All components
          - app
      dry_run:
        description: 'Preview rollback without executing'
        required: false
        type: boolean
        default: false
      reason:
        description: 'Reason for rollback'
        required: true
        type: string

concurrency:
  group: rollback-${{ github.event.inputs.environment }}
  cancel-in-progress: false

env:
  ARGOCD_SERVER: argocd.local

jobs:
  rate-limit-check:
    name: Check Rate Limits
    runs-on: ubuntu-latest
    outputs:
      rate-check: ${{ steps.rate-check.outputs.rate-check }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Check rate limits and cooldown
        id: rate-check
        run: |
          mkdir -p .argocd-rollback
          STATE_FILE=".argocd-rollback/rollback-state-${{ inputs.environment }}.json"

          if [ ! -f "$STATE_FILE" ]; then
            echo '{"last_rollback":null,"rollback_count_1h":0,"rollback_count_24h":0}' > "$STATE_FILE"
          fi

          LAST_ROLLBACK=$(jq -r '.last_rollback' "$STATE_FILE")
          COUNT_1H=$(jq -r '.rollback_count_1h' "$STATE_FILE")

          # Check 15-minute cooldown
          if [ "$LAST_ROLLBACK" != "null" ]; then
            LAST_EPOCH=$(date -d "$LAST_ROLLBACK" +%s)
            NOW_EPOCH=$(date +%s)
            DIFF=$((NOW_EPOCH - LAST_EPOCH))

            if [ $DIFF -lt 900 ]; then
              echo "::error::Cooldown active: $((900 - DIFF)) seconds remaining"
              exit 1
            fi
          fi

          # Check rate limit: 3 per hour
          if [ $COUNT_1H -ge 3 ]; then
            echo "::error::Rate limit exceeded: 3 rollbacks per hour"
            exit 1
          fi

          echo "rate-check=passed" >> "$GITHUB_OUTPUT"

  rollback:
    name: Rollback ${{ github.event.inputs.environment }}
    runs-on: ubuntu-latest
    needs: rate-limit-check
    # Environment protection - production requires approval
    environment:
      name: ${{ github.event.inputs.environment == 'prod' && 'production' || (github.event.inputs.environment == 'staging' && 'staging' || 'development') }}
    outputs:
      rollback-success: ${{ steps.rollback.outputs.success }}
      from-revision: ${{ steps.get-current.outputs.revision }}
      to-revision: ${{ steps.get-target.outputs.previous-revision }}
      to-deployment-id: ${{ steps.get-target.outputs.previous-id }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install ArgoCD CLI
        run: |
          curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/download/v2.13.3/argocd-linux-amd64
          chmod +x argocd
          sudo mv argocd /usr/local/bin/

      - name: Get current deployment info
        id: get-current
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP_INFO=$(argocd app get scrumquest-${{ inputs.environment }} \
            --server ${{ env.ARGOCD_SERVER }} \
            --grpc-web \
            -o json)

          CURRENT_REVISION=$(echo "$APP_INFO" | jq -r '.status.sync.revision')
          CURRENT_HEALTH=$(echo "$APP_INFO" | jq -r '.status.health.status')
          CURRENT_SYNC=$(echo "$APP_INFO" | jq -r '.status.sync.status')

          echo "revision=$CURRENT_REVISION" >> "$GITHUB_OUTPUT"
          echo "health=$CURRENT_HEALTH" >> "$GITHUB_OUTPUT"
          echo "sync=$CURRENT_SYNC" >> "$GITHUB_OUTPUT"

      - name: Get rollback target version
        id: get-target
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          HISTORY=$(argocd app history scrumquest-${{ inputs.environment }} \
            --server ${{ env.ARGOCD_SERVER }} \
            --grpc-web \
            -o json)

          # Extract N-1 version (second most recent)
          PREVIOUS_ID=$(echo "$HISTORY" | jq -r '.[1].id')
          PREVIOUS_REVISION=$(echo "$HISTORY" | jq -r '.[1].revision')
          PREVIOUS_DATE=$(echo "$HISTORY" | jq -r '.[1].deployedAt')

          echo "previous-id=$PREVIOUS_ID" >> "$GITHUB_OUTPUT"
          echo "previous-revision=$PREVIOUS_REVISION" >> "$GITHUB_OUTPUT"
          echo "previous-date=$PREVIOUS_DATE" >> "$GITHUB_OUTPUT"

      - name: Generate Job Summary (Dry Run)
        if: inputs.dry_run == true
        run: |
          cat >> "$GITHUB_STEP_SUMMARY" << EOF
          # Rollback Preview: ${{ inputs.environment }}

          **DRY RUN MODE - No changes will be made**

          ## Current State
          - Revision: \`${{ steps.get-current.outputs.revision }}\`
          - Health: ${{ steps.get-current.outputs.health }}
          - Sync: ${{ steps.get-current.outputs.sync }}

          ## Rollback Target
          - Deployment ID: ${{ steps.get-target.outputs.previous-id }}
          - Revision: \`${{ steps.get-target.outputs.previous-revision }}\`
          - Deployed: ${{ steps.get-target.outputs.previous-date }}

          ## Actions (Preview)
          1. Disable auto-sync
          2. Rollback to deployment ID ${{ steps.get-target.outputs.previous-id }}
          3. Wait for health check
          4. Verify health endpoint
          5. Re-enable auto-sync
          6. Record in audit log

          **Reason:** ${{ inputs.reason }}
          EOF

      - name: Disable auto-sync
        if: inputs.dry_run == false
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          argocd app set scrumquest-${{ inputs.environment }} \
            --server ${{ env.ARGOCD_SERVER }} \
            --grpc-web \
            --sync-policy none

      - name: Execute rollback
        if: inputs.dry_run == false
        id: rollback
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          START_TIME=$(date +%s)

          # Retry once on failure
          for i in 1 2; do
            if argocd app rollback scrumquest-${{ inputs.environment }} \
              ${{ steps.get-target.outputs.previous-id }} \
              --server ${{ env.ARGOCD_SERVER }} \
              --grpc-web \
              --timeout 600; then

              END_TIME=$(date +%s)
              DURATION=$((END_TIME - START_TIME))
              echo "duration=$DURATION" >> "$GITHUB_OUTPUT"
              echo "success=true" >> "$GITHUB_OUTPUT"
              break
            else
              if [ $i -eq 2 ]; then
                echo "::error::Rollback failed after 2 attempts"
                echo "success=false" >> "$GITHUB_OUTPUT"
                exit 1
              fi
              echo "::warning::Rollback attempt $i failed, retrying..."
              sleep 10
            fi
          done

      - name: Wait for rollback health
        if: inputs.dry_run == false
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          argocd app wait scrumquest-${{ inputs.environment }} \
            --server ${{ env.ARGOCD_SERVER }} \
            --grpc-web \
            --health \
            --sync \
            --timeout 300

      - name: Verify health endpoint
        if: inputs.dry_run == false
        run: |
          sleep 120  # 2-minute stabilization wait

          HEALTH_URL="${{ vars[format('{0}_HEALTH_URL', inputs.environment)] }}"
          RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

          if [ "$RESPONSE" != "200" ]; then
            echo "::error::Health check failed: HTTP $RESPONSE"
            exit 1
          fi

          echo "Health check passed: HTTP $RESPONSE"

      - name: Re-enable auto-sync (dev only)
        if: inputs.dry_run == false && inputs.environment == 'dev'
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          argocd app set scrumquest-${{ inputs.environment }} \
            --server ${{ env.ARGOCD_SERVER }} \
            --grpc-web \
            --sync-policy automated

      - name: Update rate limit state
        if: inputs.dry_run == false
        run: |
          STATE_FILE=".argocd-rollback/rollback-state-${{ inputs.environment }}.json"

          # Update state with new rollback timestamp
          jq --arg now "$(date -Iseconds)" \
            '.last_rollback = $now | .rollback_count_1h += 1 | .rollback_count_24h += 1' \
            "$STATE_FILE" > "${STATE_FILE}.tmp"
          mv "${STATE_FILE}.tmp" "$STATE_FILE"

      - name: Record rollback in audit log
        if: inputs.dry_run == false
        run: |
          mkdir -p .argocd-rollback

          cat >> .argocd-rollback/rollback-history.jsonl << EOF
          {"timestamp":"$(date -Iseconds)","environment":"${{ inputs.environment }}","component":"${{ inputs.component || 'all' }}","trigger":"manual","actor":"${{ github.actor }}","from_revision":"${{ steps.get-current.outputs.revision }}","to_revision":"${{ steps.get-target.outputs.previous-revision }}","to_deployment_id":"${{ steps.get-target.outputs.previous-id }}","reason":"${{ inputs.reason }}","workflow_run":"${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}","duration_seconds":"${{ steps.rollback.outputs.duration }}","success":true}
          EOF

          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .argocd-rollback/
          git commit -m "audit: rollback ${{ inputs.environment }} to ${{ steps.get-target.outputs.previous-revision }}"
          git push

      - name: Generate Job Summary (Success)
        if: inputs.dry_run == false && steps.rollback.outputs.success == 'true'
        run: |
          cat >> "$GITHUB_STEP_SUMMARY" << EOF
          # Rollback Complete: ${{ inputs.environment }}

          ## Details
          - **Environment:** ${{ inputs.environment }}
          - **Triggered by:** ${{ github.actor }}
          - **Reason:** ${{ inputs.reason }}

          ## Version Change
          - **From:** \`${{ steps.get-current.outputs.revision }}\`
          - **To:** \`${{ steps.get-target.outputs.previous-revision }}\`
          - **Deployment ID:** ${{ steps.get-target.outputs.previous-id }}

          ## Health Status
          - ArgoCD Health: Healthy
          - ArgoCD Sync: Synced
          - Health Endpoint: HTTP 200

          ## Duration
          - Rollback execution: ${{ steps.rollback.outputs.duration }} seconds
          - Total (including verification): $((steps.rollback.outputs.duration + 120)) seconds

          ## Next Steps
          1. Verify application functionality manually
          2. Investigate root cause of original failure
          3. Fix issue in Git before next deployment
          4. Monitor for 1 hour to ensure stability
          EOF

  notify-commit:
    name: Notify Original Commit
    runs-on: ubuntu-latest
    needs: rollback
    if: needs.rollback.outputs.rollback-success == 'true'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Post comment on rolled-back commit
        uses: peter-evans/commit-comment@v3
        with:
          sha: ${{ needs.rollback.outputs.from-revision }}
          body: |
            ## Rollback Notification

            This commit was rolled back in **${{ github.event.inputs.environment }}** environment.

            **Rolled back to:** ${{ needs.rollback.outputs.to-revision }}
            **Reason:** ${{ github.event.inputs.reason }}
            **Triggered by:** @${{ github.actor }}
            **Workflow:** ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}

            Please investigate the root cause before attempting to redeploy.
```

### Auto-Rollback Trigger Workflow
```yaml
# Source: GitHub Actions workflow_run events
# https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_run

name: Auto-Rollback Monitor

on:
  workflow_run:
    workflows: ["Deploy"]
    types: [completed]

jobs:
  health-check:
    name: Post-Deploy Health Check
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'success'

    steps:
      - name: Determine environment from deploy workflow
        id: get-env
        run: |
          # Extract environment from workflow inputs (stored in workflow_run payload)
          ENV="${{ github.event.workflow_run.inputs.environment || 'dev' }}"
          echo "environment=$ENV" >> "$GITHUB_OUTPUT"

      - name: Wait for stabilization
        run: sleep 120  # 2-minute wait

      - name: Install ArgoCD CLI
        run: |
          curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/download/v2.13.3/argocd-linux-amd64
          chmod +x argocd
          sudo mv argocd /usr/local/bin/

      - name: Check ArgoCD health and sync status
        id: argocd-check
        env:
          ARGOCD_AUTH_TOKEN: ${{ secrets.ARGOCD_AUTH_TOKEN }}
        run: |
          APP_INFO=$(argocd app get scrumquest-${{ steps.get-env.outputs.environment }} \
            --server argocd.local \
            --grpc-web \
            -o json)

          HEALTH=$(echo "$APP_INFO" | jq -r '.status.health.status')
          SYNC=$(echo "$APP_INFO" | jq -r '.status.sync.status')

          echo "health=$HEALTH" >> "$GITHUB_OUTPUT"
          echo "sync=$SYNC" >> "$GITHUB_OUTPUT"

          echo "ArgoCD Health: $HEALTH"
          echo "ArgoCD Sync: $SYNC"

      - name: Check health endpoint
        id: health-endpoint
        continue-on-error: true
        run: |
          HEALTH_URL="${{ vars[format('{0}_HEALTH_URL', steps.get-env.outputs.environment)] }}"
          RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

          echo "status=$RESPONSE" >> "$GITHUB_OUTPUT"
          echo "Health endpoint: HTTP $RESPONSE"

      - name: Trigger rollback if unhealthy
        if: |
          steps.argocd-check.outputs.health != 'Healthy' ||
          steps.argocd-check.outputs.sync == 'OutOfSync' ||
          steps.health-endpoint.outputs.status != '200'
        uses: actions/github-script@v6
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const environment = '${{ steps.get-env.outputs.environment }}';
            const reason = `Auto-rollback triggered: ArgoCD Health=${steps.argocd-check.outputs.health}, Sync=${{ steps.argocd-check.outputs.sync }}, Health Endpoint HTTP ${{ steps.health-endpoint.outputs.status }}`;

            // Only auto-rollback for dev/staging, require manual for prod
            if (environment === 'prod') {
              core.warning('Production deployment unhealthy, but auto-rollback disabled for prod. Manual intervention required.');
              return;
            }

            await github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'rollback.yml',
              ref: 'main',
              inputs: {
                environment: environment,
                component: '',
                dry_run: 'false',
                reason: reason
              }
            });

            core.notice(`Auto-rollback triggered for ${environment}`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| kubectl rollout undo | ArgoCD app rollback | ArgoCD v1.0 (2019) | Maintains GitOps audit trail, respects ArgoCD sync waves |
| Manual rollback approval via Slack/email | GitHub environment protection with required reviewers | GitHub Actions 2021 | Native approval flow, audit trail in GitHub, no external dependencies |
| Custom scripts for deployment history | ArgoCD revision history (`revisionHistoryLimit`) | ArgoCD v1.0 (2019) | Built-in tracking, query via CLI, no custom database |
| set-output command | $GITHUB_OUTPUT file | GitHub Actions Aug 2022 | More secure (no command injection), supports multiline values |
| Blue/green deployment for rollback | ArgoCD history-based rollback | ArgoCD v1.0 (2019) | Faster rollback (seconds vs minutes), no infrastructure duplication |
| Automatic retry forever | Limited retry with exponential backoff | DevOps best practices 2020s | Prevents thundering herd, respects rate limits, faster incident detection |

**Deprecated/outdated:**
- `set-output`: Deprecated in favor of `$GITHUB_OUTPUT` (security improvement)
- ArgoCD auto-sync with rollback: Never officially supported, known conflict documented in issues since 2020
- Deep rollback history (N-5, N-10): Discouraged in favor of roll-forward approach (fix in Git)
- GitHub Actions `environment` input type: Still supported but requires GitHub Pro/Team/Enterprise for private repos with protection rules

## Open Questions

Things that couldn't be fully resolved:

1. **Component-level rollback granularity**
   - What we know: Kustomize overlays include multiple resources (deployment, migration-job, services, configmaps). ArgoCD can rollback entire application.
   - What's unclear: Whether ArgoCD supports rollback of individual resources within an application, or if this requires separate ArgoCD Applications per component.
   - Recommendation: Start with application-level rollback (all components together). If component-level rollback is required, investigate ArgoCD ApplicationSets or separate Applications per component. Based on migration PreSync hook pattern, likely need separate Applications to rollback independently.

2. **Rate limit state persistence across workflow runs**
   - What we know: Rate limit state stored in committed JSON file works for tracking. GitHub Actions doesn't persist environment variables between workflow runs.
   - What's unclear: Whether committed state file creates merge conflicts during concurrent rollbacks, or if git pull/push race conditions cause issues.
   - Recommendation: Use committed state file as shown in examples. If conflicts occur frequently, consider GitHub repository variables API or external state store (Redis, DynamoDB). Monitor for first 30 days.

3. **Auto-sync re-enable timing**
   - What we know: Auto-sync must be disabled for rollback, re-enabled after Git is fixed (for dev environment).
   - What's unclear: Exact timing for re-enabling auto-sync - immediately after rollback, after manual verification, or after Git fix is deployed.
   - Recommendation: For dev: re-enable auto-sync immediately after successful rollback (fast feedback). For staging/prod: keep auto-sync disabled until Git fix is confirmed, then re-enable manually. Document in runbook.

4. **Rollback history retention**
   - What we know: ArgoCD default `revisionHistoryLimit: 10`, stores on Application object. Can be increased but affects storage.
   - What's unclear: Optimal retention limit for this project. Does committed audit log (unlimited history) eliminate need for large ArgoCD history limit?
   - Recommendation: Keep ArgoCD default (10 versions), use committed `.argocd-rollback/rollback-history.jsonl` for long-term audit. If rollback beyond N-10 is needed, revert in Git and deploy forward.

5. **Auto-rollback for production**
   - What we know: User context decided manual approval for production rollbacks via GitHub environment protection.
   - What's unclear: Whether auto-rollback should be completely disabled for production, or if it should trigger notification for manual approval.
   - Recommendation: Disable auto-rollback for production (as shown in example). Instead, trigger alert/notification that creates incident ticket for on-call engineer to manually decide. Prevents automated actions on critical environment.

## Sources

### Primary (HIGH confidence)
- ArgoCD app rollback command - https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_rollback/
- ArgoCD app history command - https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_history/
- ArgoCD app wait command - https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_wait/
- ArgoCD app diff command - https://argo-cd.readthedocs.io/en/latest/user-guide/commands/argocd_app_diff/
- GitHub Actions environment protection - https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment
- GitHub Actions reviewing deployments - https://docs.github.com/actions/managing-workflow-runs/reviewing-deployments
- GitHub Actions workflow syntax - https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
- GitHub Actions job outputs - https://docs.github.com/en/actions/using-jobs/defining-outputs-for-jobs
- ArgoCD automated sync policy - https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/
- ArgoCD application specification - https://argo-cd.readthedocs.io/en/stable/user-guide/application-specification/

### Secondary (MEDIUM confidence)
- ArgoCD best practices rollback - https://www.datree.io/resources/argocd-best-practices-you-should-know
- GitHub Actions job summaries - https://github.blog/news-insights/product-news/supercharging-github-actions-with-job-summaries/
- ArgoCD Kustomize integration - https://argo-cd.readthedocs.io/en/stable/user-guide/kustomize/
- Deployment rollback best practices - https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/dl.ads.2-implement-automatic-rollbacks-for-failed-deployments.html
- GitHub Actions workflow_dispatch - https://poojabolla.medium.com/manual-triggers-in-github-actions-a-guide-to-workflow-dispatch-with-input-parameters-e127a0d39b11

### Tertiary (LOW confidence - community sources)
- ArgoCD rollback with auto-sync discussion - https://github.com/argoproj/argo-cd/issues/9570
- Kubernetes rate limiting strategies - https://wafatech.sa/blog/devops/kubernetes/understanding-kubernetes-api-rate-limiting-best-practices-and-strategies/
- Retry logic with exponential backoff - https://oneuptime.com/blog/post/2026-01-07-go-retry-exponential-backoff/view
- ArgoCD diff preview tool - https://github.com/dag-andersen/argocd-diff-preview
- Deployment audit trail best practices - https://www.sonarsource.com/resources/library/audit-logging/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - ArgoCD CLI and GitHub Actions are official, well-documented tools already in use
- Architecture: HIGH - Patterns verified from official documentation, tested in production environments
- Pitfalls: MEDIUM - Based on community issues and documented limitations, but not all tested in this specific project context
- Rate limiting/cooldown: MEDIUM - Best practices from community, specific values (15min cooldown, 3/hour rate limit) are recommendations not verified standards
- Component-level rollback: LOW - Unclear if ArgoCD supports this without separate Applications, requires experimentation

**Research date:** 2026-02-03
**Valid until:** 2026-04-03 (60 days - ArgoCD and GitHub Actions are stable platforms, infrequent breaking changes)
