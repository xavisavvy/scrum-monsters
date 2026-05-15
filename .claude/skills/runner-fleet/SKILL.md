---
name: runner-fleet
description: Register a NEW repository against Preston's existing fleet of self-hosted GitHub Actions runners (heimdall on Synology, Alienwarerig on Win10+WSL, optional shadowsong-wsl-local). Each runner serves multiple repos in parallel via separate registrations. Use when starting a NEW repo that should share these runners, or when adding a 4th+ runner host to the fleet. NOT for first-time runner setup on a brand-new machine (that's `setup-wsl-runner`).
---

# Runner-fleet onboarding

Preston runs a small fleet of self-hosted GitHub Actions runners shared across his personal repos. Each repo gets its own runner registration on each host. A single host CAN host multiple registrations side-by-side (the Synology already runs `scrum-monsters` and `hiveforge-sh` as siblings).

## The fleet (as of 2026-05-15)

| Host | Where | Strength | Weakness |
|---|---|---|---|
| `heimdall` | Synology NAS at `192.168.0.26:88` (SSH `prestonf`) | Always-on systemd service | Read-only NVMe cache over HDD - IO-bound, load 5+ |
| `Alienwarerig` | Win10 + WSL Ubuntu at `192.168.0.245` (SSH `xavie`) | Native SSD, fastest | Depends on `WSL-Wake-Ubuntu` scheduled task |
| `shadowsong-wsl-local` | Preston's daily-driver, WSL | Available during dev | On-demand only, never autostarted |

All advertise labels `self-hosted, Linux, X64`. UIDs differ (`1030:100` on heimdall, `1000:1000` on WSL hosts) - workflows must be runner-agnostic via the chown-back pattern, NOT hardcoded `--user` flags.

## Inputs from the user

1. Repo full name (e.g. `xavisavvy/new-app`)
2. Which hosts to register on - default: heimdall + Alienwarerig
3. Does the repo's CI use Docker container actions? If yes, pre-job hook is mandatory.

## Per-host registration

Install-dir convention: `<runner-root>/<repo-name>` (or `<repo-name>-local` for shadowsong). On WSL hosts inside the distro at `/home/<user>/actions-runner/<repo-name>/`. Never on `/mnt/c/...`.

### 1. Download runner (use same VERSION as existing)

```bash
ssh heimdall 'ls -1 /volume1/actions-runner/scrum-monsters/*.tar.gz | head -1'
# then on each host in new install dir:
VERSION=2.330.0
curl -fsSL -o actions-runner.tar.gz \
  https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-x64-$VERSION.tar.gz
tar xzf actions-runner.tar.gz
```

### 2. Token (user-only, interactive)

`https://github.com/<owner>/<repo>/settings/actions/runners/new` - Linux + x64. Copy ONLY the token. NEVER write to a file.

### 3. Register

```bash
cd <install-dir>
./config.sh --unattended \
  --url https://github.com/<owner>/<repo> \
  --token <TOKEN> \
  --name <host-runner-name> \
  --labels "self-hosted,Linux,X64" \
  --work "_work" --replace
```

**CRITICAL: do NOT add custom labels.** Default labels keep the fleet fungible.

### 4. .env + pre-job hook (only if repo uses Docker container actions)

```bash
INSTALL_DIR=<install-dir>
cat >> $INSTALL_DIR/.env <<EOF
RUNNER_UID=$(id -u)
RUNNER_GID=$(id -g)
ACTIONS_RUNNER_HOOK_JOB_STARTED=$INSTALL_DIR/runner-hooks/pre-job.sh
EOF
mkdir -p $INSTALL_DIR/runner-hooks
cat > $INSTALL_DIR/runner-hooks/pre-job.sh <<'HOOK'
#!/usr/bin/env bash
set +e
LOG="$(dirname "$(readlink -f "$0")")/pre-job.log"
exec >> "$LOG" 2>&1
WORK_DIR="$(dirname "$(readlink -f "$0")")/../_work"
WORK_DIR="$(realpath "$WORK_DIR" 2>/dev/null)"
[ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ] || exit 0
DOCKER="$(command -v docker)"
[ -z "$DOCKER" ] && [ -x /usr/local/bin/docker ] && DOCKER=/usr/local/bin/docker
[ -z "$DOCKER" ] && exit 0
"$DOCKER" run --rm -v "$WORK_DIR:/work" alpine chmod -R 777 /work
exit 0
HOOK
chmod +x $INSTALL_DIR/runner-hooks/pre-job.sh
```

Why: container workflows run as root, leak root-owned files the runner user can't chmod. Docker daemon runs as root - we use Docker to chmod, sidestepping the issue. Hook runs before EVERY job including after cancellations.

### 5. Install service (heimdall, Alienwarerig only)

```bash
cd <install-dir> && sudo ./svc.sh install && sudo ./svc.sh start && sudo ./svc.sh status
```

heimdall's `svc.sh` has no `restart` - use `stop && start`. Shadowsong NEVER installs as service; use `scripts/runner/local-runner.sh` for on-demand.

### 6. Verify

```bash
gh api repos/<owner>/<repo>/actions/runners --jq '.runners[] | {name, status, busy}'
```

## Companion artifacts to copy into new repo

1. `.claude/skills/local-runner/SKILL.md` + `scripts/runner/local-runner.sh` + `scripts/runner/local-runner.cmd` - adjust `RUNNER_DIR`/`REPO_URL`/`RUNNER_NAME_DEFAULT` inside the `.sh`.
2. `.github/workflows/cleanup-pr-caches.yml` - drop-in copy.
3. `.gitignore` exception:
   ```
   .claude/*
   !.claude/skills/
   ```
4. `.gitattributes`: `*.sh text eol=lf`
5. Container workflow pattern:
   - First step: `chmod -R o+rwX /__w /github/home 2>/dev/null || true`
   - Last step `if: always()`: chown back to `${RUNNER_UID:-0}:${RUNNER_GID:-0}`
   - DO NOT hardcode `--user 1030:100`
6. Optional: typecheck pre-check job that heavy container jobs `needs:` on.

## Decommissioning

```bash
ssh <host> 'cd <install-dir> && sudo ./svc.sh stop && sudo ./svc.sh uninstall'
# get removal token from GitHub UI
./config.sh remove --unattended --token <REMOVAL_TOKEN>
rm -rf <install-dir>
```

## What NOT to do

- Don't share `_work` across registrations
- Don't reuse a single registration across repos (per-repo scope)
- Don't add custom labels (breaks job distribution)
- Don't put `_work` on `/mnt/c/...` (10x slower)
- Don't install Docker Desktop on WSL hosts
- Don't skip the pre-job hook if CI uses container jobs

## After onboarding

Write a brief reference memory in the new repo's `.claude/projects/.../memory/` and update each runner-host's `~/.claude/CLAUDE.md` to mention the new repo.
