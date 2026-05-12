#!/usr/bin/env bash
# Manual rollback: re-swap NPM back to the specified color and ensure it's running.
# Usage (run on VPS):
#   export NPM_ADMIN_EMAIL=... NPM_ADMIN_PASSWORD=...
#   bash scripts/deploy/rollback-bluegreen.sh blue
#
# See docs/runbooks/deploy-rollback.md for full operator procedure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy/lib/npm-api.sh
source "$SCRIPT_DIR/lib/npm-api.sh"
# shellcheck source=scripts/deploy/lib/health-poll.sh
source "$SCRIPT_DIR/lib/health-poll.sh"

TARGET="${1:?Usage: rollback-bluegreen.sh <blue|green>}"
case "$TARGET" in
  blue|green) ;;
  *) echo "Invalid color: $TARGET (expected blue|green)" >&2; exit 1 ;;
esac

: "${NPM_ADMIN_EMAIL:?NPM_ADMIN_EMAIL must be set}"
: "${NPM_ADMIN_PASSWORD:?NPM_ADMIN_PASSWORD must be set}"
NPM_BASE="${NPM_BASE:-http://localhost:81}"
NPM_PROXY_HOST_ID="${NPM_PROXY_HOST_ID:-1}"
ACTIVE_COLOR_FILE="${ACTIVE_COLOR_FILE:-/opt/scrummonsters/.active-color}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/scrummonsters/docker-compose.prod.yml}"

echo "Rolling back to $TARGET"
docker compose -f "$COMPOSE_FILE" --profile "$TARGET" up -d "app-$TARGET"
wait_for_healthy "app-$TARGET" 60

set +x
TOKEN=$(npm_login "$NPM_BASE" "$NPM_ADMIN_EMAIL" "$NPM_ADMIN_PASSWORD")
npm_set_forward_host "$NPM_BASE" "$TOKEN" "$NPM_PROXY_HOST_ID" "app-$TARGET"
unset TOKEN

echo "$TARGET" > "$ACTIVE_COLOR_FILE"
chmod 644 "$ACTIVE_COLOR_FILE"
echo "Rollback complete: NPM upstream now app-$TARGET"
