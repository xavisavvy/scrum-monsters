# Requirements: ScrumQuest v1.3 Game Progression

**Defined:** 2026-02-03
**Core Value:** Focused estimation that doesn't bore people. Voting should be distraction-free, but waiting for others should be fun.

## v1.3 Requirements

Requirements for milestone v1.3. Each maps to roadmap phases.

### XP/Progression

- [ ] **XP-01**: Player earns XP on vote submission
- [ ] **XP-02**: Player earns XP on boss damage dealt
- [ ] **XP-03**: Player earns bonus XP for consensus match (voting accuracy)
- [ ] **XP-04**: Player earns XP for reviving teammates
- [ ] **XP-05**: Player XP persists across sessions (account-level)
- [ ] **XP-06**: Player level calculated from total XP using progression curve
- [ ] **XP-07**: Player sees XP bar with current progress to next level
- [ ] **XP-08**: Player sees level-up notification with celebration effect

### Class Mastery

- [ ] **MSTR-01**: Player earns class-specific XP when playing a class
- [ ] **MSTR-02**: Class mastery has tier progression (e.g., Novice -> Expert -> Master)
- [ ] **MSTR-03**: Class mastery tier grants stat bonuses (HP, damage, cooldown reduction)
- [ ] **MSTR-04**: Class mastery tier unlocks class-specific abilities

### Boss AI

- [ ] **BOSS-01**: Each boss type has unique attack pool (5 bosses, distinct patterns)
- [ ] **BOSS-02**: Boss enters different phases based on HP thresholds
- [ ] **BOSS-03**: Boss attacks have telegraphing (visual warning before damage)
- [ ] **BOSS-04**: Boss difficulty scales with team average level
- [ ] **BOSS-05**: Boss enters enrage mode at low HP (faster attacks, more damage)
- [ ] **BOSS-06**: Boss targets players based on threat (damage dealt, healing done)

### Class Abilities

- [ ] **ABIL-01**: Each avatar class has 1-2 unique abilities
- [ ] **ABIL-02**: Abilities have cooldown timers (server-authoritative)
- [ ] **ABIL-03**: Player sees ability buttons with cooldown indicators
- [ ] **ABIL-04**: Ability effects vary by class role (tank: taunt/shield, healer: heal/buff, DPS: damage/debuff)

### Team Combos

- [ ] **CMBO-01**: Specific class combinations trigger combo attacks
- [ ] **CMBO-02**: Consensus-powered ultimate activates when entire team has voted
- [ ] **CMBO-03**: Combo attacks deal bonus damage and have visual effects

### Combat Items

- [ ] **ITEM-01**: Items are session-scoped consumables (no persistence between games)
- [ ] **ITEM-02**: Items have effects: heal, damage boost, shield
- [ ] **ITEM-03**: Player receives items on ticket completion
- [ ] **ITEM-04**: Player can use items during combat phase

### Lifetime Stats

- [ ] **STAT-01**: Track lifetime estimation stats (total votes, consensus rate, voting speed)
- [ ] **STAT-02**: Track lifetime combat stats (damage dealt, bosses defeated, revives, deaths)
- [ ] **STAT-03**: Display lifetime stats on player profile page
- [ ] **STAT-04**: Display session stats in game over summary

## Future Requirements

Deferred to v1.4 or later. Tracked but not in current roadmap.

### Prestige/Endgame

- **PRSTG-01**: Player can prestige after max level (reset level, keep cosmetic rewards)
- **PRSTG-02**: Prestige grants exclusive cosmetic unlocks

### Leaderboards

- **LEAD-01**: Weekly leaderboards for XP gained
- **LEAD-02**: Sprint-scoped leaderboards for teams

### Advanced Boss AI

- **ADVBOSS-01**: Boss learns player patterns across sessions (adaptive AI)
- **ADVBOSS-02**: Boss remembers players between sessions

## Out of Scope

Explicitly excluded from v1.3. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Persistent inventory | Items session-scoped for v1.3; persistence adds complexity |
| Multi-class combo chains | Requires extensive balancing; 2-class combos sufficient for v1.3 |
| XP penalties for "wrong" votes | Undermines scrum collaboration theme |
| Pay-to-win progression | Violates core value of focused estimation |
| UI redesign | Deferred to v1.4 UI Polish milestone |
| Mobile responsiveness | Deferred to v1.4 UI Polish milestone |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| XP-01 | Phase 15 | Pending |
| XP-02 | Phase 15 | Pending |
| XP-03 | Phase 15 | Pending |
| XP-04 | Phase 15 | Pending |
| XP-05 | Phase 15 | Pending |
| XP-06 | Phase 15 | Pending |
| XP-07 | Phase 15 | Pending |
| XP-08 | Phase 15 | Pending |
| MSTR-01 | Phase 16 | Pending |
| MSTR-02 | Phase 16 | Pending |
| MSTR-03 | Phase 16 | Pending |
| MSTR-04 | Phase 16 | Pending |
| BOSS-01 | Phase 17 | Pending |
| BOSS-02 | Phase 17 | Pending |
| BOSS-03 | Phase 17 | Pending |
| BOSS-04 | Phase 17 | Pending |
| BOSS-05 | Phase 17 | Pending |
| BOSS-06 | Phase 17 | Pending |
| ABIL-01 | Phase 18 | Pending |
| ABIL-02 | Phase 18 | Pending |
| ABIL-03 | Phase 18 | Pending |
| ABIL-04 | Phase 18 | Pending |
| CMBO-01 | Phase 19 | Pending |
| CMBO-02 | Phase 19 | Pending |
| CMBO-03 | Phase 19 | Pending |
| ITEM-01 | Phase 20 | Pending |
| ITEM-02 | Phase 20 | Pending |
| ITEM-03 | Phase 20 | Pending |
| ITEM-04 | Phase 20 | Pending |
| STAT-01 | Phase 20 | Pending |
| STAT-02 | Phase 20 | Pending |
| STAT-03 | Phase 20 | Pending |
| STAT-04 | Phase 20 | Pending |

**Coverage:**
- v1.3 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-02-03*
*Last updated: 2026-02-03 after roadmap creation*
