# ScrumQuest — Maintainability & Extensibility Improvement Plan

*Adversarial code-review council synthesis — 2026-06-21*

> **Method:** 76-agent adversarial council. 6 reviewers (one per lens: architecture, god-components, state, type-contracts, testing, extensibility) → every finding challenged by a skeptic + a dedicated performance guardian → chair synthesis. 34 raw findings, **32 survived** adversarial verification. The performance guardian set `blocksChange=false` on **every** finding — nothing requires a perf-safe redesign before proceeding.

## Executive Summary

ScrumQuest is functionally rich but carries the structural debt profile of a fast-evolving real-time game: a half-finished migration from a monolithic `GameState` god-class to fine-grained domain managers, two client god-components (`Lobby.tsx` at 2862 lines, `PlayerController.tsx` at ~1175 lines), and a hand-maintained event-bridge contract that links five files with no compile-time check.

The encouraging finding: **every** verified item passed the performance guardian with `blocksChange=false`. Nothing in this plan requires a perf-safe redesign before it can proceed — the constraints are about *sequencing and scope*, not about avoiding regressions. The "Deferred — Performance-Sensitive" section below is therefore short by design; it captures the handful of items where a guardian flagged a guardrail to honor, not a blocker.

The work splits into three leverage tiers, and the dominant meta-finding is that **adversarial verification repeatedly narrowed the original proposals** — phantom duplications were debunked, mis-targeted fixes were corrected, and sequencing was reordered (consolidate state into refs/reducers *before* extracting hooks; add missing payload fields *before* adding handler branches).

Two live correctness bugs surfaced and should ship **immediately**, independent of any refactor:

1. The **Technical Debt Golem** boss silently runs **Bug Hydra's AI** because a sprite filename mismatch makes `getBossTypeFromSprite` return `null`.
2. Eight class **ability buff/shield/debuff effects are silently dropped** — the handler branches were never written and `AbilityManager` never forwards the needed payload fields.

---

## Biggest Levers

> **Lever 1 — Collapse the dual source-of-truth stores.** Boss HP, player combat HP, lobby/team membership, and client boss state each live in two places that never reconcile, forcing every handler to hand-mirror writes (inconsistently). This is the largest source of per-handler correctness traps *and* the biggest extensibility tax. Ranks 3, 4, and 8 attack it directly; the team-derivation helper (rank 3) alone collapses 5+ hand-written mirror blocks and closes existing staleness bugs.

> **Lever 2 — Finish the GameState → domain-manager migration, in order.** Both singletons run live with aliased `Lobby` object refs, dead duplicate methods, and a latent reconnect correctness risk. Decommissioning is high-value but must be sequenced (fix the alias bug first, delete proven-dead code, migrate settings cleanly, then STOP before battle methods). Ranks 9 and 10.

> **Lever 3 — Close the type-contract gaps so a refactor mistake is a `tsc` error, not a production drift bug.** Adding a fine-grained event is 5-file shotgun surgery with no type linking the copies — the exact path that shipped the C1/C2/C3/C5 drift bugs. A cluster of zero-runtime `satisfies` guards, union substitutions, and a `Sequenced<T>` wrapper (rank 13) turns silent drift into compile failures.

---

## Theme 1 — Dual Source-of-Truth State Stores

The same data lives in two places that never reconcile. The mirrors are *inconsistent* — some handlers write both stores, some only one — producing silent divergence and at least two confirmed live bugs.

### Boss HP: two pools, two formulas
- `server/gameState.ts` L1849-1850 — `attackBoss` drains `lobby.boss.currentHealth`.
- `server/domains/CombatManager.ts` L437/L1727/L1766 — ability/combo paths drain a separate `combatState.boss.hp` with a different max-HP formula.
- **Live bug:** only CombatManager paths call `bossAI.checkPhaseTransition`, so basic attacks that zero `lobby.boss.currentHealth` never trigger phase 2/enrage and may leave the boss in a zombie state.
- **Fix (rank 4):** add `combatManager.applyBasicDamageToBoss`, route `attackBoss` through it, make `lobby.boss` a projection, set `defeated` only from CombatManager. **Remove the manual `eventBus.emit('combat:boss_damaged')` at `websocket.ts` ~L1169 when delegating** or you double-emit.

### Player combat HP: gameState vs CombatManager
- `gameState.playerCombatStates` (record, ~34 refs) vs `CombatManager.LobbyCombatState.players` (Map).
- **Concrete risk:** `websocket.ts:251` reads gameState's store for the revival `newHp` *after* CombatManager applied the downing damage to *its* store — so a player downed by a boss-AI attack broadcasts stale HP on revive.
- **Action:** add a characterization test pinning the divergence before any consolidation. Do **not** delete `attackBoss(_damage)` — it is live at `websocket.ts:1152`; the `_` prefix is intentional (server recomputes damage).

### Lobby/team denormalization (rank 3 — highest ROI in this theme)
- `shared/gameEvents.ts:61-62` — `Lobby` holds both `players: Player[]` and `teams: Record<TeamType, Player[]>`.
- Three subtly-different hand-written mirror strategies across handlers, **plus two handlers missing the mirror entirely** (`session:avatar_selected`, `session:host_changed`) causing live staleness, **plus** a push-before-map bug in `session:team_changed` (teams[newTeam] holds a player still carrying the old team value).
- **Fix:** `withTeamsDerived(lobby): Lobby` recomputing `teams` from `players`, threaded through **every** player-mutating `setLobby`. Unit-test it; add a `team_changed` regression test.

### Client boss state: currentBoss vs currentLobby.boss (rank 8 follow-on)
- `combat:team_attack` and `combat:minion_heal_boss` write only `currentBoss`, but `BattleScreen` passes `currentLobby.boss` to `BossDisplay` — so HP bar goes **stale** after team attacks/minion heals.
- **Immediate fix:** add the `setLobby` boss mirror to those two handlers. **Long-term:** migrate `BossDisplay` to read `currentBoss` and drop the mirror everywhere (a consumer change, larger than "small").

---

## Theme 2 — Unfinished GameState → Domain-Manager Migration

`server/gameState.ts` (2140 lines, singleton at L2136) and `server/domains/index.ts` manager singletons both run live. `websocket.ts` routes lobby/team/avatar through `sessionManager` but battle/heal/revive/reveal through legacy `gameState`, with **aliased `Lobby` object refs** shared between the two maps via `syncPlayerToLobby` (L691-698).

### Decommission order (rank 9)
0. Header comment in `gameState.ts`: LIVE vs TEST-ONLY vs DEAD methods.
1. **Fix the live bug first:** `syncPlayerToLobby` currently skips registration if the key exists → stale alias on reconnect. Make it `set` unconditionally.
2. After auditing identical `Lobby` shapes, delete the proven-dead `createLobby`/`joinLobby`/`removePlayer`/`updatePlayerTeam`/`updatePlayerAvatar`; repoint the one test.
3. Migrate `updateTimerSettings`/`updateJiraSettings`/`updateEstimationSettings` into `SessionManager` (clean cut, no shim).
4. **STOP.** Do not shim-migrate `attackBoss`/`startBattle`/`submitScore`/`revealScores` — that needs an ownership-transfer design (shims risk triple-dispatch on shared mutable state).

### Background loops are migration symptoms (rank 10)
- `gameState` runs a redundant revival watchdog (constructor L62-64) shadowing CombatManager's per-session timers; the `websocket.ts` watchdog (L244-278) drives the *legacy* `processRevivalSessions`. Route all revival through CombatManager → both watchdogs disappear, two 100ms ticks collapse to zero.
- The disconnect sweeper needs `io` only because no `session:host_transferred` event exists. Add it to the eventBus contract; bridge it; remove the `io.to(...).emit` from `websocket.ts`.
- Leave the `attack_boss` handler (thin glue — branching lives in `gameState.attackBoss`) and the io-coupled position batcher alone.

---

## Theme 3 — Client God-Components

`Lobby.tsx` (2862 lines) and `PlayerController.tsx` (~1175 lines) fuse input, 60fps movement, networking, animation, a buff state machine, a 300-line magic-effect dispatcher, and 1000+ lines of JSX.

### What the council debunked (do NOT do)
- The two `LOBBY-WIDE SPELLS` blocks (L998, L1512) are **not** copy-paste drift — they are a deliberate self/peer dual-path (local fast-path adds `setFlyHeight(0)`, uses `myPosition` directly). Do not unify into a single hook.
- The afterimage "duplication" (L565 vs L621) is two distinct triggers (movement tick vs jump arc). Leave both.
- The descriptor-driven settings form fights the structurally-distinct sections (conditional sub-forms, T-shirt grid). Keep hand-rolled JSX.
- Full `useLobbyInput`/`useLobbyActions` abstraction adds indirection without reducing coupling — skip.

### Verified extractions (rank 11, safest-first)
1. **`applySpellEffects` + `resolveTargets`** — the *genuine* duplication is `resolveTargets` (L817 and L1310) and the near-identical remote/local emote spell blocks. Highest ROI, zero perf risk, ~400→~200 lines. Pairs with the magic-effect `useReducer` (rank 6).
2. **`TavernLighting`** (L119-181, zero props/closure) → own file. Minutes.
3. **`LobbySettingsDialog`** → flat sibling `client/src/components/game/LobbySettingsDialog.tsx`. **Preserve the host+phase guard inside `onEstimationUpdate` exactly** — do not homogenize the three handlers.
4. **`LobbyAvatar`** presentational component — use explicit props (`showInvisibleBadge`, `showReadyBadge`, scalar movement props, `interactive`), **not** a single `isLocal` flag (three real divergences: 👻 only on local, ✓ ready only on others, different movement data source). Extract `computeSizeScale` as a pure helper first.
5. **`useLobbyMovement` LAST**, only after buff refs (rank 7) are in place; confirm render counts with React DevTools profiler.

### Magic-effect dispatcher (rank 6)
Consolidate the **13 useState slots** into one `useReducer` (`BuffState`/`BuffAction`), then replace the ~300-line if-cascade with `detectedEffects.forEach(e => dispatch(buildAction(e, resolveTargets(e))))`. Reject the originally-proposed ctx-object registry — `buildAction` plays that role without coupling to state setters. Enables pure reducer tests and a one-action `DISPEL_ALL`.

### Movement interval churn (rank 7)
The 16ms movement `useEffect` (Lobby.tsx:593) lists six buff Sets **plus `jumpState.jumpHeight`** as deps — and `jumpHeight` updates every frame during a jump, recreating the interval at 60fps while airborne. Promote buff Sets and `jumpHeight` to refs (mirror the existing `flyingPlayersRef` pattern at L258-267); collapse the dep array to `[keys.size > 0, currentLobby?.gamePhase, emit, currentPlayer?.id]`. Same `currentDirection`-as-ref fix in `PlayerController.tsx`. Add a fake-timers test asserting one interval per movement session.

### PlayerController dedup (rank 15)
Ctrl-shoot logic is copy-pasted **verbatim three times** (L108-175, L712-765, L924-978) → extract `handleShootAtTarget`. Two cooldown tickers (L189-197, L700-708) → `startCooldown`. Treat hook extraction as optional (the input/combat/targeting three-way data dependency means hooks add indirection without removing coupling).

---

## Theme 4 — Hand-Maintained Event Contract (no compile-time linkage)

Adding a fine-grained event touches five files (`DomainEventMap`, `ServerToClientEvents`, `ClientEventEmitter` bridge, client dispatch, client teardown) with **no type cross-checking the copies** — the exact gap that shipped C1/C2/C3/C5.

### Surgical, independent guards (rank 13 — all type-only, zero runtime)
- **Untyped escape hatch (highest value):** `emitFineGrained`/`emitToLobby` take `event: string`; ~20 `websocket.ts` call sites bypass the contract. Constrain to `keyof ServerToClientEvents`.
- **Bridge coverage:** add a `satisfies` guard after `setupInternalEventListeners` mapping bridged events against the wire-bound `DomainEvent` union (exclude server-internal events).
- **Inbound schema parity:** add `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>` at `socket-schemas.ts:737` (drop the `Object.fromEntries` runtime hack) + a contract test asserting key-set parity. *Counts are currently in perfect parity (48/48) — this prevents future drift.*
- **Wire unions:** `itemType: ItemType` (`use_item`, `item:awarded/used/effect_applied`), `avatar: AvatarClass` (`combat:minion_spawned`), `avatarClass: AvatarClass` (`class_mastery:*`). **Reject** `bossType` (server-private type) and the originally-cited minion `attackType` (wrong values — actual is `'attack'|'debuff'`, not `'light'|'heavy'|'special'|'aoe'`).
- **`Sequenced<T>` wrapper:** define once, wrap the ~40 fine-grained events; **exclude control messages** (`system:missed_events`, `server_shutdown`, `connection_lost`, `reconnect_attempt`) and comment the exclusions.

> Do **not** attempt a generic bridge that unifies all five locations — the payload transforms (field renames, vote masking, timestamp arithmetic) are semantically load-bearing.

### Teardown drift (rank 12, part)
The off-list (`eventHandlers.ts:979-1048`) is a hand-synced parallel registry. A registered-name array consumed by one teardown loop removes it; alternatively a CI test cross-checking `on()` vs `off()` counts is lower-risk than a dynamic registry.

---

## Theme 5 — Client Handler & Coordinate Boilerplate

### Synced-handler envelope (rank 12)
~50 handlers copy-paste `handleEvent/processed/getState/setLobby`, burying the one line that matters and making the seq-ordering invariant *skippable with no compile error*. Introduce **two** helpers in `client/src/lib/socket/eventHandlerUtils.ts`:
- `registerSyncedLobbyHandler(socket, event, (data, lobby) => Partial<Lobby>|null)` — for the ~30 spread-and-setLobby handlers (route through `withTeamsDerived`).
- `registerSyncedHandler(socket, event, (data)=>void)` — for the ~10 that mutate other atoms but still need the guard.

Leave the ~7 intentionally non-standard handlers (`consensus_reached`, `estimate_forced`, `minion_attack`, `youtube_*`, `system:*`) as explicit `socket.on` with their comments. Realistic savings ~300-400 lines (not 600).

### Coordinate conversion (rank 15)
Screen↔percent↔world math is open-coded at **five** sites (PlayerController L51-55, L318-320, L457-458, L534-537 **and** useViewport.ts:146-147) with inconsistent clamping. Extract `worldToPercent` (always clamps — canonical wire write) and `percentToWorld` (never clamps) into `useViewport.ts`; compose with the existing `viewport.worldToScreen`/`screenToWorld`.

---

## Theme 6 — Data-Driven Design Gaps & Live Consistency Bugs

### Boss roster (rank 1 — SHIP NOW)
`gameState.ts:1271` emits `'technical-debt-golem.png'`; `boss-definitions/index.ts:49` keys it `'tech-debt-golem.png'`. `getBossTypeFromSprite` returns `null` → CombatManager falls back to `'bug-hydra'`. **The disk filename is `technical-debt-golem.png`** (canonical everywhere else), so fix `boss-definitions/index.ts:49`, not `gameState.ts`. Follow-up: derive `availableBosses` and `SPRITE_TO_BOSS_TYPE` from `Object.values(BOSS_BEHAVIORS)`.

### Per-class registry (rank 5)
- **Live bug:** `getClassIcon` (`SpriteRenderer.tsx:111`) lists 9 classes, missing `'monk'` → returns default `⚔️`. Fix now.
- Promote `AVATAR_CLASSES` to canonical `Record<AvatarClass, ClassDef>` with `role`/`baseDamage`/`icon`; derive `HEALER_CLASSES` as a filtered view; replace `getClassBaseDamage`'s switch with a lookup. Retype client `AVATAR_IMAGES` to `Record<AvatarClass,string>` (**keep client-side — do not add `imagePath` to the shared module the server imports**). `CLASS_ABILITY_CONFIGS` is already `Record`-typed — leave it.

### Ability effect handlers (rank 2 — SHIP SOON)
Eight abilities emit `ability:effect_applied` with `effectType` `'buff'`/`'shield'`/`'debuff'` but the handler (`domains/index.ts` L420-457) only implements `damage`/`heal`/`taunt` → effects silently evaporate. **Two ordered steps:**
1. Extend `AbilityEffectAppliedPayload` with `buffType?`/`debuffType?`/`durationMs?` and have `AbilityManager.applyAbilityEffect` forward them.
2. Add the missing branches (read payload fields, don't hardcode); extract the duplicated heal loop into one `applyHealEffect`. Also audit the item handler's hardcoded `buffType:'damage_boost'`.

### Buff-type magic strings (rank 16, part)
Narrow `AbilityDefinition.buffType`/`debuffType` from bare `string` to literal unions matching the values actually used. Skip the `Record<BuffType, BuffApplicator>` dispatch table — only two buff types have runtime logic; a table is premature.

---

## Theme 7 — Testability Seams (rank 14)

Production-shipped behavior is exercised by **zero** unit tests because instantiating it requires a live socket or the eager singleton.

- **GameState singleton** starts `setInterval` watchdogs on import → tests do `as any` private surgery and leak timers. Fix: `export { GameStateManager }`, constructor `opts {startWatchdogs?:boolean}` (default true), promote `handleVotingTimeout` to public. Then tests use `new GameStateManager({startWatchdogs:false})` with no cast. (Effort: low — three keyword-scale changes.)
- **`domains/index.ts` monkey-patch** replaces `combatManager.applyDamageToPlayer` at module scope → CombatManager's own tests get the *unpatched* method, so shield absorption ships untested. Replace with a first-class `damageInterceptor` dep; **verify all seven internal `this.applyDamageToPlayer` call sites route through it** (else shield silently breaks for boss AoE). Then extract module listeners into `wireDomains(deps):{dispose()}`.
- **`websocket.ts` inline closures** — make domain singleton imports injectable at the `setupWebSocket` call site (optional params), add a server-side `makeMockSocket`, unit-test the three high-value handlers (`create_lobby`, disconnect/host-transfer, `reconnect_with_token`) via the proven client mock-socket pattern. **Do not** do the full `HandlerCtx` overhaul.

---

## Prioritized Action Table

| # | Title | Category | Sev | Effort | Perf | Key sequencing note |
|---|-------|----------|-----|--------|------|---------------------|
| 1 | Fix Tech Debt Golem AI (filename) | extensibility | high | small | none | Ship now — fix `boss-definitions/index.ts:49` |
| 2 | Implement missing ability buff/shield/debuff handlers | both | medium | medium | low | Payload fields FIRST, then branches |
| 3 | `withTeamsDerived` team projection | both | high | medium | none | Include the 2 unmirrored handlers |
| 4 | CombatManager = single boss-HP truth | both | high | medium | low | Remove manual emit at ~L1169 |
| 5 | Class union + `Record<AvatarClass>` registry | both | high | medium | none | Fix monk icon now; keep imagePath client-side |
| 6 | Magic-effect `useReducer` + `buildAction` | extensibility | high | medium | none | Consolidate 13 useStates first |
| 7 | Stop movement-interval churn (refs) | maintainability | medium | medium | low | `jumpHeight` is worst offender |
| 8 | Field-scoped Zustand selectors | both | medium | medium | low | Fix PlayerController parent + PlayerCharacter together |
| 9 | Decommission dead GameState + alias fix | both | high | large | none | Fix `syncPlayerToLobby` before deleting; STOP before battle methods |
| 10 | Finish revival migration + `host_transferred` | both | medium | medium | low | Depends on #9 |
| 11 | Decompose Lobby.tsx (verified seams) | both | high | large | medium | Spell-dedup first; movement hook LAST (after #7) |
| 12 | `registerSyncedLobbyHandler` helpers | maintainability | medium | medium | none | Two helpers; leave non-standard handlers inline |
| 13 | Close event-contract compile-time gaps | extensibility | high | medium | none | Untyped emit first; reject bossType/wrong attackType |
| 14 | Testable singletons/wiring | both | high | medium | none | Replace monkey-patch (verify all 7 call sites) |
| 15 | Coordinate helpers + PlayerController dedup | maintainability | low | small | low | 5 sites incl. useViewport.ts |
| 16 | Bridge timer tests + remove `avatar_selection` | maintainability | low | medium | none | 4 live callsites — sequence the removal |

---

## Deferred — Performance-Sensitive

No finding had `blocksChange=true`; nothing is blocked pending a perf-safe redesign. The items below are **not deferred** but carry guardian guardrails that **must be honored during implementation** — treat these as acceptance criteria, not blockers:

- **Lobby.tsx decomposition (rank 11) — perf risk: medium.** Move `dpr` + `PerformanceMonitor` *inside* the extracted scene component so `<Canvas>` is never a controlled prop-receiver (else the WebGL context re-mounts on dpr changes). Wrap the extracted scene in `React.memo`. Do not lift any new state above the Canvas boundary.
- **Movement-interval refs (rank 7) & PlayerController (rank 15) — perf risk: low.** Pass buff state as **individual ref-backed parameters**, never an aggregated object literal (a fresh object reference every render would recreate the 16ms interval up to once per frame). Promote `keys`, `currentDirection`, and `jumpHeight` to refs. Acceptance criterion: a `setInterval`-recreation counter shows no increase before/after; profile with keyboard held 5s.
- **Zustand selectors (rank 8) — perf risk: low.** Select scalar primitives, not object slices (`playerCombatStates` is spread anew on every `setLobby`, defeating strict-equality). Use `useShallow` (not yet imported) only for multi-field destructures. Fix `PlayerController`'s whole-store subscription at the same time as `PlayerCharacter` so `React.memo` can actually bail out.
- **CombatManager boss-HP delegation (rank 4) — perf risk: low.** Remove the manual `eventBus.emit('combat:boss_damaged')` at `websocket.ts` ~L1169 when delegating, or every basic attack double-emits (double XP / double client HP update).
- **In-emit schema validation (rank 13, optional) — perf risk: low.** If validating payloads inside `emitToLobby`, gate strictly behind `process.env.NODE_ENV !== 'production'` and protect the gate with a lint rule — Zod traversal on every emit would add allocation pressure at broadcast fan-out. The offline spy-based contract test has zero production cost and is preferred.
- **Ability effect handlers (rank 2) — perf risk: low.** Keep the heal hp-clamp loop byte-identical when extracting `applyHealEffect`; it feeds the `combat:player_healed` broadcast. Keep registry handlers synchronous to preserve React 18 batching for the 7-setState `dispel` path.

---

## Suggested First Sprint

A high-value, low-coordination opening batch that unblocks later work and ships two bug fixes:

1. **Rank 1** — Golem filename (minutes, ships a gameplay fix).
2. **Rank 5** (monk icon portion) + **Rank 2** — close the silent-drop ability/class bugs.
3. **Rank 3** — `withTeamsDerived` (closes staleness bugs, collapses 5 blocks, prerequisite for rank 12).
4. **Rank 14** — testability seams (no runtime change; the safety net every larger refactor needs).
5. **Rank 7** — movement refs (prerequisite for the Lobby movement-hook extraction in rank 11).

Then proceed to the state-truth consolidation (ranks 4, 8), the GameState decommission (ranks 9-10), and the god-component decomposition (rank 11) with characterization tests in place.
