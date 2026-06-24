---
phase: 51-event-contract-hardening-handler-boilerplate
verified: 2026-06-23T23:15:00Z
status: passed
score: 4/4
overrides_applied: 0
---

# Phase 51: Event-Contract Hardening & Handler Boilerplate — Verification Report

**Phase Goal:** Adding or changing a fine-grained socket event produces a `tsc` error on mismatch instead of a silent production drift (the C1/C2/C3/C5 bug class); the ~50 copy-pasted client handler envelopes collapse into tested helpers.
**Verified:** 2026-06-23T23:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `emitFineGrained`/`emitToLobby` constrained to `keyof ServerToClientEvents`; `_BRIDGE_COVERAGE satisfies` guard; `ClientEventSchemas satisfies Record<keyof ClientToServerEvents>` + parity test | VERIFIED | `ClientEventEmitter.ts:583,594` both declare `event: keyof ServerToClientEvents`; `_BRIDGE_COVERAGE` at L668-721 uses `satisfies Partial<Record<keyof ServerToClientEvents, true>>`; `socket-schemas.ts:738` has `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>`; `socket-schemas.test.ts` asserts 48 entries |
| 2 | Wire unions substituted (`ItemType` ×4, `AvatarClass` ×3); `Sequenced<T>` wraps ~40 fine-grained events (4 control messages excluded); `bossType`/minion `attackType` NOT changed | VERIFIED | `gameEvents.ts:12` exports `Sequenced<T>`; applied to all session/estimation/combat/progression/class_mastery/ability/combo/item/stats/system:full_state events; `itemType: ItemType` at L346/576/582/588; `AvatarClass` at L482/511/519; `bossType: string` and `attackType: string` confirmed unchanged |
| 3 | `registerSyncedLobbyHandler`/`registerSyncedHandler` own seq-guard + null-check + setLobby envelope for helper-eligible handlers (~17+11=28); ~21 non-standard stay explicit; teardown drift structurally impossible via registered-name array | VERIFIED | `eventHandlerUtils.ts` exports both helpers and `teardownSyncedHandlers`; 33 helper calls in `eventHandlers.ts` (31 unique events); 21 explicit `socket.on` calls for non-standard; `teardownEventHandlers` calls `teardownSyncedHandlers` first then explicit offs; teardown-parity test + helper-equivalence tests exist |
| 4 | `worldToPercent`/`percentToWorld` replace 5 coordinate sites with consistent clamping; no other wire/runtime change; Sites 2+4 clamping is the only intentional runtime change | VERIFIED | Both helpers in `useViewport.ts:179-208`; `PlayerController.tsx` uses helpers at Sites 1 (L74), 2 (L182-183), 2b (L770-771), 3 (L476), 4 (L553-554); `useViewport.test.ts` has 11 tests including projectile-render proof; Site 5 in `useViewport.ts:146` uses `percentToWorld` |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/events/ClientEventEmitter.ts` | `emitFineGrained`/`emitToLobby` constrained; `_BRIDGE_COVERAGE satisfies` guard | VERIFIED | Both methods at L583/594 declare `event: keyof ServerToClientEvents`; `_BRIDGE_COVERAGE` at L668-721; `void _BRIDGE_COVERAGE` at L724 |
| `server/websocket.ts` | `emitFineGrained` closure constrained to `keyof ServerToClientEvents` | VERIFIED | L129: `event: keyof ServerToClientEvents`; all 20 call sites compile unchanged |
| `shared/gameEvents.ts` | `Sequenced<T>` export; `ItemType` import + 4 substitutions; `AvatarClass` 3 substitutions | VERIFIED | L12 export; L3 import; substitutions confirmed at L346/482/511/519/576/582/588 |
| `shared/socket-schemas.ts` | `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>`; `as const` removed | VERIFIED | L738; no `as const` found; `ClientEventName` and `getClientEventSchema` still resolve |
| `shared/socket-schemas.test.ts` | Key-set parity test (48 entries) | VERIFIED | 8-line test; asserts `Object.keys(ClientEventSchemas).length === 48`; passes in live suite |
| `client/src/lib/socket/eventHandlerUtils.ts` | `registerSyncedLobbyHandler`, `registerSyncedHandler`, `teardownSyncedHandlers`; no `withTeamsDerived` | VERIFIED | All three exports present; `grep withTeamsDerived` = 0 matches |
| `client/src/lib/socket/eventHandlerUtils.test.ts` | 10+ unit tests covering seq-gate, null-lobby, partial merge, teardown | VERIFIED | 10 tests in 3 describe blocks; covers seq-gap triggers gap not stale |
| `client/src/lib/socket/eventHandlers.ts` | Helpers used for ~28 handlers; teardown via registered array + explicit offs | VERIFIED | 33 helper call occurrences; `teardownSyncedHandlers` called at L807; 21 explicit offs at L810-831 |
| `client/src/lib/socket/eventHandlers.test.ts` | Teardown-parity test + helper-equivalence tests | VERIFIED | Lines 622-721: teardown-parity test + 2 equivalence tests for `session:player_left` and `combat:player_damaged` |
| `client/src/lib/hooks/useViewport.ts` | `worldToPercent` (clamps) + `percentToWorld` (no clamp) exports; Site 5 converted | VERIFIED | L179-208; JSDoc documents MAINT-10 behavior change; Site 5 at L146 |
| `client/src/lib/hooks/useViewport.test.ts` | 11 tests: center, clamp-high, clamp-low, boundary, no-clamp, round-trip, projectile-render proof | VERIFIED | 11 tests across 3 describe blocks; projectile-render proof test at L68-77 |
| `client/src/components/game/PlayerController.tsx` | All 5 (actually 6) coordinate sites converted | VERIFIED | Sites 1/2/2b/3/4/5 all use helpers; grep for unclamped inline math returns 0 matches |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ClientEventEmitter.ts emitFineGrained` | `shared/gameEvents.ts ServerToClientEvents` | `event: keyof ServerToClientEvents` | WIRED | Import at L22; constraint at L583/594 |
| `server/websocket.ts emitFineGrained closure` | `shared/gameEvents.ts ServerToClientEvents` | `event: keyof ServerToClientEvents` | WIRED | Import at L10; closure at L129 |
| `_BRIDGE_COVERAGE` | `shared/gameEvents.ts ServerToClientEvents` | `satisfies Partial<Record<keyof ServerToClientEvents, true>>` | WIRED | L721; covers 51 bridged wire names |
| `socket-schemas.ts ClientEventSchemas` | `shared/gameEvents.ts ClientToServerEvents` | `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>` | WIRED | L738; `as const` removed |
| `eventHandlerUtils.ts helpers` | `eventHandlers.ts` | import + 33 call occurrences | WIRED | L6 import; 33 grep hits |
| `teardownSyncedHandlers` | `_registeredEvents array` | loop + `socket.off(event)` | WIRED | Structural: cannot drift — registration and teardown share same array |
| `worldToPercent/percentToWorld` | `PlayerController.tsx` | import at L12; used at Sites 1/2/2b/3/4 | WIRED | 5 import-level occurrences + 8 usage occurrences confirmed |

---

## Data-Flow Trace (Level 4)

Not applicable — this phase is compile-time type hardening (EXT-04) and mechanical refactor (MAINT-09/10). No components render dynamic data fetched from a new source; all changes are type additions and structural rewrites of existing data flows.

---

## Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|----------|-------------------|--------|--------|
| `tsc` clean after all changes | `npm run check` (exits 0, no output) | 0 errors | PASS |
| Full test suite: 963 tests pass | `npm test` live run | 963 passed (63 files) | PASS |
| Parity test: 48 schema entries | `shared/socket-schemas.test.ts` passes in suite | PASS (visible in test output) | PASS |
| Helper equivalence: `session:player_left` removes player | `eventHandlers.test.ts:659` | PASS | PASS |
| Helper equivalence: `combat:player_damaged` keeps `addPendingDamage` | `eventHandlers.test.ts:689` | PASS | PASS |
| Coordinate clamping: out-of-bounds clamps to 100 | `useViewport.test.ts:11-14` | PASS | PASS |
| Round-trip: in-bounds coords survive `worldToPercent -> percentToWorld` | `useViewport.test.ts:59-65` | PASS | PASS |
| Teardown parity: every on() has a matching off() | `eventHandlers.test.ts:630` | PASS | PASS |

---

## Drift-Catch Contract Assessment (CRITICAL)

**Does the EXT-04 contract actually catch drift, or only compile green?**

The 51-01 SUMMARY documents a deliberate inject-observe-revert proof:

1. Injection: changed one `emitFineGrained` call site from `'session:tickets_updated'` to `'combat:NONEXISTENT'` AND added `'combat:NONEXISTENT': true` to `_BRIDGE_COVERAGE`.
2. Observed: two `tsc` errors — one at the call site (type `'"combat:NONEXISTENT"'` not assignable to `keyof ServerToClientEvents`) and one at `_BRIDGE_COVERAGE` (key `'combat:NONEXISTENT'` not in `Partial<Record<keyof ServerToClientEvents, true>>`).
3. Reverted: both injections removed; `npm run check` clean again.

**Assessment: GENUINE CATCH.** The proof demonstrates both protection layers independently:
- The `keyof` constraint catches a bad event name at any `emitFineGrained` call site.
- The `_BRIDGE_COVERAGE satisfies` guard catches a bad bridge wire name independently.

Neither layer is redundant — a developer could add a bridge wire name in `setupInternalEventListeners` without calling `emitFineGrained` directly (it would only trigger the `_BRIDGE_COVERAGE` error), or vice versa.

The `ClientEventSchemas satisfies Record<keyof ClientToServerEvents>` provides a third independent layer: adding/removing a schema entry that diverges from `ClientToServerEvents` is a tsc error, AND the runtime count check (`Object.keys.length === 48`) is a vitest failure.

**Verdict: The contract catches drift at 3 independent levels. The proof is sound.**

---

## 6th Coordinate Site (D-pad) Deviation Assessment

The RESEARCH audit identified 5 coordinate sites in `PlayerController.tsx`. During execution, a 6th site was discovered at lines 769-772 (D-pad ControlLeft shoot handler) — an unclamped `(world.x / viewport.worldWidth) * 100` pattern identical to Sites 2 and 4.

**Assessment: SOUND and IN-SCOPE.**
- The 6th site is the exact same pattern (world-to-percent emit, no clamping) as Sites 2 and 4 — the very sites the RESEARCH flagged as having inconsistent clamping.
- Rule 2 (auto-fix missing instances of the same pattern) correctly applies.
- The executor applied the same canonicalization (`worldToPercent`) with a "Site 2b (D-pad shoot)" comment for traceability.
- MAINT-10's stated intent is to make all projectile emit sites consistent. The D-pad shoot site emits projectile coordinates. Including it is more complete than the RESEARCH's count, not a scope creep.
- The 51-03 SUMMARY explicitly documents this as the intentional runtime change: Sites 2, 2b, and 4 now clamp.

**Verdict: The 6th site deviation is correct. The SUMMARY documents it explicitly. The intent is sound.**

---

## No-Unintended-Runtime-Change Judgment

**EXT-04 (Plans 01):** Pure compile-time changes. All `Sequenced<T>`, `satisfies`, `keyof` constraints and `ItemType`/`AvatarClass` substitutions are type-level. Wire format is unchanged — `seq` and `timestamp` already went on the wire before; `Sequenced<T>` only documents that invariant. No runtime behavior changed.

**MAINT-09 (Plan 02):** Behavioral-identical refactor. The helper produces byte-identical store state to the old inlined envelope — proven by the helper-equivalence tests. The `withTeamsDerived` non-double-derivation was correctly identified: `setLobby` inside `useGameState` already applies it, so the helper correctly delegates rather than re-deriving. The registered-name teardown array is structurally equivalent to the old explicit off-list.

**MAINT-10 (Plan 03):** The ONLY intentional runtime change is clamping at Sites 2, 2b, and 4. Sites 1, 3, and 5 produce byte-identical output (pre-clamp at call site + no-clamp helper for Sites 1/5; clamp-equivalence for Site 3). The projectile-render proof test confirms in-bounds coordinates are unaffected. Out-of-bounds coordinates (physically impossible in normal gameplay) now clamp.

**Verdict: No unintended runtime changes. All three plans deliver their stated intent precisely.**

---

## Parallel-Merge Integrity

| Plan | Commits | Status |
|------|---------|--------|
| 51-01 | `b09e4ca` (Task 1), `a2f0b34` (Task 2) | Both in git history |
| 51-02 | `33ed4b6` (Task 1), `0370261` (Task 2) | Both in git history |
| 51-03 | `f9c9ed9` (Task 1), `092034c` (Task 2) | Both in git history |

All 6 commits verified in git log. No files overlap between plans (EXT-04 touched server/shared; MAINT-09 touched client/socket; MAINT-10 touched client/hooks+components). Cross-plan type dependency (`Sequenced<T>` → handler signatures) holds: `tsc` clean after merge with 0 errors.

**Test count arithmetic:** Plan 01 baseline was 938; Plan 01 ran at 939 (baseline + 1 parity test). Plan 02 added 13 tests (938 → 951). Plan 03 added 11 tests (938 → 949). Final merged count: 938 + 1 + 13 + 11 = 963 — confirmed by live `npm test` run.

**Verdict: Parallel-merge integrity confirmed. No lost or doubled artifacts.**

---

## Requirements Coverage

| Requirement | Plan | Status | Evidence |
|-------------|------|--------|----------|
| EXT-04 (compile-time event contract) | 51-01 | SATISFIED | `keyof` constraints on 3 methods; 2 `satisfies` guards; parity test |
| MAINT-09 (handler helpers + teardown) | 51-02 | SATISFIED | `eventHandlerUtils.ts` with 3 exports; 33 helper calls; teardown-parity test |
| MAINT-10 (coordinate helpers) | 51-03 | SATISFIED | `worldToPercent`/`percentToWorld` in `useViewport.ts`; all sites converted; 11 tests |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No `TBD`, `FIXME`, `XXX`, `TODO`, or placeholder patterns found in any files modified by this phase. All helper implementations are substantive (not stubs). The `void _BRIDGE_COVERAGE` pattern is the correct form for a compile-time-only guard — not a stub.

---

## ROADMAP SC3 Wording vs Implementation Note

The ROADMAP SC3 reads "~40 uniform handlers" and "~7 intentionally-non-standard". The RESEARCH audit (which post-dates and supersedes the ROADMAP estimate) settled on 17 pure-setLobby + 11 mixed-setLobby + ~21 non-standard = 50 total. Implementation used 33 helper calls for 28+ events and 21 explicit `socket.on` calls. The ROADMAP wording was an early estimate; the RESEARCH audit and 51-02 PLAN reflect the authoritative breakdown. The SC3 SUBSTANCE is satisfied: helpers own the seq-guard+null-check+setLobby envelope for all uniform handlers; non-standard handlers stay explicit; teardown drift is structurally impossible. This is not a gap — the numbers differ from the ROADMAP estimate only because the RESEARCH audit refined the classification.

---

## Human Verification Required

None. All phase behaviors are compile-time (EXT-04) or unit-testable mechanical refactors (MAINT-09/10). The VALIDATION.md confirms no manual-only verification items for this phase.

---

## Gaps Summary

No gaps. All 4 ROADMAP success criteria are verified against live code. The phase delivers:
- A genuine 3-layer drift-catch contract (call-site `keyof`, bridge `satisfies`, schema `satisfies` + runtime count)
- Type-identical `Sequenced<T>` wrapper on ~40 events with 4 control messages explicitly excluded
- 7 domain-union substitutions (ItemType ×4, AvatarClass ×3); non-goals explicitly unchanged
- Helper collapse of ~28 handlers with structural teardown safety
- Consistent coordinate clamping at all projectile emit sites, documented and tested

---

_Verified: 2026-06-23T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
