import { describe, it, expect } from 'vitest';
import { withTeamsDerived } from './withTeamsDerived';
import type { Lobby, Player } from '@shared/gameEvents';

/**
 * Unit tests for withTeamsDerived (MAINT-04).
 * Pure function — no mocks needed.
 */

function makeLobby(players: Partial<Player>[]): Lobby {
  return {
    id: 'lobby-1',
    hostId: 'host',
    players: players as Player[],
    teams: { developers: [], qa: [], spectators: [] },
    gamePhase: 'lobby',
    tickets: [],
    completedTickets: [],
  } as unknown as Lobby;
}

describe('withTeamsDerived', () => {
  it('recomputes teams from players when a player switches teams in players[]', () => {
    const lobby = makeLobby([
      { id: 'p1', team: 'developers' },
      { id: 'p2', team: 'qa' },
    ]);
    // Simulate the player switching teams in players[] but teams[] not updated yet
    const updated = withTeamsDerived({
      ...lobby,
      players: lobby.players.map(p =>
        p.id === 'p1' ? { ...p, team: 'qa' } : p
      ) as Player[],
    });
    expect(updated.teams.qa.map(p => p.id)).toContain('p1');
    expect(updated.teams.developers.map(p => p.id)).not.toContain('p1');
  });

  it('closes the push-before-map bug: teams[newTeam] player has correct team field', () => {
    // Reproduces the exact bug: teams[qa] contained a player object with .team === 'developers'
    // because the player was pushed from old players[] before the .map() was applied.
    const lobby = makeLobby([{ id: 'p1', team: 'developers' }]);
    const result = withTeamsDerived({
      ...lobby,
      players: lobby.players.map(p =>
        p.id === 'p1' ? { ...p, team: 'qa' } : p
      ) as Player[],
    });
    // Would have been 'developers' in the push-before-map bug
    expect(result.teams.qa[0].team).toBe('qa');
  });

  it('produces empty arrays for all three TeamTypes even when no players match', () => {
    const lobby = makeLobby([]);
    const result = withTeamsDerived(lobby);
    expect(result.teams.developers).toEqual([]);
    expect(result.teams.qa).toEqual([]);
    expect(result.teams.spectators).toEqual([]);
    // No undefined keys — all three TeamTypes must be present
    expect('developers' in result.teams).toBe(true);
    expect('qa' in result.teams).toBe(true);
    expect('spectators' in result.teams).toBe(true);
  });

  it('is idempotent: calling withTeamsDerived twice yields teams equal to one call', () => {
    const lobby = makeLobby([
      { id: 'p1', team: 'developers' },
      { id: 'p2', team: 'qa' },
      { id: 'p3', team: 'spectators' },
    ]);
    const once = withTeamsDerived(lobby);
    const twice = withTeamsDerived(once);
    expect(twice.teams.developers.map(p => p.id)).toEqual(once.teams.developers.map(p => p.id));
    expect(twice.teams.qa.map(p => p.id)).toEqual(once.teams.qa.map(p => p.id));
    expect(twice.teams.spectators.map(p => p.id)).toEqual(once.teams.spectators.map(p => p.id));
  });
});
