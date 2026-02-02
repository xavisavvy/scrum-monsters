/**
 * SessionManager Lobby Lifecycle Tests
 *
 * Tests for createLobby, joinLobby, removePlayer, getLobby, and getPlayerLobby methods.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager, SessionManagerDeps } from './SessionManager';
import { ScopedEventBus } from '../events';
import { LobbyNotFoundError } from '../errors/SessionErrors';

describe('SessionManager - Lobby Lifecycle', () => {
  let sessionManager: SessionManager;
  let eventBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
  });

  describe('createLobby', () => {
    it('should create a lobby with correct structure', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');

      expect(lobby).toBeDefined();
      expect(lobby.id).toBeDefined();
      expect(lobby.id).toHaveLength(6);
      expect(lobby.name).toBe('Test Lobby');
      expect(lobby.players).toHaveLength(1);
      expect(lobby.players[0].name).toBe('Host Player');
      expect(lobby.players[0].isHost).toBe(true);
      expect(lobby.players[0].team).toBe('spectators');
      expect(lobby.hostId).toBe(lobby.players[0].id);
      expect(lobby.gamePhase).toBe('lobby');
      expect(lobby.tickets).toEqual([]);
      expect(lobby.completedTickets).toEqual([]);
    });

    it('should initialize playerCombatStates for host', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      expect(lobby.playerCombatStates[hostId]).toBeDefined();
      expect(lobby.playerCombatStates[hostId].maxHp).toBe(100);
      expect(lobby.playerCombatStates[hostId].hp).toBe(100);
      expect(lobby.playerCombatStates[hostId].isDowned).toBe(false);
    });

    it('should initialize playerPositions for host', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      expect(lobby.playerPositions[hostId]).toBeDefined();
      expect(lobby.playerPositions[hostId].x).toBeGreaterThanOrEqual(10);
      expect(lobby.playerPositions[hostId].x).toBeLessThanOrEqual(90);
      expect(lobby.playerPositions[hostId].y).toBe(80);
    });

    it('should use custom lobby ID when provided', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby', {
        customLobbyId: 'CUSTOM',
      });

      expect(lobby.id).toBe('CUSTOM');
    });

    it('should emit session:player_joined event', () => {
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      expect(emitSpy).toHaveBeenCalledWith('session:player_joined', {
        lobbyId: lobby.id,
        playerId: hostId,
        playerName: 'Host Player',
      });
    });

    it('should initialize team assignments', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');

      expect(lobby.teams).toBeDefined();
      expect(lobby.teams.developers).toEqual([]);
      expect(lobby.teams.qa).toEqual([]);
      expect(lobby.teams.spectators).toHaveLength(1);
      expect(lobby.teams.spectators[0].name).toBe('Host Player');
    });
  });

  describe('joinLobby', () => {
    it('should add player to existing lobby', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');

      const result = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(result.lobby.players).toHaveLength(2);
      expect(result.player.name).toBe('Player 2');
      expect(result.player.isHost).toBe(false);
      expect(result.player.team).toBe('developers');
      expect(result.lobby.id).toBe(lobby.id);
    });

    it('should initialize playerCombatStates for new player', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(result.lobby.playerCombatStates[result.player.id]).toBeDefined();
      expect(result.lobby.playerCombatStates[result.player.id].maxHp).toBe(100);
      expect(result.lobby.playerCombatStates[result.player.id].hp).toBe(100);
      expect(result.lobby.playerCombatStates[result.player.id].isDowned).toBe(
        false
      );
    });

    it('should initialize playerPositions for new player', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(result.lobby.playerPositions[result.player.id]).toBeDefined();
      expect(result.lobby.playerPositions[result.player.id].x).toBeGreaterThanOrEqual(10);
      expect(result.lobby.playerPositions[result.player.id].x).toBeLessThanOrEqual(90);
      expect(result.lobby.playerPositions[result.player.id].y).toBe(80);
    });

    it('should throw LobbyNotFoundError for invalid lobby ID', () => {
      expect(() => {
        sessionManager.joinLobby('INVALID', 'Player 2');
      }).toThrow(LobbyNotFoundError);
    });

    it('should emit session:player_joined event', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(emitSpy).toHaveBeenCalledWith('session:player_joined', {
        lobbyId: lobby.id,
        playerId: result.player.id,
        playerName: 'Player 2',
      });
    });

    it('should update team assignments', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(result.lobby.teams.developers).toHaveLength(1);
      expect(result.lobby.teams.developers[0].name).toBe('Player 2');
    });
  });

  describe('getLobby', () => {
    it('should return lobby for valid ID', () => {
      const created = sessionManager.createLobby('Host Player', 'Test Lobby');
      const retrieved = sessionManager.getLobby(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Lobby');
    });

    it('should return null for invalid ID', () => {
      const retrieved = sessionManager.getLobby('INVALID');
      expect(retrieved).toBeNull();
    });
  });

  describe('getPlayerLobby', () => {
    it('should return lobby for valid player', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const retrieved = sessionManager.getPlayerLobby(hostId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(lobby.id);
    });

    it('should return null for unknown player', () => {
      const retrieved = sessionManager.getPlayerLobby('UNKNOWN');
      expect(retrieved).toBeNull();
    });

    it('should return lobby for non-host player', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');

      const retrieved = sessionManager.getPlayerLobby(result.player.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(lobby.id);
    });
  });

  describe('removePlayer', () => {
    it('should remove player from lobby', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');
      const player2Id = result.player.id;

      const updatedLobby = sessionManager.removePlayer(player2Id);

      expect(updatedLobby).toBeDefined();
      expect(updatedLobby?.players).toHaveLength(1);
      expect(updatedLobby?.players[0].name).toBe('Host Player');
    });

    it('should clean up playerCombatStates', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');
      const player2Id = result.player.id;

      const updatedLobby = sessionManager.removePlayer(player2Id);

      expect(updatedLobby?.playerCombatStates[player2Id]).toBeUndefined();
    });

    it('should clean up playerPositions', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');
      const player2Id = result.player.id;

      const updatedLobby = sessionManager.removePlayer(player2Id);

      expect(updatedLobby?.playerPositions[player2Id]).toBeUndefined();
    });

    it('should emit session:player_left event', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');
      const emitSpy = vi.spyOn(eventBus, 'emit');

      sessionManager.removePlayer(result.player.id);

      expect(emitSpy).toHaveBeenCalledWith('session:player_left', {
        lobbyId: lobby.id,
        playerId: result.player.id,
      });
    });

    it('should destroy lobby when last player leaves', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = sessionManager.removePlayer(hostId);

      expect(result).toBeNull();
      expect(emitSpy).toHaveBeenCalledWith('session:lobby_destroyed', {
        lobbyId: lobby.id,
      });

      // Verify lobby is actually destroyed
      const retrieved = sessionManager.getLobby(lobby.id);
      expect(retrieved).toBeNull();
    });

    it('should transfer host when host leaves', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');
      const player2Id = result.player.id;
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const updatedLobby = sessionManager.removePlayer(hostId);

      expect(updatedLobby).toBeDefined();
      expect(updatedLobby?.hostId).toBe(player2Id);
      expect(updatedLobby?.players[0].isHost).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith('session:host_changed', {
        lobbyId: lobby.id,
        oldHostId: hostId,
        newHostId: player2Id,
      });
    });

    it('should update team assignments after removal', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const result = sessionManager.joinLobby(lobby.id, 'Player 2');
      const player2Id = result.player.id;

      const updatedLobby = sessionManager.removePlayer(player2Id);

      expect(updatedLobby?.teams.developers).toHaveLength(0);
      expect(updatedLobby?.teams.spectators).toHaveLength(1);
    });
  });
});
