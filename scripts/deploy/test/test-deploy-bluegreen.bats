#!/usr/bin/env bats
# Auto-rollback + state-file alternation coverage for deploy-bluegreen.sh.
# Tests source the script (which exposes deploy_bluegreen_main but does NOT
# auto-invoke it under bats — see the BATS_TEST_FILENAME gate at the bottom
# of the script). Lib helpers are then overridden in the test process to
# control wait_for_healthy / npm_set_forward_host outcomes hermetically.
# docker + curl are PATH-shimmed to no-op binaries.

setup() {
  TMPBIN="$(mktemp -d)"
  export TMPBIN
  export PATH="$TMPBIN:$PATH"
  export ACTIVE_COLOR_FILE="$TMPBIN/.active-color"
  export COMPOSE_FILE="$TMPBIN/docker-compose.prod.yml"
  export NPM_ADMIN_EMAIL="x"
  export NPM_ADMIN_PASSWORD="y"
  export NPM_PROXY_HOST_ID="4"
  export EXTERNAL_SMOKE_URL="http://example.invalid/health"
  export HEALTH_TIMEOUT="1"
  export LEGACY_APP_CONTAINER="legacy-not-present"
  touch "$COMPOSE_FILE"
  # Plenty of headroom by default; the precheck test overrides this.
  export MEMINFO_FILE="$TMPBIN/meminfo"
  printf 'MemTotal:        2000000 kB
MemAvailable:    1500000 kB
' > "$MEMINFO_FILE"

  # Stub docker — log args, always exit 0 (incl. `docker ps` returning empty).
  cat > "$TMPBIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "$TMPBIN/docker.log"
case "$1" in
  ps) exit 0 ;;
esac
exit 0
EOF
  chmod +x "$TMPBIN/docker"

  # Stub curl — used only for EXTERNAL_SMOKE_URL.
  cat > "$TMPBIN/curl" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "$TMPBIN/curl.log"
exit 0
EOF
  chmod +x "$TMPBIN/curl"
}

teardown() {
  rm -rf "$TMPBIN"
}

@test "happy path: starts inactive (green), swaps NPM, writes state=green, stops blue" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  # shellcheck source=../deploy-bluegreen.sh
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { echo "swap to $4" >> "$TMPBIN/swap.log"; return 0; }
  run deploy_bluegreen_main
  [ "$status" -eq 0 ]
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "green" ]
  grep -q 'swap to app-green' "$TMPBIN/swap.log"
}

@test "auto-rollback: unhealthy new color exits 1, never calls npm_set_forward_host, state unchanged" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 1; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { echo "SHOULD-NOT-BE-CALLED" >> "$TMPBIN/swap.log"; return 0; }
  run deploy_bluegreen_main
  [ "$status" -ne 0 ]
  if [ -f "$TMPBIN/swap.log" ]; then
    ! grep -q 'SHOULD-NOT-BE-CALLED' "$TMPBIN/swap.log"
  fi
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "blue" ]
}

@test "alternates: two consecutive happy runs flip blue->green->blue" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { return 0; }
  run deploy_bluegreen_main
  [ "$status" -eq 0 ]
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "green" ]
  run deploy_bluegreen_main
  [ "$status" -eq 0 ]
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "blue" ]
}

@test "default-to-blue when state file is missing -> first deploy targets green" {
  rm -f "$ACTIVE_COLOR_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { echo "$4" > "$TMPBIN/swap-target"; return 0; }
  run deploy_bluegreen_main
  [ "$status" -eq 0 ]
  [ "$(cat "$TMPBIN/swap-target")" = "app-green" ]
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "green" ]
}

@test "npm-swap failure: PUT failure surfaces as non-zero exit (NPM helper failure path)" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { return 1; }  # simulate PUT non-200
  run deploy_bluegreen_main
  [ "$status" -ne 0 ]
  # State file must NOT have been advanced (write happens after swap+smoke).
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "blue" ]
}

@test "invalid .active-color contents return non-zero" {
  echo "purple" > "$ACTIVE_COLOR_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { return 0; }
  run deploy_bluegreen_main
  [ "$status" -ne 0 ]
}

@test "memory precheck: too little available aborts before starting the new color" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  printf 'MemTotal:         914000 kB\nMemAvailable:     200000 kB\n' > "$MEMINFO_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { echo "SHOULD-NOT-BE-CALLED" >> "$TMPBIN/swap.log"; return 0; }
  run deploy_bluegreen_main
  [ "$status" -ne 0 ]
  [[ "$output" == *"only 195MB available, need 512MB"* ]]
  ! grep -q 'up -d app-green' "$TMPBIN/docker.log"
  [ ! -f "$TMPBIN/swap.log" ]
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "blue" ]
}

@test "happy path: old color loses its restart policy, promoted color gets it back" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { return 0; }
  run deploy_bluegreen_main
  [ "$status" -eq 0 ]
  grep -qx 'update --restart=unless-stopped app-green' "$TMPBIN/docker.log"
  grep -qx 'update --restart=no app-blue' "$TMPBIN/docker.log"
  # The policy must be dropped before the stop is attempted.
  first_update=$(grep -n -x 'update --restart=no app-blue' "$TMPBIN/docker.log" | tail -1 | cut -d: -f1)
  last_stop=$(grep -n 'stop app-blue' "$TMPBIN/docker.log" | tail -1 | cut -d: -f1)
  [ "$first_update" -lt "$last_stop" ]
}

@test "stop_color: a hung stop falls back to docker kill and does not fail the deploy" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  export STOP_TIMEOUT=1
  # docker stub whose `compose ... stop app-blue` never returns.
  cat > "$TMPBIN/docker" <<'STUB'
#!/usr/bin/env bash
echo "$@" >> "$TMPBIN/docker.log"
case "$*" in
  *"stop app-blue"*) sleep 30 ;;
esac
exit 0
STUB
  chmod +x "$TMPBIN/docker"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 0; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { return 0; }
  run deploy_bluegreen_main
  [ "$status" -eq 0 ]
  grep -qx 'kill app-blue' "$TMPBIN/docker.log"
  [[ "$output" == *"stopping app-blue did not finish within 1s - killing it"* ]]
  [ "$(cat "$ACTIVE_COLOR_FILE")" = "green" ]
}

@test "auto-rollback also drops the failed color's restart policy" {
  echo "blue" > "$ACTIVE_COLOR_FILE"
  source "$BATS_TEST_DIRNAME/../deploy-bluegreen.sh"
  wait_for_healthy() { return 1; }
  npm_login() { echo "tok"; }
  npm_set_forward_host() { return 0; }
  run deploy_bluegreen_main
  [ "$status" -ne 0 ]
  [ "$(grep -cx 'update --restart=no app-green' "$TMPBIN/docker.log")" -ge 2 ]
}
