---
plan: 44-03
phase: 44
slug: zero-downtime-deploys-blue-green
status: awaiting-operator-verification
completed: pending
requirements: [INFRA-01]
---

# Plan 44-03 Summary — Blue-green deploy orchestrator + operator runbook

One-liner: Replaces the legacy `docker compose up -d --no-deps app` SSH script with a 9-stage `deploy-bluegreen.sh` orchestrator that pulls -> starts inactive color -> healthchecks -> migrates DB -> swaps NPM upstream -> external smokes -> persists `.active-color` -> stops old color, with mandatory pre-swap auto-rollback on healthcheck failure.

## What shipped

| Commit  | Subject |
|---------|---------|
| `598ae38` | feat(44-03): blue-green deploy orchestrator + manual rollback + bats coverage |
| `5bcc465` | feat(44-03): wire blue-green orchestrator into deploy workflow + operator runbook |

### Files

| Path | Role |
|------|------|
| `scripts/deploy/deploy-bluegreen.sh` | 9-stage orchestrator (sources `lib/npm-api.sh` + `lib/health-poll.sh` from Plan 44-02). Wraps body in `deploy_bluegreen_main` so bats can test it. |
| `scripts/deploy/rollback-bluegreen.sh` | Operator-runnable manual rollback for post-swap regressions. |
| `scripts/deploy/test/test-deploy-bluegreen.bats` | 6 hermetic tests (PATH-shimmed `docker`/`curl`, function-overridden lib helpers). |
| `.github/workflows/deploy-lightsail.yml` | Both staging + prod jobs now invoke `deploy-bluegreen.sh` over SSH, forwarding `NPM_ADMIN_EMAIL` / `NPM_ADMIN_PASSWORD` via `envs:`. Smoke-test job hits external URL. |
| `.github/workflows/ci.yml` | Deploy-scripts shellcheck step extended (`-x`) to cover the two new orchestrator scripts. |
| `docs/runbooks/deploy-rollback.md` | New operator runbook (active-game interruption, continuous-curl smoke, manual rollback, additive-migrations invariant, first-deploy bootstrap, NPM secrets, auto-rollback semantics). |

## Architecture decisions

- **State file at `/opt/scrummonsters/.active-color`** is the canonical record. Missing file defaults to `blue` (so first deploy targets `green`).
- **Pre-swap auto-rollback gate.** `wait_for_healthy` returning non-zero stops the inactive color and exits 1 BEFORE any `npm_set_forward_host` call — NPM is never touched on a failed deploy. Bats test `auto-rollback: unhealthy new color exits 1, never calls npm_set_forward_host` enforces this invariant.
- **Drizzle migration runs BEFORE NPM swap.** Old color still serves traffic on the new schema, so migrations must remain additive (Pitfall 5; documented in runbook).
- **Function-level `set -euo pipefail`** inside `deploy_bluegreen_main` plus explicit `|| return 1` on lib helper calls — ensures failures propagate even when the script is sourced into a bats `run` subshell that has cleared errexit.
- **First-deploy bootstrap baked in:** the orchestrator detects a legacy `scrummonsters-app-1` container post-swap and stops/removes it idempotently. No operator runbook step required — the legacy single-color → blue-green transition is automated. (This wasn't in the planner's pseudocode; flagged as Rule 2 critical functionality per executor brief.)
- **Workflow uses `set -e` (not `-ex`)** so the NPM password is never traced in GitHub Actions logs. Secrets are forwarded via the appleboy/ssh-action `envs:` idiom — never echoed into the `script:` body.
- **Smoke-test job hits `https://scrummonsters.com/api/health`** (external, through NPM) instead of `http://localhost:5000` — host port 5000 is no longer published in the blue-green compose topology, AND only the external URL proves NPM actually re-routed.
- **CI shellcheck step extended.** The Plan 44-02 lint gate is preserved and extended with `-x` to follow lib/ sources, covering all four deploy scripts.

## Tests + checks

- `shellcheck -x scripts/deploy/deploy-bluegreen.sh scripts/deploy/rollback-bluegreen.sh` → exit 0 (run via `koalaman/shellcheck:stable` Docker image; same gate runs in CI).
- `bats scripts/deploy/test/test-deploy-bluegreen.bats` → **6/6 pass** (the planner-stated 4 plus 2 additional: npm-swap-failure path and invalid-state-file rejection — Rule 2 critical safety functionality).
- `bash -n` syntax check on both scripts → exit 0.
- Workflow YAML validates via `js-yaml` parse → ok.
- All Task 1 + Task 2 grep acceptance criteria → pass (verified explicitly).
- `npm test` → **711/711 pass** (baseline 705, no regression).
- `npm run check` → not re-run (no TypeScript changes in this plan; previous baseline ok).

## Bats test inventory (6 tests)

1. happy path: blue → green, swaps NPM, writes state, stops blue
2. auto-rollback: unhealthy new color exits 1, never calls `npm_set_forward_host`, state unchanged
3. alternates: two consecutive happy runs flip blue → green → blue
4. default-to-blue when state file is missing → first deploy targets green
5. npm-swap failure (PUT non-200) surfaces as non-zero exit, state unchanged
6. invalid `.active-color` contents return non-zero

## Deviations from plan

### Auto-added (Rule 2 — critical functionality)

1. **Function-level `set -euo pipefail` + explicit `|| return 1` on lib calls.**
   The planner's pseudocode put `set -euo pipefail` only at the script top. Bats `run` saves/clears errexit, so function-internal failures of `npm_login` / `npm_set_forward_host` were swallowed (initially-failing test 5 surfaced this). Fixed by re-asserting strict mode inside the function and adding explicit `|| return 1` on the two lib calls. Without this, an NPM PUT 500 would silently advance `.active-color`, leaving NPM pointing at the old color while the state file claimed a successful swap.

2. **Two extra bats tests beyond planner-stated 4.** Added (a) `npm-swap failure` and (b) `invalid .active-color contents` to lock the failure semantics into CI. Total 6.

3. **First-deploy bootstrap legacy-container cleanup.** The executor brief flagged that the live VPS still has `scrummonsters-app-1` running from the pre-blue-green topology and that NPM upstream still points there. Approach (A) from the brief was implemented in `deploy-bluegreen.sh` step 9b: after the swap completes, if `scrummonsters-app-1` is still running, stop and remove it. Idempotent — no-op once retired. This means Plan 44-03's first deploy will cleanly migrate the legacy topology with no operator action.

### Configuration changes (Rule 2)

4. **CI shellcheck step extended with `-x`.** Plan 44-02 added the lint gate but only covered `lib/*.sh` and `wave0-npm-discovery.sh`. Without extension, the new orchestrator scripts would not be linted by CI. Updated `.github/workflows/ci.yml` to include them, and added `-x` so shellcheck follows the `source` statements (otherwise SC1091 false positives because shellcheck's working dir is repo root, not `scripts/deploy/`).

## Manual verification checkpoint (operator-driven, INFRA-01 success criteria)

The plan ends at a `checkpoint:human-verify` because zero-downtime swap and the WS reconnect-bounce UX cannot be validated from CI. The operator must run procedures **A through E** below on the live VPS and capture evidence in this SUMMARY before the phase can be marked complete.

### A. Continuous-curl smoke (INFRA-01 #1)

```
while true; do curl -sS -o /dev/null -w "%{http_code} " https://scrummonsters.com/api/health; sleep 0.2; done
```

Output during deploy:

```
TODO: paste actual output snippet — must contain only 200s
```

Result: PASS / FAIL — pending operator run.

### B. WS reconnect-bounce UX (INFRA-01 #2)

Browser test: create a lobby on `https://scrummonsters.com`, trigger deploy, observe sonner toast `Lobby session ended` (id `reconnect-stale`), confirm route to `/play`, no duplicate self.

Result: PASS / FAIL — pending operator run.

### C. Auto-rollback (INFRA-01 #3)

Push a deliberately-broken image, trigger deploy, confirm `.active-color` UNCHANGED and NPM `forward_host` UNCHANGED.

Result: PASS / FAIL — pending operator run.

### D. Repeated-deploy alternation (INFRA-01 #5)

Two consecutive successful deploys; confirm `.active-color` flips blue → green → blue and NPM tracks each flip.

Result: PASS / FAIL — pending operator run.

### E. Phase 39/40/41/42/43 regression (INFRA-01 #7)

After deploy, manually exercise reconnect repro and re-run `npm test` → must remain ≥ 705. (Local: 711/711 baseline confirmed before checkpoint.)

Result: PASS / FAIL — pending operator run.

## Next

After operator returns checkpoint results, this SUMMARY is updated with captured evidence and the phase is handed to `/gsd-verify-work`.
