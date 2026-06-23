---
phase: 51
slug: event-contract-hardening-handler-boilerplate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (happy-dom) + `tsc` (the primary gate for EXT-04) |
| **Config file** | `vitest.config.ts` (setup: `client/src/test/setup.ts`) |
| **Quick run command** | `npm run check` (tsc) + targeted `npx vitest run <file>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (full suite, 938 tests at phase start) |

---

## Sampling Rate

- **After every task commit:** `npm run check` (tsc is the contract test for EXT-04) + targeted `npx vitest run`
- **After every plan wave:** `npm test` + `npm run check` + `npm run lint`
- **Before `/gsd:verify-work`:** Full suite green + tsc clean + lint clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

> EXT-04 is largely COMPILE-TIME — `tsc` is the test (a mismatch must produce a tsc error). MAINT-09/10
> are mechanical refactors needing helper-equivalence tests. The planner fills exact task IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 51-01-xx | 01 | 1 | EXT-04 | — | emit constrained to keyof ServerToClientEvents; satisfies guards on bridge + ClientEventSchemas; key-set parity test | compile + parity | `npm run check && npx vitest run <schema parity test>` | ✅/❌ W0 | ⬜ pending |
| 51-02-xx | 02 | 1 | MAINT-09 | — | registerSyncedLobbyHandler/registerSyncedHandler own seq-guard+null-check+setLobby for the ~28 helper-eligible handlers; ~22 non-standard stay explicit; teardown parity guaranteed | unit + parity | `npx vitest run client/src/lib/socket/eventHandlers.test.ts` | ✅/❌ W0 | ⬜ pending |
| 51-03-xx | 03 | 1 | MAINT-10 | — | worldToPercent/percentToWorld replace 5 sites with consistent clamping (sites 2+4 gain clamping — verify projectiles still render) | unit | `npx vitest run <coordinate helper test>` | ✅/❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Schema key-set parity test — asserts `Object.keys(ClientEventSchemas)` === `keyof ClientToServerEvents` (EXT-04 forward-drift guard); plus a compile-time `satisfies` assertion that fails tsc on drift
- [ ] `registerSyncedLobbyHandler`/`registerSyncedHandler` equivalence tests — a handler registered via the helper produces byte-identical store state to the old inlined envelope (seq-guard reject stale, null-check, setLobby merge → withTeamsDerived applied at the store) (MAINT-09)
- [ ] Teardown parity — a test (or CI check) asserting every `on()`-registered name has a matching `off()` (no drift) (MAINT-09)
- [ ] Coordinate helper tests — `worldToPercent`/`percentToWorld` round-trip + clamping at bounds; a projectile-coordinate test confirming sites 2+4 (now clamped) still emit valid in-range coords (MAINT-10)

*Existing Vitest infrastructure covers framework needs — no install required. `tsc` is the EXT-04 contract test.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | EXT-04 is compile-time; MAINT-09/10 are unit-testable refactors | — |

*All phase behaviors have automated verification (tsc + unit tests).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] EXT-04 contract proven by a tsc-fails-on-drift assertion (not just current green)
- [ ] Coordinate sites 2+4 clamping behavior-change verified (projectiles still render)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
