/**
 * Boss AI Domain Index
 *
 * Central export point for all boss AI components.
 * Provides a clean API for CombatManager integration.
 */

// Core coordinator
export { BossAI } from './BossAI';

// Subsystem components
export { BossStateMachine } from './BossStateMachine';
export { PatternSequencer } from './PatternSequencer';
export { ThreatEvaluator } from './ThreatEvaluator';

// Boss definitions
export {
  BOSS_BEHAVIORS,
  SPRITE_TO_BOSS_TYPE,
  getBossBehavior,
  getBossTypeFromSprite,
} from './boss-definitions';

// Types
export type {
  BossState,
  BossPhaseNumber,
  AttackPattern,
  PatternAction,
  BossType,
  BossBehavior,
  BattleContext,
  BossAction,
  ThreatEntry,
} from './types';
