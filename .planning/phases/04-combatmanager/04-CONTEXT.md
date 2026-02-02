# Phase 4: CombatManager - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract battle mechanics, health tracking, and revival system into dedicated domain manager. Players enter combat after voting, deal damage through class abilities, and can be downed/revived. Boss attacks players with threat-based targeting and various attack types. This phase implements the CombatManager to handle all battle state independently from voting logic.

</domain>

<decisions>
## Implementation Decisions

### Battle Entry Timing
- Short transition (1-2 seconds) when player enters combat after voting
- Avatar runs onto battlefield (character animation joining the fray)
- Players warned about party composition but not limited in positioning
- Damage dealt on first attack action, not automatically on entry

### Boss Attack Pattern
- Threat-based targeting — boss attacks players who dealt most damage recently
- Variable timing between attacks (random intervals within a range)
- 2-3 attack types with different damage values (light/heavy/special)
- Occasional AoE attacks — random chance any attack could hit all players
- Minion spawns as one AoE type — minions deal damage once and disappear
- Telegraphing for big attacks — "Boss is charging..." warning before heavy hits
- Enrage mechanic at 50% HP — boss becomes faster/hits harder in second half

### Revival Mechanics
- 10-second down timer before permanent out
- Only healer classes (cleric, paladin, bard) can revive
- Channel-based revive — healer stands still for 2-3 seconds
- Boss attacks interrupt revive channel (healer must dodge or time it)
- Revived players return at 50% HP
- One revive per player per fight — second down is permanent
- Permanently downed players enter ghost mode with emotes/reactions only

### Damage & HP Tuning
- Votes don't directly cause damage — voting triggers battle entry
- Players deal damage through click-to-attack (no auto-attack)
- No cooldown on clicks — spam is allowed
- Boss HP scales linearly with player count (HP = base × players)
- Boss difficulty scales with ticket progression — dungeon crawl feel (early tickets quick, later tickets harder)
- Players can take 3-4 boss hits before going down
- Healer classes can actively heal teammates during combat
- Between-ticket healing: full HP if party has healer class, no healing if not

### Claude's Discretion
- Exact damage values and HP numbers
- Attack timing ranges (min/max intervals)
- Visual effects for transitions and abilities
- Minion appearance frequency and damage
- Enrage behavior specifics (speed increase, damage multiplier)

</decisions>

<specifics>
## Specific Ideas

- Party composition warning on entry — let players know if they lack healers, but don't restrict
- Dungeon crawl progression — each ticket in the session should feel like going deeper, with increasing difficulty
- Healers can heal AND revive, making them high-value for team survival
- Ghost mode keeps downed players engaged with emotes rather than just watching

</specifics>

<deferred>
## Deferred Ideas

- **Priest/healer class that doesn't damage boss** — dedicated support class that heals instead of attacks. Needs class system design (Phase 6 or backlog)
- **Spectator lair actions** — spectators can trigger boss abilities or environmental hazards. New capability for spectator engagement (add to backlog)
- **Multiple boss types with unique abilities** — different bosses with distinct attack patterns, minion types, and mechanics. Content expansion (add to backlog)

</deferred>

---

*Phase: 04-combatmanager*
*Context gathered: 2026-02-02*
