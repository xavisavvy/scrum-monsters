/**
 * Combo System Type Definitions
 *
 * Defines types and configurations for team combo attacks and consensus ultimates.
 * Combos trigger when specific class combinations use abilities within a timing window.
 */

import { AvatarClass } from './gameEvents';

// =============================================================================
// Core Combo Types
// =============================================================================

/**
 * Combo trigger condition - defines a class-pair requirement
 */
export interface ComboTrigger {
  classA: AvatarClass;
  classB: AvatarClass;
  requireBothClasses: boolean; // True: both must use abilities, False: either can trigger
}

/**
 * Complete combo definition with triggers, damage, and cooldown
 */
export interface ComboDefinition {
  id: string;                   // Unique combo identifier (e.g., 'shield_wall')
  name: string;                 // Display name (e.g., 'Shield Wall')
  description: string;          // Flavor text
  triggers: ComboTrigger[];     // One or more class-pair conditions (any match = combo triggers)
  damageMultiplier: number;     // Damage multiplier (e.g., 1.5 = 50% bonus)
  cooldownMs: number;           // Per-combo cooldown in milliseconds
  baseDamage: number;           // Flat damage dealt by combo
  visualEffect: string;         // Effect identifier for client rendering
}

// =============================================================================
// Event Payload Interfaces
// =============================================================================

/**
 * Emitted when a class-pair combo is triggered
 */
export interface ComboTriggeredPayload {
  lobbyId: string;
  comboId: string;
  comboName: string;
  triggeringPlayerId: string;
  participantPlayerIds: string[];  // All players whose abilities contributed
  damage: number;                  // Total combo damage dealt
  damageMultiplier: number;
  visualEffect: string;            // Visual effect identifier for client rendering
}

/**
 * Emitted when consensus ultimate is triggered
 */
export interface ConsensusUltimatePayload {
  lobbyId: string;
  damage: number;                  // Total ultimate damage dealt
  damageMultiplier: number;
  votingDurationMs: number;
}

// =============================================================================
// Class Combo Configurations
// =============================================================================

/**
 * All class-pair combos
 * Each combo triggers when specific class combinations use abilities within 3s window
 */
export const CLASS_COMBOS: ComboDefinition[] = [
  // ========== TANK + HEALER COMBOS ==========
  {
    id: 'shield_wall',
    name: 'Shield Wall',
    description: 'Tank and healer combine defenses for massive party protection',
    triggers: [
      { classA: 'warrior', classB: 'cleric', requireBothClasses: true },
      { classA: 'paladin', classB: 'bard', requireBothClasses: true },
    ],
    damageMultiplier: 1.3,
    cooldownMs: 30000, // 30 seconds
    baseDamage: 150,
    visualEffect: 'shield_barrier',
  },

  // ========== HEALER + DPS COMBOS ==========
  {
    id: 'blessed_strike',
    name: 'Blessed Strike',
    description: 'Healer buffs empower DPS abilities with holy damage',
    triggers: [
      { classA: 'cleric', classB: 'sorcerer', requireBothClasses: true },
      { classA: 'bard', classB: 'ranger', requireBothClasses: true },
    ],
    damageMultiplier: 1.5,
    cooldownMs: 25000, // 25 seconds
    baseDamage: 120,
    visualEffect: 'holy_flames',
  },

  // ========== TANK + DPS COMBOS ==========
  {
    id: 'crushing_assault',
    name: 'Crushing Assault',
    description: 'Tank opens enemy defenses, DPS delivers devastating blow',
    triggers: [
      { classA: 'warrior', classB: 'rogue', requireBothClasses: true },
      { classA: 'oathbreaker', classB: 'monk', requireBothClasses: true },
    ],
    damageMultiplier: 1.6,
    cooldownMs: 20000, // 20 seconds
    baseDamage: 130,
    visualEffect: 'shatter_impact',
  },

  // ========== DPS + DPS COMBOS ==========
  {
    id: 'elemental_fury',
    name: 'Elemental Fury',
    description: 'Combined spellcasting creates explosive magical reaction',
    triggers: [
      { classA: 'sorcerer', classB: 'wizard', requireBothClasses: true },
    ],
    damageMultiplier: 1.7,
    cooldownMs: 35000, // 35 seconds
    baseDamage: 140,
    visualEffect: 'arcane_explosion',
  },

  // ========== MULTI-CLASS COMBOS ==========
  {
    id: 'perfect_synergy',
    name: 'Perfect Synergy',
    description: 'Three different roles combine for ultimate coordination',
    triggers: [
      // Use unique class pairs that don't overlap with other combos
      // Tank + DPS combinations
      { classA: 'paladin', classB: 'wizard', requireBothClasses: true },
      { classA: 'oathbreaker', classB: 'ranger', requireBothClasses: true },
    ],
    damageMultiplier: 2.0,
    cooldownMs: 45000, // 45 seconds
    baseDamage: 200,
    visualEffect: 'divine_storm',
  },
];

/**
 * Helper function to get combo definition by ID
 * @param comboId The combo ID to look up
 * @returns ComboDefinition or undefined if not found
 */
export function getComboById(comboId: string): ComboDefinition | undefined {
  return CLASS_COMBOS.find((combo) => combo.id === comboId);
}

// =============================================================================
// Consensus Ultimate Constants
// =============================================================================

/**
 * Base damage for consensus ultimate (before multiplier)
 */
export const CONSENSUS_ULTIMATE_BASE_DAMAGE = 250;

/**
 * Minimum damage multiplier for slow voting (60 seconds)
 */
export const CONSENSUS_MIN_MULTIPLIER = 1.5;

/**
 * Maximum damage multiplier for fast voting (10 seconds)
 */
export const CONSENSUS_MAX_MULTIPLIER = 3.0;

/**
 * Voting duration for maximum multiplier (10 seconds)
 */
export const CONSENSUS_FAST_VOTE_MS = 10000;

/**
 * Voting duration for minimum multiplier (60 seconds)
 */
export const CONSENSUS_SLOW_VOTE_MS = 60000;
