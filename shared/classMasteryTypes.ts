/**
 * Class Mastery System Type Definitions
 *
 * Defines types and constants for the per-class XP and mastery tier system.
 * Players gain class-specific XP for actions performed while playing each class.
 */

import { AvatarClass } from './gameEvents';
import type { XPSource } from './progressionTypes';

/**
 * Mastery tier levels for each class
 */
export type MasteryTier = 'Novice' | 'Expert' | 'Master';

/**
 * Configuration for a mastery tier
 */
export interface MasteryTierConfig {
  tier: MasteryTier;
  xpRequired: number;
  statMultiplier: number;
  abilitiesUnlocked: string[];
}

/**
 * Mastery tier configurations
 * - Novice: Starting tier, no bonuses
 * - Expert: 10% stat boost, first class ability
 * - Master: 20% stat boost, both class abilities
 */
export const MASTERY_TIERS: Record<MasteryTier, MasteryTierConfig> = {
  Novice: {
    tier: 'Novice',
    xpRequired: 0,
    statMultiplier: 1.0,
    abilitiesUnlocked: [],
  },
  Expert: {
    tier: 'Expert',
    xpRequired: 1000,
    statMultiplier: 1.1,
    abilitiesUnlocked: ['class_ability_1'],
  },
  Master: {
    tier: 'Master',
    xpRequired: 5000,
    statMultiplier: 1.2,
    abilitiesUnlocked: ['class_ability_1', 'class_ability_2'],
  },
} as const;

/**
 * Class XP rates per action type
 * Uses same rates as global XP for 1:1 parity with ProgressionManager
 */
export const CLASS_XP_RATES = {
  vote: 10,
  boss_damage: 2,
  consensus: 50,
  revival: 30,
} as const;

/**
 * Class ability definition
 */
export interface ClassAbilityDef {
  id: string;
  name: string;
  description: string;
  tier: MasteryTier;
}

/**
 * Class-specific abilities unlocked at Expert and Master tiers
 */
export const CLASS_ABILITIES: Record<AvatarClass, { ability_1: ClassAbilityDef; ability_2: ClassAbilityDef }> = {
  ranger: {
    ability_1: {
      id: 'ranger_volley',
      name: 'Volley',
      description: 'Multi-target shot that damages multiple enemies',
      tier: 'Expert',
    },
    ability_2: {
      id: 'ranger_eagle_eye',
      name: 'Eagle Eye',
      description: 'Critical hit bonus for increased damage',
      tier: 'Master',
    },
  },
  rogue: {
    ability_1: {
      id: 'rogue_backstab',
      name: 'Backstab',
      description: 'Bonus damage from stealth positioning',
      tier: 'Expert',
    },
    ability_2: {
      id: 'rogue_shadow_step',
      name: 'Shadow Step',
      description: 'Dodge incoming attacks with quick movement',
      tier: 'Master',
    },
  },
  bard: {
    ability_1: {
      id: 'bard_inspire',
      name: 'Inspire',
      description: 'Team damage buff to boost party DPS',
      tier: 'Expert',
    },
    ability_2: {
      id: 'bard_ballad_of_heroes',
      name: 'Ballad of Heroes',
      description: 'Team heal over time effect',
      tier: 'Master',
    },
  },
  sorcerer: {
    ability_1: {
      id: 'sorcerer_fireball',
      name: 'Fireball',
      description: 'Area of effect damage spell',
      tier: 'Expert',
    },
    ability_2: {
      id: 'sorcerer_meteor_strike',
      name: 'Meteor Strike',
      description: 'Massive single-target damage',
      tier: 'Master',
    },
  },
  wizard: {
    ability_1: {
      id: 'wizard_arcane_missile',
      name: 'Arcane Missile',
      description: 'Guaranteed hit with reliable damage',
      tier: 'Expert',
    },
    ability_2: {
      id: 'wizard_time_warp',
      name: 'Time Warp',
      description: 'Cooldown reduction for faster ability usage',
      tier: 'Master',
    },
  },
  warrior: {
    ability_1: {
      id: 'warrior_shield_bash',
      name: 'Shield Bash',
      description: 'Stun and damage combination attack',
      tier: 'Expert',
    },
    ability_2: {
      id: 'warrior_berserker_rage',
      name: 'Berserker Rage',
      description: 'Massive damage boost for limited time',
      tier: 'Master',
    },
  },
  paladin: {
    ability_1: {
      id: 'paladin_holy_shield',
      name: 'Holy Shield',
      description: 'Damage reduction for increased survivability',
      tier: 'Expert',
    },
    ability_2: {
      id: 'paladin_divine_intervention',
      name: 'Divine Intervention',
      description: 'Party invulnerability shield',
      tier: 'Master',
    },
  },
  cleric: {
    ability_1: {
      id: 'cleric_greater_heal',
      name: 'Greater Heal',
      description: 'Enhanced healing with increased power',
      tier: 'Expert',
    },
    ability_2: {
      id: 'cleric_resurrection',
      name: 'Resurrection',
      description: 'Instant revive without channeling',
      tier: 'Master',
    },
  },
  oathbreaker: {
    ability_1: {
      id: 'oathbreaker_dark_smite',
      name: 'Dark Smite',
      description: 'Life steal attack that heals self',
      tier: 'Expert',
    },
    ability_2: {
      id: 'oathbreaker_aura_of_dread',
      name: 'Aura of Dread',
      description: 'Enemy debuff that weakens opponents',
      tier: 'Master',
    },
  },
  monk: {
    ability_1: {
      id: 'monk_flurry_of_blows',
      name: 'Flurry of Blows',
      description: 'Rapid sequence of attacks',
      tier: 'Expert',
    },
    ability_2: {
      id: 'monk_inner_peace',
      name: 'Inner Peace',
      description: 'Self-heal combined with damage boost',
      tier: 'Master',
    },
  },
};

/**
 * ClassMasteryXPCurve handles tier calculations based on class XP
 */
export class ClassMasteryXPCurve {
  /**
   * Calculate the mastery tier for a given class XP total
   * @param classXP Total XP earned for this class
   * @returns Current mastery tier
   */
  calculateTier(classXP: number): MasteryTier {
    if (classXP >= MASTERY_TIERS.Master.xpRequired) {
      return 'Master';
    } else if (classXP >= MASTERY_TIERS.Expert.xpRequired) {
      return 'Expert';
    }
    return 'Novice';
  }

  /**
   * Get stat multiplier for a given class XP total
   * @param classXP Total XP earned for this class
   * @returns Stat multiplier (1.0, 1.1, or 1.2)
   */
  getTierMultiplier(classXP: number): number {
    const tier = this.calculateTier(classXP);
    return MASTERY_TIERS[tier].statMultiplier;
  }

  /**
   * Get unlocked abilities for a given class XP total
   * @param classXP Total XP earned for this class
   * @returns Array of unlocked ability IDs
   */
  getUnlockedAbilities(classXP: number): string[] {
    const tier = this.calculateTier(classXP);
    return MASTERY_TIERS[tier].abilitiesUnlocked;
  }

  /**
   * Calculate progress toward next tier
   * @param classXP Total XP earned for this class
   * @returns Object with current progress, XP needed, percentage, and tier info
   */
  getProgressToNextTier(classXP: number): {
    current: number;
    needed: number;
    percentage: number;
    currentTier: MasteryTier;
    nextTier: MasteryTier | null;
  } {
    const currentTier = this.calculateTier(classXP);

    // Determine next tier
    let nextTier: MasteryTier | null = null;
    let currentTierStart = 0;
    let nextTierXP = 0;

    if (currentTier === 'Novice') {
      nextTier = 'Expert';
      currentTierStart = MASTERY_TIERS.Novice.xpRequired;
      nextTierXP = MASTERY_TIERS.Expert.xpRequired;
    } else if (currentTier === 'Expert') {
      nextTier = 'Master';
      currentTierStart = MASTERY_TIERS.Expert.xpRequired;
      nextTierXP = MASTERY_TIERS.Master.xpRequired;
    } else {
      // Master tier - already at max
      return {
        current: classXP - MASTERY_TIERS.Master.xpRequired,
        needed: 0,
        percentage: 100,
        currentTier,
        nextTier: null,
      };
    }

    const current = classXP - currentTierStart;
    const needed = nextTierXP - currentTierStart;
    const percentage = needed > 0 ? Math.floor((current / needed) * 100) : 0;

    return {
      current,
      needed,
      percentage,
      currentTier,
      nextTier,
    };
  }
}

// =============================================================================
// Event Payload Interfaces
// =============================================================================

/**
 * Emitted when class XP is awarded to a player
 */
export interface ClassMasteryXPAwardedPayload {
  lobbyId: string;
  playerId: string;
  avatarClass: AvatarClass;
  amount: number;
  source: XPSource;
  newTotal: number;
}

/**
 * Emitted when a player's mastery tier increases for a class
 */
export interface ClassMasteryTierUpPayload {
  lobbyId: string;
  playerId: string;
  avatarClass: AvatarClass;
  oldTier: MasteryTier;
  newTier: MasteryTier;
}

/**
 * Payload for syncing class mastery data to client
 */
export interface ClassMasterySyncPayload {
  lobbyId: string;
  playerId: string;
  masteryData: Record<string, { classXP: number; currentTier: MasteryTier }>;
}
