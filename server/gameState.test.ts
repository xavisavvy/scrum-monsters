import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gameState } from './gameState';
import type { Lobby } from '@shared/gameEvents';

/**
 * Phase 42-02a / FIX-05 — auto-advance toggle gate.
 *
 * Asserts that:
 *   1. With estimationSettings.autoAdvance === false (default), checkDiscussionConsensus
 *      does NOT start consensusCountdown when teams agree.
 *   2. With autoAdvance === true, the same call DOES start consensusCountdown.
 *   3. handleVotingTimeout (3-min safety net at gameState.ts:1322-1346) advances the
 *      phase regardless of autoAdvance — the safety-net path is unchanged.
 */

const gs = gameState as any; // private members access for test fixture construction

function buildDiscussionLobby(autoAdvance: boolean | undefined): Lobby {
  const lobbyId = `test-${Math.random().toString(36).slice(2, 10)}`;
  const lobby: Lobby = {
    id: lobbyId,
    name: 'test-lobby',
    hostId: 'host-1',
    players: [
      { id: 'd1', name: 'Dev1', team: 'developers', isHost: true, avatar: 'warrior', avatarClass: 'warrior', hasSubmittedScore: true, currentScore: 5, level: 1 },
      { id: 'q1', name: 'Qa1', team: 'qa', isHost: false, avatar: 'mage', avatarClass: 'mage', hasSubmittedScore: true, currentScore: 5, level: 1 },
    ] as any,
    teams: { developers: ['d1'], qa: ['q1'], spectators: [] } as any,
    tickets: [],
    gamePhase: 'discussion',
    completedTickets: [],
    teamCompetition: {
      developers: { totalStoryPoints: 0, ticketsCompleted: 0, averageEstimationTime: 0, consensusRate: 0, accuracyScore: 0, participationRate: 0, achievements: [], currentStreak: 0, bestStreak: 0 },
      qa: { totalStoryPoints: 0, ticketsCompleted: 0, averageEstimationTime: 0, consensusRate: 0, accuracyScore: 0, participationRate: 0, achievements: [], currentStreak: 0, bestStreak: 0 },
      currentRound: 0,
      winnerHistory: [],
      seasonStart: new Date().toISOString(),
    } as any,
    playerCombatStates: {
      d1: { maxHp: 100, hp: 100, isDowned: false } as any,
      q1: { maxHp: 100, hp: 100, isDowned: false } as any,
    } as any,
    playerPositions: { d1: { x: 10, y: 80 }, q1: { x: 20, y: 80 } } as any,
    consensusSettings: { countdownSeconds: 5 },
    boss: { id: 'b', name: 'Test Boss', maxHp: 100, hp: 100, level: 1 } as any,
    currentTicket: { id: 't1', title: 'Test', description: '', status: 'voting' } as any,
    estimationSettings: autoAdvance === undefined
      ? { scaleType: 'fibonacci' }
      : { scaleType: 'fibonacci', autoAdvance },
  };
  return lobby;
}

function injectLobby(lobby: Lobby): string {
  gs.lobbies.set(lobby.id, lobby);
  return lobby.id;
}

function clearLobby(lobbyId: string): void {
  // Clean up any countdown intervals the test created
  const interval = gs.consensusCountdownIntervals?.get(lobbyId);
  if (interval) clearInterval(interval);
  gs.consensusCountdownIntervals?.delete(lobbyId);
  const vt = gs.votingTimeouts?.get(lobbyId);
  if (vt) clearTimeout(vt);
  gs.votingTimeouts?.delete(lobbyId);
  gs.lobbies.delete(lobbyId);
}

describe('GameState.checkDiscussionConsensus — autoAdvance gate (Phase 42-02a / FIX-05)', () => {
  const createdLobbyIds: string[] = [];

  afterEach(() => {
    while (createdLobbyIds.length) {
      const id = createdLobbyIds.pop();
      if (id) clearLobby(id);
    }
  });

  it('does NOT start consensus countdown when autoAdvance=false', () => {
    const lobby = buildDiscussionLobby(false);
    const id = injectLobby(lobby);
    createdLobbyIds.push(id);

    const result = gameState.checkDiscussionConsensus(id);
    expect(result).not.toBeNull();
    expect(result!.lobby.consensusCountdown?.isActive).toBeFalsy();
  });

  it('does NOT start consensus countdown when autoAdvance is undefined (legacy lobby)', () => {
    const lobby = buildDiscussionLobby(undefined);
    const id = injectLobby(lobby);
    createdLobbyIds.push(id);

    const result = gameState.checkDiscussionConsensus(id);
    expect(result).not.toBeNull();
    expect(result!.lobby.consensusCountdown?.isActive).toBeFalsy();
  });

  it('DOES start consensus countdown when autoAdvance=true', () => {
    const lobby = buildDiscussionLobby(true);
    const id = injectLobby(lobby);
    createdLobbyIds.push(id);

    const result = gameState.checkDiscussionConsensus(id);
    expect(result).not.toBeNull();
    expect(result!.lobby.consensusCountdown?.isActive).toBe(true);
    expect(result!.lobby.consensusCountdown?.remainingSeconds).toBeGreaterThan(0);
  });
});

describe('GameState.handleVotingTimeout — safety net unchanged (Phase 42-02a / FIX-05)', () => {
  const createdLobbyIds: string[] = [];

  afterEach(() => {
    while (createdLobbyIds.length) {
      const id = createdLobbyIds.pop();
      if (id) clearLobby(id);
    }
  });

  function buildBattleLobby(autoAdvance: boolean): Lobby {
    const lobby = buildDiscussionLobby(autoAdvance);
    lobby.gamePhase = 'battle';
    return lobby;
  }

  it('advances the phase to reveal when autoAdvance=false (safety net fires)', () => {
    const lobby = buildBattleLobby(false);
    const id = injectLobby(lobby);
    createdLobbyIds.push(id);

    gs.handleVotingTimeout(id);

    expect(gs.lobbies.get(id)?.gamePhase).toBe('reveal');
  });

  it('advances the phase to reveal when autoAdvance=true (safety net fires)', () => {
    const lobby = buildBattleLobby(true);
    const id = injectLobby(lobby);
    createdLobbyIds.push(id);

    gs.handleVotingTimeout(id);

    expect(gs.lobbies.get(id)?.gamePhase).toBe('reveal');
  });
});
