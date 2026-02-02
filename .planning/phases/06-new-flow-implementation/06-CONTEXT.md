# Phase 6: New Flow Implementation - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the estimation-before-battle game flow: 10-second countdown when all players vote (with bonus damage opportunity), automatic transition to discussion phase, spectators fighting for boss side as minions, and team competition stats. End-to-end flow: estimation → battle (first vote triggers) → discussion → next ticket.

</domain>

<decisions>
## Implementation Decisions

### Countdown UX
- Centered overlay with large countdown number, unmissable on battle scene
- JRPG dramatic style: large stylized numbers with screen shake, particle effects, boss roar — feels like a limit break charging
- Label: "LIMIT BREAK" accompanies the countdown
- Short fanfare before countdown: "ALL VOTED!" announcement with brief fanfare before 10s countdown begins
- Vote changes allowed during countdown but timer continues (forgiving approach)
- Scaling damage bonus displayed: show current multiplier (3x → 2.5x → 2x...) that ticks down so players see urgency
- Dramatic music swell: intensity builds with each second
- At countdown zero: team attack lands with impact, brief pause, THEN transition to discussion
- If boss would die during countdown: countdown completes first for team attack payoff, then victory
- Bonus damage: coordinated team attack animation AND scaling damage multiplier (earlier consensus = bigger multiplier)

### Spectator Combat Role
- Spectators appear as AI-driven minions on boss side (corrupted version of their chosen avatar with dark aura)
- Significant mechanical threat: each spectator meaningfully increases difficulty — pressure to not be a spectator
- Minion strength scales with player count (more voters = stronger minions to maintain balance)
- Minion abilities: attack players, heal boss, and occasionally debuff players (slow, weaken)
- Minions are targetable: players can choose to attack minions instead of boss (strategic choice)
- When killed: minion respawns after 15-30 second delay (temporary relief)
- Death animation when spectator switches to voting team mid-battle (dramatic team switch)
- Spectators can switch to a voting team at any time during battle
- Spectator leaderboard: "best minion" bragging rights based on damage dealt to players

### Discussion Phase Flow
- Discussion starts after battle concludes (post-battle phase, not concurrent)
- Four ending mechanisms (priority order):
  1. Consensus first: if all votes match, immediately end discussion
  2. Host button: host can end early via 'Finalize Estimate'
  3. Timer expiration: max discussion time enforced
  4. (Consensus auto-triggers above all else)
- Discussion timer is host-configurable per session
- Players can change votes unlimited times during discussion to reach consensus
- If no consensus at timer expiration: host must pick from the actually-voted values only
- Visual state during discussion: vote review screen + player victory poses + next boss preview in background

### Claude's Discretion
- Vote reveal UX treatment (card flip, fade in, banner, etc.)
- Exact scaling formula for damage multiplier (3x → 1.5x over 10s)
- Spectator minion respawn delay within 15-30s range
- Specific debuff effects and durations
- Victory pose animations
- Discussion timer default value and configuration UI

</decisions>

<specifics>
## Specific Ideas

- "LIMIT BREAK" label evokes classic JRPG charging up a powerful attack
- Countdown should feel like Final Fantasy limit break charging — dramatic tension
- Spectator minions as corrupted versions of player avatars creates social pressure and visual interest
- Discussion phase combines vote review, victory celebration, and next boss preview — multi-purpose screen

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-new-flow-implementation*
*Context gathered: 2026-02-02*
