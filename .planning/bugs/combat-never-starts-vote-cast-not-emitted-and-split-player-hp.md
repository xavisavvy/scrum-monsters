---
title: Live combat never starts (internal estimation:vote_cast is never emitted), and player HP is split across two models
discovered: 2026-10-24 (live local verification of the dual boss-HP fix)
severity: high (the boss AI never attacks, Cleric revive can never work, and projectile hits can end the game with no visible downs)
status: ROOT-CAUSED, not fixed
area: server / combat lifecycle (battle entry) + player HP (gameState vs CombatManager)
reporter: investigation while verifying dual-boss-hp-model
---

# Combat never starts, and players have two HP models

Found while live-testing the boss-HP fix (`.planning/debug/dual-boss-hp-model.md`) on a local dev
server with three scripted players. This explains why UAT Test 12's "Cleric Q did nothing" is still
broken after `7e46145`.

## Bug 1: nothing puts players into the fight

`CombatManager` only starts the boss attack loop and the modifier loop on a player's first *battle
entry*. Battle entry is triggered by the internal domain event `estimation:vote_cast`
(`CombatManager.handleVoteCast`, subscribed at `server/domains/CombatManager.ts:213`).

That internal event is only emitted by `EstimationManager.castVote` (`EstimationManager.ts:220`), and
**no production code calls `castVote`**. The real vote path is `submit_score` (`server/websocket.ts`),
which calls `gameState.submitScore` and then `emitFineGrained(lobbyId, 'estimation:vote_cast', ...)`.
That goes to clients only (`ClientEventEmitter`), not onto the internal event bus.

Effects in every real game:
- The boss AI never attacks: no `combat:player_damaged` and no `combat:player_downed` from the boss.
- The battle modifier never ramps.
- The other `estimation:vote_cast` subscribers never fire either: `ClassMasteryManager`,
  `ProgressionManager` and `StatsTracker` (vote XP, mastery and stats). Check whether they
  read votes some other way before assuming they are broken.

Live evidence (2026-10-24): two players voted, then 90 seconds passed with zero `combat:player_damaged`
events. The server log shows no battle entry.

## Bug 2: player HP lives in two places

- Projectile hits that each client reports for itself (`boss_damage_player`, PlayerController.tsx:829)
  go to `gameState.bossDamagePlayer`. That mutates `lobby.playerCombatStates`, emits **nothing** to
  clients, and runs `checkGameOver` against that copy.
- Boss AI attacks, `heal_party` (`CombatManager.healParty`, since `7e46145`), revival and
  `combat:player_*` events all use `CombatManager`'s own `combatState.players`.

So a player downed by projectiles is invisible to the Cleric's revive, and game over can fire while
`CombatManager` thinks everyone is alive.

Live evidence (2026-10-24): a 40-damage `boss_damage_player` produced no `combat:player_damaged`.
100-damage reports on all three players produced `session:phase_changed -> game_over` with **zero**
`combat:player_downed` events.

## Fix direction (to validate)

1. Make `submit_score` emit the internal domain event too, or route the vote through
   `EstimationManager.castVote`, so battle entry and the boss attack loop actually start. This is
   a big gameplay change: the boss starts attacking for real. Play-test the damage and timing.
2. Route `gameState.bossDamagePlayer` through `combatManager.applyDamageToPlayer`, making it the
   single player-HP truth (shield interceptor, `combat:player_damaged`, down timer, revive). Then
   base game over on `CombatManager` state (all active players ghosted or downed) rather than
   `lobby.playerCombatStates`.
3. Then finish UAT Test 12 live: boss AI downs a player, a non-cleric heal_party is rejected
   (`NotHealerClassError`), the Cleric revives.

A scripted 3-player driver that reproduces all of this was used on 2026-10-24: create the lobby,
pick classes and teams, start the battle, vote, attack, then report projectile hits.
