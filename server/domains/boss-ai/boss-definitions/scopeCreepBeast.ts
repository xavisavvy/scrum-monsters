/**
 * Scope Creep Beast Boss Behavior
 *
 * Theme: Escalating damage per phase, growing stronger
 * Scrum analog: Ever-expanding requirements
 * Personality: Damage increases dramatically with each phase
 */

import type { BossBehavior, AttackPattern } from '../types';

const patterns: AttackPattern[] = [
  // Phase 1 patterns (100-67% HP) - Low damage
  {
    id: 'scope-creep-beast-feature-nibble',
    name: 'Feature Nibble',
    phases: [1],
    weight: 25,
    telegraphMessage: 'The Beast nibbles at a feature!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'random',
    baseDamage: 15,
  },
  {
    id: 'scope-creep-beast-requirement-bite',
    name: 'Requirement Bite',
    phases: [1],
    weight: 20,
    telegraphMessage: 'The Beast adds another requirement!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'highest_threat',
    baseDamage: 18,
  },
  {
    id: 'scope-creep-beast-scope-expansion',
    name: 'Scope Expansion',
    phases: [1],
    weight: 10,
    telegraphMessage: 'The scope begins to expand!',
    telegraphDurationMs: 1000,
    visualEffect: 'glow',
    attackType: 'heavy',
    targetMode: 'random',
    baseDamage: 25,
  },

  // Phase 2 patterns (66-34% HP) - Increased damage
  {
    id: 'scope-creep-beast-bloated-strike',
    name: 'Bloated Strike',
    phases: [2],
    weight: 20,
    telegraphMessage: 'The Beast has grown massive with features!',
    telegraphDurationMs: 1200,
    visualEffect: 'charge',
    attackType: 'heavy',
    targetMode: 'highest_threat',
    baseDamage: 35,
  },
  {
    id: 'scope-creep-beast-feature-flood',
    name: 'Feature Flood',
    phases: [2],
    weight: 15,
    telegraphMessage: 'A flood of features overwhelms everyone!',
    telegraphDurationMs: 1500,
    visualEffect: 'particles',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 20,
  },
  {
    id: 'scope-creep-beast-requirement-avalanche',
    name: 'Requirement Avalanche',
    phases: [2],
    weight: 15,
    telegraphMessage: 'Requirements avalanche down!',
    telegraphDurationMs: 1200,
    visualEffect: 'shake',
    attackType: 'special',
    targetMode: 'multi',
    targetCount: 3,
    baseDamage: 30,
  },

  // Phase 3 patterns (33-0% HP) - Maximum damage
  {
    id: 'scope-creep-beast-total-scope-explosion',
    name: 'Total Scope Explosion',
    phases: [3],
    weight: 25,
    telegraphMessage: 'ALL BOUNDARIES HAVE BEEN CONSUMED!',
    telegraphDurationMs: 2000,
    visualEffect: 'particles',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 40,
  },
  {
    id: 'scope-creep-beast-never-ending-story',
    name: 'Never-ending Story',
    phases: [3],
    weight: 20,
    telegraphMessage: 'The requirements will never end!',
    telegraphDurationMs: 1500,
    visualEffect: 'glow',
    attackType: 'special',
    targetMode: 'highest_threat',
    baseDamage: 50,
  },
  {
    id: 'scope-creep-beast-kitchen-sink',
    name: 'Kitchen Sink',
    phases: [3],
    weight: 15,
    telegraphMessage: 'The Beast throws everything at once!',
    telegraphDurationMs: 1000,
    visualEffect: 'shake',
    attackType: 'heavy',
    targetMode: 'multi',
    targetCount: 4,
    baseDamage: 35,
  },
];

export const SCOPE_CREEP_BEAST_BEHAVIOR: BossBehavior = {
  bossType: 'scope-creep-beast',
  name: 'Scope Creep Beast',
  sprite: 'scope-creep-beast.png',
  description: 'Ever-Expanding Horror of Feature Bloat',
  patterns,
  phaseTransitionMessages: {
    1: '',
    2: 'The Scope Creep Beast grows larger!',
    3: 'The beast has consumed all boundaries! TOTAL SCOPE FAILURE!',
  },
};
