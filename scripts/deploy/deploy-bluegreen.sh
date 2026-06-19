#!/usr/bin/env bash
# Blue-green deploy orchestrator.
# See .planning/phases/44-zero-downtime-deploys-blue-green/44-RESEARCH.md
# System Architecture for the 14-step flow.
#
# Wave 0 constants paid forward:
#   NPM_PROXY_HOST_ID=1 (44-01-SUMMARY.md)
#   NPM_BASE=http://localhost:81
#
# Library dependencies (Plan 44-02): npm-api.sh + health-poll.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy/lib/npm-api.sh
source "$SCRIPT_DIR/lib/npm-api.sh"
# shellcheck source=scripts/deploy/lib/health-poll.sh
source "$SCRIPT_DIR/lib/health-poll.sh"

deploy_bluegreen_main() {
  # Re-assert strict mode inside the function so failures propagate even when
  # the script is sourced into a shell (e.g. bats `run`) that has cleared
  # errexit. Top-level `set -euo pipefail` only protects code outside functions.
  set -euo pipefail
  : "${NPM_ADMIN_EMAIL:?NPM_ADMIN_EMAIL must be set in env}"
  : "${NPM_ADMIN_PASSWORD:?NPM_ADMIN_PASSWORD must be set in env}"
  local NPM_BASE="${NPM_BASE:-http://localhost:81}"
  local NPM_PROXY_HOST_ID="${NPM_PROXY_HOST_ID:-1}"
  local HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
  local ACTIVE_COLOR_FILE="${ACTIVE_COLOR_FILE:-/opt/scrummonsters/.active-color}"
  local COMPOSE_FILE="${COMPOSE_FILE:-/opt/scrummonsters/docker-compose.prod.yml}"
  local EXTERNAL_SMOKE_URL="${EXTERNAL_SMOKE_URL:-https://scrummonsters.com/api/health}"
  local LEGACY_APP_CONTAINER="${LEGACY_APP_CONTAINER:-scrummonsters-app-1}"

  local ACTIVE INACTIVE
  echo "[1/9] Determine active color"
  if [ -f "$ACTIVE_COLOR_FILE" ]; then
    ACTIVE=$(cat "$ACTIVE_COLOR_FILE")
  else
    ACTIVE="blue"
    echo "[1/9] No state file — defaulting ACTIVE=blue (first-deploy bootstrap; INACTIVE will be green)"
  fi
  case "$ACTIVE" in
    blue)  INACTIVE="green" ;;
    green) INACTIVE="blue"  ;;
    *)     echo "ERROR: invalid .active-color contents: $ACTIVE" >&2; return 1 ;;
  esac
  echo "Active=$ACTIVE Inactive(target)=$INACTIVE"

  echo "[2/9] Stuck-deploy cleanup — force-stop the off-color in case of prior crash"
  # Pitfall 3 / Pitfall 7: use service-name argument, NOT --profile, to avoid stopping the whole stack.
  docker compose -f "$COMPOSE_FILE" stop "app-$INACTIVE" 2>/dev/null || true

  echo "[3/9] Disk prune"
  docker image prune -af || true
  docker builder prune -af || true

  echo "[4/9] Pull latest image"
  docker compose -f "$COMPOSE_FILE" --profile "$INACTIVE" pull "app-$INACTIVE"

  echo "[5/9] Start inactive color (app-$INACTIVE)"
  docker compose -f "$COMPOSE_FILE" --profile "$INACTIVE" up -d "app-$INACTIVE"

  echo "[6/9] Wait for healthcheck (timeout=${HEALTH_TIMEOUT}s)"
  if ! wait_for_healthy "app-$INACTIVE" "$HEALTH_TIMEOUT"; then
    echo "ERROR: app-$INACTIVE did not become healthy. Aborting WITHOUT NPM swap." >&2
    docker compose -f "$COMPOSE_FILE" stop "app-$INACTIVE" || true
    return 1
  fi

  echo "[7/9] Drizzle migration (before swap — preserves rollback semantics; see Pitfall 5)"
  # Versioned migrations via `drizzle-kit migrate`: applies pending journal
  # entries (migrations/*.sql) non-interactively. We deliberately do NOT use
  # `push` here — push diffs schema-vs-DB at runtime and can hit interactive
  # resolvers (e.g. a column rename ambiguity) that have no TTY in CI; in that
  # state it printed an error yet exited 0, so the schema silently never applied
  # and the deploy swapped anyway. `migrate` just runs reviewed SQL and exits
  # non-zero on failure. drizzle-kit is a runtime dependency baked into the image
  # (npm ci --omit=dev keeps it) so this resolves.
  #
  # GATE: a failed migration MUST abort the deploy BEFORE the NPM swap — never
  # promote an image whose schema did not apply. Check the exit code explicitly
  # (a bare command under `set -e` proved insufficient once — see above).
  if ! docker compose -f "$COMPOSE_FILE" --profile "$INACTIVE" run --rm "app-$INACTIVE" npx drizzle-kit migrate; then
    echo "ERROR: drizzle-kit migrate failed. Aborting WITHOUT NPM swap (old color still serving)." >&2
    docker compose -f "$COMPOSE_FILE" stop "app-$INACTIVE" || true
    return 1
  fi

  echo "[8/9] Swap NPM upstream to app-$INACTIVE"
  set +x  # never trace the password even if BASH_XTRACEFD lands enabled
  local TOKEN
  TOKEN=$(npm_login "$NPM_BASE" "$NPM_ADMIN_EMAIL" "$NPM_ADMIN_PASSWORD") || {
    echo "ERROR: NPM login failed" >&2; return 1;
  }
  npm_set_forward_host "$NPM_BASE" "$TOKEN" "$NPM_PROXY_HOST_ID" "app-$INACTIVE" || {
    echo "ERROR: NPM swap (PUT) failed" >&2; unset TOKEN; return 1;
  }
  unset TOKEN

  echo "[8b/9] External smoke (proves NPM actually re-routed)"
  curl -fsS -o /dev/null "$EXTERNAL_SMOKE_URL"

  echo "[9/9] Persist new active color and stop old color"
  echo "$INACTIVE" > "$ACTIVE_COLOR_FILE"
  chmod 644 "$ACTIVE_COLOR_FILE"
  docker compose -f "$COMPOSE_FILE" stop "app-$ACTIVE" 2>/dev/null || true

  # First-deploy bootstrap cleanup: if the legacy single-color `app` container
  # (named `scrummonsters-app-1` per the docker compose default before Plan 44-01)
  # is still running from the pre-bluegreen topology, stop and remove it so it
  # never serves stale traffic. Idempotent — no-op once retired.
  if docker ps --format '{{.Names}}' | grep -Fxq "$LEGACY_APP_CONTAINER"; then
    echo "[9b/9] Legacy container $LEGACY_APP_CONTAINER detected — stopping (first-deploy bootstrap)"
    docker stop "$LEGACY_APP_CONTAINER" || true
    docker rm "$LEGACY_APP_CONTAINER" || true
  fi

  docker image prune -af || true

  echo "Deploy complete: active is now $INACTIVE"
}

if [ -z "${BATS_TEST_FILENAME:-}" ]; then
  deploy_bluegreen_main "$@"
fi
