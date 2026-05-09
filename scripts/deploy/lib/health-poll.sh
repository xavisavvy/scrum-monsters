#!/usr/bin/env bash
# Container healthcheck poll loop.
# Source from another bash script: source scripts/deploy/lib/health-poll.sh
# See .planning/phases/44-zero-downtime-deploys-blue-green/44-RESEARCH.md Pattern 2.
#
# Exit 0  -> container reported healthy within timeout
# Exit 1  -> container reported unhealthy (early exit, Pitfall 4) OR timed out
#
# Treats `starting` and `missing` (docker inspect non-zero) as keep-polling states.
# Logs each status transition to stderr so the deploy script can show progress.

wait_for_healthy() {
  local container="${1:?wait_for_healthy: container name required}"
  local timeout="${2:?wait_for_healthy: timeout (seconds) required}"
  local deadline status last_status=""
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
    if [ "$status" != "$last_status" ]; then
      echo "wait_for_healthy: $container -> $status" >&2
      last_status="$status"
    fi
    case "$status" in
      healthy)   return 0 ;;
      unhealthy) echo "wait_for_healthy: $container reported unhealthy" >&2; return 1 ;;
    esac
    sleep 2
  done
  echo "wait_for_healthy: $container did not become healthy within ${timeout}s (last=$status)" >&2
  return 1
}
