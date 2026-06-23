---
phase: 50
slug: finish-the-gamestate-domain-manager-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (happy-dom) |
| **Config file** | `vitest.config.ts` (setup: `client/src/test/setup.ts`) |
| **Quick run command** | `npx vitest run <targeted file>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (full suite, 919 tests at phase start) |

---

## Sampling Rate

- **After every task commit:** Run the targeted `npx vitest run` for the file touched
- **After every plan wave:** Run `npm test` (full suite) + `npm run check` (tsc) + `npm run lint`
- **Before any DELETION task:** the relevant characterization/regression test must be green FIRST (deletions are point-of-no-return)
- **Before `/gsd:verify-work`:** Full suite green + tsc clean + lint clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

> This is a deletion/migration phase. The invariant on every task: NO regression in reconnection
> (Phase 41), revival, or host-transfer. Deletions are gated on a green characterization test that
> pins behavior BEFORE the delete. The planner fills exact task IDs; rows seed the structure.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-xx | 01 | 1 | MAINT-07 | — | syncPlayerToLobby registers alias for ALL lobby members (reconnect staleness closed) | regression | `npx vitest run server/gameState.test.ts` | ✅/❌ W0 | ⬜ pending |
| 50-01-xx | 01 | 1 | MAINT-07 | — | dead methods deleted only after call-site audit; createLobby test callers migrated first; removePlayer DEFERRED (live caller) | unit | `npx vitest run server/` | ✅/❌ W0 | ⬜ pending |
| 50-01-xx | 01 | 1 | MAINT-07 | — | timer/jira/estimation settings handled by SessionManager; emit timing unchanged | unit | `npx vitest run server/domains/SessionManager.test.ts` | ✅/❌ W0 | ⬜ pending |
| 50-02-xx | 02 | 2 | MAINT-08 | — | all revival routes through CombatManager; both 100ms watchdogs gone; revival still works | regression | `npx vitest run server/domains/CombatManager.test.ts` | ✅/❌ W0 | ⬜ pending |
| 50-02-xx | 02 | 2 | MAINT-08 | — | session:host_transferred eventBus event replaces the disconnect-sweeper io.to().emit; host-transfer still reaches clients | regression | `npx vitest run server/` | ✅/❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/gameState.test.ts` — reconnect-alias regression: after `syncPlayerToLobby`, ALL lobby members resolve via `playerToLobby` (fails on the current single-player-only registration); migrate the 2 `createLobby` test callers to SessionManager equivalents before the delete
- [ ] `server/domains/SessionManager.test.ts` — settings methods (timer/jira/estimation) behave identically to the old GameState setters
- [ ] `server/domains/CombatManager.test.ts` — revival lifecycle works with both watchdogs removed (event-driven / self-managing intervals); revival completes end-to-end
- [ ] host-transfer regression — `session:host_transferred` fires on the disconnect-sweeper path and bridges to the wire `host_transferred` event (no dropped client update)

*Existing Vitest infrastructure + Phase 48 seams (new CombatManager({eventBus}), makeMockSocket, constructable GameStateManager) cover framework needs — no install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end reconnect after a real disconnect | MAINT-07 | Full socket lifecycle is integration-level; unit tests cover the alias logic | Optional smoke: disconnect a player mid-battle, reconnect, confirm state restores (Phase 41 manual UAT still valid) |

*Core logic for all three risk areas (reconnect alias, revival, host-transfer) has automated coverage; the manual smoke is a belt-and-suspenders check, not a gate.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] Every DELETION task is preceded by a green characterization/regression test
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
