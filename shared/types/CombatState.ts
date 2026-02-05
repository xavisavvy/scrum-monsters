/**
 * CombatState - Combat Domain State
 *
 * Represents the boss battle domain, separate from Session and Estimation
 * domains. This type manages:
 * - Boss identity and health
 * - Player health and positions during battle
 * - Battle timing and damage modifiers
 *
 * Uses ID-based references to maintain domain isolation. Session and player
 * details are stored separately and looked up by ID when needed.
 *
 * Note: Uses Map types for runtime state. These will be converted to Record
 * types for serialization in later phases.
 */

export interface CombatState {
  /** Reference to session by ID */
  lobbyId: string;

  /** ID of current boss (optional when no boss active) */
  bossId?: string;

  /** Current boss HP */
  bossHealth: number;

  /** Maximum boss HP */
  bossMaxHealth: number;

  /** Player ID to health mapping */
  playerHealth: Map<string, number>;

  /** Player ID to position mapping */
  playerPositions: Map<string, { x: number; y: number }>;

  /** Unix timestamp when battle started (optional when battle not active) */
  battleStartTime?: number;

  /** Damage modifier (increases over time during battle) */
  battleModifier: number;
}
