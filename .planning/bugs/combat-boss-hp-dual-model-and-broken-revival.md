---
title: Dual boss-HP model (combat vs estimation) breaks the HP bar and the down/revive lifecycle
discovered: 2026-06-25 (live on prod during Phase 47-52 UAT Test 12)
severity: high (broken boss HP display + revival not working once combat is live)
status: BOSS HP FIXED 2026-10-24 (combat model is the source of truth; lobby.boss mirrors it, see .planning/debug/dual-boss-hp-model.md). REVIVAL STILL BROKEN in real games, root-caused separately in combat-never-starts-vote-cast-not-emitted-and-split-player-hp.md.
area: server / combat boss HP reconciliation + revive lifecycle; client boss HP display
reporter: Preston (live prod) + investigation
---

# Two boss-HP models collide; revival doesn't fire once players are downed

## Live prod symptoms (lobby 7DG3TN, 3 players)

- Boss HP bar showed **`2145 / 173`** (aria-valuenow=2145 over valuemax=173 → bar overflows ~1240%).
- Player **basic attacks did not visibly reduce** the boss bar toward death (and the value
  even sat static for a while, then dropped 2145→1214 as combat damage applied).
- The boss **did** attack players (HP 100 → Bram 51 / Cade 44 → eventually both **0**).
- With both helpers at **0 HP**, the Cleric host pressing **Q (heal_party / revive) did
  NOTHING** — the downed helpers were not revived.

## Root cause — TWO unreconciled boss-HP models

1. **lobby.boss** — the displayed / estimation-facing boss. `createBossFromTickets`
   (gameState.ts:1011): `baseHealth = tickets*100`, `participantScaling = sqrt(players)`,
   `scaledHealth = round(base * scaling)` → **173** for 1 ticket × 3 players. Client receives
   this via `battle_started`; its `maxHealth=173` is what the HP bar's max uses.

2. **CombatManager combat boss** — created by `initializeCombat` (CombatManager.ts:448):
   `bossMaxHp = BASE_HP_PER_PLAYER(1000) × activePlayers × ticketMult × levelMult` → **~3000**
   for 3 players. This is the HP that `attack_boss` damages and that `combat:boss_damaged`
   (CombatManager.ts:560) pushes to the client.

The client's boss object ends up with `maxHealth = 173` (lobby.boss) but `currentHealth =`
the combat boss's value (3000→2145→1214 as it's damaged). Hence `2145/173`. The two were
**never reconciled**: one is `sqrt(players)*100`, the other `1000*players`.

This mismatch already existed wherever `initializeCombat` ran — i.e. **ticket 2+** (the
`next_level` path). The `start_battle` initializeCombat fix (e9a09ce) made ticket 1 behave
like ticket 2+, which is why it became visible now. The fix is not *wrong* — it exposed a
pre-existing inconsistency that should be fixed for all tickets.

## Broken revival (needs its own verification)

Both helpers reached 0 HP but `heal_party` (Cleric Q) did not revive them. Likely related —
the down→revive lifecycle (`combat:player_downed` → `healParty`/`revive_start` →
`combat:player_revived`) is not completing in this combat state. Possible angles:
- Players hitting 0 HP may not be transitioning to a proper `downed` (revivable) combatState,
  so `healParty`'s revive branch (gameState.ts:821) finds nothing to revive.
- `heal_party` may require the cleric to be in `fighting` state (did the host vote/enter
  battle?). Needs confirmation.
- Could also be pre-existing on ticket 2+. UNVERIFIED — reproduce locally.

## Fix plan (fix-forward — do locally with the dev server, full testing)

1. **Reconcile the boss HP models.** Pick ONE source of truth. Recommended: have
   `initializeCombat` use the already-computed `lobby.boss.maxHealth` for the combat boss
   (pass it in) instead of its own `1000*players` formula — so the combat boss and the
   displayed boss share one number, and `attack_boss` visibly drains the same bar. Apply to
   BOTH call sites (start_battle + next_level). Re-check enrage/phase thresholds, which read
   `boss.hp/boss.maxHp`.
   - Alternative: keep the combat formula but sync `maxHealth` to the client when combat
     initializes (emit the combat boss's maxHp). Messier; estimation-defeat then mismatches.
2. **Verify + fix the down/revive lifecycle** on a live local battle: drive a player to 0 HP,
   confirm `combat:player_downed`, then confirm a healer (Cleric heal_party AND a
   Bard/Paladin proximity `revive_start`) revives them and a non-healer is rejected
   (RevivalNotAllowedError) — i.e. complete UAT Test 12 locally.
3. **Add integration tests** for: boss HP bar consistency (one model), player-down event on 0
   HP, healer-revive success, non-healer-revive rejection.
4. Only then deploy. (Prod currently runs e9a09ce with the dual-HP visible on ticket 1, per
   user decision to fix-forward rather than revert.)

## Related
- `no-combat-on-first-ticket-initializeCombat-missing-from-start-battle.md` — the fix that
  surfaced this.
- Server-side unit tests for revival enforcement (Phase 50) pass; the gap is the live
  end-to-end down→revive flow.
