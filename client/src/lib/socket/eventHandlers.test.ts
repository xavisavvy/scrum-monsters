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
