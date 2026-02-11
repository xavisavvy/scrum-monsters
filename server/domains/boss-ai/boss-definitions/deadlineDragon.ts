/**
 * Deadline Dragon Boss Behavior
 *
 * Theme: Heavy hitters, time pressure, devastating single-target
 * Scrum analog: Looming deadlines
 * Personality: Slow but punishing, emphasizes threat targeting
 */

import type { BossBehavior, AttackPattern } from '../types';

const patterns: AttackPattern[] = [
  // Phase 1 patterns (100-67% HP)
  {
    id: 'deadline-dragon-time-claw',
    name: 'Time Claw',
    phases: [1],
    weight: 20,
    telegraphMessage: 'The Dragon\'s claw glows with temporal energy!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'highest_threat',
    baseDamage: 20,
  },
  {
    id: 'deadline-dragon-deadline-pressure',
    name: 'Deadline Pressure',
    phases: [1],
    weight: 15,
    telegraphMessage: 'Time itself weighs down on the target!',
    telegraphDurationMs: 1200,
    visualEffect: 'glow',
    attackType: 'heavy',
    targetMode: 'highest_threat',
    baseDamage: 32,
  },
  {
    id: 'deadline-dragon-temporal-warning',
    name: 'Temporal Warning',
    phases: [1],
    weight: 15,
    telegraphMessage: 'The Dragon issues a warning strike!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'random',
    baseDamage: 18,
  },

  // Phase 2 patterns (66-34% HP)
  {
    id: 'deadline-dragon-time-crunch',
    name: 'Time Crunch',
    phases: [2],
    weight: 20,
    telegraphMessage: 'The deadline approaches rapidly!',
    telegraphDurationMs: 1500,
    visualEffect: 'charge',
    attackType: 'special',
    targetMode: 'highest_threat',
    baseDamage: 38,
  },
  {
    id: 'deadline-dragon-clock-strike',
    name: 'Clock Strike',
    phases: [2],
    weight: 15,
    telegraphMessage: 'The Dragon\'s wings sweep like clock hands!',
    telegraphDurationMs: 1200,
    visualEffect: 'glow',
    attackType: 'heavy',
    targetMode: 'multi',
    targetCount: 2,
    baseDamage: 30,
  },
  {
    id: 'deadline-dragon-tick-tock',
    name: 'Tick Tock',
    phases: [2],
    weight: 15,
    telegraphMessage: 'The sound of ticking echoes!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'random',
    baseDamage: 20,
  },

  // Phase 3 patterns (33-0% HP)
  {
    id: 'deadline-dragon-deadline-apocalypse',
    name: 'Deadline Apocalypse',
    phases: [3],
    weight: 20,
    telegraphMessage: 'THE DEADLINE IS HERE!',
    telegraphDurationMs: 2000,
    visualEffect: 'shake',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 45,
  },
  {
    id: 'deadline-dragon-final-hour',
    name: 'Final Hour',
    phases: [3],
    weight: 25,
    telegraphMessage: 'Time runs out for the weakest!',
    telegraphDurationMs: 1500,
    visualEffect: 'glow',
    attackType: 'special',
    targetMode: 'lowest_hp',
    baseDamage: 50,
  },
  {
    id: 'deadline-dragon-overtime-slam',
    name: 'Overtime Slam',
    phases: [3],
    weight: 15,
    telegraphMessage: 'The Dragon channels overtime fury!',
    telegraphDurationMs: 1000,
    visualEffect: 'charge',
    attackType: 'heavy',
    targetMode: 'highest_threat',
    baseDamage: 40,
  },
];

export const DEADLINE_DRAGON_BEHAVIOR: BossBehavior = {
  bossType: 'deadline-dragon',
  name: 'Deadline Dragon',
  patterns,
  phaseTransitionMessages: {
    1: '',
    2: 'The Deadline Dragon\'s eyes glow with urgency!',
    3: 'THE DEADLINE IS HERE! The Dragon unleashes its full fury!',
  },
};
