import { describe, it, expect } from 'vitest';
import { ClientEventSchemas, validatePayload } from './socket-schemas';

/**
 * Contract tests for the central socket validation gateway (Security: M-2).
 * The websocket layer now validates every client event against
 * ClientEventSchemas before the handler runs, so a schema that is stricter
 * than the real client payload would silently break that feature. These tests
 * lock the two failure classes that unit tests don't exercise:
 *   1. no-arg events must accept the `undefined` Socket.IO delivers, and
 *   2. representative real payloads must pass / malformed ones must fail.
 */

// Events the client emits with NO argument → handler receives `undefined`.
const NO_ARG_EVENTS = [
  'leave_lobby', 'start_battle', 'proceed_next_level', 'restart_game',
  'abandon_quest', 'force_reveal', 'youtube_stop', 'heal_party',
  'return_to_lobby', 'client_heartbeat',
] as const;

describe('ClientEventSchemas contract (M-2)', () => {
  it('no-arg events accept undefined (Socket.IO no-payload emit)', () => {
    for (const event of NO_ARG_EVENTS) {
      const schema = ClientEventSchemas[event];
      expect(schema, `${event} missing from registry`).toBeDefined();
      const r = validatePayload(schema as never, undefined);
      expect(r.success, `${event} schema must accept undefined`).toBe(true);
    }
  });

  it('accepts representative valid payloads for key mutating events', () => {
    const valid: Array<[keyof typeof ClientEventSchemas, unknown]> = [
      ['create_lobby', { lobbyName: 'My Lobby', hostName: 'Alice' }],
      ['join_lobby', { lobbyId: 'ABC123', playerName: 'Bob' }],
      ['assign_team', { playerId: 'p1', team: 'developers' }],
      ['change_own_team', { team: 'qa' }],
      ['submit_score', { score: 8 }],
      ['submit_score', { score: '?' }],
      ['lobby_player_pos', { x: 12.5, y: 80, direction: 'left' }],
      ['lobby_player_pos', { x: 12.5, y: 80 }], // direction optional
    ];
    for (const [event, payload] of valid) {
      const r = validatePayload(ClientEventSchemas[event] as never, payload);
      expect(r.success, `${event} should accept ${JSON.stringify(payload)}`).toBe(true);
    }
  });

  it('rejects malformed payloads for those events', () => {
    const invalid: Array<[keyof typeof ClientEventSchemas, unknown]> = [
      ['create_lobby', { lobbyName: '', hostName: 'Alice' }],      // empty name
      ['create_lobby', { hostName: 'Alice' }],                     // missing lobbyName
      ['join_lobby', { lobbyId: 'ABC' }],                          // missing playerName
      ['assign_team', { playerId: 'p1', team: 'ghosts' }],         // invalid team
      ['change_own_team', {}],                                     // missing team
      ['submit_score', { score: {} }],                             // wrong type
      ['lobby_player_pos', { x: 'nope', y: 80 }],                  // wrong type
    ];
    for (const [event, payload] of invalid) {
      const r = validatePayload(ClientEventSchemas[event] as never, payload);
      expect(r.success, `${event} should reject ${JSON.stringify(payload)}`).toBe(false);
    }
  });
});
