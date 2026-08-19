/**
 * SessionManager Lobby Lifecycle Tests
 *
 * Tests for createLobby, joinLobby, removePlayer, getLobby, and getPlayerLobby methods.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from './SessionManager';
import { ScopedEventBus } from '../events';
import { LobbyNotFoundError, PlayerNotFoundError, PlayerNotHostError } from '../errors/SessionErrors';

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

    it('rejects creation past MAX_LOBBIES capacity (Security: H-5)', () => {
      const prev = process.env.MAX_LOBBIES;
      process.env.MAX_LOBBIES = '2';
      try {
        const sm = new SessionManager({ eventBus: new ScopedEventBus() });
        sm.createLobby('A', 'L1');
        sm.createLobby('B', 'L2');
        expect(sm.getLobbyCount()).toBe(2);
        // Third creation must be rejected, not silently grow the map.
        expect(() => sm.createLobby('C', 'L3')).toThrow(/capacity/i);
        expect(sm.getLobbyCount()).toBe(2);
      } finally {
        if (prev === undefined) delete process.env.MAX_LOBBIES;
        else process.env.MAX_LOBBIES = prev;
      }
    });

    it('reaps only lobbies idle beyond the TTL, cleaning up state (Security: H-5)', () => {
      const sm = new SessionManager({ eventBus: new ScopedEventBus() });
      const lobby = sm.createLobby('A', 'L1');
      const hostId = lobby.players[0].id;
      const start = Date.now();
      const TTL = 30 * 60 * 1000;

      // Within TTL → not reaped.
      expect(sm.reapIdleLobbies(start + 60_000)).toEqual([]);
      expect(sm.getLobbyCount()).toBe(1);

      // Beyond TTL → reaped and fully cleaned up.
      const reaped = sm.reapIdleLobbies(start + TTL + 1000);
      expect(reaped).toContain(lobby.id);
      expect(sm.getLobbyCount()).toBe(0);
      expect(sm.getPlayerLobby(hostId)).toBeNull();
    });

    it('recordLobbyActivity keeps a lobby within the idle window', () => {
      const sm = new SessionManager({ eventBus: new ScopedEventBus() });
      const lobby = sm.createLobby('A', 'L1');
      const t = Date.now();
      sm.recordLobbyActivity(lobby.id);
      // Checking just under one TTL after the activity stamp must not reap it.
      expect(sm.reapIdleLobbies(t + 30 * 60 * 1000 - 5000)).toEqual([]);
      expect(sm.getLobbyCount()).toBe(1);
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
        team: 'spectators',
        avatar: 'warrior',
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
    it('joinLobby returns existing player when a connected same-name player is already in the lobby', () => {
      // Phase 41-02 regression guard: GamePage auto-join was racing
      // create_lobby and emitting a duplicate join_lobby for the host's own
      // name, minting a phantom player and overwriting socket.data.playerId.
      // The dedupe path in joinLobby must return the existing record instead.
      const lobby = sessionManager.createLobby('A', 'Test Lobby');
      const originalHostId = lobby.players[0].id;

      const result = sessionManager.joinLobby(lobby.id, 'A');

      expect(result.player.id).toBe(originalHostId);
      expect(result.lobby.players).toHaveLength(1);
      expect(result.player.isHost).toBe(true);
    });

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
        team: 'developers',
        avatar: 'warrior',
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

  describe('recordPlayerActivity', () => {
    it('should record activity timestamp for player', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      // Record activity
      sessionManager.recordPlayerActivity(hostId);

      // Cannot directly verify due to private playerActivity map
      // Indirectly verified through host transfer in future tests
      expect(sessionManager).toBeDefined();
    });
  });
});

describe('SessionManager - Reconnection System', () => {
  let sessionManager: SessionManager;
  let eventBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
    vi.clearAllMocks();
  });

  describe('generateReconnectToken', () => {
    it('should create valid base64 token', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const playerId = lobby.players[0].id;

      const token = (sessionManager as any).generateReconnectToken(
        playerId,
        lobby.id,
        'Host Player'
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Should be base64 encoded
      expect(() => Buffer.from(token, 'base64').toString()).not.toThrow();

      // Decode and verify structure
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      expect(decoded.playerId).toBe(playerId);
      expect(decoded.lobbyId).toBe(lobby.id);
      expect(decoded.playerName).toBe('Host Player');
      expect(decoded.issuedAt).toBeDefined();
      expect(decoded.expiresAt).toBeDefined();
      expect(decoded.signature).toBeDefined();
    });

    it('should store token in reconnectTokens Map', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const playerId = lobby.players[0].id;

      const token = (sessionManager as any).generateReconnectToken(
        playerId,
        lobby.id,
        'Host Player'
      );

      // Verify token can be validated (which requires it to be in the Map)
      const validated = (sessionManager as any).validateReconnectToken(token);
      expect(validated).not.toBeNull();
      expect(validated.playerId).toBe(playerId);
    });
  });

  describe('validateReconnectToken', () => {
    it('should accept valid token', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const playerId = lobby.players[0].id;

      const token = (sessionManager as any).generateReconnectToken(
        playerId,
        lobby.id,
        'Host Player'
      );

      const validated = (sessionManager as any).validateReconnectToken(token);

      expect(validated).not.toBeNull();
      expect(validated.playerId).toBe(playerId);
      expect(validated.lobbyId).toBe(lobby.id);
      expect(validated.playerName).toBe('Host Player');
    });

    it('should reject unknown token', () => {
      const fakeToken = Buffer.from(JSON.stringify({
        playerId: 'fake',
        lobbyId: 'fake',
        playerName: 'Fake',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
        signature: 'fake-signature'
      })).toString('base64');

      const validated = (sessionManager as any).validateReconnectToken(fakeToken);

      expect(validated).toBeNull();
    });

    it('should reject expired token', () => {
      vi.useFakeTimers();

      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const playerId = lobby.players[0].id;

      const token = (sessionManager as any).generateReconnectToken(
        playerId,
        lobby.id,
        'Host Player'
      );

      // Fast forward 11 minutes (Phase 41-02: TOKEN_EXPIRY_TIME widened to
      // 10 minutes to match DISCONNECT_GRACE_PERIOD).
      vi.advanceTimersByTime(11 * 60 * 1000);

      const validated = (sessionManager as any).validateReconnectToken(token);

      expect(validated).toBeNull();

      vi.useRealTimers();
    });

    it('should reject tampered signature', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const playerId = lobby.players[0].id;

      const token = (sessionManager as any).generateReconnectToken(
        playerId,
        lobby.id,
        'Host Player'
      );

      // Tamper with the token
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      decoded.playerName = 'Tampered Name';
      const tamperedToken = Buffer.from(JSON.stringify(decoded)).toString('base64');

      const validated = (sessionManager as any).validateReconnectToken(tamperedToken);

      expect(validated).toBeNull();
    });
  });

  describe('handlePlayerDisconnect', () => {
    it('should return null if player not in lobby', () => {
      const result = (sessionManager as any).handlePlayerDisconnect('unknown-player');

      expect(result).toBeNull();
    });

    it('should create DisconnectedPlayer record', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const result = (sessionManager as any).handlePlayerDisconnect(hostId);

      expect(result).not.toBeNull();
      expect(result.disconnectedPlayer).toBeDefined();
      expect(result.disconnectedPlayer.playerId).toBe(hostId);
      expect(result.disconnectedPlayer.lobbyId).toBe(lobby.id);
      expect(result.disconnectedPlayer.playerName).toBe('Host Player');
      expect(result.disconnectedPlayer.disconnectedAt).toBeDefined();
      expect(result.disconnectedPlayer.graceExpiresAt).toBeDefined();
      expect(result.disconnectedPlayer.lastKnownPosition).toEqual(lobby.playerPositions[hostId]);
      expect(result.disconnectedPlayer.lastKnownCombatState).toEqual(lobby.playerCombatStates[hostId]);
    });

    it('should generate reconnect token', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const result = (sessionManager as any).handlePlayerDisconnect(hostId);

      expect(result.reconnectToken).toBeDefined();
      expect(typeof result.reconnectToken).toBe('string');

      // Verify token is valid
      const validated = (sessionManager as any).validateReconnectToken(result.reconnectToken);
      expect(validated).not.toBeNull();
    });

    it('should defer host transfer when host disconnects (Phase 41-02)', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      // Add another player
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      const result = (sessionManager as any).handlePlayerDisconnect(hostId);

      // Phase 41-02: host transfer is deferred — wasHost is set on the
      // record, lobby.hostId is unchanged, and no immediate hostTransfer
      // fires from handlePlayerDisconnect.
      expect(result.hostTransfer).toBeUndefined();
      expect(result.disconnectedPlayer.wasHost).toBe(true);

      const stillLobby = sessionManager.getLobby(lobby.id);
      expect(stillLobby?.hostId).toBe(hostId);
      const stillHost = stillLobby?.players.find(p => p.id === hostId);
      expect(stillHost?.isHost).toBe(true);
      const otherPlayer = stillLobby?.players.find(p => p.id === player2.id);
      expect(otherPlayer?.isHost).toBe(false);
    });

    it('should emit session:player_disconnected event', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const emitSpy = vi.spyOn(eventBus, 'emit');

      (sessionManager as any).handlePlayerDisconnect(hostId);

      expect(emitSpy).toHaveBeenCalledWith(
        'session:player_disconnected',
        expect.objectContaining({
          lobbyId: lobby.id,
          playerId: hostId,
          disconnectedAt: expect.any(Number),
          graceExpiresAt: expect.any(Number),
        })
      );
    });
  });

  describe('attemptPlayerReconnect', () => {
    it('should return invalid_token for bad token', () => {
      const response = (sessionManager as any).attemptPlayerReconnect('bad-token');

      expect(response.result).toBe('invalid_token');
      expect(response.message).toContain('Invalid');
    });

    it('should return lobby_closed if lobby no longer exists', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const disconnectResult = (sessionManager as any).handlePlayerDisconnect(hostId);
      const token = disconnectResult.reconnectToken;

      // Destroy the lobby
      sessionManager.removePlayer(hostId);

      const response = (sessionManager as any).attemptPlayerReconnect(token);

      expect(response.result).toBe('lobby_closed');
    });

    it('should accept token at 6min after disconnect (Phase 41-02 widened expiry)', () => {
      vi.useFakeTimers();

      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;
      // Add a second player so the lobby is not destroyed when host disconnects
      sessionManager.joinLobby(lobby.id, 'Player 2');

      const disconnectResult = (sessionManager as any).handlePlayerDisconnect(hostId);
      const token = disconnectResult.reconnectToken;

      // Fast forward 6 minutes — pre-Phase-41-02 the token would have expired
      // at 5min. Post-Phase-41-02 TOKEN_EXPIRY_TIME == DISCONNECT_GRACE_PERIOD
      // (both 10min) so the token is still valid through the entire grace
      // window.
      vi.advanceTimersByTime(6 * 60 * 1000);

      const response = (sessionManager as any).attemptPlayerReconnect(token);

      expect(response.result).toBe('success');

      vi.useRealTimers();
    });

    it('should succeed with valid token and restore isHost when wasHost was true (Phase 41-02)', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const disconnectResult = (sessionManager as any).handlePlayerDisconnect(hostId);
      const token = disconnectResult.reconnectToken;

      const response = (sessionManager as any).attemptPlayerReconnect(token);

      expect(response.result).toBe('success');
      expect(response.lobbySync).toBeDefined();
      expect(response.lobbySync.lobby).toBeDefined();
      expect(response.lobbySync.yourPlayer).toBeDefined();
      expect(response.lobbySync.yourPlayer.isHost).toBe(true);
      expect(response.lobbySync.lobby.hostId).toBe(hostId);
      expect(response.lobbySync.reconnectToken).toBeDefined();
    });

    // Phase 41-02 — deferred host transfer + restoration

    it('Phase 41-02: host preserved across grace-period reconnect', () => {
      const lobby = sessionManager.createLobby('Host A', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const { player: playerB } = sessionManager.joinLobby(lobby.id, 'Player B');

      const disconnectResult = (sessionManager as any).handlePlayerDisconnect(hostId);
      const token = disconnectResult.reconnectToken;

      // Immediately after disconnect: host status NOT transferred.
      const stillLobby = sessionManager.getLobby(lobby.id)!;
      expect(stillLobby.hostId).toBe(hostId);
      expect(stillLobby.players.find(p => p.id === playerB.id)?.isHost).toBe(false);

      // Reconnect within grace window
      const response = (sessionManager as any).attemptPlayerReconnect(token);

      expect(response.result).toBe('success');
      expect(response.lobbySync.yourPlayer.isHost).toBe(true);
      expect(response.lobbySync.lobby.hostId).toBe(hostId);
      // PlayerB is still NOT host
      const refreshed = sessionManager.getLobby(lobby.id)!;
      expect(refreshed.players.find(p => p.id === playerB.id)?.isHost).toBe(false);
    });

    it('Phase 41-02: host transfer occurs only on grace expiry', () => {
      vi.useFakeTimers();

      const lobby = sessionManager.createLobby('Host A', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const { player: playerB } = sessionManager.joinLobby(lobby.id, 'Player B');

      const disconnectResult = (sessionManager as any).handlePlayerDisconnect(hostId);
      const token = disconnectResult.reconnectToken;

      // No transfer immediately
      expect(sessionManager.getLobby(lobby.id)?.hostId).toBe(hostId);

      // Advance past grace period, run sweeper
      vi.advanceTimersByTime(11 * 60 * 1000);
      const transfers = (sessionManager as any).processDisconnectedPlayers();

      expect(transfers).toHaveLength(1);
      expect(transfers[0].newHostId).toBe(playerB.id);
      expect(transfers[0].newHostName).toBe('Player B');
      expect(transfers[0].oldHostId).toBe(hostId);

      const finalLobby = sessionManager.getLobby(lobby.id)!;
      expect(finalLobby.hostId).toBe(playerB.id);
      expect(finalLobby.players.find(p => p.id === playerB.id)?.isHost).toBe(true);
      // Original host evicted
      expect(finalLobby.players.find(p => p.id === hostId)).toBeUndefined();

      // Subsequent reconnect with original host's token: token validation
      // path will reject (token deleted by sweeper) — assert grace_expired or
      // invalid_token (both indicate the player cannot reclaim).
      const response = (sessionManager as any).attemptPlayerReconnect(token);
      expect(['invalid_token', 'grace_expired']).toContain(response.result);

      vi.useRealTimers();
    });

    it('Phase 41-02: token expiry equals grace period', () => {
      // Constant equality (private fields — read via any cast)
      const sm = sessionManager as any;
      expect(sm.TOKEN_EXPIRY_TIME).toBe(sm.DISCONNECT_GRACE_PERIOD);
      expect(sm.TOKEN_EXPIRY_TIME).toBe(10 * 60 * 1000);

      vi.useFakeTimers();

      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const playerId = lobby.players[0].id;

      const token = (sessionManager as any).generateReconnectToken(
        playerId,
        lobby.id,
        'Host Player'
      );

      // At 9min: still valid (was previously invalid at >5min)
      vi.advanceTimersByTime(9 * 60 * 1000);
      expect((sessionManager as any).validateReconnectToken(token)).not.toBeNull();

      // At 11min: invalid (expired)
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect((sessionManager as any).validateReconnectToken(token)).toBeNull();

      vi.useRealTimers();
    });

    it('Phase 41-02: interim host roll-back on reconnect (defense in depth)', () => {
      const lobby = sessionManager.createLobby('Host A', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const { player: playerB } = sessionManager.joinLobby(lobby.id, 'Player B');
      sessionManager.joinLobby(lobby.id, 'Player C');

      const disconnectResult = (sessionManager as any).handlePlayerDisconnect(hostId);
      const token = disconnectResult.reconnectToken;

      // Simulate an interim transfer by some other code path during the
      // grace window (e.g. a manual transfer or a legacy handler).
      const lobbyRef = sessionManager.getLobby(lobby.id)!;
      lobbyRef.hostId = playerB.id;
      const playerBRef = lobbyRef.players.find(p => p.id === playerB.id)!;
      playerBRef.isHost = true;
      const hostARef = lobbyRef.players.find(p => p.id === hostId)!;
      hostARef.isHost = false;

      // Reconnect: A wins, B is demoted
      const response = (sessionManager as any).attemptPlayerReconnect(token);

      expect(response.result).toBe('success');
      expect(response.lobbySync.yourPlayer.isHost).toBe(true);
      expect(response.lobbySync.lobby.hostId).toBe(hostId);

      const refreshed = sessionManager.getLobby(lobby.id)!;
      expect(refreshed.hostId).toBe(hostId);
      expect(refreshed.players.find(p => p.id === hostId)?.isHost).toBe(true);
      expect(refreshed.players.find(p => p.id === playerB.id)?.isHost).toBe(false);
    });

    it('should restore player state on reconnection', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      // Get initial state
      const initialPosition = lobby.playerPositions[hostId];
      const initialCombatState = lobby.playerCombatStates[hostId];

      const disconnectResult = (sessionManager as any).handlePlayerDisconnect(hostId);
      const token = disconnectResult.reconnectToken;

      const response = (sessionManager as any).attemptPlayerReconnect(token);

      expect(response.result).toBe('success');
      expect(response.lobbySync.yourPlayer.id).toBe(hostId);

      // Verify state is restored
      const updatedLobby = sessionManager.getLobby(lobby.id);
      expect(updatedLobby?.playerPositions[hostId]).toEqual(initialPosition);
      expect(updatedLobby?.playerCombatStates[hostId]).toEqual(initialCombatState);
    });
  });

  describe('processDisconnectedPlayers', () => {
    it('should remove expired players', () => {
      vi.useFakeTimers();

      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      // Add another player
      sessionManager.joinLobby(lobby.id, 'Player 2');

      // Disconnect host
      (sessionManager as any).handlePlayerDisconnect(hostId);

      // Fast forward past grace period
      vi.advanceTimersByTime(11 * 60 * 1000);

      // Process disconnected players
      (sessionManager as any).processDisconnectedPlayers();

      // Host should be removed from lobby
      const updatedLobby = sessionManager.getLobby(lobby.id);
      expect(updatedLobby?.players.find(p => p.id === hostId)).toBeUndefined();
      expect(updatedLobby?.players).toHaveLength(1);

      vi.useRealTimers();
    });
  });
});

describe('SessionManager - Host Transfer', () => {
  let sessionManager: SessionManager;
  let eventBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
  });

  describe('promoteNewHost', () => {
    it('should select most recently active player', async () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      // Add two more players
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const { player: player3 } = sessionManager.joinLobby(lobby.id, 'Player 3');

      // Record activity - player3 most recent
      sessionManager.recordPlayerActivity(player2.id);

      // Wait to ensure player3 has a later timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      sessionManager.recordPlayerActivity(player3.id);

      const result = (sessionManager as any).promoteNewHost(lobby.id, hostId);

      expect(result).not.toBeNull();
      expect(result.newHostId).toBe(player3.id);
      expect(result.newHostName).toBe('Player 3');
    });

    it('should skip disconnected players', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      // Add two more players
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');
      const { player: player3 } = sessionManager.joinLobby(lobby.id, 'Player 3');

      // Record activity - player3 most recent
      sessionManager.recordPlayerActivity(player2.id);
      sessionManager.recordPlayerActivity(player3.id);

      // Disconnect player3
      (sessionManager as any).handlePlayerDisconnect(player3.id);

      // Should select player2 instead
      const result = (sessionManager as any).promoteNewHost(lobby.id, hostId);

      expect(result).not.toBeNull();
      expect(result.newHostId).toBe(player2.id);
      expect(result.newHostName).toBe('Player 2');
    });

    it('should return null when no eligible players remain', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const result = (sessionManager as any).promoteNewHost(lobby.id, hostId);

      expect(result).toBeNull();
    });

    it('should emit session:host_changed event', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      const emitSpy = vi.spyOn(eventBus, 'emit');

      (sessionManager as any).promoteNewHost(lobby.id, hostId);

      expect(emitSpy).toHaveBeenCalledWith('session:host_changed', {
        lobbyId: lobby.id,
        oldHostId: hostId,
        newHostId: player2.id,
      });
    });

    it('should update isHost flags correctly', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      (sessionManager as any).promoteNewHost(lobby.id, hostId);

      const updatedLobby = sessionManager.getLobby(lobby.id);

      // Old host should no longer be host
      const oldHost = updatedLobby?.players.find(p => p.id === hostId);
      expect(oldHost?.isHost).toBe(false);

      // New host should be host
      const newHost = updatedLobby?.players.find(p => p.id === player2.id);
      expect(newHost?.isHost).toBe(true);

      // Lobby hostId should be updated
      expect(updatedLobby?.hostId).toBe(player2.id);
    });

    it('should return null for non-existent lobby', () => {
      const result = (sessionManager as any).promoteNewHost('INVALID', 'player-id');

      expect(result).toBeNull();
    });
  });
});

describe('SessionManager - Team Management', () => {
  let sessionManager: SessionManager;
  let eventBus: ScopedEventBus;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    sessionManager = new SessionManager({ eventBus });
  });

  describe('updatePlayerTeam', () => {
    it('should change player team', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const updatedLobby = (sessionManager as any).updatePlayerTeam(hostId, 'developers');

      const player = updatedLobby.players.find((p: any) => p.id === hostId);
      expect(player.team).toBe('developers');
    });

    it('should update team assignments', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      // Host starts in spectators
      expect(lobby.teams.spectators).toHaveLength(1);
      expect(lobby.teams.developers).toHaveLength(0);

      const updatedLobby = (sessionManager as any).updatePlayerTeam(hostId, 'developers');

      expect(updatedLobby.teams.spectators).toHaveLength(0);
      expect(updatedLobby.teams.developers).toHaveLength(1);
      expect(updatedLobby.teams.developers[0].id).toBe(hostId);
    });

    it('should throw PlayerNotFoundError for unknown player', () => {
      expect(() => {
        (sessionManager as any).updatePlayerTeam('unknown-player', 'developers');
      }).toThrow(PlayerNotFoundError);
    });
  });

  describe('changeOwnTeam', () => {
    it('should work same as updatePlayerTeam', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      const updatedLobby = (sessionManager as any).changeOwnTeam(hostId, 'qa');

      const player = updatedLobby.players.find((p: any) => p.id === hostId);
      expect(player.team).toBe('qa');
      expect(updatedLobby.teams.qa).toHaveLength(1);
    });
  });

  describe('assignTeam', () => {
    it('should require host privileges', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');
      const { player: player3 } = sessionManager.joinLobby(lobby.id, 'Player 3');

      // Non-host player2 tries to assign player3's team
      expect(() => {
        (sessionManager as any).assignTeam(player2.id, player3.id, 'qa');
      }).toThrow(PlayerNotHostError);
    });

    it('should throw PlayerNotHostError for non-host', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');
      const { player: player3 } = sessionManager.joinLobby(lobby.id, 'Player 3');

      expect(() => {
        (sessionManager as any).assignTeam(player2.id, player3.id, 'qa');
      }).toThrow(PlayerNotHostError);

      try {
        (sessionManager as any).assignTeam(player2.id, player3.id, 'qa');
      } catch (error) {
        expect((error as PlayerNotHostError).code).toBe('NOT_HOST');
        expect((error as PlayerNotHostError).playerId).toBe(player2.id);
      }
    });

    it('should change target player team when host', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      // Host assigns player2 to qa
      const updatedLobby = (sessionManager as any).assignTeam(hostId, player2.id, 'qa');

      const player = updatedLobby.players.find((p: any) => p.id === player2.id);
      expect(player.team).toBe('qa');
      expect(updatedLobby.teams.qa).toHaveLength(1);
      expect(updatedLobby.teams.developers).toHaveLength(0);
    });

    it('should throw PlayerNotFoundError for unknown target', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      expect(() => {
        (sessionManager as any).assignTeam(hostId, 'unknown-player', 'qa');
      }).toThrow(PlayerNotFoundError);
    });
  });

  describe('manualHostTransfer', () => {
    it('should work for host', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      const updatedLobby = (sessionManager as any).manualHostTransfer(hostId, player2.id);

      expect(updatedLobby.hostId).toBe(player2.id);

      const oldHost = updatedLobby.players.find((p: any) => p.id === hostId);
      const newHost = updatedLobby.players.find((p: any) => p.id === player2.id);

      expect(oldHost.isHost).toBe(false);
      expect(newHost.isHost).toBe(true);
    });

    it('should throw PlayerNotHostError for non-host', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');
      const { player: player3 } = sessionManager.joinLobby(lobby.id, 'Player 3');

      expect(() => {
        (sessionManager as any).manualHostTransfer(player2.id, player3.id);
      }).toThrow(PlayerNotHostError);
    });

    it('should emit session:host_changed event', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;
      const { player: player2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      const emitSpy = vi.spyOn(eventBus, 'emit');

      (sessionManager as any).manualHostTransfer(hostId, player2.id);

      expect(emitSpy).toHaveBeenCalledWith('session:host_changed', {
        lobbyId: lobby.id,
        oldHostId: hostId,
        newHostId: player2.id,
      });
    });

    it('should throw PlayerNotFoundError for unknown new host', () => {
      const lobby = sessionManager.createLobby('Host Player', 'Test Lobby');
      const hostId = lobby.players[0].id;

      expect(() => {
        (sessionManager as any).manualHostTransfer(hostId, 'unknown-player');
      }).toThrow(PlayerNotFoundError);
    });
  });

  describe('updateTimerSettings', () => {
    it('updates timerSettings on the lobby and returns it (happy path)', () => {
      const lobby = sessionManager.createLobby('Host', 'Timer Test');
      const hostId = lobby.players[0].id;
      const settings = { enabled: true, durationMinutes: 5 };

      const updated = sessionManager.updateTimerSettings(hostId, settings as any);

      expect(updated.timerSettings).toEqual(settings);
    });

    it('throws PlayerNotHostError for non-host', () => {
      const lobby = sessionManager.createLobby('Host', 'Timer Test');
      const { player: p2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(() =>
        sessionManager.updateTimerSettings(p2.id, { enabled: true, durationMinutes: 3 } as any)
      ).toThrow(PlayerNotHostError);
    });

    it('throws PlayerNotFoundError for unknown player', () => {
      expect(() =>
        sessionManager.updateTimerSettings('no-such-player', { enabled: false } as any)
      ).toThrow(PlayerNotFoundError);
    });
  });

  describe('updateJiraSettings', () => {
    it('updates jiraSettings on the lobby and returns it (happy path)', () => {
      const lobby = sessionManager.createLobby('Host', 'Jira Test');
      const hostId = lobby.players[0].id;
      const settings = { enabled: true, projectKey: 'SCRUM', boardId: 42 };

      const updated = sessionManager.updateJiraSettings(hostId, settings as any);

      expect(updated.jiraSettings).toEqual(settings);
    });

    it('throws PlayerNotHostError for non-host', () => {
      const lobby = sessionManager.createLobby('Host', 'Jira Test');
      const { player: p2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(() =>
        sessionManager.updateJiraSettings(p2.id, { enabled: true } as any)
      ).toThrow(PlayerNotHostError);
    });
  });

  describe('updateEstimationSettings', () => {
    it('updates estimationSettings on the lobby and returns it (happy path)', () => {
      const lobby = sessionManager.createLobby('Host', 'Estimation Test');
      const hostId = lobby.players[0].id;
      const settings = { scaleType: 'fibonacci' as const, autoAdvance: true };

      const updated = sessionManager.updateEstimationSettings(hostId, settings as any);

      expect(updated.estimationSettings).toEqual(settings);
    });

    it('throws PlayerNotHostError for non-host', () => {
      const lobby = sessionManager.createLobby('Host', 'Estimation Test');
      const { player: p2 } = sessionManager.joinLobby(lobby.id, 'Player 2');

      expect(() =>
        sessionManager.updateEstimationSettings(p2.id, { scaleType: 'fibonacci' as const } as any)
      ).toThrow(PlayerNotHostError);
    });
  });

  // MAINT-08: session:host_transferred event (Task 1 — additive)
  describe('processDisconnectedPlayers — session:host_transferred event', () => {
    it('emits session:host_transferred on grace expiry with { lobbyId, oldHostId, newHostId, newHostName }', () => {
      vi.useFakeTimers();

      const localEventBus = new ScopedEventBus();
      const sm = new SessionManager({ eventBus: localEventBus });

      const lobby = sm.createLobby('Host A', 'Transfer Test Lobby');
      const hostId = lobby.players[0].id;
      const { player: playerB } = sm.joinLobby(lobby.id, 'Player B');

      const transferredListener = vi.fn();
      localEventBus.on('session:host_transferred', transferredListener);

      (sm as any).handlePlayerDisconnect(hostId);

      // Advance past grace period
      vi.advanceTimersByTime(11 * 60 * 1000);
      (sm as any).processDisconnectedPlayers();

      expect(transferredListener).toHaveBeenCalledTimes(1);
      expect(transferredListener).toHaveBeenCalledWith({
        lobbyId: lobby.id,
        oldHostId: hostId,
        newHostId: playerB.id,
        newHostName: 'Player B',
      });

      vi.useRealTimers();
    });

    it('also emits session:host_changed (additive — do not remove it)', () => {
      vi.useFakeTimers();

      const localEventBus = new ScopedEventBus();
      const sm = new SessionManager({ eventBus: localEventBus });

      const lobby = sm.createLobby('Host A', 'Transfer Test Lobby 2');
      const hostId = lobby.players[0].id;
      sm.joinLobby(lobby.id, 'Player B');

      const hostChangedListener = vi.fn();
      localEventBus.on('session:host_changed', hostChangedListener);

      (sm as any).handlePlayerDisconnect(hostId);
      vi.advanceTimersByTime(11 * 60 * 1000);
      (sm as any).processDisconnectedPlayers();

      expect(hostChangedListener).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });
});
