---
plan: 44-02
phase: 44
slug: zero-downtime-deploys-blue-green
status: complete
completed: 2026-05-08
requirements: [INFRA-01]
subsystem: deploy-tooling
tags: [bash, shellcheck, bats, ci, npm-rest-api, blue-green]
dependency_graph:
  requires:
    - 44-01 (Wave 0 NPM_PROXY_HOST_ID + NPM_PUT_STRIP_LIST)
  provides:
    - scripts/deploy/lib/npm-api.sh — sourced by Plan 44-03 deploy orchestrator
    - scripts/deploy/lib/health-poll.sh — sourced by Plan 44-03 deploy orchestrator
    - CI shellcheck + bats gate on every PR (deploy-scripts job)
  affects:
    - .github/workflows/ci.yml (added deploy-scripts job + ci-success needs[] entry)
tech_stack:
  added: [bats (CI apt), shellcheck (CI apt)]
  patterns: [PATH-shim mocking, GET-modify-PUT for NPM, docker inspect Health.Status poll]
key_files:
  created:
    - scripts/deploy/lib/npm-api.sh
    - scripts/deploy/lib/health-poll.sh
    - scripts/deploy/test/test-npm-api.bats
    - scripts/deploy/test/test-health-poll.bats
  modified:
    - .github/workflows/ci.yml
decisions:
  - npm-api.sh fails loudly on requires_2fa response (CONTEXT.md service-account decision)
  - 13 bats tests instead of plan's 12 — extra requires_2fa test added per executor brief
metrics:
  duration: ~30min
  completed: 2026-05-08
  task_count: 2
  file_count: 5
---

# Phase 44 Plan 02: NPM API + healthcheck bash modules + CI gate Summary

Reusable, shellcheck-clean, Bats-covered bash modules that Plan 44-03's blue-green deploy orchestrator will source: an NPM REST API client (token + GET-modify-PUT proxy host) and a Docker healthcheck poll loop. CI now gates both modules on every PR via a new `deploy-scripts` job.

## What shipped

| Commit  | Subject |
|---------|---------|
| `47cc14a` | feat(44-02): add NPM REST API helper module + Bats spec |
| `8546614` | feat(44-02): add health-poll module + Bats spec + wire CI shellcheck/bats |

## Captured constants (forensic reference for Plan 44-03)

```bash
NPM_PROXY_HOST_ID_DEFAULT=1
NPM_BASE_DEFAULT='http://localhost:81'
NPM_PUT_STRIP_LIST_DEFAULT='del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err)'
```

These are exported from `scripts/deploy/lib/npm-api.sh` as module-level bash variables so Plan 44-03 can either accept the defaults or override at the call site (the strip list via `NPM_PUT_STRIP_LIST=...`).

## Module API contracts (Plan 44-03 consumers)

```bash
source scripts/deploy/lib/npm-api.sh
TOKEN=$(npm_login "$NPM_BASE" "$NPM_ADMIN_EMAIL" "$NPM_ADMIN_PASSWORD") || exit 1
RECORD=$(npm_get_proxy_host "$NPM_BASE" "$TOKEN" "$NPM_PROXY_HOST_ID")
npm_set_forward_host "$NPM_BASE" "$TOKEN" "$NPM_PROXY_HOST_ID" "app-green" || exit 1

source scripts/deploy/lib/health-poll.sh
if ! wait_for_healthy "app-green" 60; then
  docker compose stop app-green
  exit 1
fi
```

## Tests + checks

- `shellcheck scripts/deploy/lib/*.sh` — exit 0 (run via `koalaman/shellcheck:stable` Docker image; shellcheck still not installed locally on Windows host — CI now installs it via apt)
- `bats scripts/deploy/test/` — **13 tests, 0 failures** (8 npm-api + 5 health-poll)
- CI invocation in workflow: `bats scripts/deploy/test/`
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` — exit 0

### Bats test breakdown

**`test-npm-api.bats` (8 tests):**
1. `npm_login` returns token from `.token` field (happy path)
2. `npm_login` fails on empty `.token` (401-style response with no token)
3. `npm_login` fails when curl fails (network error)
4. `npm_login` rejects empty password argument
5. `npm_login` fails loudly when response signals `requires_2fa` (added per executor brief)
6. `npm_set_forward_host` issues PUT when GET succeeds (round-trip happy path)
7. `npm_set_forward_host` fails when PUT returns non-200
8. `npm_set_forward_host` rejects empty new_host

**`test-health-poll.bats` (5 tests):**
1. `wait_for_healthy` returns 0 when container goes healthy (after `starting starting healthy` sequence)
2. `wait_for_healthy` returns 1 immediately on unhealthy (early-exit per Pitfall 4)
3. `wait_for_healthy` returns 1 on timeout (status never healthy)
4. `wait_for_healthy` treats `missing` container (docker inspect non-zero) as keep-polling, then times out
5. `wait_for_healthy` rejects missing arguments

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical functionality] Added 8th npm-api test for requires_2fa fail-loud path**
- **Found during:** Task 1 (executor brief explicitly requires fail-loud handling of `requires_2fa: true` in npm_login)
- **Issue:** Plan's bats spec listed 7 tests; the executor brief mandates a fail-loud branch for the 2FA-enabled response shape (NPM 2.14 added 2FA, see 44-01 SUMMARY). Without a test, the branch could regress silently.
- **Fix:** Added `npm_login fails loudly when response signals requires_2fa` test + the corresponding code path in `npm_login` (jq on `.requires_2fa`, error message pointing to CONTEXT.md service-account decision).
- **Files modified:** `scripts/deploy/lib/npm-api.sh`, `scripts/deploy/test/test-npm-api.bats`
- **Commit:** `47cc14a`
- **Net effect:** Plan acceptance criterion "12 tests, 0 failures" becomes "13 tests, 0 failures". All other counts (npm_login==1, npm_get_proxy_host==1, npm_set_forward_host==1, NPM_PUT_STRIP_LIST_DEFAULT>=1, jq forward_host mutation==1, echo $password==0, echo $token<=1) still satisfied.

**2. [Rule 1 — Bug] Fixed bats curl-mock OUTFILE detection logic**
- **Found during:** Task 1 (initial bats run failed test 6 because the original mock from the plan tried to use `${!i}` indirect expansion and `printf | sed` to find the `-o` argument value — flaky/wrong in the bats sandbox)
- **Issue:** PUT branch never wrote `200` to the OUTFILE, so `npm_set_forward_host` saw the http_code as the JSON GET body and bailed.
- **Fix:** Replaced indirect-index lookup with a simple `prev`-tracking `for arg in "$@"` loop (same pattern, correct semantics).
- **Files modified:** `scripts/deploy/test/test-npm-api.bats`
- **Commit:** `47cc14a`

No architectural deviations. Both modules' public APIs match the plan's `<interfaces>` block exactly.

## Threat model coverage

- **T-44-05** (jq strip list override) — accepted; default is the operator-confirmed list, override path documented in module header.
- **T-44-06** (token leak via `set -x` / accidental echo) — mitigated; `grep -cE 'echo .*\$token' scripts/deploy/lib/npm-api.sh` returns 1 (the single intentional return-value line). Bats spec encodes this as a verifiable invariant.
- **T-44-07** (docker inspect hang) — mitigated; mandatory timeout argument + bats coverage of the timeout branch.

## Local verification quirks

- Windows host has no shellcheck/bats/jq/curl installed natively. Verification was done via Docker:
  - `docker run --rm -v "$(pwd -W):/mnt" -w /mnt koalaman/shellcheck:stable /mnt/scripts/deploy/lib/*.sh`
  - `docker run --rm --entrypoint sh -v "$(pwd -W):/mnt" -w /mnt bats/bats:latest -c "apk add --no-cache jq curl bash >/dev/null && bats scripts/deploy/test/"`
  - The `apk add` step is a workaround for `bats/bats:latest` shipping without jq/curl; CI uses `apt-get install shellcheck bats jq` on `ubuntu-latest` instead.

## Self-Check: PASSED

- `scripts/deploy/lib/npm-api.sh` — FOUND
- `scripts/deploy/lib/health-poll.sh` — FOUND
- `scripts/deploy/test/test-npm-api.bats` — FOUND
- `scripts/deploy/test/test-health-poll.bats` — FOUND
- `.github/workflows/ci.yml` deploy-scripts job — FOUND (`grep -c 'deploy-scripts' .github/workflows/ci.yml` >= 2)
- Commit `47cc14a` — FOUND in `git log`
- Commit `8546614` — FOUND in `git log`

## Next

Plan 44-03 (Wave 3): build `scripts/deploy/blue-green-swap.sh` orchestrator that sources both modules above, plus the `.github/workflows/deploy-lightsail.yml` integration that calls it. The bats gate now in CI guards regressions in the helpers between deploys.
