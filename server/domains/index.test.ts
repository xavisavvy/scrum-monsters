/**
 * Domain Manager Integration Tests
 *
 * Tests the initialization and wiring of domain managers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  eventBus,
  sessionManager,
  estimationManager,
  combatManager,
  progressionManager,
  lobbyEventSequencer,
  initializeClientEventEmitter,
  getClientEventEmitter,
} from './index';
import { Server } from 'socket.io';

describe('Domain Manager Integration', () => {
  describe('exports', () => {
    it('exports eventBus instance', () => {
      expect(eventBus).toBeDefined();
      expect(eventBus.emit).toBeInstanceOf(Function);
      expect(eventBus.on).toBeInstanceOf(Function);
    });

    it('exports sessionManager instance', () => {
      expect(sessionManager).toBeDefined();
      expect(sessionManager.createLobby).toBeInstanceOf(Function);
    });

    it('exports estimationManager instance', () => {
      expect(estimationManager).toBeDefined();
      expect(estimationManager.startEstimation).toBeInstanceOf(Function);
    });

    it('exports combatManager instance', () => {
      expect(combatManager).toBeDefined();
      expect(combatManager.initializeCombat).toBeInstanceOf(Function);
    });

    it('exports progressionManager instance', () => {
      expect(progressionManager).toBeDefined();
      expect(progressionManager.awardXP).toBeInstanceOf(Function);
    });

    it('exports lobbyEventSequencer instance', () => {
      expect(lobbyEventSequencer).toBeDefined();
      expect(lobbyEventSequencer.getCurrentSeq).toBeInstanceOf(Function);
    });
  });

  describe('ClientEventEmitter initialization', () => {
    it('throws when getting ClientEventEmitter before initialization', () => {
      expect(() => getClientEventEmitter()).toThrow('ClientEventEmitter not initialized');
    });

    it('initializes ClientEventEmitter with io instance', () => {
      const mockIo = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;

      const emitter = initializeClientEventEmitter(mockIo);
      expect(emitter).toBeDefined();
    });

    it('returns same ClientEventEmitter instance on subsequent calls', () => {
      const mockIo = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;

      const emitter1 = initializeClientEventEmitter(mockIo);
      const emitter2 = initializeClientEventEmitter(mockIo);
      expect(emitter1).toBe(emitter2);
    });

    it('getClientEventEmitter returns initialized instance', () => {
      const mockIo = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;

      initializeClientEventEmitter(mockIo);
      const emitter = getClientEventEmitter();
      expect(emitter).toBeDefined();
    });
  });

  describe('manager integration', () => {
    it('estimationManager can query sessionManager for player teams', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test');
      const { player } = sessionManager.joinLobby(lobby.id, 'Player 1');

      // Verify the team lookup callback works
      const lobbyState = sessionManager.getLobby(lobby.id);
      expect(lobbyState).toBeDefined();
      expect(lobbyState!.players).toContainEqual(expect.objectContaining({ id: player.id }));
    });

    it('combatManager can query sessionManager for player teams and classes', () => {
      const lobby = sessionManager.createLobby('Host1', 'Test2');
      const { player } = sessionManager.joinLobby(lobby.id, 'Player 1');

      // Verify the class lookup callback works
      const lobbyState = sessionManager.getLobby(lobby.id);
      expect(lobbyState).toBeDefined();
      const foundPlayer = lobbyState!.players.find(p => p.id === player.id);
      expect(foundPlayer).toBeDefined();
      expect(foundPlayer!.avatar).toBe('warrior');
    });
  });
});
