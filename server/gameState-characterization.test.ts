/**
 * Phase 50-01 Post-Deletion Regression Coverage
 *
 * Originally created as a pre-deletion characterization gate for GameState.createLobby
 * and GameState.joinLobby (Task 3). After Task 4 deleted those methods, the GameState
 * assertions were removed (expected — point-of-no-return confirmed).
 *
 * What remains: SessionManager assertions that serve as the live regression coverage
 * confirming the SessionManager equivalents behave correctly.
 *
 * NOTE: This file is safe to delete once Phase 50 is fully verified by CI. The
 * SessionManager equivalents are also covered by server/domains/SessionManager.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { SessionManager } from './domains/SessionManager';
import { ScopedEventBus } from './events';

/** Core structural keys expected in every Lobby object */
const EXPECTED_LOBBY_KEYS = [
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

describe('SessionManager.createLobby — structural regression', () => {
  it('produces a lobby with all expected structural keys', () => {
    const eventBus = new ScopedEventBus();
    const sm = new SessionManager({ eventBus });

    const lobby = sm.createLobby('Host', 'Test');

    expect(Object.keys(lobby)).toEqual(
      expect.arrayContaining(EXPECTED_LOBBY_KEYS)
    );
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].isHost).toBe(true);
    expect(lobby.gamePhase).toBe('lobby');
  });

  it('preserves estimationSettings option through createLobby', () => {
    const eventBus = new ScopedEventBus();
    const sm = new SessionManager({ eventBus });

    const lobby = sm.createLobby('Host', 'Test', {
      estimationSettings: { scaleType: 'fibonacci', autoAdvance: true },
    });

    expect(lobby.estimationSettings?.autoAdvance).toBe(true);
    expect(lobby.estimationSettings?.scaleType).toBe('fibonacci');
  });
});

describe('SessionManager.joinLobby — structural regression', () => {
  it('returns { lobby, player } with correct player count and shared keys', () => {
    const eventBus = new ScopedEventBus();
    const sm = new SessionManager({ eventBus });

    const lobby = sm.createLobby('Host', 'Test');
    const { lobby: joined, player } = sm.joinLobby(lobby.id, 'Joiner');

    expect(Object.keys(joined)).toEqual(
      expect.arrayContaining(EXPECTED_LOBBY_KEYS)
    );
    expect(joined.players).toHaveLength(2);

    const EXPECTED_PLAYER_KEYS = ['id', 'name', 'team', 'isHost', 'avatar', 'avatarClass', 'hasSubmittedScore', 'level'];
    expect(Object.keys(player)).toEqual(expect.arrayContaining(EXPECTED_PLAYER_KEYS));
    expect(player.isHost).toBe(false);
  });
});
