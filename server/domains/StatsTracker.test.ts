/**
 * StatsTracker Unit Tests (TDD)
 *
 * Tests event-driven stats tracking and session summary aggregation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatsTracker } from './StatsTracker';
import { ScopedEventBus } from '../events';
import type { IStorage } from '../storage';

describe('StatsTracker', () => {
  let tracker: StatsTracker;
  let eventBus: ScopedEventBus;
  let storage: IStorage;
  let getUserId: (lobbyId: string, playerId: string) => number | undefined;
  let emittedEvents: Record<string, any[]>;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    emittedEvents = {};

    // Spy on event emissions
    const originalEmit = eventBus.emit.bind(eventBus);
    eventBus.emit = ((event: any, payload: any) => {
      if (!emittedEvents[event]) {
        emittedEvents[event] = [];
      }
      emittedEvents[event].push(payload);
      return originalEmit(event, payload);
    }) as typeof eventBus.emit;

    // Mock storage
    storage = {
      incrementUserStat: vi.fn().mockResolvedValue(undefined),
      updateUserStats: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock getUserId
    getUserId = vi.fn((lobbyId: string, playerId: string) => {
      // Return userId as hash of playerId for testing
      return parseInt(playerId.replace(/\D/g, '')) || 1;
    });

    tracker = new StatsTracker({
      eventBus,
      storage,
      getUserId,
    });
  });

  // =============================================================================
  // Vote Tracking (4 tests)
  // =============================================================================

  describe('Vote Tracking', () => {
    it('handleVoteCast increments totalVotes in session summary', () => {
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary).toBeDefined();
      expect(summary!.totalVotes).toBe(1);
    });

    it('handleVoteCast tracks voting speed when votingStartedAt provided', () => {
      // First emit voting_started to establish baseline
      const votingStartedAt = Date.now() - 5000; // 5 seconds ago
      eventBus.emit('estimation:voting_started', {
        lobbyId: 'lobby1',
        ticketId: 'ticket1',
      });

      // Manually set the voting start time (simulating what voting_started would do)
      (tracker as any).votingStartTimes.set('lobby1', votingStartedAt);

      // Then emit vote_cast
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary).toBeDefined();
      expect(summary!.averageVotingSpeedMs).toBeGreaterThan(4000); // Should be ~5000ms
      expect(summary!.averageVotingSpeedMs).toBeLessThan(6000);
    });

    it('handleVoteCast calls persistStat for totalVotes', () => {
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });

      expect(storage.incrementUserStat).toHaveBeenCalledWith(
        expect.any(Number),
        'totalVotes',
        1
      );
    });

    it('multiple votes accumulate correctly', () => {
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 8,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 3,
        team: 'developers',
      });

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary!.totalVotes).toBe(3);
    });
  });

  // =============================================================================
  // Consensus Tracking (2 tests)
  // =============================================================================

  describe('Consensus Tracking', () => {
    it('handleConsensus increments consensusCount for each voter', () => {
      // First cast votes
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player2',
        vote: 5,
        team: 'developers',
      });

      // Then trigger consensus
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId: 'lobby1',
        ticketId: 'ticket1',
      });

      const summary1 = tracker.getSessionSummary('lobby1', 'player1');
      const summary2 = tracker.getSessionSummary('lobby1', 'player2');

      expect(summary1!.consensusCount).toBe(1);
      expect(summary2!.consensusCount).toBe(1);
    });

    it('consensusRate computed correctly at session end', () => {
      // Cast 3 votes for player1, 2 in consensus
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId: 'lobby1',
        ticketId: 'ticket1',
      });

      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 8,
        team: 'developers',
      });
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId: 'lobby1',
        ticketId: 'ticket2',
      });

      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 3,
        team: 'developers',
      });
      // No consensus on third vote

      // Trigger phase change to game_over
      eventBus.emit('session:phase_changed', {
        lobbyId: 'lobby1',
        oldPhase: 'battle',
        newPhase: 'game_over',
      });

      // Should have called updateUserStats with consensusRate = 2/3 * 100 = 66.66...
      expect(storage.updateUserStats).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          consensusRate: expect.any(Number),
        })
      );

      // Verify the rate is close to 66.67
      const calls = (storage.updateUserStats as any).mock.calls;
      const rateCall = calls.find((c: any) => c[1].consensusRate !== undefined);
      expect(rateCall).toBeDefined();
      expect(rateCall[1].consensusRate).toBeGreaterThan(66);
      expect(rateCall[1].consensusRate).toBeLessThan(67);
    });
  });

  // =============================================================================
  // Combat Tracking (5 tests)
  // =============================================================================

  describe('Combat Tracking', () => {
    it('handleBossDamage increments totalDamageDealt by damage amount', () => {
      eventBus.emit('combat:boss_damaged', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        damage: 25,
        bossHealth: 475,
      });

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary!.totalDamageDealt).toBe(25);
    });

    it('handleBossDefeated increments bossesDefeated for all session players', () => {
      // First, make sure some players have session data
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player2',
        vote: 5,
        team: 'developers',
      });

      // Now defeat boss
      eventBus.emit('combat:boss_defeated', {
        lobbyId: 'lobby1',
        bossId: 'bug-hydra',
      });

      const summary1 = tracker.getSessionSummary('lobby1', 'player1');
      const summary2 = tracker.getSessionSummary('lobby1', 'player2');

      expect(summary1!.bossesDefeated).toBe(1);
      expect(summary2!.bossesDefeated).toBe(1);
    });

    it('handleRevival increments revives for the reviver player', () => {
      eventBus.emit('combat:player_revived', {
        lobbyId: 'lobby1',
        playerId: 'player2', // The downed player
        reviverId: 'player1', // The reviver
      });

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary!.revives).toBe(1);
    });

    it('handleDeath increments deaths for downed player', () => {
      eventBus.emit('combat:player_permanently_downed', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        message: 'Player1 has been defeated',
      });

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary!.deaths).toBe(1);
    });

    it('fire-and-forget persistence called for each combat stat', () => {
      eventBus.emit('combat:boss_damaged', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        damage: 25,
        bossHealth: 475,
      });

      expect(storage.incrementUserStat).toHaveBeenCalledWith(
        expect.any(Number),
        'totalDamageDealt',
        25
      );

      eventBus.emit('combat:player_revived', {
        lobbyId: 'lobby1',
        playerId: 'player2',
        reviverId: 'player1',
      });

      expect(storage.incrementUserStat).toHaveBeenCalledWith(
        expect.any(Number),
        'revivesPerformed',
        1
      );

      eventBus.emit('combat:player_permanently_downed', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        message: 'Defeated',
      });

      expect(storage.incrementUserStat).toHaveBeenCalledWith(
        expect.any(Number),
        'totalDeaths',
        1
      );
    });
  });

  // =============================================================================
  // Session Summary (3 tests)
  // =============================================================================

  describe('Session Summary', () => {
    it('handlePhaseChange emits stats:session_complete at game_over', () => {
      // Create some session data
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });

      // Clear emitted events
      emittedEvents = {};

      // Trigger phase change to game_over
      eventBus.emit('session:phase_changed', {
        lobbyId: 'lobby1',
        oldPhase: 'battle',
        newPhase: 'game_over',
      });

      expect(emittedEvents['stats:session_complete']).toBeDefined();
      expect(emittedEvents['stats:session_complete'].length).toBe(1);
      expect(emittedEvents['stats:session_complete'][0].lobbyId).toBe('lobby1');
      expect(emittedEvents['stats:session_complete'][0].summaries).toBeDefined();
    });

    it('handlePhaseChange emits stats:session_complete at victory', () => {
      // Create some session data
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });

      // Clear emitted events
      emittedEvents = {};

      // Trigger phase change to victory
      eventBus.emit('session:phase_changed', {
        lobbyId: 'lobby1',
        oldPhase: 'battle',
        newPhase: 'victory',
      });

      expect(emittedEvents['stats:session_complete']).toBeDefined();
      expect(emittedEvents['stats:session_complete'][0].lobbyId).toBe('lobby1');
    });

    it('session summary contains correct aggregated values', () => {
      // Create diverse session data
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 8,
        team: 'developers',
      });

      eventBus.emit('combat:boss_damaged', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        damage: 50,
        bossHealth: 450,
      });

      eventBus.emit('combat:player_revived', {
        lobbyId: 'lobby1',
        playerId: 'player2',
        reviverId: 'player1',
      });

      eventBus.emit('combat:player_permanently_downed', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        message: 'Defeated',
      });

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary).toBeDefined();
      expect(summary!.totalVotes).toBe(2);
      expect(summary!.totalDamageDealt).toBe(50);
      expect(summary!.revives).toBe(1);
      expect(summary!.deaths).toBe(1);
    });
  });

  // =============================================================================
  // Cleanup (2 tests)
  // =============================================================================

  describe('Cleanup', () => {
    it('cleanupLobby removes all session data', () => {
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });

      tracker.cleanupLobby('lobby1');

      const summary = tracker.getSessionSummary('lobby1', 'player1');
      expect(summary).toBeNull();
    });

    it("cleanupLobby doesn't affect other lobbies", () => {
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby2',
        playerId: 'player1',
        vote: 8,
        team: 'developers',
      });

      tracker.cleanupLobby('lobby1');

      const summary1 = tracker.getSessionSummary('lobby1', 'player1');
      const summary2 = tracker.getSessionSummary('lobby2', 'player1');

      expect(summary1).toBeNull();
      expect(summary2).toBeDefined();
      expect(summary2!.totalVotes).toBe(1);
    });
  });

  // =============================================================================
  // Additional: getVoters tracking
  // =============================================================================

  describe('Consensus voter tracking', () => {
    it('tracks voters correctly for consensus event', () => {
      // Setup: need to track who has voted
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player2',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby1',
        playerId: 'player3',
        vote: 5,
        team: 'developers',
      });

      // Emit consensus - this should increment consensusCount for all voters
      eventBus.emit('estimation:full_consensus_reached', {
        lobbyId: 'lobby1',
        ticketId: 'ticket1',
      });

      const summary1 = tracker.getSessionSummary('lobby1', 'player1');
      const summary2 = tracker.getSessionSummary('lobby1', 'player2');
      const summary3 = tracker.getSessionSummary('lobby1', 'player3');

      expect(summary1!.consensusCount).toBe(1);
      expect(summary2!.consensusCount).toBe(1);
      expect(summary3!.consensusCount).toBe(1);
    });
  });
});
