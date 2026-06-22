---
phase: 48
slug: testability-seams
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (happy-dom) |
| **Config file** | `vitest.config.ts` (setup: `client/src/test/setup.ts`) |
| **Quick run command** | `npx vitest run server/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (full suite, 890 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run server/` (targeted server tests)
- **After every plan wave:** Run `npm test` (full suite) + `npm run check` (tsc)
- **Before `/gsd:verify-work`:** Full suite green + tsc clean + lint clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

> This is a pure-refactor phase — the central acceptance gate for every task is "byte-identical
> production behavior: full suite stays green." The NEW tests each seam unlocks are the proof the
> seam works. Filled out by the planner; rows below seed the structure.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-xx | 01 | 1 | MAINT-01 | — | N/A (refactor) | unit | `npx vitest run server/gameState` | ❌ W0 | ⬜ pending |
| 48-02-xx | 02 | 1 | MAINT-02 | — | shield absorption routes through damageInterceptor (7 call sites) | unit | `npx vitest run server/domains/CombatManager` | ✅ | ⬜ pending |
| 48-03-xx | 03 | 2 | MAINT-03 | — | create_lobby / disconnect+host-transfer / reconnect_with_token reachable via mock socket | unit | `npx vitest run server/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/gameState.test.ts` — characterization tests pinning current GameStateManager behavior BEFORE export/constructor refactor (MAINT-01); assert no leaked timers when `startWatchdogs: false`
- [ ] `server/domains/wireDomains.test.ts` (or co-located) — fresh `ScopedEventBus` per test; assert `dispose()` removes all 9 listener registrations (MAINT-03)
- [ ] `server/test/makeMockSocket.ts` — server-side mock socket helper (`data`, `join`, `emit`, `on`, `off`) modeled on `client/src/lib/socket/eventHandlers.test.ts:18-31`
- [ ] CombatManager shield-absorption test via injected `damageInterceptor` (MAINT-02) — closes the currently-untested shield path

*Existing Vitest infrastructure covers framework needs — no install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | All seams are unit-testable by design (that is the phase goal) | — |

*All phase behaviors have automated verification — this phase exists to make that true.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
