#!/usr/bin/env bash
# Wave 0 NPM discovery — run ONCE on the VPS to capture:
#   1. NPM_PROXY_HOST_ID for scrummonsters.com
#   2. Empirical read-only-field strip list for the NPM PUT body
#   3. nginx-proxy-manager image digest currently running (for Plan 44-01 pin)
#
# Usage (on VPS):
#   export NPM_ADMIN_EMAIL='admin@example.com'
#   export NPM_ADMIN_PASSWORD='...'
#   bash scripts/deploy/wave0-npm-discovery.sh
#
# Output: prints results to stdout; does NOT modify any NPM state.
# The PUT round-trip in step 3 is a no-op (PUTs the GET response back unchanged).
#
# Phase 44 — see .planning/phases/44-zero-downtime-deploys-blue-green/44-RESEARCH.md
# (Pattern 1 + Open Questions 2 + Pitfall 8) for the rationale behind each step.
set -euo pipefail

: "${NPM_ADMIN_EMAIL:?NPM_ADMIN_EMAIL must be set}"
: "${NPM_ADMIN_PASSWORD:?NPM_ADMIN_PASSWORD must be set}"

NPM_BASE="${NPM_BASE:-http://localhost:81}"

echo "[1/4] Authenticating to NPM at $NPM_BASE..."
# NOTE: -d "$JSON" intentionally inlines the secret into curl's argv only; the
# value never reaches stdout. The secret env var is never printed by this
# script — see threat T-44-01 in 44-01-PLAN.md.
AUTH_BODY=$(jq -n \
  --arg identity "$NPM_ADMIN_EMAIL" \
  --arg secret "$NPM_ADMIN_PASSWORD" \
  '{identity: $identity, secret: $secret}')
TOKEN=$(curl -fsS -X POST "$NPM_BASE/api/tokens" \
  -H 'Content-Type: application/json' \
  -d "$AUTH_BODY" \
  | jq -r '.token')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: NPM authentication failed" >&2
  exit 1
fi

echo "[2/4] Discovering proxy host ID for scrummonsters.com..."
HOSTS=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$NPM_BASE/api/nginx/proxy-hosts")
PROXY_HOST_ID=$(echo "$HOSTS" | jq -r '.[] | select(.domain_names | index("scrummonsters.com")) | .id')
if [ -z "$PROXY_HOST_ID" ] || [ "$PROXY_HOST_ID" = "null" ]; then
  echo "ERROR: Could not find proxy host for scrummonsters.com" >&2
  echo "Available hosts:" >&2
  echo "$HOSTS" | jq -r '.[] | "\(.id): \(.domain_names | join(","))"' >&2
  exit 1
fi
echo "DISCOVERED NPM_PROXY_HOST_ID=$PROXY_HOST_ID"

echo "[3/4] Determining read-only-field strip list (no-op PUT round-trip)..."
RECORD=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "$NPM_BASE/api/nginx/proxy-hosts/$PROXY_HOST_ID")

# Start from the conservative published strip list (RESEARCH.md Pattern 1):
STRIP='del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err)'
PAYLOAD=$(echo "$RECORD" | jq "$STRIP")

HTTP_CODE=$(curl -s -o /tmp/npm-noop-response.json -w '%{http_code}' \
  -X PUT "$NPM_BASE/api/nginx/proxy-hosts/$PROXY_HOST_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" = "200" ]; then
  echo "STRIP_LIST_OK: $STRIP"
else
  echo "STRIP_LIST_INSUFFICIENT: PUT returned $HTTP_CODE"
  echo "Response body:"
  cat /tmp/npm-noop-response.json
  echo
  echo "Operator: extend the strip list (jq del(...)) until PUT returns 200."
  echo "Common additional fields to try: .enabled, .access_list, .certificate, .owner, .use_default_location"
  exit 2
fi

echo
echo "[4/4] Capturing NPM image digest for Plan 44-01 pin verification..."
docker inspect jc21/nginx-proxy-manager:latest --format '{{.Id}}' || true
docker inspect jc21/nginx-proxy-manager:latest --format '{{.RepoTags}} {{.Created}}' || true

echo
echo "DONE. Paste the DISCOVERED line and STRIP_LIST_OK line into Plan 44-03's deploy script."
