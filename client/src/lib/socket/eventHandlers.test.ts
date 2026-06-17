import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Boss, Lobby } from '@shared/gameEvents';
import { setupEventHandlers } from './eventHandlers';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';

/**
 * Phase 45-01 regression coverage for socket schema drift bugs C1/C2/C3/C5
 * (see .planning/phases/45-socket-schema-drift-reconciliation/45-RESEARCH.md).
 *
 * Each test installs a mock socket that records its .on() registrations,
 * runs setupEventHandlers against it, fishes out the handler under test, and
 * invokes it with a payload shaped exactly as the server bridge sends.
 */

type Handler = (data: unknown) => void;

function makeMockSocket(): { socket: any; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const socket = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    // Mirrors socket.io-client Emitter.listeners — used by the H1 recovery
    // re-dispatch bridge to re-apply buffered/missed events.
    listeners: vi.fn((event: string) => (handlers.has(event) ? [handlers.get(event)!] : [])),
  };
  return { socket, handlers };
}

function seedBoss(): Boss {
  return {
    id: 'boss-1',
    name: 'Goblin',
    type: 'goblin',
    maxHealth: 200,
    currentHealth: 100,
    defeated: false,
  } as unknown as Boss;
}

function seedLobby(boss: Boss): Lobby {
  return {
    id: 'lobby-1',
    hostId: 'host',
    players: [],
    teams: { developers: [], qa: [], spectators: [] },
    gamePhase: 'battle',
    boss,
    tickets: [],
    completedTickets: [],
  } as unknown as Lobby;
}

describe('Phase 45-01 handler regression coverage', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    // useGameState has no explicit reset; null out the keys we touch.
    useGameState.setState({ currentLobby: null, currentBoss: null });
  });

  describe('C1: combat:boss_healed reads data.newHp (was data.newHealth)', () => {
    it('sets currentBoss.currentHealth to the wire newHp value', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const boss = seedBoss();
      const lobby = seedLobby(boss);
      useGameState.setState({ currentBoss: boss, currentLobby: lobby });

      const handler = handlers.get('combat:boss_healed');
      expect(handler).toBeDefined();

      handler!({ healAmount: 25, newHp: 175, seq: 1, timestamp: Date.now() });

      const state = useGameState.getState();
      expect(state.currentBoss!.currentHealth).toBe(175);
      expect(state.currentLobby!.boss!.currentHealth).toBe(175);
      // Regression guard: a payload missing newHp would have set this to undefined.
      expect(typeof state.currentBoss!.currentHealth).toBe('number');
    });

    it('handles a series of heals without losing the running total', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const boss = seedBoss();
      useGameState.setState({ currentBoss: boss });

      const handler = handlers.get('combat:boss_healed')!;
      handler({ healAmount: 25, newHp: 125, seq: 1, timestamp: 0 });
      handler({ healAmount: 25, newHp: 150, seq: 2, timestamp: 0 });
      handler({ healAmount: 50, newHp: 200, seq: 3, timestamp: 0 });

      expect(useGameState.getState().currentBoss!.currentHealth).toBe(200);
    });
  });

  describe('C2: estimation:timer_started reconstructs startedAt from endsAt - durationMs', () => {
    it('builds a TimerState whose startedAt is finite and consistent with the wire shape', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const lobby = seedLobby(seedBoss());
      useGameState.setState({ currentLobby: lobby });

      const handler = handlers.get('estimation:timer_started')!;
      const endsAt = 1_000_000;
      const durationMs = 30_000;
      handler({ team: 'developers', endsAt, durationMs, seq: 1, timestamp: 0 });

      const timer = useGameState.getState().currentLobby!.currentTimer!;
      expect(timer.startedAt).toBe(endsAt - durationMs);
      expect(timer.durationMs).toBe(durationMs);
      expect(timer.isActive).toBe(true);
      // Regression guard: a payload missing startedAt would have made this NaN.
      expect(Number.isFinite(timer.startedAt)).toBe(true);
    });
  });

  describe('C3: estimation:timer_resumed reconstructs both startedAt and durationMs', () => {
    it('anchors startedAt to now and derives durationMs from endsAt - now', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const lobby = seedLobby(seedBoss());
      useGameState.setState({ currentLobby: lobby });

      const now = 2_000_000;
      const remainingMs = 15_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const handler = handlers.get('estimation:timer_resumed')!;
      handler({ team: 'developers', endsAt: now + remainingMs, seq: 1, timestamp: 0 });

      const timer = useGameState.getState().currentLobby!.currentTimer!;
      expect(timer.startedAt).toBe(now);
      expect(timer.durationMs).toBe(remainingMs);
      expect(timer.isActive).toBe(true);
      // Regression guard: pre-fix handler read non-existent data.durationMs and got undefined.
      expect(Number.isFinite(timer.durationMs)).toBe(true);

      vi.restoreAllMocks();
    });

    it('clamps durationMs to zero if the wire endsAt is already past', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const lobby = seedLobby(seedBoss());
      useGameState.setState({ currentLobby: lobby });

      const now = 2_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const handler = handlers.get('estimation:timer_resumed')!;
      handler({ team: 'developers', endsAt: now - 5_000, seq: 1, timestamp: 0 });

      expect(useGameState.getState().currentLobby!.currentTimer!.durationMs).toBe(0);
      vi.restoreAllMocks();
    });
  });
});

describe('Phase 45-04 broken-feature restoration handler coverage', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    useGameState.setState({
      currentLobby: null,
      currentBoss: null,
      revivalSessions: {},
      pendingDamageEvents: [],
    });
  });

  describe('Revival UX (combat:revival_started / _progress / _cancelled)', () => {
    it('combat:revival_started inserts a session keyed by targetId with percent 0', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      handlers.get('combat:revival_started')!({
        reviverId: 'cleric-1',
        targetId: 'warrior-1',
        durationMs: 3000,
        seq: 1,
        timestamp: 0,
      });

      const sessions = useGameState.getState().revivalSessions;
      expect(sessions['warrior-1']).toMatchObject({
        reviverId: 'cleric-1',
        targetId: 'warrior-1',
        percent: 0,
        durationMs: 3000,
      });
    });

    it('combat:revival_progress updates percent on an existing session', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      handlers.get('combat:revival_started')!({
        reviverId: 'cleric-1',
        targetId: 'warrior-1',
        durationMs: 3000,
        seq: 1,
        timestamp: 0,
      });
      handlers.get('combat:revival_progress')!({
        reviverId: 'cleric-1',
        targetId: 'warrior-1',
        percent: 50,
        remainingMs: 1500,
        seq: 2,
        timestamp: 0,
      });

      expect(useGameState.getState().revivalSessions['warrior-1'].percent).toBe(50);
    });

    it('combat:revival_progress is a no-op if no session exists for the targetId', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      handlers.get('combat:revival_progress')!({
        reviverId: 'cleric-1',
        targetId: 'ghost',
        percent: 50,
        remainingMs: 1500,
        seq: 1,
        timestamp: 0,
      });

      expect(useGameState.getState().revivalSessions).toEqual({});
    });

    it('combat:revival_cancelled removes the session', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      handlers.get('combat:revival_started')!({
        reviverId: 'cleric-1',
        targetId: 'warrior-1',
        durationMs: 3000,
        seq: 1,
        timestamp: 0,
      });
      handlers.get('combat:revival_cancelled')!({
        reviverId: 'cleric-1',
        targetId: 'warrior-1',
        reason: 'cancelled_by_reviver',
        seq: 2,
        timestamp: 0,
      });

      expect(useGameState.getState().revivalSessions['warrior-1']).toBeUndefined();
    });

    it('combat:player_revived also clears any in-flight revival session', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const lobby = seedLobby(seedBoss());
      useGameState.setState({
        currentLobby: { ...lobby, playerCombatStates: { 'warrior-1': { hp: 0, maxHp: 100, isDowned: true } } } as unknown as Lobby,
      });

      handlers.get('combat:revival_started')!({
        reviverId: 'cleric-1',
        targetId: 'warrior-1',
        durationMs: 3000,
        seq: 1,
        timestamp: 0,
      });
      handlers.get('combat:player_revived')!({
        playerId: 'warrior-1',
        reviverId: 'cleric-1',
        newHp: 50,
        seq: 2,
        timestamp: 0,
      });

      expect(useGameState.getState().revivalSessions['warrior-1']).toBeUndefined();
    });
  });

  describe('combat:player_healed (floating-heal popup)', () => {
    it('writes new hp and pushes a heal-type entry into pendingDamageEvents', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const lobby = seedLobby(seedBoss());
      useGameState.setState({
        currentLobby: { ...lobby, playerCombatStates: { 'warrior-1': { hp: 10, maxHp: 100, isDowned: false } } } as unknown as Lobby,
      });

      handlers.get('combat:player_healed')!({
        playerId: 'warrior-1',
        healerId: 'cleric-1',
        healAmount: 40,
        newHp: 50,
        seq: 1,
        timestamp: 0,
      });

      const state = useGameState.getState();
      expect(state.currentLobby!.playerCombatStates['warrior-1'].hp).toBe(50);
      expect(state.pendingDamageEvents).toHaveLength(1);
      expect(state.pendingDamageEvents[0]).toMatchObject({
        playerId: 'warrior-1',
        amount: 40,
        type: 'heal',
      });
    });

    it('clears isDowned when heal brings hp above 0', () => {
      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      const lobby = seedLobby(seedBoss());
      useGameState.setState({
        currentLobby: { ...lobby, playerCombatStates: { 'warrior-1': { hp: 0, maxHp: 100, isDowned: true } } } as unknown as Lobby,
      });

      handlers.get('combat:player_healed')!({
        playerId: 'warrior-1',
        healerId: 'cleric-1',
        healAmount: 50,
        newHp: 50,
        seq: 1,
        timestamp: 0,
      });

      expect(useGameState.getState().currentLobby!.playerCombatStates['warrior-1'].isDowned).toBe(false);
    });
  });

  describe('YouTube sync', () => {
    it('youtube_play_synced dispatches playYoutubeAudio with the wire videoId', async () => {
      // Mock useAudio via dynamic import; the handler reads useAudio.getState().
      const { useAudio } = await import('../stores/useAudio');
      const playSpy = vi.fn();
      const original = useAudio.getState().playYoutubeAudio;
      useAudio.setState({ playYoutubeAudio: playSpy });

      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      handlers.get('youtube_play_synced')!({ videoId: 'abc123', url: 'https://youtu.be/abc123' });

      expect(playSpy).toHaveBeenCalledWith('abc123');
      useAudio.setState({ playYoutubeAudio: original });
    });

    it('youtube_play_synced is a no-op if videoId is missing', async () => {
      const { useAudio } = await import('../stores/useAudio');
      const playSpy = vi.fn();
      const original = useAudio.getState().playYoutubeAudio;
      useAudio.setState({ playYoutubeAudio: playSpy });

      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      handlers.get('youtube_play_synced')!({ url: 'https://youtu.be/abc123' });

      expect(playSpy).not.toHaveBeenCalled();
      useAudio.setState({ playYoutubeAudio: original });
    });

    it('youtube_stop_synced dispatches stopYoutubeAudio', async () => {
      const { useAudio } = await import('../stores/useAudio');
      const stopSpy = vi.fn();
      const original = useAudio.getState().stopYoutubeAudio;
      useAudio.setState({ stopYoutubeAudio: stopSpy });

      const { socket, handlers } = makeMockSocket();
      setupEventHandlers(socket);

      handlers.get('youtube_stop_synced')!(undefined);

      expect(stopSpy).toHaveBeenCalled();
      useAudio.setState({ stopYoutubeAudio: original });
    });
  });
});

describe('Reveal vote mirror — teams[*] populated so Discussion renders (council C1)', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    useGameState.setState({ currentLobby: null, currentBoss: null, currentPlayer: null });
  });

  function seedTeamLobby(): Lobby {
    const dev = { id: 'd1', name: 'Dev1', team: 'developers', isHost: false, avatar: 'warrior', avatarClass: 'warrior', hasSubmittedScore: true, level: 1 };
    const qa = { id: 'q1', name: 'Qa1', team: 'qa', isHost: false, avatar: 'mage', avatarClass: 'mage', hasSubmittedScore: true, level: 1 };
    return {
      id: 'lobby-1',
      hostId: 'd1',
      players: [dev, qa],
      teams: { developers: [dev], qa: [qa], spectators: [] },
      gamePhase: 'discussion',
      tickets: [],
      completedTickets: [],
    } as unknown as Lobby;
  }

  it('estimation:votes_revealed writes currentScore into BOTH players[] and teams[*]', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);
    useGameState.setState({ currentLobby: seedTeamLobby() });

    handlers.get('estimation:votes_revealed')!({ votes: { d1: 8 }, team: 'developers', seq: 1, timestamp: 0 });

    const lobby = useGameState.getState().currentLobby!;
    // Council C1 regression guard: Discussion.tsx renders from teams.developers,
    // NOT players[]. A players-only write left the vote grid empty.
    expect(lobby.teams.developers[0].currentScore).toBe(8);
    expect(lobby.players.find(p => p.id === 'd1')!.currentScore).toBe(8);
  });

  it('does not clobber the first team when the second team\'s reveal arrives', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);
    useGameState.setState({ currentLobby: seedTeamLobby() });

    const h = handlers.get('estimation:votes_revealed')!;
    h({ votes: { d1: 8 }, team: 'developers', seq: 1, timestamp: 0 });
    h({ votes: { q1: 5 }, team: 'qa', seq: 2, timestamp: 0 });

    const lobby = useGameState.getState().currentLobby!;
    expect(lobby.teams.developers[0].currentScore).toBe(8);
    expect(lobby.teams.qa[0].currentScore).toBe(5);
  });

  it('mirrors the local player\'s revealed score into currentPlayer (Discussion auto-select)', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);
    const lobby = seedTeamLobby();
    useGameState.setState({ currentLobby: lobby, currentPlayer: lobby.players[0] });

    handlers.get('estimation:votes_revealed')!({ votes: { d1: 13 }, team: 'developers', seq: 1, timestamp: 0 });

    expect(useGameState.getState().currentPlayer!.currentScore).toBe(13);
  });

  it('estimation:discussion_vote_updated also mirrors into teams[*]', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);
    useGameState.setState({ currentLobby: seedTeamLobby() });

    handlers.get('estimation:discussion_vote_updated')!({ playerId: 'q1', score: 3, seq: 1, timestamp: 0 });

    const lobby = useGameState.getState().currentLobby!;
    expect(lobby.teams.qa[0].currentScore).toBe(3);
    expect(lobby.players.find(p => p.id === 'q1')!.currentScore).toBe(3);
  });
});

describe('Recovery re-applies events, not just lastSeq (council H1)', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    useEventSync.getState().setReplayDispatch(null);
    useGameState.setState({ currentLobby: null, currentBoss: null, currentPlayer: null });
  });

  function seedBattleLobby(): Lobby {
    const dev = { id: 'd1', name: 'Dev1', team: 'developers', isHost: false, avatar: 'warrior', avatarClass: 'warrior', hasSubmittedScore: true, level: 1 };
    return {
      id: 'lobby-1',
      hostId: 'd1',
      players: [dev],
      teams: { developers: [dev], qa: [], spectators: [] },
      gamePhase: 'battle',
      tickets: [],
      completedTickets: [],
    } as unknown as Lobby;
  }

  it('drains a buffered out-of-order votes_revealed once the gap is filled', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);
    useGameState.setState({ currentLobby: seedBattleLobby() });

    // seq 2 arrives before seq 1 → buffered, NOT applied yet.
    handlers.get('estimation:votes_revealed')!({ votes: { d1: 8 }, team: 'developers', seq: 2, timestamp: 0 });
    expect(useGameState.getState().currentLobby!.teams.developers[0].currentScore).toBeUndefined();

    // In-order seq 1 fills the gap → drain re-dispatches seq 2 → votes applied.
    handlers.get('session:phase_changed')!({ lobbyId: 'lobby-1', oldPhase: 'battle', newPhase: 'discussion', seq: 1, timestamp: 0 });

    const lobby = useGameState.getState().currentLobby!;
    expect(lobby.gamePhase).toBe('discussion');
    // Pre-H1-fix this stayed undefined — processEventQueue advanced seq but dropped the payload.
    expect(lobby.teams.developers[0].currentScore).toBe(8);
  });

  it('applies missed votes_revealed delivered via system:missed_events', () => {
    const { socket, handlers } = makeMockSocket();
    setupEventHandlers(socket);
    useGameState.setState({ currentLobby: seedBattleLobby() });

    // Gap: seq 2 buffered while waiting for seq 1.
    handlers.get('estimation:votes_revealed')!({ votes: { d1: 5 }, team: 'developers', seq: 2, timestamp: 0 });
    expect(useGameState.getState().currentLobby!.teams.developers[0].currentScore).toBeUndefined();

    // Server replays the missing seq 1; recovery drains the contiguous seq 2 too.
    handlers.get('system:missed_events')!({
      events: [
        { event: 'session:phase_changed', data: { lobbyId: 'lobby-1', oldPhase: 'battle', newPhase: 'discussion', seq: 1, timestamp: 0 } },
      ],
    });

    // Pre-H1-fix this stayed undefined — handleMissedEventsReplay discarded payloads.
    expect(useGameState.getState().currentLobby!.teams.developers[0].currentScore).toBe(5);
  });
});
