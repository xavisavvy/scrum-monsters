import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gameState, GameStateManager } from './gameState';
import { SessionManager } from './domains/SessionManager';
import { ScopedEventBus } from './events';
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

/**
 * Phase 48-01 — MAINT-01 testability seam.
 *
 * Asserts that:
 *   1. GameStateManager is exported and constructable without starting watchdog timers.
 *   2. The default constructor (no opts) starts exactly two setInterval watchdogs.
 *   3. handleVotingTimeout is callable as a public method without `as any`.
 *
 * Key notes:
 *   - Tests use new GameStateManager(undefined, { startWatchdogs: false }) — no timer leaks.
 *   - Fake timers are scoped to this describe only; restored in afterEach.
 *   - handleVotingTimeout calls emitRevealCascade which checks this.io; when io is
 *     undefined (as in these tests), the cascade no-ops (RESEARCH Pitfall 6). The
 *     gamePhase mutation still fires — that is the assertion target.
 */
describe('GameStateManager — MAINT-01 testability seam', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('constructs without starting timers when startWatchdogs: false', () => {
    const gs = new GameStateManager(undefined, { startWatchdogs: false });
    expect(gs).toBeInstanceOf(GameStateManager);
    // No setInterval was called — timer count is zero
    expect(vi.getTimerCount()).toBe(0);
  });

  it('default constructor (no opts) starts exactly two watchdog intervals', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const gs = new GameStateManager();
    try {
      expect(spy).toHaveBeenCalledTimes(2);
      expect(gs).toBeInstanceOf(GameStateManager);
    } finally {
      // Clean up the two real intervals the production singleton started
      vi.clearAllTimers();
      spy.mockRestore();
    }
  });

  it('handleVotingTimeout is callable as a public method without as any', () => {
    const gs = new GameStateManager(undefined, { startWatchdogs: false });

    // Phase 50-01: fixture migrated from gs.createLobby to sessionManager.createLobby
    // + gs.syncPlayerToLobby (production pattern). gs.createLobby deleted in Task 4.
    const eventBus = new ScopedEventBus();
    const sessionManager = new SessionManager({ eventBus });
    const lobby = sessionManager.createLobby('Host', 'Test Lobby');
    // Sync the lobby into gs so getLobby/handleVotingTimeout can find it
    gs.syncPlayerToLobby(lobby.hostId, lobby);

    // Advance to battle phase and add a player with a submitted vote via the
    // mutable lobby reference returned by getLobby (no `as any` on gs needed).
    // io is undefined so emitRevealCascade will no-op (RESEARCH Pitfall 6) —
    // the gamePhase mutation still fires, which is what we assert.
    const lobbyRef = gs.getLobby(lobby.id)!;
    lobbyRef.gamePhase = 'battle';
    lobbyRef.players.push({
      id: 'voter-1',
      name: 'Voter',
      team: 'developers',
      isHost: false,
      avatar: 'warrior',
      avatarClass: 'warrior',
      hasSubmittedScore: true,
      currentScore: 5,
      level: 1,
    } as any);

    // Call the public method directly — no `as any` on gs
    gs.handleVotingTimeout(lobby.id);

    expect(gs.getLobby(lobby.id)?.gamePhase).toBe('reveal');
  });
});

describe('GameStateManager.syncPlayerToLobby — alias registration', () => {
  it('registers aliases for ALL lobby members, not just the triggering player', () => {
    const mgr = new GameStateManager(undefined, { startWatchdogs: false });

    // Build a lobby with 3 players using the constructable seam
    const lobby = mgr.createLobby('Host', 'Alias Test Lobby');
    const hostId = lobby.hostId;

    // Manually add player2 and player3 to the lobby (simulating join)
    const player2 = {
      id: 'player2-id',
      name: 'Player Two',
      team: 'developers' as const,
      isHost: false,
      avatar: 'mage' as const,
      avatarClass: 'mage' as const,
      hasSubmittedScore: false,
      currentScore: undefined,
      level: 1,
    };
    const player3 = {
      id: 'player3-id',
      name: 'Player Three',
      team: 'developers' as const,
      isHost: false,
      avatar: 'healer' as const,
      avatarClass: 'healer' as const,
      hasSubmittedScore: false,
      currentScore: undefined,
      level: 1,
    };
    lobby.players.push(player2 as any, player3 as any);

    // Call syncPlayerToLobby with ONLY the host's id
    mgr.syncPlayerToLobby(hostId, lobby);

    // ALL players' aliases should resolve — this fails before the fix
    expect(mgr.getLobbyByPlayerId(player2.id)).not.toBeNull();
    expect(mgr.getLobbyByPlayerId(player3.id)).not.toBeNull();
    expect(mgr.getLobbyByPlayerId(player2.id)?.id).toBe(lobby.id);
    expect(mgr.getLobbyByPlayerId(player3.id)?.id).toBe(lobby.id);
  });

  it('is idempotent — calling syncPlayerToLobby again does not throw or overwrite', () => {
    const mgr = new GameStateManager(undefined, { startWatchdogs: false });
    const lobby = mgr.createLobby('Host', 'Idempotency Test');
    const hostId = lobby.hostId;

    // First call
    mgr.syncPlayerToLobby(hostId, lobby);
    // Second call — same player, same lobby
    mgr.syncPlayerToLobby(hostId, lobby);

    expect(mgr.getLobbyByPlayerId(hostId)?.id).toBe(lobby.id);
  });

  it('always refreshes the lobby reference unconditionally', () => {
    const mgr = new GameStateManager(undefined, { startWatchdogs: false });
    const lobby = mgr.createLobby('Host', 'Refresh Test');
    const hostId = lobby.hostId;

    // Mutate the lobby and re-sync — the new reference should be stored
    const lobbyRef = mgr.getLobby(lobby.id)!;
    lobbyRef.name = 'Updated Name';

    mgr.syncPlayerToLobby(hostId, lobbyRef);

    expect(mgr.getLobby(lobby.id)?.name).toBe('Updated Name');
  });
});
