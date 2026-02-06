import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhaseCoordinator } from './PhaseCoordinator';
import { SessionManager } from './SessionManager';
import { EstimationManager } from './EstimationManager';
import { CombatManager } from './CombatManager';
import { ScopedEventBus } from '../events';
import type { Lobby } from '../../shared/gameEvents';

/**
 * Integration Tests for PhaseCoordinator
 * 
 * These tests verify end-to-end game flow scenarios and event interactions
 * between PhaseCoordinator, SessionManager, EstimationManager, and CombatManager.
 */
describe('PhaseCoordinator Integration Tests', () => {
  let eventBus: ScopedEventBus;
  let sessionManager: SessionManager;
  let estimationManager: EstimationManager;
  let combatManager: CombatManager;
  let phaseCoordinator: PhaseCoordinator;

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

  describe('Full Game Flow - Happy Path', () => {
    it('should complete full victory flow: lobby → avatar → battle → reveal → discussion → victory → lobby', () => {
      // Create lobby
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'game-lobby',
      });
      expect(lobby.gamePhase).toBe('lobby');

      // Track phase changes
      const phaseHistory: string[] = ['lobby'];
      eventBus.on('phase:changed', (payload) => {
        phaseHistory.push(payload.newPhase);
      });

      // 1. lobby → avatar_selection
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', {
        reason: 'start_game',
        initiator: lobby.hostId,
      });
      expect(lobby.gamePhase).toBe('avatar_selection');

      // 2. avatar_selection → battle
      phaseCoordinator.transitionTo(lobby, 'battle', {
        reason: 'avatars_selected',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('battle');

      // 3. battle → reveal (via all votes cast event)
      vi.spyOn(estimationManager, 'hasAllVotes').mockReturnValue(true);
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'game-lobby',
        voteCount: 4,
      });
      expect(lobby.gamePhase).toBe('reveal');

      // 4. reveal → discussion
      phaseCoordinator.transitionTo(lobby, 'discussion', {
        reason: 'scores_revealed',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('discussion');

      // 5. discussion → victory
      phaseCoordinator.transitionTo(lobby, 'victory', {
        reason: 'boss_defeated',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('victory');

      // 6. victory → lobby
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'return_to_lobby',
        initiator: lobby.hostId,
      });
      expect(lobby.gamePhase).toBe('lobby');

      // Verify phase history
      expect(phaseHistory).toEqual([
        'lobby',
        'avatar_selection',
        'battle',
        'reveal',
        'discussion',
        'victory',
        'lobby',
      ]);
    });

    it('should complete full next_level flow: lobby → ... → discussion → next_level → battle → ...', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'next-level-lobby',
      });

      const phaseHistory: string[] = [];
      eventBus.on('phase:changed', (payload) => {
        phaseHistory.push(payload.newPhase);
      });

      // Get to discussion phase
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      
      vi.spyOn(estimationManager, 'hasAllVotes').mockReturnValue(true);
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'next-level-lobby',
        voteCount: 4,
      });
      
      phaseCoordinator.transitionTo(lobby, 'discussion', { reason: 'reveal_complete' });

      // discussion → next_level
      phaseCoordinator.transitionTo(lobby, 'next_level', {
        reason: 'continue_adventure',
        initiator: lobby.hostId,
      });
      expect(lobby.gamePhase).toBe('next_level');

      // next_level → battle
      phaseCoordinator.transitionTo(lobby, 'battle', {
        reason: 'new_boss',
        initiator: 'system',
      });
      expect(lobby.gamePhase).toBe('battle');

      expect(phaseHistory).toContain('next_level');
      expect(phaseHistory[phaseHistory.length - 1]).toBe('battle');
    });
  });

  describe('Game Over Flow', () => {
    it('should handle game over flow: battle → game_over → lobby', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'gameover-lobby',
      });

      const phaseHistory: string[] = [];
      eventBus.on('phase:changed', (payload) => {
        phaseHistory.push(payload.newPhase);
      });

      // Get to battle phase
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      // Trigger game over via all players downed event
      vi.spyOn(combatManager, 'areAllPlayersDowned').mockReturnValue(true);
      eventBus.emit('combat:all_players_downed', {
        lobbyId: 'gameover-lobby',
        downedCount: 4,
      });

      expect(lobby.gamePhase).toBe('game_over');

      // game_over → lobby
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'restart',
        initiator: lobby.hostId,
      });
      expect(lobby.gamePhase).toBe('lobby');

      expect(phaseHistory).toEqual([
        'avatar_selection',
        'battle',
        'game_over',
        'lobby',
      ]);
    });

    it('should allow game over from reveal phase', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'gameover-reveal-lobby',
      });

      // Get to reveal phase
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'reveal', { reason: 'voting_timeout' });

      // Trigger game over from reveal
      vi.spyOn(combatManager, 'areAllPlayersDowned').mockReturnValue(true);
      
      // Use direct transition instead of event (since reveal is a valid source phase)
      phaseCoordinator.transitionTo(lobby, 'game_over', {
        reason: 'all_players_downed',
        initiator: 'system',
      });

      expect(lobby.gamePhase).toBe('game_over');
    });

    it('should allow game over from discussion phase', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'gameover-discussion-lobby',
      });

      // Get to discussion phase
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'reveal', { reason: 'voting_timeout' });
      phaseCoordinator.transitionTo(lobby, 'discussion', { reason: 'reveal_complete' });

      // Trigger game over from discussion
      vi.spyOn(combatManager, 'areAllPlayersDowned').mockReturnValue(true);
      
      // Use direct transition
      phaseCoordinator.transitionTo(lobby, 'game_over', {
        reason: 'all_players_downed',
        initiator: 'system',
      });

      expect(lobby.gamePhase).toBe('game_over');
    });
  });

  describe('Emergency Exit Flow', () => {
    it('should allow abandon quest from battle phase', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'abandon-battle-lobby',
      });

      // Get to battle
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      // Emergency exit: battle → lobby
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: lobby.hostId,
      });

      expect(lobby.gamePhase).toBe('lobby');
    });

    it('should allow abandon quest from reveal phase', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'abandon-reveal-lobby',
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'reveal', { reason: 'voting_timeout' });

      // Emergency exit: reveal → lobby
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: lobby.hostId,
      });

      expect(lobby.gamePhase).toBe('lobby');
    });

    it('should allow abandon quest from discussion phase', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'abandon-discussion-lobby',
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'reveal', { reason: 'voting_timeout' });
      phaseCoordinator.transitionTo(lobby, 'discussion', { reason: 'reveal_complete' });

      // Emergency exit: discussion → lobby
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: lobby.hostId,
      });

      expect(lobby.gamePhase).toBe('lobby');
    });

    it('should allow abandon quest from next_level phase', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'abandon-next-level-lobby',
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'reveal', { reason: 'voting_timeout' });
      phaseCoordinator.transitionTo(lobby, 'discussion', { reason: 'reveal_complete' });
      phaseCoordinator.transitionTo(lobby, 'next_level', { reason: 'continue' });

      // Emergency exit: next_level → lobby
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: lobby.hostId,
      });

      expect(lobby.gamePhase).toBe('lobby');
    });
  });

  describe('Event Ordering and Race Conditions', () => {
    it('should handle rapid event emissions without race conditions', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'race-lobby',
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      // Mock validators
      const hasAllVotesSpy = vi.spyOn(estimationManager, 'hasAllVotes');
      const areAllDownedSpy = vi.spyOn(combatManager, 'areAllPlayersDowned');

      // Scenario: both all_votes_cast and all_players_downed fire simultaneously
      hasAllVotesSpy.mockReturnValue(true);
      areAllDownedSpy.mockReturnValue(true);

      // Emit both events
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'race-lobby',
        voteCount: 4,
      });

      eventBus.emit('combat:all_players_downed', {
        lobbyId: 'race-lobby',
        downedCount: 4,
      });

      // Only one transition should win (likely game_over since it's higher priority)
      // The phase should be stable (either reveal or game_over, not in inconsistent state)
      expect(['reveal', 'game_over']).toContain(lobby.gamePhase);
    });

    it('should reject stale events after phase has changed', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'stale-lobby',
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      vi.spyOn(estimationManager, 'hasAllVotes').mockReturnValue(true);

      // Transition to reveal
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'stale-lobby',
        voteCount: 4,
      });
      expect(lobby.gamePhase).toBe('reveal');

      // Emit stale event (all_votes_cast fires again, but we're already in reveal)
      // PhaseCoordinator should ignore it (wrong phase)
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'stale-lobby',
        voteCount: 4,
      });

      // Should still be in reveal (event ignored)
      expect(lobby.gamePhase).toBe('reveal');
    });

    it('should handle voting timeout while in battle phase', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'timeout-lobby',
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      // Voting timeout should work even if not all votes submitted
      vi.spyOn(estimationManager, 'hasAllVotes').mockReturnValue(false);

      eventBus.emit('estimation:voting_timeout', {
        lobbyId: 'timeout-lobby',
        submittedCount: 2,
        totalCount: 4,
      });

      // Should transition to reveal despite not having all votes (timeout overrides)
      expect(lobby.gamePhase).toBe('reveal');
    });
  });

  describe('Error Cases and Edge Scenarios', () => {
    it('should handle event for non-existent lobby gracefully', () => {
      // Emit event for lobby that doesn't exist
      expect(() => {
        eventBus.emit('estimation:all_votes_cast', {
          lobbyId: 'non-existent-lobby',
          voteCount: 4,
        });
      }).not.toThrow();

      // Should not crash, just log warning
    });

    it('should reject transition when validator fails', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'validator-fail-lobby',
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      // Mock validator to fail
      vi.spyOn(estimationManager, 'hasAllVotes').mockReturnValue(false);

      const rejectionEvents: any[] = [];
      eventBus.on('phase:transition_rejected', (payload) => {
        rejectionEvents.push(payload);
      });

      // Try to transition to reveal without all votes
      eventBus.emit('estimation:all_votes_cast', {
        lobbyId: 'validator-fail-lobby',
        voteCount: 2,
      });

      // Should stay in battle
      expect(lobby.gamePhase).toBe('battle');

      // Should emit rejection event
      expect(rejectionEvents).toHaveLength(1);
      expect(rejectionEvents[0]).toMatchObject({
        lobbyId: 'validator-fail-lobby',
        fromPhase: 'battle',
        toPhase: 'reveal',
      });
    });

    it('should handle rapid phase transitions without state corruption', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'rapid-lobby',
      });

      const phaseChanges: string[] = [];
      eventBus.on('phase:changed', (payload) => {
        phaseChanges.push(`${payload.oldPhase}->${payload.newPhase}`);
      });

      // Rapid sequence of valid transitions
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'reveal', { reason: 'voting_timeout' });
      phaseCoordinator.transitionTo(lobby, 'discussion', { reason: 'reveal_complete' });
      phaseCoordinator.transitionTo(lobby, 'victory', { reason: 'boss_defeated' });
      phaseCoordinator.transitionTo(lobby, 'lobby', { reason: 'return' });

      // All transitions should have occurred in order
      expect(phaseChanges).toEqual([
        'lobby->avatar_selection',
        'avatar_selection->battle',
        'battle->reveal',
        'reveal->discussion',
        'discussion->victory',
        'victory->lobby',
      ]);

      // Final state should be consistent
      expect(lobby.gamePhase).toBe('lobby');
    });
  });

  describe('Domain Cleanup Integration', () => {
    it('should emit phase:changed event when returning to lobby', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'cleanup-lobby',
      });

      // Track phase:changed events
      const phaseChangedEvents: any[] = [];
      eventBus.on('phase:changed', (payload) => {
        phaseChangedEvents.push(payload);
      });

      // Go through game flow
      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'reveal', { reason: 'voting_timeout' });

      // Return to lobby
      phaseCoordinator.transitionTo(lobby, 'lobby', {
        reason: 'abandon_quest',
        initiator: lobby.hostId,
      });

      // Should have emitted phase:changed for each transition
      expect(phaseChangedEvents.length).toBe(4);
      expect(phaseChangedEvents[3]).toMatchObject({
        lobbyId: 'cleanup-lobby',
        oldPhase: 'reveal',
        newPhase: 'lobby',
      });
    });

    it('should emit phase:changed event on game_over transition', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'gameover-cleanup-lobby',
      });

      const phaseChangedEvents: any[] = [];
      eventBus.on('phase:changed', (payload) => {
        phaseChangedEvents.push(payload);
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      // Trigger game over
      vi.spyOn(combatManager, 'areAllPlayersDowned').mockReturnValue(true);
      eventBus.emit('combat:all_players_downed', {
        lobbyId: 'gameover-cleanup-lobby',
        downedCount: 4,
      });

      expect(lobby.gamePhase).toBe('game_over');

      // Should have emitted phase:changed for game_over transition
      const gameOverEvent = phaseChangedEvents.find(e => e.newPhase === 'game_over');
      expect(gameOverEvent).toBeDefined();
      expect(gameOverEvent).toMatchObject({
        lobbyId: 'gameover-cleanup-lobby',
        oldPhase: 'battle',
        newPhase: 'game_over',
      });
    });

    it('should allow domains to react to phase:changed events', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test Game', {
        customLobbyId: 'domain-reaction-lobby',
      });

      // Track that phase:changed events are fired
      let phaseChangedFired = false;
      let gameOverPhaseChangePayload: any = null;

      eventBus.on('phase:changed', (payload) => {
        phaseChangedFired = true;
        if (payload.newPhase === 'game_over') {
          gameOverPhaseChangePayload = payload;
        }
      });

      phaseCoordinator.transitionTo(lobby, 'avatar_selection', { reason: 'start' });
      phaseCoordinator.transitionTo(lobby, 'battle', { reason: 'start' });

      vi.spyOn(combatManager, 'areAllPlayersDowned').mockReturnValue(true);
      eventBus.emit('combat:all_players_downed', {
        lobbyId: 'domain-reaction-lobby',
        downedCount: 4,
      });

      // Verify phase:changed was emitted
      expect(phaseChangedFired).toBe(true);
      expect(gameOverPhaseChangePayload).toBeDefined();
      expect(gameOverPhaseChangePayload.newPhase).toBe('game_over');
      
      // Domains can subscribe to this event and react accordingly
      // (EstimationManager and CombatManager do this for cleanup)
    });
  });
});
