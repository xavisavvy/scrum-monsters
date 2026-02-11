/**
 * PatternSequencer Tests
 *
 * Tests for weighted pattern selection with phase filtering.
 * RED phase: These tests should FAIL initially.
 */

import { describe, it, expect } from 'vitest';
import { PatternSequencer } from './PatternSequencer';
import type { AttackPattern, BossPhaseNumber } from './types';

describe('PatternSequencer', () => {
  // Test patterns
  const testPatterns: AttackPattern[] = [
    {
      id: 'light-1',
      name: 'Quick Jab',
      phases: [1, 2, 3],
      weight: 10,
      telegraphMessage: '',
      telegraphDurationMs: 0,
      visualEffect: 'none',
      attackType: 'light',
      targetMode: 'random',
      baseDamage: 25,
    },
    {
      id: 'heavy-1',
      name: 'Heavy Strike',
      phases: [1, 2],
      weight: 5,
      telegraphMessage: 'Boss winds up...',
      telegraphDurationMs: 1000,
      visualEffect: 'charge',
      attackType: 'heavy',
      targetMode: 'highest_threat',
      baseDamage: 40,
    },
    {
      id: 'special-1',
      name: 'Enrage Roar',
      phases: [3],
      weight: 15,
      telegraphMessage: 'Boss is enraged!',
      telegraphDurationMs: 1500,
      visualEffect: 'glow',
      attackType: 'special',
      targetMode: 'all',
      baseDamage: 50,
    },
    {
      id: 'aoe-1',
      name: 'Ground Slam',
      phases: [2, 3],
      weight: 8,
      telegraphMessage: 'Boss raises fist...',
      telegraphDurationMs: 1200,
      visualEffect: 'shake',
      attackType: 'aoe',
      targetMode: 'all',
      baseDamage: 35,
    },
  ];

  describe('Pattern Filtering', () => {
    it('filters patterns by current phase', () => {
      const phase1Patterns = PatternSequencer.getAvailablePatterns(testPatterns, 1);
      expect(phase1Patterns).toHaveLength(2); // light-1 and heavy-1
      expect(phase1Patterns.map(p => p.id).sort()).toEqual(['heavy-1', 'light-1']);

      const phase2Patterns = PatternSequencer.getAvailablePatterns(testPatterns, 2);
      expect(phase2Patterns).toHaveLength(3); // light-1, heavy-1, aoe-1
      expect(phase2Patterns.map(p => p.id).sort()).toEqual(['aoe-1', 'heavy-1', 'light-1']);

      const phase3Patterns = PatternSequencer.getAvailablePatterns(testPatterns, 3);
      expect(phase3Patterns).toHaveLength(3); // light-1, special-1, aoe-1
      expect(phase3Patterns.map(p => p.id).sort()).toEqual(['aoe-1', 'light-1', 'special-1']);
    });

    it('returns empty array when no patterns match phase', () => {
      const noPhasePatterns: AttackPattern[] = [
        {
          id: 'impossible',
          name: 'Impossible',
          phases: [], // No valid phases
          weight: 1,
          telegraphMessage: '',
          telegraphDurationMs: 0,
          visualEffect: 'none',
          attackType: 'light',
          targetMode: 'random',
          baseDamage: 1,
        },
      ];
      const result = PatternSequencer.getAvailablePatterns(noPhasePatterns, 1);
      expect(result).toHaveLength(0);
    });
  });

  describe('Pattern Selection', () => {
    it('selectPattern returns a pattern from available pool', () => {
      const selected = PatternSequencer.selectPattern(testPatterns, 1);
      expect(selected).not.toBeNull();
      expect(['light-1', 'heavy-1']).toContain(selected!.id);
    });

    it('selectPattern returns null when no patterns available', () => {
      const result = PatternSequencer.selectPattern([], 1);
      expect(result).toBeNull();
    });

    it('selectPattern respects weights (weight=10 pattern selected ~10x more often than weight=1)', () => {
      const weightTestPatterns: AttackPattern[] = [
        {
          id: 'high-weight',
          name: 'High Weight',
          phases: [1],
          weight: 10,
          telegraphMessage: '',
          telegraphDurationMs: 0,
          visualEffect: 'none',
          attackType: 'light',
          targetMode: 'random',
          baseDamage: 10,
        },
        {
          id: 'low-weight',
          name: 'Low Weight',
          phases: [1],
          weight: 1,
          telegraphMessage: '',
          telegraphDurationMs: 0,
          visualEffect: 'none',
          attackType: 'light',
          targetMode: 'random',
          baseDamage: 10,
        },
      ];

      let highWeightCount = 0;
      let lowWeightCount = 0;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const selected = PatternSequencer.selectPattern(weightTestPatterns, 1);
        if (selected?.id === 'high-weight') {
          highWeightCount++;
        } else if (selected?.id === 'low-weight') {
          lowWeightCount++;
        }
      }

      // High weight should be selected ~10x more often (with tolerance)
      // Expected ratio: ~909:91 for weight 10:1
      const ratio = highWeightCount / (lowWeightCount || 1);
      expect(ratio).toBeGreaterThan(7); // Allow some variance
      expect(ratio).toBeLessThan(13);
    });
  });

  describe('Anti-Repeat Logic', () => {
    it('avoids repeating last pattern when alternatives exist', () => {
      const multiPatterns: AttackPattern[] = [
        { id: 'p1', name: 'P1', phases: [1], weight: 1, telegraphMessage: '', telegraphDurationMs: 0, visualEffect: 'none', attackType: 'light', targetMode: 'random', baseDamage: 10 },
        { id: 'p2', name: 'P2', phases: [1], weight: 1, telegraphMessage: '', telegraphDurationMs: 0, visualEffect: 'none', attackType: 'light', targetMode: 'random', baseDamage: 10 },
        { id: 'p3', name: 'P3', phases: [1], weight: 1, telegraphMessage: '', telegraphDurationMs: 0, visualEffect: 'none', attackType: 'light', targetMode: 'random', baseDamage: 10 },
      ];

      let consecutiveRepeats = 0;
      let lastId: string | undefined;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const selected = PatternSequencer.selectPattern(multiPatterns, 1, lastId);
        if (selected) {
          if (selected.id === lastId) {
            consecutiveRepeats++;
          }
          lastId = selected.id;
        }
      }

      // With 3 patterns and anti-repeat, we should see ZERO consecutive repeats
      expect(consecutiveRepeats).toBe(0);
    });

    it('allows repeat when only one pattern available', () => {
      const singlePattern: AttackPattern[] = [
        { id: 'only', name: 'Only', phases: [1], weight: 1, telegraphMessage: '', telegraphDurationMs: 0, visualEffect: 'none', attackType: 'light', targetMode: 'random', baseDamage: 10 },
      ];

      const first = PatternSequencer.selectPattern(singlePattern, 1);
      expect(first?.id).toBe('only');

      // Should allow selecting same pattern again when it's the only option
      const second = PatternSequencer.selectPattern(singlePattern, 1, 'only');
      expect(second?.id).toBe('only');
    });
  });
});
