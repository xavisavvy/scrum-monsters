# Phase 15: XP/Progression Foundation - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Players earn XP from game actions (voting, combat, consensus, revival), see their progress with visual feedback, and experience level-up celebrations. XP persists at the account level. This phase establishes the XP infrastructure that class mastery, abilities, and other progression systems will build upon.

</domain>

<decisions>
## Implementation Decisions

### XP Gain Feedback
- Floating numbers RPG-style — rises from action location and fades
- Color-coded by source: vote XP = blue, damage XP = red, consensus bonus = gold, etc.
- Multiple XP events stack vertically (visible together, not combined)
- Bonus XP (consensus, revival) appears larger with golden glow effect
- Numbers originate near the action (vote XP from voting area, damage XP from boss)
- Quick display duration (~1 second) — fast paced, doesn't clutter
- No sound effect for XP gains — visual only
- XP bar pulses/glows briefly when receiving XP (smooth fill animation + pulse)

### Level & XP Bar Display
- Repurpose existing bottom bar for XP display — rework host controls UX to accommodate
- Progressive detail: minimal by default (Lv + bar), expand on hover/tap to show exact numbers
- Classic JRPG gradient style for XP bar — gold/orange gradient fill, beveled edges
- Player levels visible in lobby only (next to player name), not during combat
- Level format: "PlayerName [Lv 5]" inline with name in lobby

### Level-up Celebration
- Dramatic celebration — full-screen flash, particles, character effect, lingers ~2-3 seconds
- Class-specific animations — fully unique per class:
  - Paladin/Cleric: Pillar of light, glowing aura
  - Rogue: Burst of golden coins
  - Other classes: Thematic effects TBD during implementation
- Triumphant fanfare sound effect — classic RPG level-up jingle
- Shared celebration — others see a scaled-down version of your level-up
- Priority to local player — your level-up is dramatic, others show as smaller notifications
- Shows unlocks: "Level 5! Unlocked: [ability/perk name]"

### XP Values & Pacing
- Quick early levels, slow later — first few levels in one session, higher levels take multiple sessions
- Balanced XP sources — roughly equal XP from voting and combat actions
- Soft level cap around 50-100 — long-term progression goal
- XP only increases — no penalties, progression always moves forward
- Revival XP scales with situation — clutch revivals (low team HP, tough boss) give bonus
- Win streak bonus — cross-session consensus streak that resets on bad estimate

### Claude's Discretion
- Exact XP values for each action type
- Precise level thresholds and curve formula
- Consensus bonus percentage (tune for good team dynamics)
- Win streak multiplier values and cap
- Specific level-up animation implementations for each class beyond Paladin/Cleric/Rogue
- Bottom bar layout and host controls rework specifics

</decisions>

<specifics>
## Specific Ideas

- "Perhaps the level up animation can be specific to the kind of class. IE Paladin and Cleric a pillar of light and glowing. A Rogue a burst of golden coins, etc."
- Repurpose existing bottom bar — it currently has leave/continue buttons for hosts that need UX rework
- Floating XP numbers should feel classic JRPG — think Final Fantasy victory screens

</specifics>

<deferred>
## Deferred Ideas

- **Player inspection popup** — tap on another character in lobby to see popup with their stats, current skin, etc. (future "player profiles" feature)

</deferred>

---

*Phase: 15-xp-progression-foundation*
*Context gathered: 2026-02-03*
