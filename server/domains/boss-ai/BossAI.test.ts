/**
 * BossAI Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BossAI } from './BossAI';
import { BOSS_BEHAVIORS, getBossTypeFromSprite, SPRITE_TO_BOSS_TYPE } from './boss-definitions';
import type { BossType, BattleContext, ThreatEntry } from './types';

// =========================================================================
// Task 1 (TDD RED): BossBehavior sprite + description fields
// =========================================================================
describe('BossBehavior sprite and description fields', () => {
  it('all 5 boss behaviors have a non-empty sprite field', () => {
    for (const behavior of Object.values(BOSS_BEHAVIORS)) {
      expect(behavior.sprite, `${behavior.bossType} should have sprite`).toBeTruthy();
      expect(typeof behavior.sprite).toBe('string');
    }
  });

  it('all 5 boss behaviors have a non-empty description field', () => {
    for (const behavior of Object.values(BOSS_BEHAVIORS)) {
      expect(behavior.description, `${behavior.bossType} should have description`).toBeTruthy();
      expect(typeof behavior.description).toBe('string');
    }
  });

  it('TECH_DEBT_GOLEM_BEHAVIOR.sprite is technical-debt-golem.png (golem fix)', () => {
    expect(BOSS_BEHAVIORS['tech-debt-golem'].sprite).toBe('technical-debt-golem.png');
  });

  it('bug-hydra sprite is bug-hydra.png', () => {
    expect(BOSS_BEHAVIORS['bug-hydra'].sprite).toBe('bug-hydra.png');
  });

  it('sprint-demon sprite is sprint-demon.png', () => {
    expect(BOSS_BEHAVIORS['sprint-demon'].sprite).toBe('sprint-demon.png');
  });

  it('deadline-dragon sprite is deadline-dragon.png', () => {
    expect(BOSS_BEHAVIORS['deadline-dragon'].sprite).toBe('deadline-dragon.png');
  });

  it('scope-creep-beast sprite is scope-creep-beast.png', () => {
    expect(BOSS_BEHAVIORS['scope-creep-beast'].sprite).toBe('scope-creep-beast.png');
  });
});

// =========================================================================
// Task 2 (TDD RED): Derived SPRITE_TO_BOSS_TYPE + round-trip/regression
// =========================================================================
describe('SPRITE_TO_BOSS_TYPE derived from BOSS_BEHAVIORS', () => {
  it('has exactly 5 entries (one per boss)', () => {
    expect(Object.keys(SPRITE_TO_BOSS_TYPE).length).toBe(5);
  });

  it('all 5 sprite→bossType pairs round-trip via getBossTypeFromSprite', () => {
    for (const behavior of Object.values(BOSS_BEHAVIORS)) {
      expect(getBossTypeFromSprite(behavior.sprite)).toBe(behavior.bossType);
    }
  });

  it('golem regression: getBossTypeFromSprite(technical-debt-golem.png) === tech-debt-golem', () => {
    expect(getBossTypeFromSprite('technical-debt-golem.png')).toBe('tech-debt-golem');
  });

  it('old wrong golem key tech-debt-golem.png returns null (stale key gone)', () => {
    expect(getBossTypeFromSprite('tech-debt-golem.png')).toBeNull();
  });
});

describe('BossAI', () => {
  describe('creates BossAI for each boss type', () => {
    const bossTypes: BossType[] = [
      'bug-hydra',
      'sprint-demon',
      'deadline-dragon',
      'tech-debt-golem',
      'scope-creep-beast',
    ];

    bossTypes.forEach((bossType) => {
      it(`creates BossAI for ${bossType}`, () => {
        const ai = new BossAI(bossType);
        expect(ai.getBossType()).toBe(bossType);
        expect(ai.getBehavior()).toBeDefined();
        expect(ai.getBehavior().patterns.length).toBeGreaterThan(0);
      });
    });
  });

  describe('selectNextAction', () => {
    let bugHydraAI: BossAI;
    let threatTable: Map<string, ThreatEntry>;
    let context: BattleContext;

    beforeEach(() => {
      bugHydraAI = new BossAI('bug-hydra');
      threatTable = new Map();
      context = {
        bossHp: 100,
        bossMaxHp: 100,
        currentPhase: 1,
        playerCount: 4,
        fightingPlayerCount: 4,
        timeSinceBattleStart: 0,
      };
    });

    it('returns action with valid pattern for phase 1', () => {
      const alivePlayers = ['player1', 'player2', 'player3', 'player4'];
      const action = bugHydraAI.selectNextAction(context, threatTable, alivePlayers);

      expect(action).not.toBeNull();
      expect(action?.pattern).toBeDefined();
      expect(action?.pattern.phases).toContain(1);
      expect(action?.targetPlayerIds).toBeDefined();
      expect(action?.targetPlayerIds.length).toBeGreaterThan(0);
    });

    it('returns action with targets matching pattern targetMode', () => {
      const alivePlayers = ['player1', 'player2', 'player3', 'player4'];

      // Add threat to make targeting predictable
      threatTable.set('player1', { playerId: 'player1', threat: 100, lastActionAt: Date.now() });

      const action = bugHydraAI.selectNextAction(context, threatTable, alivePlayers);

      expect(action).not.toBeNull();
      expect(action?.targetPlayerIds).toBeDefined();

      // Verify targets are from alive players
      action?.targetPlayerIds.forEach(targetId => {
        expect(alivePlayers).toContain(targetId);
      });
    });

    it('returns null when no alive players', () => {
      const alivePlayers: string[] = [];
      const action = bugHydraAI.selectNextAction(context, threatTable, alivePlayers);

      expect(action).toBeNull();
    });

    it('selects different patterns across multiple calls', () => {
      const alivePlayers = ['player1', 'player2'];
      const patterns = new Set<string>();

      // Call multiple times to get different patterns
      for (let i = 0; i < 20; i++) {
        const action = bugHydraAI.selectNextAction(context, threatTable, alivePlayers);
        if (action) {
          patterns.add(action.pattern.id);
        }
      }

      // Should have selected multiple different patterns
      expect(patterns.size).toBeGreaterThan(1);
    });

    it('selects patterns for phase 2 when HP is in phase 2 range', () => {
      const alivePlayers = ['player1', 'player2'];
      context.bossHp = 50; // 50% HP = Phase 2

      const action = bugHydraAI.selectNextAction(context, threatTable, alivePlayers);

      expect(action).not.toBeNull();
      expect(action?.pattern.phases).toContain(2);
    });

    it('selects patterns for phase 3 when HP is in phase 3 range', () => {
      const alivePlayers = ['player1', 'player2'];
      context.bossHp = 30; // 30% HP = Phase 3

      const action = bugHydraAI.selectNextAction(context, threatTable, alivePlayers);

      expect(action).not.toBeNull();
      expect(action?.pattern.phases).toContain(3);
    });
  });

  describe('checkPhaseTransition', () => {
    let ai: BossAI;

    beforeEach(() => {
      ai = new BossAI('bug-hydra');
    });

    it('returns transitioned=true when HP crosses 66% threshold', () => {
      const result = ai.checkPhaseTransition(65, 100);

      expect(result.transitioned).toBe(true);
      expect(result.newPhase).toBe(2);
      expect(result.message).toBe('The Bug Hydra sprouts new heads!');
    });

    it('returns transitioned=false when same phase', () => {
      const result1 = ai.checkPhaseTransition(80, 100);
      expect(result1.transitioned).toBe(false);

      const result2 = ai.checkPhaseTransition(75, 100);
      expect(result2.transitioned).toBe(false);
    });

    it('returns transitioned=true when HP crosses 33% threshold', () => {
      // First transition to phase 2
      ai.checkPhaseTransition(65, 100);

      // Then transition to phase 3
      const result = ai.checkPhaseTransition(32, 100);

      expect(result.transitioned).toBe(true);
      expect(result.newPhase).toBe(3);
      expect(result.message).toBe('The Bug Hydra enters a frenzy of multiplication!');
    });

    it('returns correct message per boss type', () => {
      const deadlineDragon = new BossAI('deadline-dragon');
      const result = deadlineDragon.checkPhaseTransition(65, 100);

      expect(result.transitioned).toBe(true);
      expect(result.newPhase).toBe(2);
      expect(result.message).toBe('The Deadline Dragon\'s eyes glow with urgency!');
    });

    it('prevents phase oscillation (one-way transitions)', () => {
      // Transition to phase 2
      const result1 = ai.checkPhaseTransition(50, 100);
      expect(result1.transitioned).toBe(true);
      expect(result1.newPhase).toBe(2);

      // HP goes back up (shouldn't happen in real game, but test the guard)
      const result2 = ai.checkPhaseTransition(80, 100);
      expect(result2.transitioned).toBe(false);
      expect(result2.newPhase).toBe(2); // Stays in phase 2
    });
  });

  describe('recordThreat', () => {
    it('delegates to ThreatEvaluator', () => {
      const ai = new BossAI('bug-hydra');
      const threatTable = new Map<string, ThreatEntry>();

      ai.recordThreat(threatTable, 'player1', 'damage', 50);

      expect(threatTable.has('player1')).toBe(true);
      expect(threatTable.get('player1')?.threat).toBe(50);
    });

    it('accumulates threat across multiple actions', () => {
      const ai = new BossAI('bug-hydra');
      const threatTable = new Map<string, ThreatEntry>();

      ai.recordThreat(threatTable, 'player1', 'damage', 50);
      ai.recordThreat(threatTable, 'player1', 'damage', 30);

      expect(threatTable.get('player1')?.threat).toBe(80);
    });
  });

  describe('cleanupPlayer', () => {
    it('removes player from threat table', () => {
      const ai = new BossAI('bug-hydra');
      const threatTable = new Map<string, ThreatEntry>();

      ai.recordThreat(threatTable, 'player1', 'damage', 50);
      expect(threatTable.has('player1')).toBe(true);

      ai.cleanupPlayer(threatTable, 'player1');
      expect(threatTable.has('player1')).toBe(false);
    });
  });

  describe('selectNextAction uses different patterns for different boss types', () => {
    it('Bug Hydra vs Deadline Dragon produce different pattern IDs', () => {
      const bugHydra = new BossAI('bug-hydra');
      const deadlineDragon = new BossAI('deadline-dragon');

      const alivePlayers = ['player1', 'player2'];
      const threatTable = new Map<string, ThreatEntry>();
      const context: BattleContext = {
        bossHp: 100,
        bossMaxHp: 100,
        currentPhase: 1,
        playerCount: 2,
        fightingPlayerCount: 2,
        timeSinceBattleStart: 0,
      };

      const bugHydraPatterns = new Set<string>();
      const dragonPatterns = new Set<string>();

      // Collect patterns from multiple calls
      for (let i = 0; i < 10; i++) {
        const bugAction = bugHydra.selectNextAction(context, threatTable, alivePlayers);
        const dragonAction = deadlineDragon.selectNextAction(context, threatTable, alivePlayers);

        if (bugAction) bugHydraPatterns.add(bugAction.pattern.id);
        if (dragonAction) dragonPatterns.add(dragonAction.pattern.id);
      }

      // Bug Hydra patterns should have 'bug-hydra' prefix
      bugHydraPatterns.forEach(id => {
        expect(id).toContain('bug-hydra');
      });

      // Deadline Dragon patterns should have 'deadline-dragon' prefix
      dragonPatterns.forEach(id => {
        expect(id).toContain('deadline-dragon');
      });

      // No overlap between pattern sets
      bugHydraPatterns.forEach(id => {
        expect(dragonPatterns.has(id)).toBe(false);
      });
    });
  });
});
