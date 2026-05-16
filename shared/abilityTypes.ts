/**
 * Ability System Type Definitions
 *
 * Defines types and constants for class-specific abilities with cooldowns.
 * Extends ClassAbilityDef from classMasteryTypes.ts with gameplay mechanics.
 */

import { AvatarClass } from './gameEvents';
import { ClassAbilityDef } from './classMasteryTypes';

/**
 * Effect type categorizes what an ability does mechanically
 */
export type AbilityEffectType =
  | 'damage'   // Deal damage to boss
  | 'heal'     // Restore HP to allies
  | 'buff'     // Increase ally stats temporarily
  | 'debuff'   // Decrease enemy stats temporarily
  | 'taunt'    // Force boss targeting
  | 'shield';  // Damage reduction/invulnerability

/**
 * Target type defines who/what the ability affects
 */
export type AbilityTargetType =
  | 'self'     // Only caster
  | 'single'   // One ally (lowest HP) or boss
  | 'party'    // All allies
  | 'boss';    // Boss only

/**
 * Complete ability definition with cooldown and effect mechanics
 * Extends ClassAbilityDef from classMasteryTypes.ts
 */
export interface AbilityDefinition extends ClassAbilityDef {
  cooldownMs: number;           // Cooldown duration in milliseconds
  effectType: AbilityEffectType; // What the ability does
  targetType: AbilityTargetType; // Who/what it affects
  power: number;                 // Damage/heal amount or buff strength
  buffType?: string;             // e.g., 'damage_boost', 'crit_boost', 'cooldown_reduction'
  debuffType?: string;           // e.g., 'attack_slow', 'defense_down'
}

/**
 * Complete ability configurations for all 10 classes
 * Each class has exactly 2 abilities (ability_1, ability_2)
 */
export const CLASS_ABILITY_CONFIGS: Record<AvatarClass, {
  ability_1: AbilityDefinition;
  ability_2: AbilityDefinition;
}> = {
  // ========== TANK CLASSES ==========
  warrior: {
    ability_1: {
      id: 'warrior_shield_bash',
      name: 'Shield Bash',
      description: 'Stun and damage combination attack',
      tier: 'Expert',
      cooldownMs: 15000,           // 15 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 80,                   // Moderate damage
    },
    ability_2: {
      id: 'warrior_berserker_rage',
      name: 'Berserker Rage',
      description: 'Massive damage boost for limited time',
      tier: 'Master',
      cooldownMs: 30000,           // 30 seconds
      effectType: 'buff',
      targetType: 'self',
      power: 50,                   // +50% damage for duration
      buffType: 'damage_boost',
    },
  },

  paladin: {
    ability_1: {
      id: 'paladin_holy_shield',
      name: 'Holy Shield',
      description: 'Damage reduction for increased survivability',
      tier: 'Expert',
      cooldownMs: 20000,           // 20 seconds
      effectType: 'shield',
      targetType: 'self',
      power: 40,                   // 40% damage reduction
    },
    ability_2: {
      id: 'paladin_divine_intervention',
      name: 'Divine Intervention',
      description: 'Party invulnerability shield',
      tier: 'Master',
      cooldownMs: 45000,           // 45 seconds (very powerful)
      effectType: 'shield',
      targetType: 'party',
      power: 30,                   // 30% party-wide shield
    },
  },

  oathbreaker: {
    ability_1: {
      id: 'oathbreaker_dark_smite',
      name: 'Dark Smite',
      description: 'Life steal attack that heals self',
      tier: 'Expert',
      cooldownMs: 12000,           // 12 seconds
      effectType: 'damage',        // Damage with self-heal (handled specially)
      targetType: 'boss',
      power: 70,                   // Moderate damage + heal
    },
    ability_2: {
      id: 'oathbreaker_aura_of_dread',
      name: 'Aura of Dread',
      description: 'Enemy debuff that weakens opponents',
      tier: 'Master',
      cooldownMs: 25000,           // 25 seconds
      effectType: 'debuff',
      targetType: 'boss',
      power: 0,
      debuffType: 'attack_slow',   // Reduces boss attack speed
    },
  },

  // ========== HEALER CLASSES ==========
  cleric: {
    ability_1: {
      id: 'cleric_greater_heal',
      name: 'Greater Heal',
      description: 'Enhanced healing with increased power',
      tier: 'Expert',
      cooldownMs: 12000,           // 12 seconds
      effectType: 'heal',
      targetType: 'single',        // Lowest HP ally
      power: 50,                   // Strong single-target heal
    },
    ability_2: {
      id: 'cleric_resurrection',
      name: 'Resurrection',
      description: 'Instant revive without channeling',
      tier: 'Master',
      cooldownMs: 45000,           // 45 seconds (powerful utility)
      effectType: 'heal',
      targetType: 'single',        // One downed ally
      power: 50,                   // Revive at 50% HP
    },
  },

  bard: {
    ability_1: {
      id: 'bard_inspire',
      name: 'Inspire',
      description: 'Team damage buff to boost party DPS',
      tier: 'Expert',
      cooldownMs: 20000,           // 20 seconds
      effectType: 'buff',
      targetType: 'party',
      power: 30,                   // +30% damage to party
      buffType: 'damage_boost',
    },
    ability_2: {
      id: 'bard_ballad_of_heroes',
      name: 'Ballad of Heroes',
      description: 'Team heal over time effect',
      tier: 'Master',
      cooldownMs: 30000,           // 30 seconds
      effectType: 'heal',
      targetType: 'party',
      power: 25,                   // Party-wide heal
    },
  },

  // ========== DPS CLASSES ==========
  ranger: {
    ability_1: {
      id: 'ranger_volley',
      name: 'Volley',
      description: 'Multi-target shot that damages multiple enemies',
      tier: 'Expert',
      cooldownMs: 10000,           // 10 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 90,                   // Solid damage
    },
    ability_2: {
      id: 'ranger_eagle_eye',
      name: 'Eagle Eye',
      description: 'Critical hit bonus for increased damage',
      tier: 'Master',
      cooldownMs: 20000,           // 20 seconds
      effectType: 'buff',
      targetType: 'self',
      power: 40,                   // +40% crit chance
      buffType: 'crit_boost',
    },
  },

  rogue: {
    ability_1: {
      id: 'rogue_backstab',
      name: 'Backstab',
      description: 'Bonus damage from stealth positioning',
      tier: 'Expert',
      cooldownMs: 8000,            // 8 seconds (quick for sustained DPS)
      effectType: 'damage',
      targetType: 'boss',
      power: 120,                  // High burst damage
    },
    ability_2: {
      id: 'rogue_shadow_step',
      name: 'Shadow Step',
      description: 'Dodge incoming attacks with quick movement',
      tier: 'Master',
      cooldownMs: 25000,           // 25 seconds
      effectType: 'buff',
      targetType: 'self',
      power: 0,                    // Dodge buff (no numeric value)
      buffType: 'dodge',
    },
  },

  sorcerer: {
    ability_1: {
      id: 'sorcerer_fireball',
      name: 'Fireball',
      description: 'Area of effect damage spell',
      tier: 'Expert',
      cooldownMs: 10000,           // 10 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 100,                  // High burst damage
    },
    ability_2: {
      id: 'sorcerer_meteor_strike',
      name: 'Meteor Strike',
      description: 'Massive single-target damage',
      tier: 'Master',
      cooldownMs: 25000,           // 25 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 200,                  // Very high damage, long cooldown
    },
  },

  wizard: {
    ability_1: {
      id: 'wizard_arcane_missile',
      name: 'Arcane Missile',
      description: 'Guaranteed hit with reliable damage',
      tier: 'Expert',
      cooldownMs: 8000,            // 8 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 85,                   // Reliable damage
    },
    ability_2: {
      id: 'wizard_time_warp',
      name: 'Time Warp',
      description: 'Cooldown reduction for faster ability usage',
      tier: 'Master',
      cooldownMs: 35000,           // 35 seconds (powerful utility)
      effectType: 'buff',
      targetType: 'party',
      power: 0,                    // Cooldown reduction (special effect)
      buffType: 'cooldown_reduction',
    },
  },

  monk: {
    ability_1: {
      id: 'monk_flurry_of_blows',
      name: 'Flurry of Blows',
      description: 'Rapid sequence of attacks',
      tier: 'Expert',
      cooldownMs: 10000,           // 10 seconds
      effectType: 'damage',
      targetType: 'boss',
      power: 110,                  // High sustained DPS
    },
    ability_2: {
      id: 'monk_inner_peace',
      name: 'Inner Peace',
      description: 'Self-heal combined with damage boost',
      tier: 'Master',
      cooldownMs: 20000,           // 20 seconds
      effectType: 'heal',          // Hybrid ability
      targetType: 'self',
      power: 40,                   // Self-heal amount
    },
  },
};

/**
 * Helper function to get ability config by class and ability ID
 * @param avatarClass The player's class
 * @param abilityId The ability ID to look up
 * @returns AbilityDefinition or null if not found
 */
export function getAbilityConfig(
  avatarClass: AvatarClass,
  abilityId: string
): AbilityDefinition | null {
  const classAbilities = CLASS_ABILITY_CONFIGS[avatarClass];
  if (!classAbilities) return null;

  if (classAbilities.ability_1.id === abilityId) {
    return classAbilities.ability_1;
  }
  if (classAbilities.ability_2.id === abilityId) {
    return classAbilities.ability_2;
  }

  return null;
}

// =============================================================================
// Event Payload Interfaces
// =============================================================================

/**
 * Emitted when a player uses an ability
 */
export interface AbilityUsedPayload {
  lobbyId: string;
  playerId: string;
  abilityId: string;
  abilityName: string;
  effectType: AbilityEffectType;
  targetType: AbilityTargetType;
}

/**
 * Emitted when a cooldown starts for an ability
 */
export interface AbilityCooldownStartedPayload {
  lobbyId: string;
  playerId: string;
  abilityId: string;
  durationMs: number;
  expiresAt: number;
}

/**
 * Emitted when an ability effect is applied
 */
export interface AbilityEffectAppliedPayload {
  lobbyId: string;
  playerId: string;
  abilityId: string;
  effectType: AbilityEffectType;
  targetIds: string[];          // Player IDs or 'boss'
  value: number;                // Damage/heal amount or buff power
}
