# Roadmap: ScrumQuest v1.3 Game Progression

## Overview

Transform ScrumQuest from a simple real-time multiplayer experience into a proper RPG progression system. Add XP tracking with account-level persistence, class mastery for long-term engagement, varied boss AI patterns for distinct battles, class-specific abilities with cooldown management, team combos for coordinated play, combat items for tactical depth, and lifetime statistics tracking. The journey follows natural dependencies: establish XP foundation first, extend with class mastery, enhance bosses independently, then layer abilities, combos, and items on top.

## Milestones

- ✅ **v1.0 MVP** - Phases 1-6 (shipped 2026-02-02)
- ✅ **v1.2 SDLC Best Practices** - Phases 7-14 (shipped 2026-02-03)
- 🚧 **v1.3 Game Progression** - Phases 15-20 (in progress)

## Phases

<details>
<summary>✅ v1.0 Domain Separation (Phases 1-6) - SHIPPED 2026-02-02</summary>

See `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 SDLC Best Practices (Phases 7-14) - SHIPPED 2026-02-03</summary>

See `.planning/milestones/v1.2-ROADMAP.md`

</details>

### 🚧 v1.3 Game Progression (In Progress)

**Milestone Goal:** Make the game more engaging with progression systems, varied boss battles, and deeper combat mechanics.

- [ ] **Phase 15: XP/Progression Foundation** - Account-level XP tracking with visual feedback
- [ ] **Phase 16: Class Mastery System** - Class-specific progression with tier unlocks
- [ ] **Phase 17: Boss AI Patterns** - Unique boss behaviors with phases and scaling
- [ ] **Phase 18: Class Abilities** - Class-specific abilities with cooldown system
- [ ] **Phase 19: Team Combos** - Coordinated attacks and consensus ultimates
- [ ] **Phase 20: Combat Items & Lifetime Stats** - Session consumables and persistent statistics

## Phase Details

### Phase 15: XP/Progression Foundation

**Goal**: Players earn XP from game actions, see their progress, and level up with celebration
**Depends on**: Nothing (first phase of v1.3, builds on v1.2 infrastructure)
**Requirements**: XP-01, XP-02, XP-03, XP-04, XP-05, XP-06, XP-07, XP-08
**Success Criteria** (what must be TRUE):
  1. Player sees XP gain notification after submitting a vote
  2. Player sees XP gain notification after dealing damage to boss
  3. Player earns bonus XP when their vote matches consensus
  4. Player earns XP for successfully reviving a teammate
  5. Player's XP total persists after logging out and back in
  6. Player sees their current level based on accumulated XP
  7. Player sees XP bar showing progress toward next level
  8. Player sees level-up celebration when crossing level threshold
**Plans**: TBD

### Phase 16: Class Mastery System

**Goal**: Players develop expertise in specific avatar classes with tier-based rewards
**Depends on**: Phase 15 (requires XP infrastructure)
**Requirements**: MSTR-01, MSTR-02, MSTR-03, MSTR-04
**Success Criteria** (what must be TRUE):
  1. Player earns class-specific XP when playing as that class
  2. Player sees their mastery tier for each class (Novice/Expert/Master)
  3. Player's class stats improve as they gain mastery tiers
  4. Player unlocks class-specific abilities at higher mastery tiers
**Plans**: TBD

### Phase 17: Boss AI Patterns

**Goal**: Each boss type feels distinct with unique attack patterns and dynamic difficulty
**Depends on**: Phase 15 (difficulty scales with team level)
**Requirements**: BOSS-01, BOSS-02, BOSS-03, BOSS-04, BOSS-05, BOSS-06
**Success Criteria** (what must be TRUE):
  1. Each of 5 boss types uses distinct attack patterns (not the same attacks)
  2. Boss changes behavior at HP thresholds (e.g., new attacks at 50% HP)
  3. Player sees visual warning before boss attacks land (telegraphing)
  4. Higher average team level results in more challenging boss encounters
  5. Boss becomes more aggressive at low HP (faster attacks, more damage)
  6. Boss prioritizes targeting players who deal more damage or healing
**Plans**: TBD

### Phase 18: Class Abilities

**Goal**: Each avatar class has unique abilities that define its combat role
**Depends on**: Phase 16 (mastery unlocks abilities), Phase 17 (abilities need bosses to test against)
**Requirements**: ABIL-01, ABIL-02, ABIL-03, ABIL-04
**Success Criteria** (what must be TRUE):
  1. Each avatar class has 1-2 unique abilities (Tank: taunt/shield, Healer: heal/buff, DPS: damage/debuff)
  2. Abilities have server-enforced cooldowns that prevent spam
  3. Player sees ability buttons with visual cooldown indicators
  4. Ability effects match the class role (tanks protect, healers heal, DPS damages)
**Plans**: TBD

### Phase 19: Team Combos

**Goal**: Team coordination is rewarded with powerful combo attacks
**Depends on**: Phase 18 (requires ability system)
**Requirements**: CMBO-01, CMBO-02, CMBO-03
**Success Criteria** (what must be TRUE):
  1. Specific class combinations trigger special combo attacks
  2. When entire team has voted, a consensus-powered ultimate attack activates
  3. Combo attacks deal bonus damage and have distinct visual effects
**Plans**: TBD

### Phase 20: Combat Items & Lifetime Stats

**Goal**: Players have tactical consumables and can track their lifetime achievements
**Depends on**: Phase 18 (items reuse ability effect system)
**Requirements**: ITEM-01, ITEM-02, ITEM-03, ITEM-04, STAT-01, STAT-02, STAT-03, STAT-04
**Success Criteria** (what must be TRUE):
  1. Items exist only within a game session (not persisted between games)
  2. Items provide effects: healing, damage boost, or shield
  3. Player receives items when tickets are completed
  4. Player can use items during combat phase via UI
  5. Player's lifetime estimation stats are tracked (total votes, consensus rate, voting speed)
  6. Player's lifetime combat stats are tracked (damage dealt, bosses defeated, revives, deaths)
  7. Player can view lifetime stats on their profile page
  8. Player sees session stats summary at game over
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 15 → 16 → 17 → 18 → 19 → 20

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 30/30 | Complete | 2026-02-02 |
| 7-14 | v1.2 | 21/21 | Complete | 2026-02-03 |
| 15. XP/Progression | v1.3 | 0/TBD | Not started | - |
| 16. Class Mastery | v1.3 | 0/TBD | Not started | - |
| 17. Boss AI Patterns | v1.3 | 0/TBD | Not started | - |
| 18. Class Abilities | v1.3 | 0/TBD | Not started | - |
| 19. Team Combos | v1.3 | 0/TBD | Not started | - |
| 20. Items & Stats | v1.3 | 0/TBD | Not started | - |
