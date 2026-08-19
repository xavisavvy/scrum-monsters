import type { Lobby, TeamType } from '@shared/gameEvents';

const TEAM_TYPES: TeamType[] = ['developers', 'qa', 'spectators'];

/**
 * Returns a new Lobby with `teams` recomputed from `players`.
 * Thread through setLobby in useGameState to close the team-staleness
 * bugs (MAINT-04). Idempotent — safe to call on server-provided lobbies.
 *
 * Rationale: The Lobby type carries both `players: Player[]` (authoritative)
 * and `teams: Record<TeamType, Player[]>` (derived projection). Several
 * fine-grained socket handlers (session:team_changed, session:avatar_selected,
 * session:host_changed) mutate `players` without re-deriving `teams`,
 * causing consumer components reading from `teams[*]` to see stale data.
 * Calling withTeamsDerived at the single setLobby site in useGameState.tsx
 * ensures every handler benefits automatically and idempotently.
 */
export function withTeamsDerived(lobby: Lobby): Lobby {
  const teams = {} as Record<TeamType, typeof lobby.players>;
  for (const t of TEAM_TYPES) {
    teams[t] = lobby.players.filter(p => p.team === t);
  }
  return { ...lobby, teams };
}
