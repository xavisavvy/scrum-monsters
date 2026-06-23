/**
 * Phase 50-01 Pre-Deletion Characterization Gate
 *
 * TEMPORARY FILE — delete after Phase 50 lands (once all GameState dead methods
 * are removed and SessionManager equivalents are the live regression coverage).
 *
 * Purpose: assert that SessionManager.createLobby and SessionManager.joinLobby
 * produce structurally equivalent output to their GameState counterparts BEFORE
 * we delete those GameState methods in Task 4. If shapes drift, Task 4 would
 * be unsafe.
 *
 * Known differences (not regressions):
 *   - GameState lobby has `consensusSettings` field; SessionManager does not.
 *     This field is populated by GameState.createLobby with a default of
 *     { countdownSeconds: 5 }. SessionManager inherits consensusSettings when
 *     it receives a Lobby object from a client but does not initialise the field
 *     itself. This is a known divergence that is safe to ignore for deletion.
 *   - Key insertion order differs (does not affect runtime correctness).
 *   - SessionManager enforces MAX_LOBBIES; GameState does not.
 *
 * After Task 4 runs, the createLobby/joinLobby GameState methods are gone, so
 * the `gs.createLobby` / `gs.joinLobby` sections below will be removed then.
 * The SessionManager assertions remain as the live regression.
 */

import { describe, it, expect } from 'vitest';
import { GameStateManager } from './gameState';
import { SessionManager } from './domains/SessionManager';
import { ScopedEventBus } from './events';

/** Core structural keys present in BOTH implementations */
const SHARED_LOBBY_KEYS = [
  'id',
  'name',
  'hostId',
  'players',
  'teams',
  'tickets',
  'completedTickets',
  'gamePhase',
  'playerCombatStates',
  'playerPositions',
  'teamCompetition',
  'timerSettings',
  'jiraSettings',
  'estimationSettings',
];

describe('Pre-deletion shape characterization: createLobby', () => {
  it('both implementations share the core lobby structural keys', () => {
    const gs = new GameStateManager(undefined, { startWatchdogs: false });
    const eventBus = new ScopedEventBus();
    const sm = new SessionManager({ eventBus });

    const gsLobby = gs.createLobby('Host', 'Test');
    const smLobby = sm.createLobby('Host', 'Test');

    // Both have all shared structural keys
    expect(Object.keys(gsLobby)).toEqual(
      expect.arrayContaining(SHARED_LOBBY_KEYS)
    );
    expect(Object.keys(smLobby)).toEqual(
      expect.arrayContaining(SHARED_LOBBY_KEYS)
    );

    // Both start with exactly 1 player (the host)
    expect(gsLobby.players).toHaveLength(1);
    expect(smLobby.players).toHaveLength(1);
    // Both mark the single player as host
    expect(gsLobby.players[0].isHost).toBe(true);
    expect(smLobby.players[0].isHost).toBe(true);
    // Both start in lobby phase
    expect(gsLobby.gamePhase).toBe('lobby');
    expect(smLobby.gamePhase).toBe('lobby');
  });

  it('SessionManager.createLobby preserves estimationSettings option', () => {
    const eventBus = new ScopedEventBus();
    const sm = new SessionManager({ eventBus });

    const smLobby = sm.createLobby('Host', 'Test', {
      estimationSettings: { scaleType: 'fibonacci', autoAdvance: true },
    });

    expect(smLobby.estimationSettings?.autoAdvance).toBe(true);
    expect(smLobby.estimationSettings?.scaleType).toBe('fibonacci');
  });
});

describe('Pre-deletion shape characterization: joinLobby', () => {
  it('both implementations return { lobby, player } with shared structural keys', () => {
    const gs = new GameStateManager(undefined, { startWatchdogs: false });
    const eventBus = new ScopedEventBus();
    const sm = new SessionManager({ eventBus });

    const gsLobby = gs.createLobby('Host', 'Test');
    const smLobby = sm.createLobby('Host', 'Test');

    const gsResult = gs.joinLobby(gsLobby.id, 'Joiner');
    const smResult = sm.joinLobby(smLobby.id, 'Joiner');

    // Both return { lobby, player }
    expect(gsResult).not.toBeNull();
    expect(smResult).not.toBeNull();

    const { lobby: gsJoined, player: gsPlayer } = gsResult!;
    const { lobby: smJoined, player: smPlayer } = smResult;

    // Shared keys present in both
    expect(Object.keys(gsJoined)).toEqual(
      expect.arrayContaining(SHARED_LOBBY_KEYS)
    );
    expect(Object.keys(smJoined)).toEqual(
      expect.arrayContaining(SHARED_LOBBY_KEYS)
    );

    // Both now have 2 players
    expect(gsJoined.players).toHaveLength(2);
    expect(smJoined.players).toHaveLength(2);

    // The returned player objects have shared structural keys
    const SHARED_PLAYER_KEYS = ['id', 'name', 'team', 'isHost', 'avatar', 'avatarClass', 'hasSubmittedScore', 'level'];
    expect(Object.keys(gsPlayer)).toEqual(expect.arrayContaining(SHARED_PLAYER_KEYS));
    expect(Object.keys(smPlayer)).toEqual(expect.arrayContaining(SHARED_PLAYER_KEYS));
  });
});
