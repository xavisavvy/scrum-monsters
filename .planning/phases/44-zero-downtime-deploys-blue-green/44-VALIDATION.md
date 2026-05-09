---
phase: 44
slug: zero-downtime-deploys-blue-green
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Most of this phase is infrastructure (compose, deploy script, NPM API) that is not directly unit-testable. Validation leans on shellcheck for bash, schema/lint for compose YAML, integration smoke against a live (or staged) NPM, and the existing Vitest suite to catch any reconnection-flow regressions introduced by toast/UX copy changes.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.x (existing, for unit/component tests on toast UX changes) + shellcheck (deploy script) + `docker compose config` (compose YAML lint) |
| **Config file** | `vitest.config.ts` (existing); shellcheck installed in CI |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npm test && shellcheck scripts/deploy/*.sh && docker compose -f docker-compose.prod.yml config -q` |
| **Estimated runtime** | ~30s vitest, <2s shellcheck, <1s compose lint |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed` for any tasks touching `client/`, `server/`, or `shared/`. For pure-bash / compose / workflow tasks: run `shellcheck` and `docker compose config -q` instead.
- **After every plan wave:** Run full suite (`npm test`, `shellcheck`, `compose config`).
- **Before `/gsd-verify-work`:** Full suite green AND a manual smoke deploy against staging completed (see Manual-Only Verifications).
- **Max feedback latency:** ~35s for code changes, ~3s for infra-only changes.

---

## Per-Task Verification Map

> Filled in by the planner after PLAN.md files exist. Skeleton below — planner adds rows per task ID.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | INFRA-01    | TBD        | TBD             | TBD       | TBD               | ❌ W0       | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **NPM PUT empirical field-strip discovery** — one-time manual GET → no-op PUT against the live NPM instance to derive the read-only field strip list. Output captured as a comment in the deploy script. (Researcher Open Question 2.)
- [ ] **NPM proxy host ID capture** — one-time `GET /api/nginx/proxy-hosts` to record the stable ID for `scrummonsters.com` → hardcoded as a constant in the deploy script.
- [ ] **shellcheck installed in CI** — if not already present, add to `.github/workflows/ci.yml` lint job before any bash deploy script lands.
- [ ] **Vitest fixture for "lobby_not_found on reconnect" path** — add a unit/integration test asserting that when `validateReconnectToken` returns null (mimicking new-color-empty-Maps), the client surfaces the documented stale-snapshot toast and routes to `/play` (not a silent error).

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zero-2xx during deploy | Success Criterion 1 | Requires live VPS + concurrent traffic generator | Terminal A: `while true; do curl -sS -o /dev/null -w "%{http_code} " https://scrummonsters.com/api/health; sleep 0.2; done`. Terminal B: trigger deploy via GitHub Actions or manual SSH. Output must contain only `200`. Document the captured run in the phase SUMMARY. |
| WS reconnect bounce-to-/play behavior | Success Criterion 2 | Requires real browser + active lobby across deploy | Open browser with active lobby on staging. Trigger deploy. Confirm: (a) WS disconnect detected, (b) reconnect attempt fires, (c) on `lobby_not_found`, user lands on `/play` with the stale-snapshot toast — no duplicate-self, no white screen, no infinite spinner. |
| NPM upstream actually swapped | Success Criterion 3 | Requires NPM admin UI / API verification | After a deploy, SSH to VPS and `curl -H "Authorization: Bearer $TOKEN" http://localhost:81/api/nginx/proxy-hosts/$ID \| jq .forward_host` — must equal the new color (`app-blue` or `app-green`) matching `/opt/scrummonsters/.active-color`. |
| Auto-rollback when new color fails healthcheck | Success Criterion 3 | Requires deliberately broken image | Push an image that intentionally fails `/api/health` (e.g., add a startup `process.exit(1)` behind a feature flag). Trigger deploy. Confirm: (a) deploy script exits non-zero, (b) NPM upstream still points at old color, (c) old color still serves 200, (d) failed new color is stopped. |
| Repeated deploys alternate colors | Success Criterion 5 | Requires multiple deploys + state-file inspection | Run two consecutive successful deploys. Confirm `/opt/scrummonsters/.active-color` flips blue ↔ green and that NPM upstream tracks. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify, Wave 0 dependencies, or are explicitly justified as Manual-Only above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (compose / shellcheck / vitest counts)
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter once the planner fills in the per-task table

**Approval:** pending
