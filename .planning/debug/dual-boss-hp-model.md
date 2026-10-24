---
slug: dual-boss-hp-model
status: boss_hp_resolved; revive_blocked_by_separate_bug
trigger: Dual boss-HP model (combat vs estimation) breaks the HP bar; attack_boss drains an invisible bar
created: 2026-07-27
updated: 2026-10-24
---

# Debug: dual-boss-hp-model

## Symptoms

<DATA_START>

**Expected behavior**
One authoritative boss HP number. The boss HP bar reads `current / max` from the same
model that `attack_boss` damages, so basic attacks visibly drain the bar toward death,
and estimation-driven defeat agrees with the combat model.

**Actual behavior**
Observed live on prod (lobby 7DG3TN, 3 players, Phase 47-52 UAT Test 12):

- Boss HP bar showed **`2145 / 173`** (`aria-valuenow=2145` over `aria-valuemax=173` —
  the bar overflows ~1240%).
- Player basic attacks did **not** visibly reduce the bar toward death. The value sat
  static for a while, then dropped 2145 → 1214 as combat damage applied.
- The boss **did** attack players (HP 100 → Bram 51 / Cade 44 → eventually both **0**).
- With both helpers at 0 HP, the Cleric host pressing **Q** (`heal_party` / revive) did
  nothing — downed helpers were not revived.

**Error messages**
None. No exception, no console error — silent numeric divergence.

**Timeline**
Pre-existing on ticket 2+ (the `next_level` path) since `initializeCombat` was introduced.
Became visible on ticket 1 only after commit `e9a09ce` (`fix(combat): initialize combat on
the first ticket`), which made ticket 1 behave like ticket 2+. The fix is not wrong — it
exposed a pre-existing inconsistency that should be reconciled for all tickets.

**Reproduction**
Start a battle with 3 players, enter the first ticket, and basic-attack the boss. The HP
bar renders a current value far above its own max. Drive players to 0 HP to also exercise
the down/revive lifecycle.

</DATA_END>

## Prior Investigation (already root-caused — do not re-derive)

Full write-up: `.planning/bugs/combat-boss-hp-dual-model-and-broken-revival.md`

**Two unreconciled boss-HP models:**

1. **`lobby.boss`** — the displayed / estimation-facing boss. `createBossFromTickets`
   (`server/gameState.ts:1011`): `baseHealth = tickets*100`, `participantScaling =
   sqrt(players)`, `scaledHealth = round(base * scaling)` → **173** for 1 ticket × 3
   players. The client receives this via `battle_started`; its `maxHealth=173` is what
   the HP bar's max uses.

2. **CombatManager combat boss** — created by `initializeCombat`
   (`server/domains/CombatManager.ts:448`): `bossMaxHp = BASE_HP_PER_PLAYER(1000) ×
   activePlayers × ticketMult × levelMult` → **~3000** for 3 players. This is the HP that
   `attack_boss` damages and that `combat:boss_damaged` (`CombatManager.ts:560`) pushes
   to the client.

The client's boss object ends up with `maxHealth = 173` (from `lobby.boss`) but
`currentHealth =` the combat boss's value. Hence `2145/173`.

**Current signature (confirmed unchanged as of HEAD ce8aa44):**
```
CombatManager.ts:419  initializeCombat(lobbyId, players, ticketIndex = 0, bossSprite?)
websocket.ts:934      combatManager.initializeCombat(updatedLobby.id, combatPlayers, 0, boss?.sprite)
websocket.ts:1208     combatManager.initializeCombat(lobbyId, players, ticketIndex, lobby.boss?.sprite)
```
Neither call site passes a maxHealth — the reconciliation is unimplemented.

## Planned Fix (from the bug doc — validate before applying)

1. **Reconcile the boss HP models.** Pick ONE source of truth. Recommended: have
   `initializeCombat` use the already-computed `lobby.boss.maxHealth` for the combat boss
   (pass it in) instead of its own `1000*players` formula — so the combat boss and the
   displayed boss share one number, and `attack_boss` visibly drains the same bar. Apply
   to BOTH call sites (`start_battle` + `next_level`). Re-check enrage/phase thresholds,
   which read `boss.hp/boss.maxHp`.
   - Alternative: keep the combat formula but sync `maxHealth` to the client when combat
     initializes (emit the combat boss's maxHp). Messier; estimation-defeat then mismatches.
2. **Verify the down/revive lifecycle** on a live local battle: drive a player to 0 HP,
   confirm `combat:player_downed`, then confirm a healer revives them and a non-healer is
   rejected (`RevivalNotAllowedError`).
3. **Add integration tests** for: boss HP bar consistency (one model), player-down event
   on 0 HP, healer-revive success, non-healer-revive rejection.
4. Only then deploy. Prod currently runs `e9a09ce` with the dual-HP visible on ticket 1,
   per the user's decision to fix-forward rather than revert.

**Partially addressed already:** commit `ce8aa44` (`fix(combat): route Cleric heal_party
through CombatManager`) fixed one half of the revival failure — `heal_party` was reading
`lobby.playerCombatStates` while combat damage/downs are recorded only in CombatManager's
`combatStates.players`. `CombatManager.healParty` was added (+2 integration tests). The
live end-to-end down→revive flow is still unverified, and fix-plan step 1 (HP
reconciliation) is untouched.

## Evidence

- timestamp: 2026-07-27T00:00:00Z
  checked: server/domains/boss-ai/BossStateMachine.ts getCurrentPhase/checkPhaseTransition
  found: Phase/enrage thresholds are computed as `hp/maxHp` ratios (>0.66 phase1, >0.33 phase2, else phase3), not hardcoded absolute HP values.
  implication: Changing the maxHp formula is SAFE for phase/enrage triggers — they'll still fire at 66%/33% of whatever maxHp is, so rescaling maxHp doesn't shift trigger points relative to boss health remaining.

- timestamp: 2026-07-27T00:00:01Z
  checked: server/gameState.ts attackBoss (line 1570) and createBossFromTickets (line 1011)
  found: `attackBoss` delegates dev/qa damage to `combatManager.applyBasicDamageToBoss` and writes the returned `newHp` straight into `lobby.boss.currentHealth` (line 1601) — but `lobby.boss.maxHealth` is never touched after `createBossFromTickets` set it to the sqrt-scaled estimation value (173). This is the exact mechanism producing `2145/173`: currentHealth tracks the combat model (~3000 max), maxHealth stays pinned to the estimation model (173).
  implication: Confirms root cause exactly as stated in Prior Investigation. Also line 1615 `lobby.boss.currentHealth < lobby.boss.maxHealth * 0.3` (ring-attack threshold) is silently broken by the same mismatch — currentHealth is almost always >> maxHealth*0.3 until near-total combat defeat. This resolves itself once the two models share one maxHp.

- timestamp: 2026-07-27T00:00:02Z
  checked: server/websocket.ts start_battle handler (~914-937) and next_level handler (~1170-1229)
  found: Both handlers have a valid, freshly-computed `lobby.boss` (with correct `.maxHealth`) available at the exact moment they call `combatManager.initializeCombat(...)`. For next_level, `lobby.boss` was already reassigned to the NEXT ticket's boss at gameState.ts:1522 (inside the full-consensus handler) before the phase flips to `next_level` — so `lobby.boss.maxHealth` is valid and correct at both call sites, not stale.
  implication: Both call sites can safely thread `lobby.boss.maxHealth` / `boss.maxHealth` into `initializeCombat` as an override.

- timestamp: 2026-07-27T00:00:03Z
  checked: client/src/lib/socket/eventHandlers.ts combat:boss_damaged handler (line 413)
  found: Client only ever updates `currentHealth` from `combat:boss_damaged`; `maxHealth` comes from the boss object set at battle_started / session:game_reset time (i.e., `lobby.boss.maxHealth`) and is never overwritten by combat events.
  implication: A server-only fix is sufficient — once the combat boss's initial/max HP equals `lobby.boss.maxHealth`, `combat:boss_damaged`'s `newHp` values will already be in the same numeric range the client renders as max. No client changes needed.

- timestamp: 2026-07-27T00:00:04Z
  checked: server/domains/CombatManager.test.ts initializeCombat describe block (lines 53-169)
  found: Existing unit tests call `initializeCombat(lobbyId, players, ticketIndex)` with no 5th arg and assert the internal `1000*players*ticketMultiplier*levelMultiplier` formula (e.g. maxHp=3000 for 3 players, 3600 for ticketIndex=4, 2000 filtering spectators).
  implication: Adding an OPTIONAL override param (used only when the caller supplies a positive number) preserves all existing unit test behavior while fixing both production call sites, which will now always pass `lobby.boss.maxHealth`.

## Eliminated

(none — root cause was pre-confirmed by prior investigation; evidence above validates it against current HEAD without contradiction)

## Current Focus

reasoning_checkpoint:
  hypothesis: "initializeCombat (CombatManager.ts:448) computes its own 1000×activePlayers×ticketMult×levelMult boss maxHp instead of using the already-computed lobby.boss.maxHealth (gameState.ts:1039, sqrt-scaled). attackBoss (gameState.ts:1601) projects the combat model's currentHealth into lobby.boss.currentHealth but never touches lobby.boss.maxHealth, so the client renders combat-model current HP against estimation-model max HP, producing the 2145/173 overflow."
  confirming_evidence:
    - "gameState.ts:1601 `lobby.boss.currentHealth = newHp` (combat model) directly adjacent to `lobby.boss.maxHealth` never being reassigned after createBossFromTickets — the two fields are sourced from different models with no reconciliation code path anywhere."
    - "CombatManager.ts:448 bossMaxHp formula (BASE_HP_PER_PLAYER=1000 × players) vs gameState.ts:1011-1021 scaledHealth formula (100 × tickets × sqrt(players)) are algebraically different and neither references the other — confirmed no accidental prior sync."
  falsification_test: "If lobby.boss.maxHealth were already being passed into/read by initializeCombat anywhere, or if client recomputed maxHealth from combat:boss_damaged/battle_initialized payloads, the dual-model theory would be wrong. Grepped both — neither is true (see Evidence entries above)."
  fix_rationale: "Threading lobby.boss.maxHealth into initializeCombat as the combat boss's maxHp (both call sites) makes both fields (currentHealth via attackBoss projection, maxHealth via lobby.boss) derive from ONE number at combat-init time. This addresses the root cause (two unreconciled formulas) rather than a symptom (e.g. patching the client to recompute a ratio, which would still leave two divergent server-side models for future consumers)."
  blind_spots: "Have not yet live-tested the down/revive flow end-to-end locally (fix-plan step 2) — evidence so far is static code reading only. Have not yet run the full test suite after the change. levelMultiplier/ticketMultiplier scaling that the combat formula applied (but the estimation formula doesn't) will be dropped for ticket 2+/leveled parties once we switch to lobby.boss.maxHealth — accepted per fix-plan's explicit recommendation, but worth flagging as an intentional behavior change (combat difficulty no longer scales with ticketIndex/player level, only with tickets remaining × sqrt(players))."
next_action: Boss HP fixed and verified live (2026-10-24). Revive cannot be verified until .planning/bugs/combat-never-starts-vote-cast-not-emitted-and-split-player-hp.md is fixed.

## Resolution

### 2026-10-24: approach changed. The combat model is the source of truth, not the estimation model.

The first fix (an `overrideMaxHp` parameter that gave the combat boss `lobby.boss.maxHealth`) made
the numbers agree, but it shrank every fight to the estimation formula. A 3-player, 1-ticket boss
went from 3000 HP to 173. That is about 9 basic hits (15-25 damage each), or 1-2 team attacks
(summed class damage x 1.5-3.0). It also inverted difficulty: the estimation formula scales with
tickets *remaining*, so later bosses got weaker (the final boss was 173-283 HP for any lobby),
while the combat formula ramps +20% per ticket. The user chose to keep the combat model.

root_cause: unchanged (see above). Two unreconciled formulas, `createBossFromTickets`
(100 x tickets left x sqrt(players)) and `CombatManager.initializeCombat` (1000 x players x
ticket and level multipliers). `attackBoss` projected combat HP onto `lobby.boss.currentHealth`
but never touched `maxHealth`.

fix:
  - `overrideMaxHp` reverted. `CombatManager` is unchanged.
  - New `GameState.initializeCombatForCurrentTicket(lobbyId, ticketIndex)` (server/gameState.ts):
    cleanupLobby + initializeCombat, then copies the combat boss's `maxHp`/`hp` onto
    `lobby.boss.maxHealth`/`currentHealth`.
  - Both websocket.ts call sites (start_battle, proceed_next_level) call it before the boss reaches
    clients (`battle_started` / `session:game_reset`). `boss` in start_battle *is* `lobby.boss`,
    and sessionManager and gameState share the same lobby object (`syncPlayerToLobby`).
  - Side effect: the ring-attack trigger (`currentHealth < maxHealth * 0.3`) now works, because
    both values come from one model.

verification:
  - `npm run check`, `eslint`: clean. Full suite: 71 files / 1055 tests pass.
  - New tests in server/gameState.test.ts (`initializeCombatForCurrentTicket — one boss-HP model`):
    displayed boss = combat boss (3000, not 173); ticket 2 scales to 4200; attacks drain below max
    and match CombatManager. All 3 FAIL with the copy removed, so they catch the bug.
  - The non-cleric heal_party rejection test in gameFlow.test.ts (from the first attempt) is kept.
  - LIVE, local dev server, 3 scripted players (cleric host, warrior, rogue), 2026-10-24:
    `battle_started` boss 3000/3000 (lobby.boss.maxHealth 3000). Ten basic hits gave
    `combat:boss_damaged` newHp 2985 -> 2825, monotonic, never above max. **PASS.**

not verified, blocked by a separate bug: the down -> Cleric revive flow. The boss AI never attacks
in a real game, because nothing emits the *internal* `estimation:vote_cast` that starts battle entry.
Projectile hits also down players in a second player-HP copy that heal_party cannot see. See
`.planning/bugs/combat-never-starts-vote-cast-not-emitted-and-split-player-hp.md`.

files_changed:
  - server/gameState.ts (initializeCombatForCurrentTicket)
  - server/websocket.ts (both call sites use it)
  - server/gameState.test.ts (+3 regression tests)
  - server/integration/gameFlow.test.ts (+1 non-cleric heal_party rejection test)
