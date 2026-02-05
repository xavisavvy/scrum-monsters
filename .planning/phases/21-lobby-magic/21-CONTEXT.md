# Phase 21: Lobby Magic & Emote System

## Status: PARTIALLY COMPLETE (Ad-hoc Implementation)

This phase was implemented outside the normal GSD workflow during a tangent from Phase 15 work. The features are functional but lack formal testing, code review, and some polish.

## What Was Built

### Core Systems

**Magic Word Detection** (`client/src/lib/utils/magicWords.ts`)
- `detectMagicWords(message)` - Scans message for trigger words, returns effect types
- `getPrimaryMagicEffect(message)` - Returns first detected effect
- `getSpellWords(effectType)` - Returns trigger words for a spell type
- `extractSpellTargets(message, spellWords)` - Extracts target player names from message
- `extractHoldTarget(message)` - Legacy single-target extraction for hold/freeze

**Effect Types Defined:**
```typescript
type MagicEffectType =
  | 'fire' | 'ice' | 'heal' | 'lightning' | 'magic' | 'love' | 'confetti'
  | 'rage' | 'sleep' | 'sparkle' | 'die' | 'revive' | 'haste' | 'slow'
  | 'fly' | 'hold' | 'earthbind' | 'massacre' | 'massrevive' | 'dragon'
  | 'dispel' | 'chaos' | 'invisibility' | 'enlarge' | 'reduce' | 'petrify';
```

### State Management (in `Lobby.tsx`)

**Player States:**
- `deadPlayers: Set<string>` - Players with X eyes
- `flyingPlayers: Set<string>` - Players floating above ground
- `frozenPlayers: Set<string>` - Players frozen by hold person
- `invisiblePlayers: Set<string>` - Invisible players
- `petrifiedPlayers: Set<string>` - Players turned to stone

**Buff Systems:**
- `speedBuffs: Record<string, { type: 'haste' | 'slow', stacks: number }>` - Movement speed modifiers
- `sizeBuffs: Record<string, { type: 'enlarge' | 'reduce', stacks: number }>` - Size modifiers (3x stackable)

**Visual States:**
- `magicEffects: Record<playerId, { effects, x, timestamp }>` - Active particle effects
- `invisibleFlicker: Record<string, boolean>` - Random visibility flicker for invisible players
- `screenShake: number` - Shake intensity (1-3 based on enlarge stacks)
- `chaosMode: boolean` - Disco rainbow effect
- `tavernDarkMode: boolean` - Darkened tavern after massacre
- `dragonAttack: { active, targetX, targetPlayerId }` - Dragon animation state

### Spell Categories

**Targetable Spells** (self-cast by default, or target with names):
| Spell | Trigger Words | Effect |
|-------|--------------|--------|
| die | die, dead, death, kill, rip, ded, x_x, xx | Player gets X eyes |
| revive | revive, resurrect, arise, awaken, phoenix, rebirth, live | Remove dead state |
| haste | haste, speed, fast, quick, swift, zoom, nyoom | Speed buff (3x stack) |
| slow | slow, sluggish, crawl, snail, turtle, molasses | Speed debuff |
| fly | fly, flight, soar, levitate, float, wings, ascend | Float above ground |
| hold | hold person, paralyze, freeze | Freeze for 5 seconds |
| enlarge | enlarge, grow, giant, big, expand, embiggen | Scale up (3x stack) |
| reduce | reduce, shrink, tiny, small, minimize, diminish | Scale down (3x stack) |
| petrify | petrify, stone, medusa, basilisk, statue, flesh to stone | Turn to stone |
| invisibility | invisibility, invisible, vanish, stealth, fade, shadow walk | Half opacity/invisible |
| dispel | dispel magic, dispel, cleanse, purify, remove curse | Remove all effects |

**Lobby-Wide Spells** (no targeting):
| Spell | Trigger Words | Effect |
|-------|--------------|--------|
| earthbind | earthbind, grounded, ground, gravity, fall | Kill all flying players |
| massacre | avada kedavra, avadakadavra, killing curse | Kill all others, darken tavern |
| massrevive | for the alliance, for the horde, legends never die, mass resurrection, rally | Revive everyone |
| dragon | clever girl, dracarys, summon dragon, release the dragon | Dragon eats random player |
| chaos | chaos mode, disco, party mode, rave, rainbow | 5-second disco effect |

**Visual-Only Spells** (particle effects only):
- fire, ice, heal, lightning, magic, love, confetti, rage, sleep, sparkle

### Multi-Targeting Syntax

All targetable spells support multiple targets:
- `haste Bob` - Single target
- `haste Bob, Alice` - Comma-separated
- `haste Bob and Alice` - "and" separator
- `haste Bob, Alice and Charlie` - Mixed
- `haste Bob & Alice` - Ampersand

### Special Mechanics

**Invisibility:**
- Caster sees themselves at 50% opacity
- Others see invisible players as completely hidden
- Random 15% flicker every 2 seconds (400ms visibility at 20% opacity)
- Breaks when casting any other spell
- Breaks on death

**Size Scaling:**
- Enlarge: 1.5x → 2.0x → 2.5x (3 stacks)
- Reduce: 0.7x → 0.5x → 0.35x (3 stacks)
- Transform origin at feet (bottom center)

**Screen Shake:**
- Triggered when enlarged players move
- Intensity matches enlarge stacks (1-3)
- 100ms reset timeout for intermittent effect

### UI Components

**EmoteModal** (`EmoteModal.tsx`)
- Input field for typing emotes
- Help text showing all available spells
- ESC to cancel, Enter to submit

**MagicEffect** (`MagicEffect.tsx`)
- CSS particle animations for each effect type
- Positioned relative to player
- Auto-removes after 2.5 seconds

**FAB Button** (tablet-only)
- Bottom-left floating action button
- Shows on `md:hidden` (mobile/tablet only)
- Opens emote modal

## Known Issues / TODO

1. **No server-side validation** - Effects are client-only, could be exploited
2. **No test coverage** - Needs unit tests for magicWords.ts and integration tests
3. **Effects don't persist on reconnect** - Player states reset
4. **No effect sync for late joiners** - They don't see existing effects
5. **Some TypeScript errors** - Pre-existing issues in related files
6. **Stale closure risks** - Uses refs but could have edge cases
7. **Performance** - Many effects at once could lag

## Files Modified

- `client/src/lib/utils/magicWords.ts` - Core spell detection logic
- `client/src/components/game/Lobby.tsx` - State management and handlers
- `client/src/components/game/MagicEffect.tsx` - Visual effect components
- `client/src/components/game/EmoteModal.tsx` - Input modal with help text

## Implementation Date

2026-02-03 to 2026-02-04 (during Phase 15 execution)
