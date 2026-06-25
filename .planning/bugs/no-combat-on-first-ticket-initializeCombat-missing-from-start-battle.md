---
title: First ticket of a battle has no live combat — initializeCombat only runs on next_level
discovered: 2026-06-24 (Phase 47-52 UAT, while setting up the revival test)
severity: high (breaks all live-combat features on the first ticket: boss attacks, player downing, revival, real boss damage — and was the trigger for the server-crash bug)
status: ROOT-CAUSED, NOT fixed — fix recommended below, needs validation vs estimation-driven boss defeat
area: server / combat lifecycle (CombatManager init) + battle phase wiring
reporter: Penelope (host) + investigation during UAT
---

# Bug: combat (BossAI + combat state) is never initialized for the first ticket

## Symptom (live)

In a single-ticket battle: the boss sits at full HP and never moves — player
attacks (`Ctrl`/click → `attack_boss`) do **nothing** to its HP, and the boss
**never attacks players**, so no one can be downed. (Confirmed via probe: boss
173/173 before and after 6 attacks; no player HP change.) With one ticket the boss
is then "defeated" purely by estimation consensus → straight to victory; combat
never happens at all.

## Root cause

`CombatManager.initializeCombat()` (server/domains/CombatManager.ts:419) is what
creates the **BossAI** (L434) and the combat state (`combatStates.set`, L513). The
boss only attacks, and players can only deal/take combat damage, once that state
exists — otherwise `applyBasicDamageToBoss` throws `CombatNotActiveError`
(CombatManager.ts:540).

`initializeCombat` is called from **exactly one** production site:
`server/websocket.ts:1198`, inside the **`next_level → battle`** transition (advancing
to the *next* ticket). It does `combatManager.cleanupLobby(lobbyId)` then
`combatManager.initializeCombat(lobbyId, players, ticketIndex, lobby.boss?.sprite)`.

The initial battle path — `start_battle` handler (websocket.ts:874) →
`gameState.startBattle()` (gameState.ts:582) — sets `lobby.boss`, scales display HP,
and calls `startVotingPhase()`, but **never calls `initializeCombat`**. So:

- **Ticket 1:** no combat state → boss inert, attacks no-op, `attack_boss` throws
  `CombatNotActiveError` (this was the uncaught throw that crashed the server — see
  `attack-boss-during-voting-crashes-server.md`; now guarded).
- **Ticket 2+:** the `next_level` transition runs `initializeCombat`, so combat is
  finally live.

## Is it a bug or intended? → Likely a bug (oversight)

Evidence it's unintended:
- `git log -S "initializeCombat" -- server/gameState.ts` is **empty** — startBattle
  never had it, so this isn't a regression; it's been missing since the feature was
  built (`feat(04-06)` / `feat(06-05)`).
- **No** comment / design doc anywhere states "first ticket is estimation-only"
  (grep for first-ticket/warmup/estimation-only/level-2 found nothing relevant).
- The **client shows the full combat HUD** on ticket 1 (boss HP bar, "Special Attack
  Ready", "Hit Tab for controls") and **lets the player attack** — i.e. the client
  expects combat to be live. That mismatch is precisely what produced the server
  crash.
- The `next_level` path's shape (`cleanupLobby` + `initializeCombat`) looks like the
  canonical "enter a battle" setup that `start_battle` simply forgot to mirror.

## Recommended fix

Mirror the `next_level` setup in the initial battle path: after `gameState.startBattle`
succeeds, call `combatManager.initializeCombat(lobbyId, players, ticketIndex=0,
lobby.boss?.sprite)` (with a `cleanupLobby` first for safety). Cleanest spot is the
`start_battle` websocket handler (websocket.ts ~L914, right after the startBattle
result is validated) so it has `lobby.players` and the boss sprite.

### Caveat to validate before shipping
There are TWO boss-HP concepts:
- `lobby.boss` (created in `startBattle` via `createBossFromTickets`, ~173 HP) — the
  **estimation-facing** boss that's defeated by story-point consensus.
- the `CombatManager` boss (created in `initializeCombat` via a different formula) —
  the **combat-facing** HP that `attack_boss` damages.

On ticket 2+ both already coexist, so initializing combat on ticket 1 only makes
ticket 1 consistent. But confirm the two HP pools / the boss-defeat-by-estimation
path don't fight each other when combat is live on the first ticket (phase
transitions, victory trigger, enrage thresholds). Add an integration test that
starts a single-ticket battle and asserts `attack_boss` damages the boss and the
boss AI attacks (no `CombatNotActiveError`).

## Blocks
- UAT Test 11 (boss combat: attacks land, projectiles, HP decrements) — only testable
  from ticket 2 today.
- UAT Test 12 (healer-only revival) — needs a downed player → needs live combat →
  ticket 2 today.
- Relates to: `attack-boss-during-voting-crashes-server.md` (the crash this triggered,
  now guarded at the socket boundary).
