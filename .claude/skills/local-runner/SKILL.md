---
name: local-runner
description: Start, stop, or check the status of an on-demand GitHub Actions self-hosted runner that lives in WSL2 (Ubuntu) on the user's Windows dev machine (Shadowsong). Use when the user says any of "start the local runner", "spawn the WSL runner", "fire up a local runner", "stop the local runner", "is the local runner running", "tail the runner logs", or otherwise indicates they want to add temporary CI/deploy capacity from their own machine. This is the ON-DEMAND counterpart to the always-on heimdall runner — never autostart it, never offer to install it as a service, never start it without an explicit request from the user.
---

# Local On-Demand GitHub Actions Runner (WSL)

There is a GitHub Actions self-hosted runner registered against `xavisavvy/scrum-monsters` named `shadowsong-wsl-local`, living inside the WSL2 Ubuntu distro on this machine. It is **registered persistently** with GitHub but the runner process is **never autostarted** — it only runs when the user explicitly asks.

The contract:

- Heimdall (Synology NAS at `192.168.0.26`) is always-on. It picks up every job by default.
- `shadowsong-wsl-local` is dormant by default. When the user asks, you start it; it adds parallel capacity for whatever's queued; the user later asks you to stop it. Both runners share the `[self-hosted, Linux, X64]` label set.
- ALIENWARERIG (separate Windows machine) is provisioned by a different skill (`setup-wsl-runner`) and runs as a service. Don't conflate.

## How to invoke the helper

All commands route through `scripts/runner/local-runner.sh` inside the WSL Ubuntu distro. From this Windows session's Bash tool you call it via `wsl`:

```bash
scripts\runner\local-runner.cmd <command>        # from any Windows shell
# or, from inside WSL directly:
~/actions-runner/scrum-monsters-local/local-runner.sh <command>
```

Subcommands: `setup`, `start`, `stop`, `status`, `logs`, `unregister`.

## Workflows

### User asks: "start the local runner"

```bash
C:\Users\Preston\git\ScrumMonsters\scripts\runner\local-runner.cmd start
```

If the script reports "Runner not installed — run setup first", drop into the **first-time setup** workflow below before continuing.

After the start command returns, confirm with `status`:

```bash
wsl -d Ubuntu -- bash /mnt/c/Users/Preston/git/ScrumMonsters/scripts/runner/local-runner.sh status
```

Tell the user the PID and the log path. The runner now picks up jobs continuously until stopped.

### User asks: "stop the local runner"

```bash
C:\Users\Preston\git\ScrumMonsters\scripts\runner\local-runner.cmd stop
```

The runner gracefully finishes any in-flight job (up to 30s grace) before exiting. If a job is currently running you'll see the wait in the output — don't second-guess and SIGKILL it manually.

### User asks: "what's the local runner doing"

```bash
C:\Users\Preston\git\ScrumMonsters\scripts\runner\local-runner.cmd status
C:\Users\Preston\git\ScrumMonsters\scripts\runner\local-runner.cmd logs 80
```

If the user says "is it picking up the deploy?", also check GitHub:
```bash
gh run list --workflow=deploy-lightsail.yml --limit 3
gh run view <run-id> --log | grep -i "runner name"
```
The deploy job's setup log line `Job is about to start running on the runner: <name>` tells you which runner GitHub assigned the job to — `heimdall` or `shadowsong-wsl-local`.

### First-time setup (run only when the user has never set this up, or `start` reports it's not installed)

The setup is interactive — it needs a one-time registration token that **only the user can fetch**. Walk them through it:

1. Confirm Rancher Desktop or Docker Desktop is running (so Docker socket is exposed to Ubuntu). If neither is up, tell the user; the runner can start but container actions in jobs will fail.

2. Tell the user to open the registration page in their browser:
   `https://github.com/xavisavvy/scrum-monsters/settings/actions/runners/new`
   They should select **Linux** + **x64** and copy ONLY the token from the `--token` argument (a long uppercase alphanumeric string, ~29 chars).

3. Run setup. This is interactive — it will prompt for the token via `read`. Run it in the foreground; do NOT redirect stdin from /dev/null. The cleanest way from this session is to delegate to the user via `! <command>` so they paste interactively:

   Recommend to the user:
   ```
   ! C:\Users\Preston\git\ScrumMonsters\scripts\runner\local-runner.cmd setup
   ```

   The `!` prefix runs the command in their actual shell so the token prompt works. Don't try to run setup yourself via the Bash tool — token entry will hang.

   **Shell gotcha:** if the user is in Git Bash (MSYS) and prefers to invoke the `.sh` directly, MSYS will mangle `/mnt/c/...` paths by prefixing the Git install root. The `.cmd` wrapper avoids this entirely. If they insist on the `.sh`, tell them to prefix `MSYS_NO_PATHCONV=1 `.

4. After setup completes, run `status` to verify the runner is registered but not running. Then `start` if the user wants it active immediately.

### User asks: "remove the local runner"

```bash
wsl -d Ubuntu -- bash /mnt/c/Users/Preston/git/ScrumMonsters/scripts/runner/local-runner.sh unregister
```

Also interactive (needs a removal token). Same `! <command>` pattern.

## Guard rails

- **NEVER start the runner unless the user explicitly asks for it this turn.** Don't infer from "I'm about to push a big batch of work" or "CI is slow" — wait for an explicit request.
- **NEVER install the runner as a systemd service.** The whole point is on-demand; a service would defeat that.
- **NEVER write the registration token to a file or commit it.** Tokens are short-lived (1 hour) and the script reads them via interactive `read` precisely so they don't leak to logs.
- **Don't add labels.** The runner registers with exactly `self-hosted,Linux,X64` to match heimdall. Adding labels would silently exclude it from existing jobs.
- **Don't move the runner workspace to `/mnt/c/...`.** The script puts it at `~/actions-runner/scrum-monsters-local/` on the WSL ext4 filesystem deliberately; `/mnt/c` is ~10× slower for npm/git workloads.
- **If the user has multiple WSL distros** (`wsl --list` may show `rancher-desktop`, `docker-desktop`, etc.), always target `Ubuntu` explicitly with `-d Ubuntu`. The other distros are container backends and don't have apt or our runner installed.

## State files (so you don't have to re-discover them)

| Path (inside WSL) | What it is |
|---|---|
| `~/actions-runner/scrum-monsters-local/` | Runner install root |
| `~/actions-runner/scrum-monsters-local/runner.log` | Stdout/stderr from `run.sh` |
| `~/actions-runner/scrum-monsters-local/.runner.pid` | PID of the running `run.sh`; absent when stopped |
| `~/actions-runner/scrum-monsters-local/_diag/` | The runner's own diagnostic logs (per-worker, per-listener) |
| `~/actions-runner/scrum-monsters-local/_work/` | Per-job checkouts and temp dirs |
