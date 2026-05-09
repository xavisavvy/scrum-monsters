#!/usr/bin/env bats
# Bats spec for scripts/deploy/lib/health-poll.sh
# Stubs `docker` via PATH shim and overrides `sleep` so tests don't actually wait.

setup() {
  TMPBIN="$(mktemp -d)"
  export TMPBIN
  export PATH="$TMPBIN:$PATH"
  # shellcheck source=../lib/health-poll.sh
  source "$BATS_TEST_DIRNAME/../lib/health-poll.sh"
}

teardown() {
  rm -rf "$TMPBIN"
}

_make_docker_mock() {
  # Sequence of statuses to emit on successive `docker inspect` calls.
  # After the sequence is exhausted, repeats the last entry.
  local statuses="$1"
  echo "$statuses" > "$TMPBIN/docker-statuses"
  echo "0" > "$TMPBIN/docker-call-idx"
  cat > "$TMPBIN/docker" <<EOF
#!/usr/bin/env bash
IDX=\$(cat "$TMPBIN/docker-call-idx")
# shellcheck disable=SC2207
STATUSES=(\$(cat "$TMPBIN/docker-statuses"))
LEN=\${#STATUSES[@]}
if [ "\$IDX" -ge "\$LEN" ]; then IDX=\$((LEN-1)); fi
S="\${STATUSES[\$IDX]}"
if [ "\$S" = "missing" ]; then
  echo "\$((IDX+1))" > "$TMPBIN/docker-call-idx"
  exit 1
fi
echo "\$S"
echo "\$((IDX+1))" > "$TMPBIN/docker-call-idx"
EOF
  chmod +x "$TMPBIN/docker"
}

# Override sleep so tests don't actually wait 2 seconds per poll.
sleep() { :; }
export -f sleep

@test "wait_for_healthy returns 0 when container goes healthy" {
  _make_docker_mock "starting starting healthy"
  run wait_for_healthy "app-green" 10
  [ "$status" -eq 0 ]
}

@test "wait_for_healthy returns 1 immediately on unhealthy" {
  _make_docker_mock "starting unhealthy"
  run wait_for_healthy "app-green" 10
  [ "$status" -eq 1 ]
}

@test "wait_for_healthy returns 1 on timeout (status never healthy)" {
  _make_docker_mock "starting"
  run wait_for_healthy "app-green" 1
  [ "$status" -eq 1 ]
}

@test "wait_for_healthy treats missing container as keep-polling, then times out" {
  _make_docker_mock "missing missing missing"
  run wait_for_healthy "app-nonexistent" 1
  [ "$status" -eq 1 ]
}

@test "wait_for_healthy rejects missing arguments" {
  run wait_for_healthy "" 10
  [ "$status" -ne 0 ]
}
