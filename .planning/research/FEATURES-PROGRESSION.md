# Feature Research: Game Progression Systems

**Domain:** XP/leveling, boss AI patterns, team combat mechanics for multiplayer JRPG-style game
**Researched:** 2026-02-03
**Confidence:** MEDIUM (industry patterns well documented; ScrumQuest-specific integration needs validation)

---

## Table Stakes

Features users expect for XP/leveling, boss fights, and combat abilities. Missing these would feel incomplete.

### XP/Leveling System

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **XP gain on vote submission** | Core gamification of scrum poker activity | LOW | Estimation domain events |
| **XP gain on boss damage dealt** | Combat participation rewards | LOW | Combat domain events |
| **Visual XP bar/progress indicator** | Players need to see progress toward level-up | LOW | Client-side UI component |
| **Level-up notification/fanfare** | Reward moment must be celebrated | MEDIUM | Sound/visual effects system |
| **Progressive XP curve** | Early levels fast, higher levels require more investment | LOW | `baseXP * (level ^ exponent)` formula |
| **Persistent XP across sessions** | Progress must survive logout/reconnect | MEDIUM | Database storage, user accounts |
| **Account-level vs class-specific XP** | Players expect both overall and class mastery tracking | MEDIUM | Dual progression schema |

### Boss AI Patterns

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Phase-based attacks** | Boss behavior changes as health decreases | MEDIUM | Boss state machine |
| **Telegraphed attacks** | Players need visual warning before damage | LOW | Animation/warning indicators |
| **Attack cooldowns** | Boss attacks at predictable intervals (not constant spam) | LOW | Timer system per boss |
| **Unique attacks per boss type** | 5 bosses should feel different to fight | MEDIUM | Per-boss attack configuration |
| **Target selection logic** | Boss should pick targets intelligently (not random) | MEDIUM | Proximity/threat calculation |
| **Enrage at low HP** | Increased difficulty when boss nearly defeated | LOW | HP threshold trigger |

### Team Combat Mechanics

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Class-specific abilities** | 10 classes should have unique combat contributions | HIGH | Ability system per class |
| **Ability cooldowns** | Prevent ability spam, encourage strategic timing | MEDIUM | Cooldown tracking per player |
| **Visual ability feedback** | Players see when abilities activate/cooldown | MEDIUM | UI cooldown indicators |
| **Damage/healing numbers** | Floating combat text for impact feedback | LOW | Client-side visual effects |
| **Player status effects** | Buffs/debuffs visible on character | MEDIUM | Status effect system |

---

## Differentiators

Features that would make ScrumQuest stand out from standard planning poker or generic boss games.

### XP/Progression Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Voting accuracy XP bonus** | Reward estimates that match final consensus | MEDIUM | Encourages thoughtful estimation, not just fast voting |
| **Streak bonuses** | Consecutive accurate votes multiply XP | LOW | Engagement hook, encourages consistency |
| **Class mastery unlocks** | Playing same class unlocks new abilities | HIGH | Long-term progression hook, replayability |
| **Team XP sharing** | Partial XP for teammates on successful consensus | LOW | Encourages teamwork over individual glory |
| **Weekly/sprint leaderboards** | Competitive element with time-limited rankings | MEDIUM | Social engagement, resets prevent snowballing |
| **Prestige/rebirth system** | Max level players can reset for permanent bonuses | HIGH | End-game content for dedicated users |

### Boss AI Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Adaptive attack selection** | Boss counters most-used strategies | HIGH | Prevents memorization, keeps fights fresh |
| **Scrum-themed attacks** | Bug Hydra spawns bug minions, Scope Creep expands arena | MEDIUM | Thematic coherence, memorable fights |
| **Vote-triggered mechanics** | Boss attacks when votes disagree, calms on consensus | MEDIUM | Ties combat to estimation quality |
| **Team composition awareness** | Boss targets healers first, avoids tanks | MEDIUM | Rewards strategic class selection |
| **Memory between sessions** | Boss remembers team tactics from previous fights | HIGH | Persistent challenge, long-term engagement |
| **Difficulty scaling by team level** | Higher team average = stronger boss | LOW | Prevents trivial fights as team progresses |

### Team Combat Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Combo attacks between classes** | Synergy abilities when specific classes cooperate | HIGH | Encourages class diversity in team |
| **Estimation-powered ultimates** | Perfect consensus charges team super attack | MEDIUM | Ties combat rewards to core activity |
| **Revival chains** | Reviving builds meter for team buff | LOW | Rewards helping downed teammates |
| **Position-based abilities** | Tank stance in front protects backline | MEDIUM | Spatial strategy layer |
| **Shared resource pool** | Team mana/energy for powerful abilities | MEDIUM | Coordination requirement |
| **Cross-team synergies** | Dev + QA combo attacks | LOW | Unique to ScrumQuest's team structure |

---

## Anti-Features

Features that seem appealing but would harm the ScrumQuest experience.

### Progression Anti-Features

| Anti-Feature | Why It Seems Good | Why Problematic | Alternative |
|--------------|-------------------|-----------------|-------------|
| **Pay-to-level XP boosts** | Monetization opportunity | Undermines achievement feeling, creates unfair advantages | Cosmetic-only purchases |
| **XP penalties for wrong votes** | Encourage accuracy | Discourages participation, punishes honest disagreement | Accuracy bonuses instead of penalties |
| **Level-gated features** | Retention mechanic | Frustrates new users, splits team | Time-gated or achievement-unlocked instead |
| **Individual XP leaderboards** | Competition drives engagement | Promotes individual over team, gaming system | Team-based leaderboards |
| **XP decay for inactivity** | Encourages daily play | Punishes vacation/sick time, creates anxiety | Positive streak bonuses instead |
| **Infinite level cap** | Always something to earn | Numbers lose meaning, power creep issues | Soft cap with prestige system |

### Boss AI Anti-Features

| Anti-Feature | Why It Seems Good | Why Problematic | Alternative |
|--------------|-------------------|-----------------|-------------|
| **Full AI unpredictability** | Every fight unique | Removes skill expression, pure reaction | Weighted randomness within defined patterns |
| **One-shot kill attacks** | High stakes | Frustrating for new players, feels unfair | High damage with survival window |
| **Instant attack execution** | Challenging | No counterplay opportunity | Telegraphed attacks with dodge windows |
| **Boss heals when team argues** | Thematic for scrum disputes | Punishes healthy debate, encourages groupthink | Boss powers up (damage) but doesn't heal |
| **Random target selection** | Unpredictable | No strategic positioning value | Threat/proximity-based targeting |
| **Invisible mechanics** | Surprise factor | Players can't learn, repeated frustration | Clear visual/audio feedback for all mechanics |

### Combat Anti-Features

| Anti-Feature | Why It Seems Good | Why Problematic | Alternative |
|--------------|-------------------|-----------------|-------------|
| **Pay-to-win consumables** | Revenue stream | Undermines skill, creates have/have-not divide | Earnable consumables only |
| **Unlimited ability spam** | Feels powerful | No resource management, no strategy | Cooldowns and resource costs |
| **Perma-death for characters** | High stakes | Too punishing for casual poker game | Respawn with temporary debuff |
| **Solo carry potential** | Reward skilled players | Undermines team nature of scrum | Team synergy requirements |
| **Complex ability rotations** | Depth for hardcore | Alienates casual users (main audience) | Simple abilities with combo depth |
| **Mandatory meta builds** | Clear optimal paths | Reduces class diversity, boring | Multiple viable strategies per class |

---

## Complexity Notes

### Low Complexity Features

Quick wins that can be implemented without major architecture changes.

**XP System:**
- XP gain events (vote submitted, boss damaged)
- Simple XP bar UI component
- Progressive XP formula
- Streak tracking

**Boss AI:**
- Attack cooldown timers
- HP threshold phase transitions
- Enrage mechanic at low HP
- Basic target selection (nearest player)

**Combat:**
- Floating damage numbers
- Basic ability cooldowns
- Simple buff/debuff indicators

### Medium Complexity Features

Require coordination across domains but manageable scope.

**XP System:**
- Database persistence for XP/level
- Account-level + class mastery split
- Voting accuracy calculation
- Level-up effects and rewards

**Boss AI:**
- Unique attack patterns per boss type
- Telegraphed attacks with warning indicators
- Team-aware target selection
- Phase-specific attack pools

**Combat:**
- Class-specific abilities (10 classes x 2-3 abilities each)
- Visual cooldown indicators
- Status effect system
- Position-based ability modifiers

### High Complexity Features

Significant architectural work or new systems required.

**XP System:**
- Class mastery unlock progression
- Prestige/rebirth system
- Team XP distribution algorithms

**Boss AI:**
- Adaptive AI that learns player patterns
- Memory between sessions
- Scrum-themed attack mechanics tied to voting

**Combat:**
- Combo attacks between multiple classes
- Shared team resource pools
- Complex synergy system

---

## Feature Dependencies (Existing Systems)

### Already Built (Can Leverage)

| Existing Feature | Located In | Can Support |
|-----------------|------------|-------------|
| Player HP and downed state | `gameState.ts` PlayerCombatState | Ability damage/healing |
| Revival mechanic | `gameState.ts` revival sessions | Revival chains, class heals |
| Ring attacks from boss | `createRingAttack()` | Boss attack patterns |
| Spectator minions | Combat events | Boss minion mechanics |
| 5 boss types with visuals | `createBossFromTickets()` | Unique boss attack pools |
| Class-based avatar selection | `AVATAR_CLASSES` with stats | Class ability scaling |
| Character stats (STR, DEX, etc.) | `shared/gameEvents.ts` CharacterStats | Ability damage formulas |
| Team assignment (Dev/QA/Spectator) | Lobby.teams | Team synergy abilities |
| Voting submission tracking | Player.hasSubmittedScore | XP triggers on vote |
| Consensus detection | `checkDiscussionConsensus()` | Bonus XP on consensus |
| Battle modifier system | `battleModifier`, `getCurrentModifier()` | Difficulty scaling |

### Needs Building (New Systems)

| New System | Required For | Priority |
|------------|--------------|----------|
| XP/Level storage schema | All progression features | P0 |
| Ability definition schema | Class abilities, cooldowns | P0 |
| Cooldown tracker | Ability timing | P0 |
| Boss attack pattern configs | Unique boss behavior | P1 |
| Status effect system | Buffs/debuffs | P1 |
| Combo detection | Team synergy attacks | P2 |
| Consumable inventory | Combat items | P2 |

---

## MVP Recommendation

For the v1.3 milestone, prioritize features that create the core progression loop.

### Phase 1: Core XP System (Must Have)

1. XP gain on vote submission (base amount)
2. XP gain on boss damage dealt
3. Persistent XP storage per account
4. Level progression with XP curve
5. Visual XP bar and level display
6. Level-up notification

**Rationale:** Foundation for all other progression. Without XP tracking, nothing else makes sense.

### Phase 2: Boss AI Variety (Must Have)

1. Phase-based attack patterns (2-3 phases per boss)
2. Unique attack pool per boss type
3. Telegraphed attacks with warning
4. HP-based enrage mechanic
5. Basic difficulty scaling by team level

**Rationale:** 5 existing bosses with identical behavior wastes existing assets. Differentiation makes fights memorable.

### Phase 3: Class Abilities (Should Have)

1. 1-2 unique abilities per class (20 total)
2. Cooldown system
3. Visual ability UI
4. Basic class mastery tracking

**Rationale:** Existing 10 classes with stats but no abilities. Give each class identity.

### Phase 4: Team Synergies (Nice to Have)

1. Cross-team combo (Dev + QA)
2. Consensus-powered team ultimate
3. Revival chain bonuses

**Rationale:** Differentiators that tie combat to scrum collaboration theme.

### Defer to Post-MVP

- Prestige/rebirth system
- Adaptive boss AI
- Complex combo attacks
- Combat consumables
- Weekly leaderboards

---

## Sources

### XP and Progression Systems

- [Quantitative Design: How to Define XP Thresholds](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-) - Game Developer
- [How to Implement a Leveling System in RPG](https://howtomakeanrpg.com/r/a/how-to-make-an-rpg-levels.html) - How to Make an RPG
- [Level Systems and Character Growth in RPG Games](https://pavcreations.com/level-systems-and-character-growth-in-rpg-games/) - Pav Creations
- [What are Progression Systems in Games](https://www.universityxp.com/blog/2024/1/16/what-are-progression-systems-in-games) - University XP
- [Progression & XP Inflation in MMORPGs](https://clockwork-labs.medium.com/progression-xp-inflation-in-mmorpgs-5b8e52e75ea7) - Clockwork Labs

### Boss AI and Attack Patterns

- [Boss Battle Design and Structure](https://www.gamedeveloper.com/design/boss-battle-design-and-structure) - Game Developer
- [The Evolution of Boss Designs in Video Games](https://www.gamedeveloper.com/design/the-evolution-of-boss-designs-in-video-games) - Game Developer
- [How Boss Design Has Evolved](https://medium.com/super-jump/how-boss-design-has-evolved-50929f22af89) - SUPERJUMP
- [Boss Design: How to Make an Unforgettable Boss Battle](https://gamedesignskills.com/game-design/game-boss-design/) - Game Design Skills
- [NVIDIA ACE Autonomous Game Characters](https://www.nvidia.com/en-us/geforce/news/nvidia-ace-autonomous-ai-companions-pubg-naraka-bladepoint/) - NVIDIA

### Team Combat and Synergies

- [Combining Abilities: Teamwork and Synergy between RPG Characters](https://www.campaignmastery.com/blog/combining-abilities/) - Campaign Mastery
- [Ultimate Guide to RPG Class Balancing](https://www.ttrpg-games.com/blog/ultimate-guide-to-rpg-class-balancing/) - TTRPG Games
- [8 RPGs With The Best Combo Attacks](https://gamerant.com/rpgs-with-best-combo-attacks/) - Game Rant
- [The Science of Battle Systems in Action RPGs](https://medium.com/super-jump/the-science-of-battle-systems-in-action-rpgs-4256b1f515b) - SUPERJUMP

### Ability and Cooldown Systems

- [Cooldown - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/Cooldown) - TV Tropes
- [Unreal Engine Gameplay Ability System](https://github.com/tranek/GASDocumentation) - GitHub
- [Mastering the Art of Cooldowns](https://plarium.com/en/glossary/cooldown/) - Plarium

### Difficulty Scaling

- [Multiplayer Difficulty Spike - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/MultiplayerDifficultySpike) - TV Tropes

### Consumables and Resource Management

- [RPG Design: Expendable!](https://rampantgames.com/blog/?p=6552) - Rampant Games
- [RPG Design: The Positive Potential of Potions](https://rampantgames.com/blog/?p=7803) - Rampant Games
- [Too Awesome to Use - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/TooAwesomeToUse) - TV Tropes

---

*Feature research for: Game Progression Systems (ScrumQuest v1.3)*
*Researched: 2026-02-03*
*Confidence: MEDIUM - Industry patterns well-established, ScrumQuest-specific integration requires validation during implementation*
