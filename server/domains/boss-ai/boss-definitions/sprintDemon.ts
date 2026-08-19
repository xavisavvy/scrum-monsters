/**
 * Sprint Demon Boss Behavior
 *
 * Theme: Speed, rapid attacks, short telegraphs
 * Scrum analog: Rushed sprints
 * Personality: Fast and aggressive, minimal warning time
 */

import type { BossBehavior, AttackPattern } from '../types';

const patterns: AttackPattern[] = [
  // Phase 1 patterns (100-67% HP)
  {
    id: 'sprint-demon-quick-slash',
    name: 'Quick Slash',
    phases: [1],
    weight: 25,
    telegraphMessage: 'The Demon blurs into motion!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'random',
    baseDamage: 14,
  },
  {
    id: 'sprint-demon-rushing-strike',
    name: 'Rushing Strike',
    phases: [1],
    weight: 20,
    telegraphMessage: 'The Demon locks onto its target!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'highest_threat',
    baseDamage: 16,
  },
  {
    id: 'sprint-demon-sprint-burst',
    name: 'Sprint Burst',
    phases: [1],
    weight: 10,
    telegraphMessage: 'The Demon coils to spring!',
    telegraphDurationMs: 500,
    visualEffect: 'charge',
    attackType: 'heavy',
    targetMode: 'random',
    baseDamage: 24,
  },

  // Phase 2 patterns (66-34% HP)
  {
    id: 'sprint-demon-blinding-speed',
    name: 'Blinding Speed',
    phases: [2],
    weight: 25,
    telegraphMessage: 'The Demon becomes a blur!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'multi',
    targetCount: 2,
    baseDamage: 18,
  },
  {
    id: 'sprint-demon-time-pressure',
    name: 'Time Pressure',
    phases: [2],
    weight: 20,
    telegraphMessage: 'The Demon builds momentum!',
    telegraphDurationMs: 500,
    visualEffect: 'glow',
    attackType: 'heavy',
    targetMode: 'highest_threat',
    baseDamage: 30,
  },
  {
    id: 'sprint-demon-velocity-crash',
    name: 'Velocity Crash',
    phases: [2],
    weight: 10,
    telegraphMessage: 'The Demon reaches critical velocity!',
    telegraphDurationMs: 800,
    visualEffect: 'charge',
    attackType: 'special',
    targetMode: 'random',
    baseDamage: 26,
  },

  // Phase 3 patterns (33-0% HP)
  {
    id: 'sprint-demon-hypersonic-fury',
    name: 'Hypersonic Fury',
    phases: [3],
    weight: 20,
    telegraphMessage: 'The air screams with speed!',
    telegraphDurationMs: 600,
    visualEffect: 'shake',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 32,
  },
  {
    id: 'sprint-demon-final-sprint',
    name: 'Final Sprint',
    phases: [3],
    weight: 25,
    telegraphMessage: 'The Demon channels all its speed into one strike!',
    telegraphDurationMs: 800,
    visualEffect: 'glow',
    attackType: 'special',
    targetMode: 'highest_threat',
    baseDamage: 42,
  },
  {
    id: 'sprint-demon-burnout-blast',
    name: 'Burnout Blast',
    phases: [3],
    weight: 15,
    telegraphMessage: 'The Demon targets the weak!',
    telegraphDurationMs: 500,
    visualEffect: 'charge',
    attackType: 'heavy',
    targetMode: 'lowest_hp',
    baseDamage: 36,
  },
];

export const SPRINT_DEMON_BEHAVIOR: BossBehavior = {
  bossType: 'sprint-demon',
  name: 'Sprint Demon',
  sprite: 'sprint-demon.png',
  description: 'Infernal Master of Rushed Deadlines',
  patterns,
  phaseTransitionMessages: {
    1: '',
    2: 'The Sprint Demon accelerates!',
    3: 'The Sprint Demon reaches terminal velocity!',
  },
};
