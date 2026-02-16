/**
 * Boss Definitions Index
 *
 * Central registry for all boss behaviors.
 * Provides lookup functions for boss behaviors and type mapping.
 */

import type { BossBehavior, BossType } from '../types';
import { BUG_HYDRA_BEHAVIOR } from './bugHydra';
import { SPRINT_DEMON_BEHAVIOR } from './sprintDemon';
import { DEADLINE_DRAGON_BEHAVIOR } from './deadlineDragon';
import { TECH_DEBT_GOLEM_BEHAVIOR } from './techDebtGolem';
import { SCOPE_CREEP_BEAST_BEHAVIOR } from './scopeCreepBeast';

/**
 * Central behavior registry
 * Maps BossType to its behavior definition
 */
export const BOSS_BEHAVIORS: Record<BossType, BossBehavior> = {
  'bug-hydra': BUG_HYDRA_BEHAVIOR,
  'sprint-demon': SPRINT_DEMON_BEHAVIOR,
  'deadline-dragon': DEADLINE_DRAGON_BEHAVIOR,
  'tech-debt-golem': TECH_DEBT_GOLEM_BEHAVIOR,
  'scope-creep-beast': SCOPE_CREEP_BEAST_BEHAVIOR,
};

/**
 * Get boss behavior by type
 * @param bossType Boss type identifier
 * @returns Boss behavior definition
 * @throws Error if boss type not found
 */
export function getBossBehavior(bossType: BossType): BossBehavior {
  const behavior = BOSS_BEHAVIORS[bossType];
  if (!behavior) {
    throw new Error(`Unknown boss type: ${bossType}`);
  }
  return behavior;
}

/**
 * Sprite filename to BossType mapping
 * Maps sprite filenames to BossType enum values
 */
const SPRITE_TO_BOSS_TYPE: Record<string, BossType> = {
  'bug-hydra.png': 'bug-hydra',
  'sprint-demon.png': 'sprint-demon',
  'deadline-dragon.png': 'deadline-dragon',
  'tech-debt-golem.png': 'tech-debt-golem',
  'scope-creep-beast.png': 'scope-creep-beast',
};

/**
 * Get boss type from sprite filename
 * @param sprite Sprite filename (e.g., 'bug-hydra.png')
 * @returns Boss type or null if not found
 */
export function getBossTypeFromSprite(sprite: string): BossType | null {
  return SPRITE_TO_BOSS_TYPE[sprite] || null;
}
