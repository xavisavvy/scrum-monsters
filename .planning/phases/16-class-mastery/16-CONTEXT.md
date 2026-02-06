# Phase 16: Class Mastery System - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Players develop expertise in specific avatar classes through a 5-tier mastery system. Each avatar class has its own mastery track with XP thresholds, stat bonuses, and visual indicators. Mastery progress is permanent, visible to all players, and provides combat and meta-progression bonuses. Class-specific abilities are unlocked at higher tiers.

</domain>

<decisions>
## Implementation Decisions

### Mastery tiers & thresholds
- 5 tiers: Novice, Apprentice, Adept, Expert, Master
- Steep XP escalation between tiers — early tiers quick, Master requires serious dedication
- Mastery progress is permanent once earned — no decay
- Classes start as "unranked" until the player plays at least one game as that class
- One mastery track per existing avatar class (not grouped by archetype)
- Mastery is visible to all players in the lobby (social flex)

### Mastery UI & visibility
- Two display locations: quick summary in lobby + detailed view in profile/stats panel
- Lobby display uses a layered approach combining all three: tier badge/icon, border/frame color (escalating with tier), and title text under name (e.g., "Expert Warrior")
- Profile view shows ALL classes, with unplayed ones grayed out/locked to encourage exploration
- Mastery progress bars use the same JRPG gold styling as the Phase 15 XP bar for visual consistency

### Stat improvements per tier
- Both combat bonuses (lower tiers) and meta-progression bonuses (higher tiers)
- Subtle edge: 5-15% total bonus at max tier — rewards dedication without dominating newer players
- Bonuses apply only when playing the active mastered class — no cross-class passive bonuses

### Tier-up celebration
- Bigger than the Phase 15 level-up celebration — mastery tiers are rarer and harder-earned
- Triggers immediately when XP pushes over the threshold — instant gratification
- Visible to ALL players in the lobby — broadcast moment (e.g., "PlayerX reached Expert Warrior!")
- Escalating celebrations: Apprentice gets small fanfare, Master gets a massive JRPG-style ceremony

### Claude's Discretion
- Exact XP thresholds for each tier (steep curve, but specific numbers TBD based on existing XP rates)
- XP tracking approach: same pool dual-tracked vs. separate class XP (decide based on Phase 15 infrastructure)
- Whether higher tiers require account level gates (decide based on progression curve)
- Role-specific vs. generic stat bonuses (decide based on existing class differentiation in combat system)
- Specific badge icons, border colors per tier, and celebration visual effects
- Loading skeleton and error state designs
- Exact stat values per tier within the 5-15% total budget

</decisions>

<specifics>
## Specific Ideas

- Lobby display should combine badge + colored border + title for strong visual identity — apply UX and gamification best practices to make each tier feel distinct
- The tier-up celebration should feel like a classic JRPG moment — escalating from a quick flash at Apprentice to a full ceremony at Master
- User noted the Phase 15 XP bar may not be visible yet (Plan 15-06 pending verification) — mastery bars should follow the same gold style once established

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-class-mastery*
*Context gathered: 2026-02-05*
