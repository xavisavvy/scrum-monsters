/**
 * ClientEventEmitter Tests
 *
 * Tests for the bridge between internal domain events and Socket.IO client events.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClientEventEmitter } from './ClientEventEmitter';
import { ScopedEventBus } from './ScopedEventBus';
import { LobbyEventSequencer } from './LobbyEventSequencer';

describe('ClientEventEmitter', () => {
  let mockIo: any;
  let eventBus: ScopedEventBus;
  let sequencer: LobbyEventSequencer;
  let emitter: ClientEventEmitter;
  let emittedEvents: Array<{ room: string; event: string; data: any }>;

  beforeEach(() => {
    // Reset emitted events tracker
    emittedEvents = [];

    // Mock Socket.IO Server
    mockIo = {
      to: (room: string) => ({
        emit: (event: string, data: any) => {
          emittedEvents.push({ room, event, data });
        },
      }),
    };

    // Create real event infrastructure
    eventBus = new ScopedEventBus();
    sequencer = new LobbyEventSequencer();

    // Create ClientEventEmitter with mocked io
    emitter = new ClientEventEmitter({
      io: mockIo,
      eventBus,
      sequencer,
    });
  });

  // =============================================================================
  // Event Bridging
  // =============================================================================

  describe('Event bridging', () => {
    it('bridges session:player_joined to Socket.IO', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        room: 'TEST-LOBBY',
        event: 'session:player_joined',
        data: {
          playerId: 'player-1',
          playerName: 'Alice',
          seq: 1,
        },
      });
      expect(emittedEvents[0].data.timestamp).toBeTypeOf('number');
    });

    it('bridges combat:boss_damaged to Socket.IO', () => {
      eventBus.emit('combat:boss_damaged', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        damage: 15,
        bossHealth: 85,
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        room: 'TEST-LOBBY',
        event: 'combat:boss_damaged',
        data: {
          playerId: 'player-1',
          damage: 15,
          newHp: 85,
          seq: 1,
        },
      });
    });

    it('includes seq and timestamp in all events', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
          team: 'developers',
      });

      const data = emittedEvents[0].data;
      expect(data.seq).toBe(1);
      expect(data.timestamp).toBeTypeOf('number');
      expect(data.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    // Phase 45-01 C5 regression: bridge previously hardcoded newHp: 50,
    // dropping the actual revived HP from CombatManager (which uses
    // floor(maxHp * 0.5) — only matches 50 for classes with maxHp=100).
    it('bridges combat:player_revived with the server-computed newHp (not a literal 50)', () => {
      eventBus.emit('combat:player_revived', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'downed-player',
        reviverId: 'reviver-player',
        newHp: 25, // simulates maxHp=50 class
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        room: 'TEST-LOBBY',
        event: 'combat:player_revived',
        data: {
          playerId: 'downed-player',
          reviverId: 'reviver-player',
          newHp: 25,
        },
      });
    });

    it('forwards a different revive HP for a different maxHp class', () => {
      eventBus.emit('combat:player_revived', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'tank',
        reviverId: 'cleric',
        newHp: 100, // simulates maxHp=200 class
      });

      expect(emittedEvents[0].data.newHp).toBe(100);
    });
  });

  // =============================================================================
  // Vote Masking
  // =============================================================================

  describe('Vote masking', () => {
    it('masks vote value in estimation:vote_cast', () => {
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        vote: 8,
        team: 'developers',
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toMatchObject({
        playerId: 'player-1',
        team: 'developers',
        hasVoted: true,
      });
      expect(emittedEvents[0].data.vote).toBeUndefined();
    });

    it('emits discussion_started without vote values (placeholder)', () => {
      eventBus.emit('estimation:discussion_started', {
        lobbyId: 'TEST-LOBBY',
        team: 'developers',
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        room: 'TEST-LOBBY',
        event: 'estimation:discussion_started',
        data: {
          team: 'developers',
        },
      });
    });
  });

  // =============================================================================
  // Sequence Numbers
  // =============================================================================

  describe('Sequence numbers', () => {
    it('starts sequence at 1 for first event', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });

      expect(emittedEvents[0].data.seq).toBe(1);
    });

    it('increments sequence for subsequent events', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-2',
        playerName: 'Bob',
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        vote: 5,
        team: 'developers',
      });

      expect(emittedEvents[0].data.seq).toBe(1);
      expect(emittedEvents[1].data.seq).toBe(2);
      expect(emittedEvents[2].data.seq).toBe(3);
    });

    it('maintains independent sequences for different lobbies', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'LOBBY-A',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });
      eventBus.emit('session:player_joined', {
        lobbyId: 'LOBBY-B',
        playerId: 'player-2',
        playerName: 'Bob',
        team: 'developers',
      });
      eventBus.emit('session:player_joined', {
        lobbyId: 'LOBBY-A',
        playerId: 'player-3',
        playerName: 'Charlie',
        team: 'developers',
      });

      const lobbyAEvents = emittedEvents.filter((e) => e.room === 'LOBBY-A');
      const lobbyBEvents = emittedEvents.filter((e) => e.room === 'LOBBY-B');

      expect(lobbyAEvents[0].data.seq).toBe(1);
      expect(lobbyAEvents[1].data.seq).toBe(2);
      expect(lobbyBEvents[0].data.seq).toBe(1);
    });
  });

  // =============================================================================
  // Event Buffering
  // =============================================================================

  describe('Event buffering', () => {
    it('buffers emitted events', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        vote: 5,
        team: 'developers',
      });

      const missed = emitter.getMissedEvents('TEST-LOBBY', 0);
      expect(missed).not.toBeNull();
      expect(missed).toHaveLength(2);
      expect(missed![0].seq).toBe(1);
      expect(missed![1].seq).toBe(2);
    });

    it('returns missed events after given sequence', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-2',
        playerName: 'Bob',
        team: 'developers',
      });
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        vote: 5,
        team: 'developers',
      });

      const missed = emitter.getMissedEvents('TEST-LOBBY', 1);
      expect(missed).not.toBeNull();
      expect(missed).toHaveLength(2);
      expect(missed![0].seq).toBe(2);
      expect(missed![1].seq).toBe(3);
    });

    it('clears buffer on cleanup', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });

      emitter.cleanup('TEST-LOBBY');

      const missed = emitter.getMissedEvents('TEST-LOBBY', 0);
      expect(missed).toBeNull();
    });
  });

  // =============================================================================
  // Cleanup
  // =============================================================================

  describe('Cleanup', () => {
    it('cleans up on session:lobby_destroyed', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });

      // Emit lobby destroyed
      eventBus.emit('session:lobby_destroyed', {
        lobbyId: 'TEST-LOBBY',
      });

      // Should have NO Socket.IO emission for lobby_destroyed
      const destroyedEvents = emittedEvents.filter(
        (e) => e.event === 'session:lobby_destroyed'
      );
      expect(destroyedEvents).toHaveLength(0);

      // Sequencer should be cleaned up
      const missed = emitter.getMissedEvents('TEST-LOBBY', 0);
      expect(missed).toBeNull();
    });

    it('cleans up on combat:cleanup_complete', () => {
      eventBus.emit('combat:boss_damaged', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        damage: 15,
        bossHealth: 85,
      });

      // Emit cleanup complete
      eventBus.emit('combat:cleanup_complete', {
        lobbyId: 'TEST-LOBBY',
      });

      // Should have NO Socket.IO emission for cleanup_complete
      const cleanupEvents = emittedEvents.filter(
        (e) => e.event === 'combat:cleanup_complete'
      );
      expect(cleanupEvents).toHaveLength(0);

      // Sequencer should be cleaned up
      const missed = emitter.getMissedEvents('TEST-LOBBY', 0);
      expect(missed).toBeNull();
    });

    it('explicit cleanup() method works', () => {
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });

      emitter.cleanup('TEST-LOBBY');

      const missed = emitter.getMissedEvents('TEST-LOBBY', 0);
      expect(missed).toBeNull();
    });
  });

  // =============================================================================
  // sendFullState
  // =============================================================================

  describe('sendFullState', () => {
    it('emits system:full_state to entire lobby', () => {
      const mockLobby: any = {
        id: 'TEST-LOBBY',
        players: [],
        gamePhase: 'lobby',
      };

      emitter.sendFullState('TEST-LOBBY', mockLobby);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        room: 'TEST-LOBBY',
        event: 'system:full_state',
      });
      expect(emittedEvents[0].data.lobby).toBe(mockLobby);
      expect(emittedEvents[0].data.seq).toBeTypeOf('number');
      expect(emittedEvents[0].data.timestamp).toBeTypeOf('number');
    });

    it('emits system:full_state to specific socket', () => {
      const mockLobby: any = {
        id: 'TEST-LOBBY',
        players: [],
        gamePhase: 'lobby',
      };

      emitter.sendFullState('TEST-LOBBY', mockLobby, 'socket-123');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        room: 'socket-123',
        event: 'system:full_state',
      });
    });

    it('includes current sequence in full state', () => {
      // Generate some events first
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-1',
        playerName: 'Alice',
        team: 'developers',
      });
      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST-LOBBY',
        playerId: 'player-2',
        playerName: 'Bob',
        team: 'developers',
      });

      emittedEvents = []; // Reset

      const mockLobby: any = {
        id: 'TEST-LOBBY',
        players: [],
        gamePhase: 'lobby',
      };

      emitter.sendFullState('TEST-LOBBY', mockLobby);

      expect(emittedEvents[0].data.seq).toBe(2); // Current sequence after 2 events
    });
  });

  // =============================================================================
  // All Domain Events
  // =============================================================================

  describe('All domain events are bridged', () => {
    it('bridges session events', () => {
      const sessionEvents = [
        'session:player_joined',
        'session:player_left',
        'session:host_changed',
        'session:phase_changed',
      ];

      eventBus.emit('session:player_joined', {
        lobbyId: 'TEST',
        playerId: 'p1',
        playerName: 'Alice',
        team: 'developers',
      });
      eventBus.emit('session:player_left', {
        lobbyId: 'TEST',
        playerId: 'p1',
      });
      eventBus.emit('session:host_changed', {
        lobbyId: 'TEST',
        oldHostId: 'p1',
        newHostId: 'p2',
      });
      eventBus.emit('session:phase_changed', {
        lobbyId: 'TEST',
        oldPhase: 'lobby',
        newPhase: 'battle',
      });

      expect(emittedEvents.map((e) => e.event)).toEqual(sessionEvents);
    });

    it('bridges estimation events', () => {
      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'TEST',
        playerId: 'p1',
        vote: 5,
        team: 'developers',
      });
      eventBus.emit('estimation:team_consensus_reached', {
        lobbyId: 'TEST',
        team: 'developers',
        consensusValue: 5,
      });
      eventBus.emit('estimation:timer_started', {
        lobbyId: 'TEST',
        team: 'developers',
        durationMs: 60000,
        startedAt: Date.now(),
      });

      expect(emittedEvents.map((e) => e.event)).toEqual([
        'estimation:vote_cast',
        'estimation:consensus_reached',
        'estimation:timer_started',
      ]);
    });

    it('bridges combat events', () => {
      eventBus.emit('combat:boss_damaged', {
        lobbyId: 'TEST',
        playerId: 'p1',
        damage: 15,
        bossHealth: 85,
      });
      eventBus.emit('combat:player_damaged', {
        lobbyId: 'TEST',
        playerId: 'p1',
        damage: 10,
        playerHealth: 90,
      });
      eventBus.emit('combat:boss_defeated', {
        lobbyId: 'TEST',
        bossId: 'boss-1',
      });

      expect(emittedEvents.map((e) => e.event)).toEqual([
        'combat:boss_damaged',
        'combat:player_damaged',
        'combat:boss_defeated',
      ]);
    });
  });
});
