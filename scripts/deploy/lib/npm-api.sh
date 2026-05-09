#!/usr/bin/env bash
# NPM REST API helper module — source from another bash script.
# Provides: npm_login, npm_get_proxy_host, npm_set_forward_host
# See .planning/phases/44-zero-downtime-deploys-blue-green/44-RESEARCH.md
# Pattern 1 + Pitfall 2 for the GET-modify-PUT rationale.
#
# Wave 0 captured constants (44-01-SUMMARY.md):
#   NPM_PROXY_HOST_ID_DEFAULT=1
#   NPM_PUT_STRIP_LIST_DEFAULT (below) — confirmed sufficient against NPM 2.14.0
#   NPM_BASE_DEFAULT=http://localhost:81
#
# The deploy-bot service account has 2FA disabled (see CONTEXT.md
# "NPM service account for deploy automation"), so npm_login assumes the
# {token, expires} success path. If the response contains requires_2fa,
# we fail loudly and point the operator at the service-account decision.

# shellcheck disable=SC2034  # Defaults are intentionally exported as module-level
NPM_PROXY_HOST_ID_DEFAULT=1
NPM_BASE_DEFAULT='http://localhost:81'

# Default strip list — captured during Plan 44-01 Wave 0 discovery against the
# live NPM instance (version 2.14.0). Override at the call site with
# NPM_PUT_STRIP_LIST=... if a future NPM upgrade changes the contract.
NPM_PUT_STRIP_LIST_DEFAULT='del(.id, .created_on, .modified_on, .owner_user_id, .meta.nginx_online, .meta.nginx_err)'

npm_login() {
  local base="${1:?npm_login: base url required}"
  local email="${2:?npm_login: email required}"
  local password="${3:?npm_login: password required}"
  local resp token requires_2fa
  resp=$(curl -fsS -X POST "$base/api/tokens" \
    -H 'Content-Type: application/json' \
    -d "{\"identity\":\"$email\",\"secret\":\"$password\"}") || {
    echo "npm_login: HTTP error talking to $base/api/tokens" >&2
    return 1
  }
  requires_2fa=$(echo "$resp" | jq -r '.requires_2fa // empty')
  if [ "$requires_2fa" = "true" ]; then
    echo "npm_login: account requires 2FA — see CONTEXT.md 'NPM service account for deploy automation' decision (deploy must use deploy-bot@scrummonsters.com which has 2FA disabled)" >&2
    return 1
  fi
  token=$(echo "$resp" | jq -r '.token // empty')
  if [ -z "$token" ]; then
    echo "npm_login: token missing in response" >&2
    return 1
  fi
  echo "$token"
}

npm_get_proxy_host() {
  local base="${1:?npm_get_proxy_host: base url required}"
  local token="${2:?npm_get_proxy_host: token required}"
  local id="${3:?npm_get_proxy_host: id required}"
  curl -fsS -H "Authorization: Bearer $token" \
    "$base/api/nginx/proxy-hosts/$id"
}

npm_set_forward_host() {
  local base="${1:?npm_set_forward_host: base url required}"
  local token="${2:?npm_set_forward_host: token required}"
  local id="${3:?npm_set_forward_host: id required}"
  local new_host="${4:?npm_set_forward_host: new_host required}"
  local strip_list="${NPM_PUT_STRIP_LIST:-$NPM_PUT_STRIP_LIST_DEFAULT}"
  local record payload http_code body_file

  record=$(npm_get_proxy_host "$base" "$token" "$id") || {
    echo "npm_set_forward_host: GET failed" >&2
    return 1
  }
  payload=$(echo "$record" | jq --arg h "$new_host" \
    ".forward_host = \$h | $strip_list") || {
    echo "npm_set_forward_host: jq transform failed" >&2
    return 1
  }
  body_file=$(mktemp)
  http_code=$(curl -s -o "$body_file" -w '%{http_code}' \
    -X PUT "$base/api/nginx/proxy-hosts/$id" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "$payload")
  if [ "$http_code" != "200" ]; then
    echo "npm_set_forward_host: PUT returned $http_code" >&2
    cat "$body_file" >&2
    rm -f "$body_file"
    return 1
  fi
  rm -f "$body_file"
  return 0
}
