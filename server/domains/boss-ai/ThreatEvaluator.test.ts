/**
 * ThreatEvaluator Tests
 *
 * Tests for action-specific threat tracking and weighted targeting.
 * RED phase: These tests should FAIL initially.
 */

import { describe, it, expect } from 'vitest';
import { ThreatEvaluator } from './ThreatEvaluator';
import type { ThreatEntry } from './types';

describe('ThreatEvaluator', () => {
  describe('Threat Management', () => {
    it('addThreat creates new entry for unknown player', () => {
      const threatTable = new Map<string, ThreatEntry>();

      ThreatEvaluator.addThreat(threatTable, 'player1', 'damage', 100);

      expect(threatTable.has('player1')).toBe(true);
      const entry = threatTable.get('player1')!;
      expect(entry.threat).toBe(100); // 100 * 1.0 weight
      expect(entry.lastActionAt).toBeGreaterThan(0);
    });

    it('addThreat accumulates threat for known player', () => {
      const threatTable = new Map<string, ThreatEntry>();

      ThreatEvaluator.addThreat(threatTable, 'player1', 'damage', 50);
      ThreatEvaluator.addThreat(threatTable, 'player1', 'damage', 30);

      const entry = threatTable.get('player1')!;
      expect(entry.threat).toBe(80); // 50 + 30
    });

    it('addThreat applies correct weight for damage (1.0x)', () => {
      const threatTable = new Map<string, ThreatEntry>();

      ThreatEvaluator.addThreat(threatTable, 'player1', 'damage', 100);

      expect(threatTable.get('player1')!.threat).toBe(100);
    });

    it('addThreat applies correct weight for healing (0.8x)', () => {
      const threatTable = new Map<string, ThreatEntry>();

      ThreatEvaluator.addThreat(threatTable, 'healer', 'healing', 100);

      expect(threatTable.get('healer')!.threat).toBe(80); // 100 * 0.8
    });

    it('addThreat applies fixed threat for revival (150)', () => {
      const threatTable = new Map<string, ThreatEntry>();

      ThreatEvaluator.addThreat(threatTable, 'healer', 'revival', 0); // Amount ignored for revival

      expect(threatTable.get('healer')!.threat).toBe(150);
    });
  });

  describe('Target Selection', () => {
    it('selectTarget returns highest threat player 70% of the time', () => {
      const threatTable = new Map<string, ThreatEntry>([
        ['high', { playerId: 'high', threat: 1000, lastActionAt: Date.now() }],
        ['medium', { playerId: 'medium', threat: 500, lastActionAt: Date.now() }],
        ['low', { playerId: 'low', threat: 100, lastActionAt: Date.now() }],
      ]);

      const alivePlayers = ['high', 'medium', 'low'];
      let highThreatCount = 0;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const target = ThreatEvaluator.selectTarget(threatTable, alivePlayers);
        if (target === 'high') {
          highThreatCount++;
        }
      }

      // Should select highest threat ~70% of time (with tolerance)
      expect(highThreatCount).toBeGreaterThan(620); // ~70% - 80 tolerance
      expect(highThreatCount).toBeLessThan(780);    // ~70% + 80 tolerance
    });

    it('selectTarget returns random player when no threat data', () => {
      const threatTable = new Map<string, ThreatEntry>();
      const alivePlayers = ['player1', 'player2', 'player3'];

      const target = ThreatEvaluator.selectTarget(threatTable, alivePlayers);

      expect(target).not.toBeNull();
      expect(alivePlayers).toContain(target!);
    });

    it('selectTarget excludes downed/ghost players (only targets alive players)', () => {
      const threatTable = new Map<string, ThreatEntry>([
        ['alive1', { playerId: 'alive1', threat: 100, lastActionAt: Date.now() }],
        ['downed', { playerId: 'downed', threat: 500, lastActionAt: Date.now() }],
      ]);

      const alivePlayers = ['alive1']; // Only alive1 is fighting

      const target = ThreatEvaluator.selectTarget(threatTable, alivePlayers);

      // Should only target alive1, even though downed has more threat
      expect(target).toBe('alive1');
    });

    it('selectTarget returns null when no alive players', () => {
      const threatTable = new Map<string, ThreatEntry>([
        ['downed', { playerId: 'downed', threat: 100, lastActionAt: Date.now() }],
      ]);

      const alivePlayers: string[] = [];

      const target = ThreatEvaluator.selectTarget(threatTable, alivePlayers);

      expect(target).toBeNull();
    });
  });

  describe('Threat Cleanup', () => {
    it('cleanupPlayer removes player from threat table', () => {
      const threatTable = new Map<string, ThreatEntry>([
        ['player1', { playerId: 'player1', threat: 100, lastActionAt: Date.now() }],
        ['player2', { playerId: 'player2', threat: 200, lastActionAt: Date.now() }],
      ]);

      ThreatEvaluator.cleanupPlayer(threatTable, 'player1');

      expect(threatTable.has('player1')).toBe(false);
      expect(threatTable.has('player2')).toBe(true);
    });
  });

  describe('Threat Decay', () => {
    it('decayThreat reduces all entries by decay amount', () => {
      const threatTable = new Map<string, ThreatEntry>([
        ['player1', { playerId: 'player1', threat: 100, lastActionAt: Date.now() }],
        ['player2', { playerId: 'player2', threat: 50, lastActionAt: Date.now() }],
      ]);

      ThreatEvaluator.decayThreat(threatTable, 20);

      expect(threatTable.get('player1')!.threat).toBe(80);
      expect(threatTable.get('player2')!.threat).toBe(30);
    });

    it('decayThreat removes entries with threat <= 0', () => {
      const threatTable = new Map<string, ThreatEntry>([
        ['player1', { playerId: 'player1', threat: 15, lastActionAt: Date.now() }],
        ['player2', { playerId: 'player2', threat: 50, lastActionAt: Date.now() }],
      ]);

      ThreatEvaluator.decayThreat(threatTable, 20);

      expect(threatTable.has('player1')).toBe(false); // 15 - 20 = -5, removed
      expect(threatTable.has('player2')).toBe(true);  // 50 - 20 = 30, kept
      expect(threatTable.get('player2')!.threat).toBe(30);
    });
  });
});
