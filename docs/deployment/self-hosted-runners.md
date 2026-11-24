# Self-hosted CI runners: what jobs can and cannot do

_Added 2026-11-24. Applies to every repo that uses the shared self-hosted pool (lfg-app, scrum-monsters, toa-website,
preston-farr-website)._

The `[self-hosted, Linux, X64]` runners are a **shared pool** in WSL2 on two Windows machines (Shadowsong and
Alienwarerig), managed by the `wsl-runner-host` setup (systemd units, queue poller, idle shutdown). The same pool
also builds and **deploys lfg-app to production**, so on 2026-11-24 it was locked down:

## 1. Untrusted code never runs on the pool

Fork PRs and **Dependabot-authored PRs** run on GitHub-hosted runners. Trusted work (pushes to the default branch, the
owner's own PRs, schedules, dispatches, deploys) stays on the pool.

When you add or change a workflow job that runs on the pool, keep this guard in its `runs-on`
(`github.event.pull_request.user.login` is the PR author, so a human re-run of a Dependabot PR is still caught):

```yaml
runs-on: ${{ (github.event_name == 'pull_request' && (github.event.pull_request.head.repo.fork || github.event.pull_request.user.login == 'dependabot[bot]')) && 'ubuntu-latest' || fromJSON('["self-hosted","Linux","X64"]') }}
```

Never put `pull_request_target` jobs that check out PR code on the pool.

## 2. The WSL distros are runner-only and hardened

`/etc/wsl.conf` on both machines:

- `[interop] enabled=false` and `appendWindowsPath=false`: a job cannot start Windows programs (`wsl.exe`,
  `powershell.exe`, `cmd.exe`, `*.exe` on PATH).
- `[automount] enabled=false`: **no Windows drives** (`/mnt/c`, `/mnt/f`, ...) inside the distro. A job cannot read or
  write Windows files.

What that means for workflows and scripts:

- Do not use `/mnt/c/...` paths or Windows tools in CI steps; they do not exist on the pool.
- Docker `buildx` and `compose` are Linux packages inside the distro (Ubuntu's `docker-buildx`, `docker-compose-v2` on
  Shadowsong; Docker's own plugins on Alienwarerig), no longer Rancher Desktop's copies under `/mnt/c`.
- Each runner has a private `DOCKER_CONFIG` with no credential helper; `docker login` writes a plain auth blob there
  and `docker logout` clears it at the end of the job (unchanged).
- To work with the distro from Windows, go in through `wsl.exe` (inbound still works) or `\\wsl.localhost\Ubuntu\...`.
  Start and stop runners with `wsl -d Ubuntu -- bash ~/actions-runner/runner-ctl.sh start|stop|status <name|all>`
  (the desktop Pause/Resume CI shortcuts keep working). A helper that launches a runner script by a `/mnt/c/...` path
  no longer works.

## 3. Still true

Runner jobs run as the runner user, who is in the `docker` group (root-equivalent over that machine's Docker daemon,
which every repo on the machine shares). That is acceptable only because of rule 1. Dependabot updates that are
auto-merged reach the default branch and then run on the pool like any trusted push, so keep auto-merge to updates you
would merge without reading.
