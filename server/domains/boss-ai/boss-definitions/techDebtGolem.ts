/**
 * Tech Debt Golem Boss Behavior
 *
 * Theme: Slow but punishing AoE, accumulating pressure
 * Scrum analog: Legacy code weight
 * Personality: Heavy AoE attacks, escalating as fight progresses
 */

import type { BossBehavior, AttackPattern } from '../types';

const patterns: AttackPattern[] = [
  // Phase 1 patterns (100-67% HP)
  {
    id: 'tech-debt-golem-legacy-crush',
    name: 'Legacy Crush',
    phases: [1],
    weight: 20,
    telegraphMessage: 'The Golem\'s massive fist rises!',
    telegraphDurationMs: 1200,
    visualEffect: 'shake',
    attackType: 'heavy',
    targetMode: 'highest_threat',
    baseDamage: 28,
  },
  {
    id: 'tech-debt-golem-code-rot',
    name: 'Code Rot',
    phases: [1],
    weight: 20,
    telegraphMessage: 'Corruption spreads from the Golem!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'random',
    baseDamage: 16,
  },
  {
    id: 'tech-debt-golem-dependency-tangle',
    name: 'Dependency Tangle',
    phases: [1],
    weight: 10,
    telegraphMessage: 'Tangled code ensnares multiple targets!',
    telegraphDurationMs: 0,
    visualEffect: 'none',
    attackType: 'light',
    targetMode: 'multi',
    targetCount: 2,
    baseDamage: 14,
  },

  // Phase 2 patterns (66-34% HP)
  {
    id: 'tech-debt-golem-spaghetti-slam',
    name: 'Spaghetti Slam',
    phases: [2],
    weight: 20,
    telegraphMessage: 'The Golem unleashes tangled code chaos!',
    telegraphDurationMs: 1500,
    visualEffect: 'particles',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 26,
  },
  {
    id: 'tech-debt-golem-regression-wave',
    name: 'Regression Wave',
    phases: [2],
    weight: 15,
    telegraphMessage: 'A wave of broken code spreads!',
    telegraphDurationMs: 1200,
    visualEffect: 'glow',
    attackType: 'heavy',
    targetMode: 'multi',
    targetCount: 3,
    baseDamage: 30,
  },
  {
    id: 'tech-debt-golem-technical-burden',
    name: 'Technical Burden',
    phases: [2],
    weight: 15,
    telegraphMessage: 'The weight of legacy code bears down!',
    telegraphDurationMs: 1500,
    visualEffect: 'charge',
    attackType: 'special',
    targetMode: 'highest_threat',
    baseDamage: 34,
  },

  // Phase 3 patterns (33-0% HP)
  {
    id: 'tech-debt-golem-system-collapse',
    name: 'System Collapse',
    phases: [3],
    weight: 25,
    telegraphMessage: 'The entire system begins to fail!',
    telegraphDurationMs: 2000,
    visualEffect: 'shake',
    attackType: 'aoe',
    targetMode: 'all',
    baseDamage: 38,
  },
  {
    id: 'tech-debt-golem-critical-failure',
    name: 'Critical Failure',
    phases: [3],
    weight: 20,
    telegraphMessage: 'A critical error targets the weakest link!',
    telegraphDurationMs: 1500,
    visualEffect: 'glow',
    attackType: 'special',
    targetMode: 'lowest_hp',
    baseDamage: 44,
  },
  {
    id: 'tech-debt-golem-entropy-cascade',
    name: 'Entropy Cascade',
    phases: [3],
    weight: 15,
    telegraphMessage: 'Chaos spreads to multiple systems!',
    telegraphDurationMs: 1200,
    visualEffect: 'particles',
    attackType: 'heavy',
    targetMode: 'multi',
    targetCount: 4,
    baseDamage: 33,
  },
];

export const TECH_DEBT_GOLEM_BEHAVIOR: BossBehavior = {
  bossType: 'tech-debt-golem',
  name: 'Technical Debt Golem',
  sprite: 'technical-debt-golem.png',
  description: 'Crushing Burden of Legacy Code',
  patterns,
  phaseTransitionMessages: {
    1: '',
    2: 'The Tech Debt Golem\'s cracks spread wider!',
    3: 'The Golem crumbles and reforms, stronger than before!',
  },
};
