#!/usr/bin/env bash
# Pool of parallel on-demand GitHub Actions runners in WSL2.
#
# Complements local-runner.sh (the primary, instance #1). Spins up additional
# instances #2..N so this single large machine can run CI jobs in PARALLEL —
# each self-hosted runner process handles only one job at a time, so N
# instances == N concurrent jobs. On-demand only: NOT a systemd service, NOT
# autostarted at boot. Same label set as the primary so jobs schedule onto it.
#
#   bash local-runner-pool.sh up [TOTAL]   # ensure TOTAL runners running (incl. primary; default 4)
#   bash local-runner-pool.sh down         # gracefully stop the extra instances (#2+)
#   bash local-runner-pool.sh status       # show every instance
#
# `up` is interactive ONLY when it must register a new instance: it prompts
# once for a registration token from
#   https://github.com/xavisavvy/scrum-monsters/settings/actions/runners/new
# (Linux/x64). One token registers all the new instances. Run `up` via the
# shell directly (e.g. Claude's `! ...`) so the token prompt works and the
# token never lands in a log.
set -euo pipefail

REPO_URL="https://github.com/xavisavvy/scrum-monsters"
BASE_DIR="$HOME/actions-runner"
PRIMARY_DIR="$BASE_DIR/scrum-monsters-local"
LABELS="self-hosted,Linux,X64"
NAME_PREFIX="shadowsong-wsl-local"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">> $*"; }

ensure_wsl() {
  grep -qiE "microsoft|wsl" /proc/sys/kernel/osrelease 2>/dev/null \
    || die "This must run inside WSL2 (Ubuntu)."
}

instance_dir()  { echo "$BASE_DIR/scrum-monsters-local-$1"; }
instance_name() { echo "$NAME_PREFIX-$1"; }

# Each pool instance needs its OWN copy of the pre-job hook that chmods
# root-owned files left in _work by previous container jobs (the Playwright
# image runs as root). The hook resolves _work relative to its own location, so
# a shared/symlinked copy would clean the wrong directory. Without it, the next
# checkout fails with `EACCES: permission denied, unlink … _work/.git/objects/…`.
# Mirrors the primary runner's hook (configured in PR #127). Idempotent — safe to
# re-run on already-configured instances. .env is read at process start, so this
# takes effect on the next start_instance (an instance that is not yet running).
ensure_prejob_hook() {
  local dir="$1"
  local src="$PRIMARY_DIR/runner-hooks/pre-job.sh"
  local hook="$dir/runner-hooks/pre-job.sh"
  if [[ ! -f "$src" ]]; then
    info "  WARN: primary pre-job hook missing ($src) — skipping hook install"
    return 0
  fi
  mkdir -p "$dir/runner-hooks"
  cp "$src" "$hook"
  chmod +x "$hook"
  sed -i '/^ACTIONS_RUNNER_HOOK_JOB_STARTED=/d' "$dir/.env" 2>/dev/null || true
  echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$hook" >> "$dir/.env"
}

start_instance() {
  local dir="$1" pid_file log pid
  pid_file="$dir/.runner.pid"; log="$dir/runner.log"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file" 2>/dev/null)" 2>/dev/null; then
    info "  already running (pid $(cat "$pid_file"))"; return 0
  fi
  cd "$dir"
  # setsid detaches so the runner survives the launching shell exiting (same
  # rationale as local-runner.sh). $log is an absolute, script-derived path.
  setsid bash -c "./run.sh >> '$log' 2>&1" </dev/null &
  pid=$!
  echo "$pid" > "$pid_file"
  cd - >/dev/null
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    info "  started (pid $pid)"
  else
    rm -f "$pid_file"; die "instance failed to start — tail: $log"
  fi
}

cmd_up() {
  ensure_wsl
  local total="${1:-4}"
  [[ "$total" =~ ^[0-9]+$ && "$total" -ge 2 ]] || die "TOTAL must be an integer >= 2"
  [[ -x "$PRIMARY_DIR/run.sh" ]] || die "Primary runner not set up — run local-runner.sh setup first."
  local tarball
  tarball=$(ls "$PRIMARY_DIR"/actions-runner-linux-x64-*.tar.gz 2>/dev/null | head -1)
  [[ -n "$tarball" ]] || die "No runner tarball found in $PRIMARY_DIR."

  # Token is only needed if at least one new instance must be registered.
  local need_token=0 i
  for ((i = 2; i <= total; i++)); do
    [[ -x "$(instance_dir "$i")/run.sh" && -f "$(instance_dir "$i")/.runner" ]] || need_token=1
  done

  # Token may be supplied via the RUNNER_TOKEN env var (preferred when launched
  # non-interactively, where a read prompt can't capture input). Falls back to
  # an interactive prompt for a normal terminal.
  local token="${RUNNER_TOKEN:-}"
  if [[ $need_token -eq 1 && -z "$token" ]]; then
    echo "==============================================================="
    echo "  A registration token is needed to register the new runner(s)."
    echo "  Get one (Linux/x64): $REPO_URL/settings/actions/runners/new"
    echo "  Tip: pass it as  RUNNER_TOKEN=<token>  if prompts don't work."
    echo "==============================================================="
    read -r -p "Paste registration token: " token
    [[ -n "$token" ]] || die "No token provided. Re-run with RUNNER_TOKEN=<token>."
  fi

  for ((i = 2; i <= total; i++)); do
    local dir name; dir=$(instance_dir "$i"); name=$(instance_name "$i")
    info "instance #$i ($name)"
    if [[ -x "$dir/run.sh" && -f "$dir/.runner" ]]; then
      info "  already configured"
    else
      mkdir -p "$dir"
      ( cd "$dir" && tar xzf "$tarball" )
      ( cd "$dir" && ./config.sh --unattended --url "$REPO_URL" --token "$token" \
          --name "$name" --labels "$LABELS" --work "_work" --replace )
      # RUNNER_UID/GID so container-job chown-back works (see runner-fleet notes).
      sed -i '/^RUNNER_UID=/d;/^RUNNER_GID=/d' "$dir/.env" 2>/dev/null || true
      printf 'RUNNER_UID=%s\nRUNNER_GID=%s\n' "$(id -u)" "$(id -g)" >> "$dir/.env"
      info "  configured (UID/GID $(id -u):$(id -g))"
    fi
    # Always (re)assert the pre-job hook — older instances were registered
    # without it and would fail container jobs with EACCES on dirty _work.
    ensure_prejob_hook "$dir"
    start_instance "$dir"
  done
  info "Pool up: targeted instances #2..#$total (primary is #1). Run 'status' to verify."
}

cmd_down() {
  ensure_wsl
  local dir found=0
  for dir in "$BASE_DIR"/scrum-monsters-local-*; do
    [[ -d "$dir" ]] || continue
    [[ "$dir" == "$PRIMARY_DIR" ]] && continue   # never touch the primary
    found=1
    local pid_file="$dir/.runner.pid" pids w=0
    # Discover the live listener by its path rather than trusting .runner.pid:
    # that file can go stale (e.g. a prior stop killed only the setsid wrapper
    # and orphaned the Runner.Listener, which keeps serving). Trusting it made
    # `down` report "not running" while the runner was in fact online — the
    # failure that left orphaned instances behind once. pgrep on the per-instance
    # dir path is authoritative.
    pids="$(pgrep -f "$dir/bin/Runner.Listener" 2>/dev/null | tr '\n' ' ')"
    pids="$(echo "$pids" | xargs 2>/dev/null || true)"
    if [[ -z "$pids" ]]; then
      info "$(basename "$dir"): not running"; rm -f "$pid_file"; continue
    fi
    info "$(basename "$dir"): SIGTERM $pids (finishes in-flight job, up to 30s)..."
    # shellcheck disable=SC2086  # word-splitting intended: $pids is a PID list
    kill -TERM $pids 2>/dev/null || true
    while [[ $w -lt 30 ]] && pgrep -f "$dir/bin/Runner.Listener" >/dev/null 2>&1; do
      sleep 1; w=$((w + 1))
    done
    if pgrep -f "$dir/bin/Runner.Listener" >/dev/null 2>&1; then
      info "  did not exit in 30s — SIGKILL everything under $(basename "$dir")"
      pkill -KILL -f "$dir/" 2>/dev/null || true
    fi
    rm -f "$pid_file"; info "  stopped"
  done
  [[ $found -eq 1 ]] || info "No extra instances found."
}

cmd_status() {
  local dir
  for dir in "$PRIMARY_DIR" "$BASE_DIR"/scrum-monsters-local-*; do
    [[ -d "$dir" ]] || continue
    [[ "$dir" == "$PRIMARY_DIR"-* || "$dir" == "$PRIMARY_DIR" ]] || continue
    local pid_file="$dir/.runner.pid" state="not running" pid="—" up="—"
    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file" 2>/dev/null)" 2>/dev/null; then
      pid=$(cat "$pid_file"); up=$(ps -o etime= -p "$pid" 2>/dev/null | xargs || echo "?"); state="running"
    fi
    printf '%-34s %-12s pid=%-8s up=%s\n' "$(basename "$dir")" "$state" "$pid" "$up"
  done
}

case "${1:-}" in
  up)     shift; cmd_up "${1:-4}" ;;
  down)   cmd_down ;;
  status) cmd_status ;;
  *) echo "usage: $0 {up [TOTAL] | down | status}"; exit 1 ;;
esac
