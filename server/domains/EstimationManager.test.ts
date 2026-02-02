import { describe, it, expect, beforeEach } from 'vitest';
import { EstimationManager } from './EstimationManager';
import { ScopedEventBus } from '../events';

describe('EstimationManager', () => {
  let eventBus: ScopedEventBus;
  let estimationManager: EstimationManager;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    estimationManager = new EstimationManager({ eventBus });
  });

  describe('instantiation', () => {
    it('should instantiate with ScopedEventBus dependency', () => {
      expect(estimationManager).toBeInstanceOf(EstimationManager);
    });

    it('should return null for non-existent estimation', () => {
      const result = estimationManager.getEstimation('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('startEstimation', () => {
    it('should initialize estimation state for a lobby', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      const state = estimationManager.getEstimation('lobby1');

      expect(state).not.toBeNull();
      expect(state!.lobbyId).toBe('lobby1');
      expect(state!.ticketId).toBe('ticket1');
      expect(state!.teams.developers.votes.size).toBe(0);
      expect(state!.teams.qa.votes.size).toBe(0);
      expect(state!.teams.developers.phase).toBe('voting');
      expect(state!.teams.qa.phase).toBe('voting');
    });
  });

  describe('cleanupLobby', () => {
    it('should remove estimation state for a lobby', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      expect(estimationManager.getEstimation('lobby1')).not.toBeNull();

      estimationManager.cleanupLobby('lobby1');
      expect(estimationManager.getEstimation('lobby1')).toBeNull();
    });

    it('should handle cleanup of non-existent lobby gracefully', () => {
      // Should not throw
      estimationManager.cleanupLobby('nonexistent');
    });
  });
});
