---
name: setup-wsl-runner
description: Provision a GitHub Actions self-hosted runner for the xavisavvy/scrum-monsters repo on a Windows host via WSL2. Use when the user is preparing a new Windows machine (e.g. ALIENWARERIG) to act as a secondary Linux runner alongside the primary on the Synology NAS (heimdall, 192.168.0.26). The goal is genuine label parity — registers as `[self-hosted, Linux, X64]` so it picks up the same jobs as heimdall, including the Lightsail blue-green deploy.
---

# Setup WSL2 Runner for scrum-monsters

You are setting up a **second** GitHub Actions self-hosted runner for the `xavisavvy/scrum-monsters` repo. The **first** runner (heimdall) is a Synology NAS at `192.168.0.26` running `[self-hosted, Linux, X64]`. This new runner is on a Windows machine and must register with the **same label set** so it picks up the same workflow jobs — `ci.yml`, `e2e.yml`, `docker.yml`, and most importantly `deploy-lightsail.yml`, which uses `appleboy/ssh-action@v1` (a Docker container action) and an inline bash script. None of that runs natively on Windows, hence WSL2.

The user has primed you on this. Don't re-explain why WSL — just execute.

## Pre-flight

Confirm with the user:

1. **Host name** of this Windows machine (default assumption: `ALIENWARERIG`). Used only for logging clarity.
2. **Where the runner workspace will live.** Default: `~/actions-runner/scrum-monsters/` inside the WSL distro (NOT under `/mnt/c/...` — 10× slower for npm/git workloads). Do not let them put it on `/mnt/c`.
3. **Admin elevation.** The user must run the initial Windows commands (WSL install, `.wslconfig`) from an **Administrator** PowerShell. Once inside WSL, no further Windows admin is needed.
4. **Runner registration token.** This is a short-lived token (1 hour TTL). The user must fetch it themselves from:
   `https://github.com/xavisavvy/scrum-monsters/settings/actions/runners/new`
   Pick "Linux" + "x64". You'll need the token + URL pasted in when running `./config.sh`. **Never write the token to a file the user might commit.**

## Steps

### 1. Install / verify WSL2 (Administrator PowerShell on Windows)

```powershell
wsl --status
wsl --install -d Ubuntu     # if not already installed
wsl --set-default-version 2
wsl --update
```

If Ubuntu was already installed but is on WSL1, convert it:
```powershell
wsl --set-version Ubuntu 2
```

### 2. Cap WSL resources

Create or edit `$env:USERPROFILE\.wslconfig` (e.g. `C:\Users\Preston\.wslconfig`). Defaults grab up to 50% of host RAM — bad for a gaming rig:

```ini
[wsl2]
memory=8GB
processors=4
swap=2GB
```

Then `wsl --shutdown` and reopen the distro to apply.

### 3. Enable systemd inside WSL

Inside the Ubuntu shell:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true

[user]
default=$USER
EOF
```

Exit WSL, run `wsl --shutdown` from PowerShell, reopen. Verify with `systemctl is-system-running` — should return `running` or `degraded` (degraded is fine for now).

### 4. Install Docker Engine (NOT Docker Desktop)

Docker Desktop has murky commercial licensing AND uses a separate VM. Install upstream Docker CE directly inside the WSL distro:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out + back into WSL (`exit`, reopen distro) so the docker group membership takes effect. Test: `docker run --rm hello-world`.

If Docker fails to start, check `sudo systemctl status docker`. With systemd enabled it should start at boot; without systemd you'd be running `dockerd` manually — which is why step 3 was non-negotiable.

### 5. Install build prerequisites

The runner itself needs almost nothing, but jobs in this repo do:

```bash
sudo apt-get install -y git curl jq build-essential
# Node 22 (matches CI):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 6. Download and register the runner

Latest runner version: check https://github.com/actions/runner/releases — substitute below.

```bash
mkdir -p ~/actions-runner/scrum-monsters
cd ~/actions-runner/scrum-monsters
# Use the version + URL the user pasted from GitHub's "Add new runner" page.
curl -o actions-runner-linux-x64.tar.gz -L <URL_FROM_GITHUB>
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/xavisavvy/scrum-monsters --token <TOKEN_FROM_GITHUB>
```

When prompted:
- **Runner group:** Default
- **Runner name:** something descriptive like `alienwarerig-wsl` (NOT `heimdall` — has to be unique)
- **Runner labels:** **leave blank** to accept defaults (`self-hosted`, `Linux`, `X64`). DO NOT add custom labels — the workflows target the default set.
- **Work folder:** accept default `_work`

### 7. Install as a systemd service

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

This drops a `actions.runner.xavisavvy-scrum-monsters.<runner-name>.service` unit. With systemd-in-WSL it'll auto-start when the distro boots.

### 8. Keep WSL alive at Windows logon

WSL distros suspend when their last process exits. Even with systemd, a freshly-booted Windows session won't have the distro running unless something pokes it. Create a Windows Scheduled Task:

- **Trigger:** At log on (any user, or your user)
- **Action:** `wsl.exe -d Ubuntu -- /bin/true`
- **Settings:** "Run whether user is logged on or not" → OFF (WSL2 requires an interactive session). "Hidden" → ON.

Verify after a Windows reboot: log in, wait 30 sec, then from PowerShell `wsl -d Ubuntu -- systemctl is-active actions.runner.xavisavvy-scrum-monsters.*.service` → should print `active`.

### 9. Confirm the runner appears online

Visit `https://github.com/xavisavvy/scrum-monsters/settings/actions/runners`. You should see two runners listed, both green/Idle:

- `heimdall` (or the existing Synology runner name)
- `alienwarerig-wsl` (or whatever you chose in step 6)

Both should show labels `self-hosted`, `Linux`, `X64`.

## Validation

After registration, push a no-op commit to a throwaway branch and watch GitHub Actions. CI jobs that target `[self-hosted, Linux, X64]` should distribute across both runners. The blue-green deploy will still pin to whichever runner picks up first; this is fine — Lightsail's `.active-color` makes the deploy idempotent.

A safer first test: from the GitHub Actions UI, manually `workflow_dispatch` the `deploy-lightsail` workflow. Watch the job picker — if both runners are idle, GitHub picks one. Either should succeed identically. If your run gets assigned to the new WSL runner and fails where heimdall would have succeeded, something is wrong with the WSL setup (most likely Docker isn't running, or the runner can't reach `34.199.135.244` over SSH).

## Common failures + fixes

| Symptom | Cause | Fix |
|---|---|---|
| `appleboy/ssh-action` errors with "Cannot connect to the Docker daemon" | Docker Engine not running in WSL | `sudo systemctl start docker` and verify systemd is on (`/etc/wsl.conf` step) |
| Runner shows offline after Windows reboot | Scheduled Task didn't fire / WSL distro not awake | Re-check the task; manually run `wsl -d Ubuntu -- /bin/true` |
| Jobs hang at "Setting up runner" forever | Runner.Listener crashed silently | `sudo journalctl -u actions.runner.* -n 200` inside WSL |
| `npm ci` is glacially slow | Runner workspace is on `/mnt/c/...` | Move `~/actions-runner/scrum-monsters` to the WSL ext4 filesystem |
| Deploy job picked up but SSH fails | Outbound firewall on Windows blocking WSL2 NAT | Allow `vEthernet (WSL)` in Windows Defender Firewall |

## What NOT to do

- **Don't** copy the runner token into any file in the repo or in `~/.bashrc`. It's short-lived; let the user paste it interactively when running `config.sh`.
- **Don't** add the `deploy` label or any custom label to this runner. The workflows in `.github/workflows/` target the default `[self-hosted, Linux, X64]` set. Custom labels would silently exclude this runner from existing jobs.
- **Don't** install Docker Desktop. It conflicts with native Docker Engine inside WSL and adds licensing complexity.
- **Don't** put the runner's `_work` directory on `/mnt/c/...`. Performance is terrible.
- **Don't** register this runner against any other repo. The Synology runs two separate runners for two repos (`scrum-monsters` and `hiveforge-sh`) — each as a distinct registration with its own service. If the user later wants ALIENWARERIG to host a second runner for another repo, repeat steps 6–7 in a sibling directory `~/actions-runner/<other-repo>/`.

## When you're done

Report back to the user:

1. Runner name as it appears in GitHub UI
2. Runner labels (should be exactly `self-hosted, Linux, X64`)
3. Output of `sudo systemctl is-active actions.runner.*.service`
4. Output of `docker run --rm hello-world` (proves Docker works)

If anything in the validation section fails, surface it explicitly — don't paper over it. The user has another working runner (heimdall) so they can A/B test if this one misbehaves.

## Context for handoff back to the originating session

After this is done, the originating Claude session (on Preston's primary machine, working in the scrum-monsters repo) will resume. It does NOT need any artifacts from you committed to the repo — runner registration is server-side state, not in-repo state. Just confirm completion in a message.
