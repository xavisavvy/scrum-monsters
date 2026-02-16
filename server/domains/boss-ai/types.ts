/**
 * Boss AI Types
 *
 * Core type definitions for boss behavior system.
 * These types replace the simple boolean `isEnraged` flag with rich,
 * data-driven boss behavior patterns.
 */

// =============================================================================
// State Machine Types
// =============================================================================

/**
 * Boss state enum for explicit FSM
 * Replaces boolean state flags with explicit states
 */
export type BossState =
  | 'idle'             // Waiting between attacks
  | 'telegraphing'     // Warning before attack
  | 'attacking'        // Executing attack
  | 'recovering'       // Cooldown after attack
  | 'phase_transition'; // Transitioning to new HP phase

/**
 * Boss phase number based on HP percentage
 * Phase 1: 100-67% HP
 * Phase 2: 66-34% HP
 * Phase 3: 33-0% HP
 */
export type BossPhaseNumber = 1 | 2 | 3;

// =============================================================================
// Attack Pattern Types
// =============================================================================

/**
 * Attack pattern definition
 * Data-driven approach to boss attacks
 */
export interface AttackPattern {
  id: string;
  name: string;
  phases: BossPhaseNumber[];     // Which HP phases this pattern is valid in
  weight: number;                // Relative probability (higher = more likely)
  telegraphMessage: string;
  telegraphDurationMs: number;   // 0 for instant (light attacks)
  visualEffect: 'charge' | 'glow' | 'shake' | 'particles' | 'none';
  attackType: 'light' | 'heavy' | 'special' | 'aoe';
  targetMode: 'highest_threat' | 'lowest_hp' | 'random' | 'all' | 'multi';
  targetCount?: number;          // For 'multi' mode
  baseDamage: number;            // Base damage before scaling
}

/**
 * Pattern action in a sequence
 */
export interface PatternAction {
  type: 'telegraph' | 'wait' | 'attack' | 'special';

  // For 'attack' type
  attackType?: 'light' | 'heavy' | 'special' | 'aoe';
  targetMode?: 'highest_threat' | 'lowest_hp' | 'random' | 'all' | 'multi';
  targetCount?: number;

  // For 'telegraph' type
  telegraphMessage?: string;
  telegraphDurationMs?: number;
  visualEffect?: 'charge' | 'glow' | 'shake' | 'particles' | 'none';

  // For 'wait' type
  delayMs?: number;

  // For 'special' type
  specialType?: 'spawn_minion' | 'heal' | 'buff' | 'debuff';
}

// =============================================================================
// Boss Behavior Types
// =============================================================================

/**
 * Boss type enum
 */
export type BossType =
  | 'bug-hydra'
  | 'sprint-demon'
  | 'deadline-dragon'
  | 'tech-debt-golem'
  | 'scope-creep-beast';

/**
 * Boss behavior definition
 * Each boss type implements unique patterns
 */
export interface BossBehavior {
  bossType: BossType;
  name: string;
  patterns: AttackPattern[];
  phaseTransitionMessages: Record<BossPhaseNumber, string>;
}

// =============================================================================
// Battle Context Types
// =============================================================================

/**
 * Battle context for decision-making
 */
export interface BattleContext {
  bossHp: number;
  bossMaxHp: number;
  currentPhase: BossPhaseNumber;
  playerCount: number;
  fightingPlayerCount: number;
  timeSinceBattleStart: number;
}

// =============================================================================
// Boss Action Types
// =============================================================================

/**
 * Boss action result from pattern selection
 */
export interface BossAction {
  pattern: AttackPattern;
  targetPlayerIds: string[];
}

// =============================================================================
// Threat Table Types
// =============================================================================

/**
 * Threat table entry for enhanced targeting
 */
export interface ThreatEntry {
  playerId: string;
  threat: number;
  lastActionAt: number;
}
