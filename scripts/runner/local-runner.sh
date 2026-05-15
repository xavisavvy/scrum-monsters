#!/usr/bin/env bash
# Local on-demand GitHub Actions self-hosted runner for scrum-monsters.
#
# Runs inside WSL2 (Ubuntu) on the developer's Windows machine. Designed
# to be started/stopped explicitly — NOT autostarted at boot, NOT a
# systemd service.
#
# Invoked from Windows side via:
#   wsl -d Ubuntu -- bash /mnt/c/Users/Preston/git/ScrumMonsters/scripts/runner/local-runner.sh <command>
#
# Or from inside WSL directly via:
#   ~/actions-runner/scrum-monsters-local/local-runner.sh <command>  (after setup)
#
# Commands:
#   setup    One-time: download runner, register with the repo (interactive — needs token)
#   start    Launch runner in the background; idempotent (no-op if already running)
#   stop     Graceful shutdown (SIGTERM); waits up to 30s, then SIGKILL
#   status   Print PID + uptime + last log line
#   logs     Tail the runner's stdout log
#   unregister  Remove the runner registration from GitHub (interactive — needs token)

set -euo pipefail

RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runner/scrum-monsters-local}"
PID_FILE="$RUNNER_DIR/.runner.pid"
LOG_FILE="$RUNNER_DIR/runner.log"
REPO_URL="https://github.com/xavisavvy/scrum-monsters"
RUNNER_NAME_DEFAULT="shadowsong-wsl-local"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">> $*"; }

ensure_wsl() {
  # /proc/sys/kernel/osrelease contains "microsoft" or "WSL" on WSL kernels.
  if ! grep -qiE "microsoft|wsl" /proc/sys/kernel/osrelease 2>/dev/null; then
    die "This script must run inside WSL2 (Ubuntu). Detected: $(uname -a)"
  fi
}

ensure_runner_installed() {
  if [[ ! -x "$RUNNER_DIR/run.sh" ]]; then
    die "Runner not installed at $RUNNER_DIR. Run '$0 setup' first."
  fi
}

cmd_setup() {
  ensure_wsl

  if [[ -d "$RUNNER_DIR" && -x "$RUNNER_DIR/run.sh" ]]; then
    info "Runner already installed at $RUNNER_DIR. Re-running config.sh will re-register."
    read -r -p "Continue? (y/N) " yn
    [[ "$yn" =~ ^[Yy]$ ]] || exit 0
  fi

  info "Installing prerequisites (apt: curl, jq, git)..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl jq git ca-certificates

  # Node 22 — matches CI. Skip if already installed at major version 22.
  if ! command -v node >/dev/null || [[ "$(node --version 2>/dev/null)" != v22* ]]; then
    info "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  else
    info "Node $(node --version) already present."
  fi

  # Docker CLI — required by appleboy/ssh-action (container action).
  # Rancher Desktop / Docker Desktop should be exposing a socket to this distro.
  if ! command -v docker >/dev/null; then
    info "Installing docker CLI (assumes Rancher/Docker Desktop exposes a socket)..."
    sudo apt-get install -y -qq docker.io
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "WARNING: 'docker info' failed. The runner can start, but jobs that use"
    echo "         container actions (e.g. appleboy/ssh-action in deploy-lightsail)"
    echo "         will fail until Rancher Desktop or Docker Desktop is running"
    echo "         AND its WSL integration is enabled for the Ubuntu distro."
  fi

  mkdir -p "$RUNNER_DIR"
  cd "$RUNNER_DIR"

  info "Fetching latest runner release metadata..."
  local latest
  latest=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)
  local version asset url
  version=$(echo "$latest" | jq -r .tag_name | sed 's/^v//')
  asset="actions-runner-linux-x64-${version}.tar.gz"
  url=$(echo "$latest" | jq -r --arg name "$asset" '.assets[] | select(.name == $name) | .browser_download_url')
  [[ -n "$url" && "$url" != "null" ]] || die "Could not resolve runner download URL for $asset"

  if [[ ! -f "$asset" ]]; then
    info "Downloading $asset..."
    curl -fsSL -o "$asset" "$url"
  fi
  info "Extracting runner..."
  tar xzf "$asset"

  echo
  echo "==============================================================="
  echo "  Get a registration token from:"
  echo "  $REPO_URL/settings/actions/runners/new"
  echo "  (Select Linux + x64 — copy ONLY the token, e.g. AAAA...)"
  echo "==============================================================="
  echo
  read -r -p "Paste registration token: " token
  [[ -n "$token" ]] || die "No token provided."

  info "Registering runner '$RUNNER_NAME_DEFAULT' with $REPO_URL..."
  ./config.sh \
    --unattended \
    --url "$REPO_URL" \
    --token "$token" \
    --name "$RUNNER_NAME_DEFAULT" \
    --labels "self-hosted,Linux,X64" \
    --work "_work" \
    --replace

  # Write RUNNER_UID/RUNNER_GID into the runner's .env so the chown-back
  # step in container workflows can restore ownership after the container
  # (which runs as root) exits. Without this, the next actions/checkout
  # on this runner fails with EACCES on git clean.
  # Remove any pre-existing entries first so re-running setup is idempotent.
  if [[ -f "$RUNNER_DIR/.env" ]]; then
    sed -i '/^RUNNER_UID=/d; /^RUNNER_GID=/d' "$RUNNER_DIR/.env"
  fi
  {
    echo "RUNNER_UID=$(id -u)"
    echo "RUNNER_GID=$(id -g)"
  } >> "$RUNNER_DIR/.env"
  info "Wrote RUNNER_UID/RUNNER_GID to .env ($(id -u):$(id -g))."

  # Drop a self-link so the user can invoke this script from inside the runner dir.
  ln -sf "$(realpath "$0")" "$RUNNER_DIR/local-runner.sh"

  echo
  info "Setup complete. Runner is registered but NOT running."
  info "Start it on demand with: $0 start"
}

cmd_start() {
  ensure_wsl
  ensure_runner_installed

  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    info "Runner already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  cd "$RUNNER_DIR"
  info "Starting runner in background..."
  # setsid detaches from the current session so the runner survives the WSL
  # invocation exit; nohup + & alone is not enough when launched from
  # `wsl -- bash script.sh` because the parent process is the wsl.exe shim
  # which exits as soon as bash returns.
  setsid bash -c "./run.sh >> '$LOG_FILE' 2>&1" </dev/null &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  sleep 1
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    die "Runner failed to start. Last log lines:\n$(tail -n 20 "$LOG_FILE" 2>/dev/null || true)"
  fi
  info "Runner started (pid $pid). Logs: $LOG_FILE"
}

cmd_stop() {
  if [[ ! -f "$PID_FILE" ]]; then
    info "No PID file — runner not running."
    return 0
  fi
  local pid
  pid=$(cat "$PID_FILE")
  if ! kill -0 "$pid" 2>/dev/null; then
    info "Stale PID file (process $pid is gone). Removing."
    rm -f "$PID_FILE"
    return 0
  fi
  info "Sending SIGTERM to runner pid $pid..."
  # The runner traps SIGTERM and finishes the current job before exiting.
  kill -TERM "$pid" 2>/dev/null || true
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [[ $waited -lt 30 ]]; do
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    info "Runner did not exit in 30s — sending SIGKILL."
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  info "Runner stopped."
}

cmd_status() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    local pid uptime
    pid=$(cat "$PID_FILE")
    uptime=$(ps -o etime= -p "$pid" 2>/dev/null | xargs || echo "?")
    echo "STATUS: running"
    echo "PID:    $pid"
    echo "UPTIME: $uptime"
    echo "LOG:    $LOG_FILE"
    if [[ -f "$LOG_FILE" ]]; then
      echo "TAIL:   $(tail -n 1 "$LOG_FILE" 2>/dev/null || true)"
    fi
  else
    echo "STATUS: not running"
    [[ -f "$PID_FILE" ]] && echo "(stale PID file present — will be cleaned on next start)"
  fi
}

cmd_logs() {
  [[ -f "$LOG_FILE" ]] || die "No log file at $LOG_FILE (runner hasn't started yet?)"
  tail -n "${1:-50}" "$LOG_FILE"
}

cmd_unregister() {
  ensure_runner_installed
  cd "$RUNNER_DIR"
  echo "Get a removal token from $REPO_URL/settings/actions/runners (click the runner, 'Remove')."
  read -r -p "Paste removal token: " token
  [[ -n "$token" ]] || die "No token provided."
  ./config.sh remove --unattended --token "$token"
  info "Runner unregistered from GitHub. Local files at $RUNNER_DIR remain — rm -rf manually if desired."
}

case "${1:-}" in
  setup)        cmd_setup ;;
  start)        cmd_start ;;
  stop)         cmd_stop ;;
  status)       cmd_status ;;
  logs)         shift; cmd_logs "${1:-50}" ;;
  unregister)   cmd_unregister ;;
  ""|help|-h|--help)
    sed -n '2,/^set -eu/p' "$0" | sed 's/^# \{0,1\}//;$d'
    exit 0
    ;;
  *)
    die "Unknown command: $1 (try: setup, start, stop, status, logs, unregister)"
    ;;
esac
