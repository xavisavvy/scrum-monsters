---
phase: 52
slug: client-god-component-decomposition
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (happy-dom) + `tsc` + React DevTools profiler (manual, for the perf guardrail) |
| **Config file** | `vitest.config.ts` (setup: `client/src/test/setup.ts`) |
| **Quick run command** | `npm run check` + targeted `npx vitest run <file>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (full suite, 963 tests at phase start) |

---

## Sampling Rate

- **After every task commit:** `npm run check` (tsc) + targeted `npx vitest run` for the touched file
- **After every plan wave:** `npm test` (full suite) + `npm run check` + `npm run lint`
- **Before `/gsd:verify-work`:** Full suite green + tsc clean + lint clean
- **Max feedback latency:** ~15 seconds
- **Perf guardrail:** render-count assertion (automated where possible) + a documented React DevTools profiler check that render counts did NOT increase (manual confirmation recorded in SUMMARY)

---

## Per-Task Verification Map

> This is a decomposition refactor of two god-components with a HARD perf guardrail (no render-count
> increase; 60fps loops untouched). Each extraction must be behavior-identical. The planner fills exact IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-xx | A | 1 | MAINT-11 | — | movement useEffect runs ONE interval per session (buff/jump changes no longer recreate it); refs mirror state | fake-timers unit | `npx vitest run <movement interval test>` | ✅/❌ W0 | ⬜ pending |
| 52-xx | A | 1 | MAINT-14 | — | handleShootAtTarget replaces 3× Ctrl-shoot; startCooldown replaces 2 tickers; behavior identical | unit | `npx vitest run <PlayerController test>` | ✅/❌ W0 | ⬜ pending |
| 52-xx | B | 2 | MAINT-12 | — | 10 slots → one useReducer (BuffState/BuffAction); DISPEL_ALL one action; behavior identical incl. isLocalCast setFlyHeight(0) divergence | reducer unit | `npx vitest run <buffReducer test>` | ✅/❌ W0 | ⬜ pending |
| 52-xx | C | 3 | MAINT-13 | — | verified seams extracted in order (TavernLighting→LobbySettingsDialog→LobbyAvatar→applySpellEffects dedup→useLobbyMovement last); host+phase guard preserved exactly; debunked seams untouched; dpr inside scene; scene React.memo'd; render counts not increased | unit + render-count + profiler | `npx vitest run <lobby seam tests> && npm test` | ✅/❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Movement one-interval-per-session test (fake timers) — asserts the 16ms interval is created ONCE and not recreated on buff/jump-height changes (MAINT-11, both Lobby + PlayerController)
- [ ] `buffReducer` unit tests — every BuffAction transition incl. DISPEL_ALL; the isLocalCast self-cast `setFlyHeight(0)` divergence preserved (MAINT-12)
- [ ] PlayerController dedup equivalence — handleShootAtTarget produces identical emit at all 3 call sites; startCooldown identical to both inline tickers (MAINT-14)
- [ ] Seam-extraction equivalence + render-count guardrail — extracted components render identically; LobbySettingsDialog host+phase guard intact; a render-count spy (pattern from Phase 49 PlayerCharacter.test.tsx) confirms the extracted scene does NOT re-render more than before (MAINT-13 + perf)

*Existing Vitest + @testing-library/react + the Phase 49 render-spy pattern cover framework needs. The DevTools profiler check is the one manual gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 60fps movement/scene render counts did not increase | Perf guardrail | React DevTools profiler is a runtime/visual measurement; automated render-count spies cover unit scope but the full-scene 60fps profile is best confirmed live | Open the lobby in dev, record a profiler session during movement + a spell cast, confirm extracted-scene render count ≤ pre-refactor baseline; record the result in the SUMMARY |

*Automated render-count spies cover the component-level guardrail; the profiler check is belt-and-suspenders for the 60fps loops.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] Movement one-interval-per-session proven (fake timers)
- [ ] Reducer behavior-equivalence proven (incl. isLocalCast divergence)
- [ ] Perf guardrail: render-count spy green + profiler confirmation recorded; Canvas not a controlled prop-receiver
- [ ] Debunked seams confirmed untouched
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
