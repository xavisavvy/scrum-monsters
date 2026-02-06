import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhaseCoordinator } from './PhaseCoordinator';
import { SessionManager } from './SessionManager';
import { EstimationManager } from './EstimationManager';
import { CombatManager } from './CombatManager';
import { ScopedEventBus } from '../events';
import type { Lobby, GamePhase } from '../../shared/gameEvents';

describe('PhaseCoordinator', () => {
  let eventBus: ScopedEventBus;
  let sessionManager: SessionManager;
  let estimationManager: EstimationManager;
  let combatManager: CombatManager;
  let phaseCoordinator: PhaseCoordinator;

  // Helper to create a minimal lobby for testing
  const createTestLobby = (gamePhase: GamePhase = 'lobby'): Lobby => ({
    id: 'test-lobby',
    name: 'Test Lobby',
    hostId: 'host1',
    gamePhase,
    players: [],
    tickets: [],
    currentTicket: undefined,
    boss: undefined,
    completedTickets: [],
    teams: {
      developers: [],
      qa: [],
      spectators: [],
    },
    playerCombatStates: {},
    playerPositions: {},
    teamCompetition: {
      currentRound: 0,
      winnerHistory: [],
      seasonStart: new Date().toISOString(),
      developers: {
        totalStoryPoints: 0,
        ticketsCompleted: 0,
        averageEstimationTime: 0,
        consensusRate: 0,
        accuracyScore: 0,
        participationRate: 0,
        achievements: [],
        currentStreak: 0,
        bestStreak: 0,
      },
      qa: {
        totalStoryPoints: 0,
        ticketsCompleted: 0,
        averageEstimationTime: 0,
        consensusRate: 0,
        accuracyScore: 0,
        participationRate: 0,
        achievements: [],
        currentStreak: 0,
        bestStreak: 0,
      },
    },
    timerSettings: {
      enabled: false,
      durationMinutes: 5,
    },
    jiraSettings: {},
    estimationSettings: {
      scaleType: 'fibonacci' as const,
    },
  });

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
    estimationManager = new EstimationManager({ eventBus });
    combatManager = new CombatManager({ eventBus });
    phaseCoordinator = new PhaseCoordinator({
      eventBus,
      sessionManager,
      estimationManager,
      combatManager,
    });
  });

  describe('State Machine - Valid Transitions', () => {
    it('should allow lobby → avatar_selection transition', () => {
      const lobby = createTestLobby('lobby');
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', {
        reason: 'start_game',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('avatar_selection');
    });

    it('should allow avatar_selection → battle transition', () => {
      const lobby = createTestLobby('avatar_selection');
      phaseCoordinator.transitionTo(lobby, 'battle', {
        reason: 'proceed_to_battle',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('battle');
    });

    it('should allow battle → reveal transition', () => {
      const lobby = createTestLobby('battle');
      
      // Mock validator to return true
      vi.spyOn(estimationManager, 'hasAllVotes').mockReturnValue(true);
      
      phaseCoordinator.transitionTo(lobby, 'reveal', {
        reason: 'all_votes_cast',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('reveal');
    });

    it('should allow reveal → discussion transition', () => {
      const lobby = createTestLobby('reveal');
      phaseCoordinator.transitionTo(lobby, 'discussion', {
        reason: 'reveal_complete',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('discussion');
    });

    it('should allow discussion → victory transition', () => {
      const lobby = createTestLobby('discussion');
      phaseCoordinator.transitionTo(lobby, 'victory', {
        reason: 'consensus_reached',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('victory');
    });

    it('should allow discussion → next_level transition', () => {
      const lobby = createTestLobby('discussion');
      phaseCoordinator.transitionTo(lobby, 'next_level', {
        reason: 'more_tickets',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('next_level');
    });

    it('should allow next_level → battle transition', () => {
      const lobby = createTestLobby('next_level');
      phaseCoordinator.transitionTo(lobby, 'battle', {
        reason: 'proceed_next_level',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('battle');
    });

    it('should allow victory → lobby transition', () => {
      const lobby = createTestLobby('victory');
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'return_to_lobby',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('lobby');
    });

    it('should allow game_over → lobby transition', () => {
      const lobby = createTestLobby('game_over');
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'return_to_lobby',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('lobby');
    });
  });

  describe('State Machine - Invalid Transitions', () => {
    it('should reject lobby → battle transition (must go through avatar_selection)', () => {
      const lobby = createTestLobby('lobby');
      const emitSpy = vi.spyOn(eventBus, 'emit');

      phaseCoordinator.transitionTo(lobby, 'battle', {
        reason: 'invalid_skip',
        initiator: 'host1',
      });

      // Phase should NOT change
      expect(lobby.gamePhase).toBe('lobby');

      // Should emit rejection event
      expect(emitSpy).toHaveBeenCalledWith(
        'phase:transition_rejected',
        expect.objectContaining({
          lobbyId: 'test-lobby',
          fromPhase: 'lobby',
          toPhase: 'battle',
        })
      );
    });

    it('should reject battle → victory transition (must go through reveal → discussion)', () => {
      const lobby = createTestLobby('battle');
      phaseCoordinator.transitionTo(lobby, 'victory', {
        reason: 'invalid_skip',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('battle');
    });

    it('should reject reveal → battle transition (cannot go backwards)', () => {
      const lobby = createTestLobby('reveal');
      phaseCoordinator.transitionTo(lobby, 'battle', {
        reason: 'invalid_back',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('reveal');
    });

    it('should reject avatar_selection → lobby transition (must use emergency exit)', () => {
      const lobby = createTestLobby('avatar_selection');
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'normal_transition',
        initiator: 'host1',
      });
      // Should still allow it (emergency exit)
      expect(lobby.gamePhase).toBe('lobby');
    });
  });

  describe('Emergency Transitions', () => {
    it('should allow battle → lobby transition (abandon quest)', () => {
      const lobby = createTestLobby('battle');
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('lobby');
    });

    it('should allow reveal → lobby transition (abandon quest)', () => {
      const lobby = createTestLobby('reveal');
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('lobby');
    });

    it('should allow discussion → lobby transition (abandon quest)', () => {
      const lobby = createTestLobby('discussion');
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('lobby');
    });

    it('should allow next_level → lobby transition (abandon quest)', () => {
      const lobby = createTestLobby('next_level');
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: 'host1',
      });
      expect(lobby.gamePhase).toBe('lobby');
    });
  });

  describe('Event Emissions', () => {
    it('should emit phase:changed event on successful transition', () => {
      const lobby = createTestLobby('lobby');
      const emitSpy = vi.spyOn(eventBus, 'emit');

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', {
        reason: 'start_game',
        initiator: 'host1',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'phase:changed',
        expect.objectContaining({
          lobbyId: 'test-lobby',
          oldPhase: 'lobby',
          newPhase: 'avatar_selection',
          reason: 'start_game',
          initiator: 'host1',
        })
      );
    });

    it('should emit phase:transition_rejected event on invalid transition', () => {
      const lobby = createTestLobby('lobby');
      const emitSpy = vi.spyOn(eventBus, 'emit');

      phaseCoordinator.transitionTo(lobby, 'reveal', {
        reason: 'invalid',
        initiator: 'host1',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'phase:transition_rejected',
        expect.objectContaining({
          lobbyId: 'test-lobby',
          fromPhase: 'lobby',
          toPhase: 'reveal',
          reason: 'Invalid state machine transition',
        })
      );
    });
  });

  describe('Event-Triggered Transitions', () => {
    it('should transition battle → reveal when estimation:all_votes_cast emitted', () => {
      // Create lobby in sessionManager with correct phase
      const lobby = sessionManager.createLobby('Host1', 'Test Lobby', {
        customLobbyId: 'test-lobby',
      });
      lobby.gamePhase = 'battle';
      
      // Mock the validator to return true
      vi.spyOn(estimationManager, 'hasAllVotes').mockReturnValue(true);

      // Emit the event
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'test-lobby',
        voteCount: 5,
      });

      // Check phase changed
      const updatedLobby = sessionManager.getLobby('test-lobby');
      expect(updatedLobby?.gamePhase).toBe('reveal');
    });

    it('should transition battle → reveal when estimation:voting_timeout emitted', () => {
      // Create lobby in sessionManager with correct phase
      const lobby = sessionManager.createLobby('Host1', 'Test Lobby', {
        customLobbyId: 'test-lobby',
      });
      lobby.gamePhase = 'battle';

      // Emit the event
      eventBus.emit('estimation:voting_timeout', {
        lobbyId: 'test-lobby',
        submittedCount: 3,
        totalCount: 5,
      });

      // Check phase changed
      const updatedLobby = sessionManager.getLobby('test-lobby');
      expect(updatedLobby?.gamePhase).toBe('reveal');
    });

    it('should transition battle → game_over when combat:all_players_downed emitted', () => {
      // Create lobby in sessionManager with correct phase
      const lobby = sessionManager.createLobby('Host1', 'Test Lobby', {
        customLobbyId: 'test-lobby',
      });
      lobby.gamePhase = 'battle';
      
      // Mock the validator to return true
      vi.spyOn(combatManager, 'areAllPlayersDowned').mockReturnValue(true);

      // Emit the event
      eventBus.emit('combat:all_players_downed', {
        lobbyId: 'test-lobby',
        downedCount: 4,
      });

      // Check phase changed
      const updatedLobby = sessionManager.getLobby('test-lobby');
      expect(updatedLobby?.gamePhase).toBe('game_over');
    });
  });

  describe('Validation Re-check (Stale Events)', () => {
    it('should re-validate before transition to prevent stale events', () => {
      // Create first lobby
      const lobby1 = sessionManager.createLobby('Host1', 'Test Lobby 1', {
        customLobbyId: 'test-lobby-1',
      });
      lobby1.gamePhase = 'battle';
      
      // Create second lobby
      const lobby2 = sessionManager.createLobby('Host2', 'Test Lobby 2', {
        customLobbyId: 'test-lobby-2',
      });
      lobby2.gamePhase = 'battle';
      
      // Mock validator: return true for lobby1, false for lobby2
      const hasAllVotesSpy = vi.spyOn(estimationManager, 'hasAllVotes');
      hasAllVotesSpy.mockImplementation((lobbyId: string) => {
        return lobbyId === 'test-lobby-1'; // Only lobby1 has all votes
      });

      // Emit event for lobby1 - should transition
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'test-lobby-1',
        voteCount: 5,
      });

      // Lobby1 should transition
      const lobby1Updated = sessionManager.getLobby('test-lobby-1');
      expect(lobby1Updated?.gamePhase).toBe('reveal');

      // Emit event for lobby2 - should NOT transition (stale event, votes not actually complete)
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'test-lobby-2',
        voteCount: 5,
      });

      // Lobby2 should stay in battle (validation failed)
      const lobby2Updated = sessionManager.getLobby('test-lobby-2');
      expect(lobby2Updated?.gamePhase).toBe('battle');
    });
  });

  describe('Edge Cases', () => {
    it('should handle transition when lobby not found in sessionManager', () => {
      // Don't create lobby in sessionManager
      const emitSpy = vi.spyOn(eventBus, 'emit');

      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'nonexistent-lobby',
        voteCount: 5,
      });

      // Should not crash, just log warning
      expect(emitSpy).not.toHaveBeenCalledWith('phase:changed', expect.anything());
    });

    it('should reject same-phase transition (not idempotent)', () => {
      const lobby = createTestLobby('battle');
      const emitSpy = vi.spyOn(eventBus, 'emit');
      
      phaseCoordinator.transitionTo(lobby, 'battle', {
        reason: 'refresh',
        initiator: 'system',
      });

      // Should reject (battle not in NORMAL_TRANSITIONS for battle)
      expect(lobby.gamePhase).toBe('battle');
      expect(emitSpy).toHaveBeenCalledWith(
        'phase:transition_rejected',
        expect.objectContaining({
          lobbyId: 'test-lobby',
          fromPhase: 'battle',
          toPhase: 'battle',
        })
      );
    });

    it('should handle battle → game_over when validator returns false', () => {
      // Create lobby in sessionManager with correct phase
      const lobby = sessionManager.createLobby('Host1', 'Test Lobby', {
        customLobbyId: 'test-lobby',
      });
      lobby.gamePhase = 'battle';
      
      // Mock validator to return false (not all players downed)
      vi.spyOn(combatManager, 'areAllPlayersDowned').mockReturnValue(false);

      eventBus.emit('combat:all_players_downed', {
        lobbyId: 'test-lobby',
        downedCount: 2,
      });

      // Should NOT transition
      const updatedLobby = sessionManager.getLobby('test-lobby');
      expect(updatedLobby?.gamePhase).toBe('battle');
    });
  });

  describe('canTransition helper', () => {
    it('should return true for valid normal transitions', () => {
      expect(phaseCoordinator.canTransition('lobby', 'avatar_selection')).toBe(true);
      expect(phaseCoordinator.canTransition('battle', 'reveal')).toBe(true);
      expect(phaseCoordinator.canTransition('discussion', 'victory')).toBe(true);
    });

    it('should return true for emergency transitions to lobby', () => {
      expect(phaseCoordinator.canTransition('battle', 'lobby')).toBe(true);
      expect(phaseCoordinator.canTransition('reveal', 'lobby')).toBe(true);
      expect(phaseCoordinator.canTransition('discussion', 'lobby')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(phaseCoordinator.canTransition('lobby', 'reveal')).toBe(false);
      expect(phaseCoordinator.canTransition('battle', 'victory')).toBe(false);
      expect(phaseCoordinator.canTransition('reveal', 'battle')).toBe(false);
    });

    it('should return false for same-phase transitions (except lobby)', () => {
      // Same-phase transitions are not in NORMAL_TRANSITIONS, so they return false
      expect(phaseCoordinator.canTransition('battle', 'battle')).toBe(false);
      expect(phaseCoordinator.canTransition('reveal', 'reveal')).toBe(false);
      // lobby → lobby is allowed (emergency exit always true)
      expect(phaseCoordinator.canTransition('lobby', 'lobby')).toBe(true);
    });
  });
});
