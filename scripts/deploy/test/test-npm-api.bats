#!/usr/bin/env bats
# Bats spec for scripts/deploy/lib/npm-api.sh
# Uses a PATH shim so curl/jq calls go through controllable mocks.

setup() {
  TMPBIN="$(mktemp -d)"
  export TMPBIN
  export PATH="$TMPBIN:$PATH"
  # Provide a real jq via system PATH — capture once and re-export, so the
  # PATH shim only intercepts curl, not jq.
  REAL_JQ="$(command -v jq || true)"
  export REAL_JQ
  if [ -n "$REAL_JQ" ]; then
    cat > "$TMPBIN/jq" <<EOF
#!/usr/bin/env bash
exec "$REAL_JQ" "\$@"
EOF
    chmod +x "$TMPBIN/jq"
  fi
  # shellcheck source=../lib/npm-api.sh
  source "$BATS_TEST_DIRNAME/../lib/npm-api.sh"
}

teardown() {
  rm -rf "$TMPBIN"
}

_make_curl_mock() {
  # Writes a curl shim that returns the given exit code and emits the given body.
  local exit_code="$1"
  local body="$2"
  cat > "$TMPBIN/curl" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$TMPBIN/curl-args.log"
printf '%s' '$body'
exit $exit_code
EOF
  chmod +x "$TMPBIN/curl"
}

@test "npm_login returns token from .token field" {
  _make_curl_mock 0 '{"token":"abc123","expires":"2026-05-09"}'
  run npm_login "http://localhost:81" "admin@example.com" "pw"
  [ "$status" -eq 0 ]
  [ "$output" = "abc123" ]
}

@test "npm_login fails on empty .token" {
  _make_curl_mock 0 '{"error":"unauthorized"}'
  run npm_login "http://localhost:81" "admin@example.com" "pw"
  [ "$status" -ne 0 ]
}

@test "npm_login fails when curl fails" {
  _make_curl_mock 22 ''
  run npm_login "http://localhost:81" "admin@example.com" "pw"
  [ "$status" -ne 0 ]
}

@test "npm_login rejects empty password argument" {
  run npm_login "http://localhost:81" "admin@example.com" ""
  [ "$status" -ne 0 ]
}

@test "npm_login fails loudly when response signals requires_2fa" {
  _make_curl_mock 0 '{"requires_2fa":true,"challenge_token":"xyz"}'
  run npm_login "http://localhost:81" "admin@example.com" "pw"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q '2FA'
}

@test "npm_set_forward_host issues PUT when GET succeeds" {
  # Two-call mock: first call (GET) returns a proxy-host record,
  # second call (PUT) returns HTTP 200 written to the -o body file.
  cat > "$TMPBIN/curl" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "/tmp/curl-args.log"
OUTFILE=""
IS_PUT=0
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then OUTFILE="$arg"; fi
  if [ "$arg" = "PUT" ] && [ "$prev" = "-X" ]; then IS_PUT=1; fi
  prev="$arg"
done
if [ "$IS_PUT" = "1" ]; then
  [ -n "$OUTFILE" ] && echo '{"ok":true}' > "$OUTFILE"
  printf '200'
  exit 0
fi
# GET branch — return a minimal proxy-host record
printf '{"id":4,"forward_host":"app-blue","forward_port":5000,"domain_names":["scrummonsters.com"],"created_on":"x","modified_on":"x","owner_user_id":1,"meta":{"nginx_online":true,"nginx_err":null}}'
exit 0
EOF
  chmod +x "$TMPBIN/curl"
  rm -f /tmp/curl-args.log
  run npm_set_forward_host "http://localhost:81" "tok" "4" "app-green"
  [ "$status" -eq 0 ]
  grep -q -- '-X PUT' /tmp/curl-args.log
  grep -q '/api/nginx/proxy-hosts/4' /tmp/curl-args.log
}

@test "npm_set_forward_host fails when PUT returns non-200" {
  cat > "$TMPBIN/curl" <<'EOF'
#!/usr/bin/env bash
OUTFILE=""
IS_PUT=0
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then OUTFILE="$arg"; fi
  if [ "$arg" = "PUT" ] && [ "$prev" = "-X" ]; then IS_PUT=1; fi
  prev="$arg"
done
if [ "$IS_PUT" = "1" ]; then
  [ -n "$OUTFILE" ] && echo '{"error":"bad request"}' > "$OUTFILE"
  printf '400'
  exit 0
fi
printf '{"id":4,"forward_host":"app-blue","domain_names":["scrummonsters.com"]}'
exit 0
EOF
  chmod +x "$TMPBIN/curl"
  run npm_set_forward_host "http://localhost:81" "tok" "4" "app-green"
  [ "$status" -ne 0 ]
}

@test "npm_set_forward_host rejects empty new_host" {
  run npm_set_forward_host "http://localhost:81" "tok" "4" ""
  [ "$status" -ne 0 ]
}
