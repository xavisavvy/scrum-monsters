/**
 * Bug Hydra Boss Behavior
 *
 * Theme: Multi-headed, multi-target, spawning
 * Scrum analog: Bugs that multiply
 * Personality: Swarm-focused, prefers hitting multiple targets
 */

import type { BossBehavior, AttackPattern } from '../types';

const patterns: AttackPattern[] = [
  // Phase 1 patterns (100-67% HP)
  {
    id: 'bug-hydra-bite-swarm',
    name: 'Bite Swarm',
    phases: [1],
    weight: 20,
    telegraphMessage: 'The Hydra\'s heads dart forward!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'multi',
    targetCount: 2,
    baseDamage: 15,
  },
  {
    id: 'bug-hydra-venomous-snap',
    name: 'Venomous Snap',
    phases: [1],
    weight: 15,
    telegraphMessage: 'A head targets the biggest threat!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'highest_threat',
    baseDamage: 18,
  },
  {
    id: 'bug-hydra-spawn-buglings',
    name: 'Spawn Buglings',
    phases: [1],
    weight: 10,
    telegraphMessage: 'The Hydra shudders... something is emerging!',
    telegraphDurationMs: 1500,
    visualEffect: 'particles',
    attackType: 'special',
    targetMode: 'random',
    baseDamage: 12,
  },

  // Phase 2 patterns (66-34% HP)
  {
    id: 'bug-hydra-hydra-fury',
    name: 'Hydra Fury',
    phases: [2],
    weight: 20,
    telegraphMessage: 'Multiple heads rear back in fury!',
    telegraphDurationMs: 1000,
    visualEffect: 'charge',
    attackType: 'heavy',
    targetMode: 'multi',
    targetCount: 3,
    baseDamage: 28,
  },
  {
    id: 'bug-hydra-toxic-spray',
    name: 'Toxic Spray',
    phases: [2],
    weight: 15,
    telegraphMessage: 'The Hydra inhales deeply!',
    telegraphDurationMs: 1200,
    visualEffect: 'glow',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 22,
  },
  {
    id: 'bug-hydra-regrow-head',
    name: 'Regrow Head',
    phases: [2],
    weight: 10,
    telegraphMessage: 'A severed neck begins to writhe!',
    telegraphDurationMs: 1500,
    visualEffect: 'particles',
    attackType: 'special',
    targetMode: 'random',
    baseDamage: 16,
  },

  // Phase 3 patterns (33-0% HP)
  {
    id: 'bug-hydra-pestilence-storm',
    name: 'Pestilence Storm',
    phases: [3],
    weight: 25,
    telegraphMessage: 'The air fills with pestilence!',
    telegraphDurationMs: 1500,
    visualEffect: 'particles',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 35,
  },
  {
    id: 'bug-hydra-death-bite',
    name: 'Death Bite',
    phases: [3],
    weight: 20,
    telegraphMessage: 'A head lunges at the weakest prey!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'special',
    targetMode: 'lowest_hp',
    baseDamage: 40,
  },
  {
    id: 'bug-hydra-endless-swarm',
    name: 'Endless Swarm',
    phases: [3],
    weight: 15,
    telegraphMessage: 'All heads strike in unison!',
    telegraphDurationMs: 1000,
    visualEffect: 'shake',
    attackType: 'heavy',
    targetMode: 'multi',
    targetCount: 4,
    baseDamage: 32,
  },
];

export const BUG_HYDRA_BEHAVIOR: BossBehavior = {
  bossType: 'bug-hydra',
  name: 'Bug Hydra',
  patterns,
  phaseTransitionMessages: {
    1: '',
    2: 'The Bug Hydra sprouts new heads!',
    3: 'The Bug Hydra enters a frenzy of multiplication!',
  },
};
