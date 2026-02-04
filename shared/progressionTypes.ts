/**
 * Progression System Type Definitions
 *
 * Defines types and constants for the XP/leveling system.
 * All XP calculations and progression logic use these types.
 */

/**
 * Sources of XP awards
 */
export type XPSource = 'vote' | 'boss_damage' | 'consensus' | 'revival';

/**
 * Base XP rates for each action type
 */
export const XP_RATES = {
  vote: 10,              // Fixed XP per vote
  boss_damage: 2,        // XP per damage point dealt
  consensus: 50,         // Bonus for reaching consensus
  revival: 30,           // Base XP for reviving a teammate
} as const;

/**
 * XP curve configuration
 */
export interface XPCurveConfig {
  baseXP: number;        // Base XP for level 2 (100)
  exponent: number;      // Exponential growth factor (1.5)
}

/**
 * Payload emitted when XP is awarded
 */
export interface ProgressionXPAwardedPayload {
  lobbyId: string;
  playerId: string;
  amount: number;
  source: XPSource;
  newTotal: number;
}

/**
 * Payload emitted when player levels up
 */
export interface ProgressionLevelUpPayload {
  lobbyId: string;
  playerId: string;
  oldLevel: number;
  newLevel: number;
}
