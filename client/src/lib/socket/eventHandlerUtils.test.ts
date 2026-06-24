import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerSyncedLobbyHandler, registerSyncedHandler, teardownSyncedHandlers } from './eventHandlerUtils';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';

/**
 * Unit tests for eventHandlerUtils helpers.
 * Mirrors the mock socket pattern from eventHandlers.test.ts (lines 18-31).
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
    listeners: vi.fn((event: string) => (handlers.has(event) ? [handlers.get(event)!] : [])),
  };
  return { socket, handlers };
}

describe('registerSyncedLobbyHandler', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    useGameState.setState({ currentLobby: null });
    // Tear down registered events to prevent cross-test accumulation.
    const { socket } = makeMockSocket();
    teardownSyncedHandlers(socket);
  });

  it('calls updater only when handleEvent returns processed=true', () => {
    const { socket, handlers } = makeMockSocket();
    const updater = vi.fn().mockReturnValue(null);

    registerSyncedLobbyHandler(socket, 'session:player_left', updater);

    // handleEvent on a fresh store will increment seq, treat seq=1 as processed=true
    useGameState.setState({
      currentLobby: { id: 'l1', players: [], teams: { developers: [], qa: [], spectators: [] } } as any,
    });

    handlers.get('session:player_left')!({ playerId: 'p1', seq: 1, timestamp: 0 });
    expect(updater).toHaveBeenCalledOnce();
  });

  it('skips updater when processed=false (seq gap triggers recovery)', () => {
    const { socket, handlers } = makeMockSocket();
    const updater = vi.fn().mockReturnValue(null);

    registerSyncedLobbyHandler(socket, 'session:lobby_renamed', updater);

    useGameState.setState({
      currentLobby: { id: 'l1', players: [], teams: { developers: [], qa: [], spectators: [] } } as any,
    });

    // lastSeq=0; seq=5 creates a gap (5 > 0+1) → handleEvent returns false
    handlers.get('session:lobby_renamed')!({ name: 'x', seq: 5, timestamp: 0 });
    expect(updater).not.toHaveBeenCalled();
  });

  it('calls setLobby with merged lobby when updater returns Partial<Lobby>', () => {
    const { socket, handlers } = makeMockSocket();
    const baseLobby = {
      id: 'l1',
      name: 'OldName',
      players: [],
      teams: { developers: [], qa: [], spectators: [] },
    } as any;
    useGameState.setState({ currentLobby: baseLobby });

    const setLobbySpy = vi.fn();
    useGameState.setState({ setLobby: setLobbySpy });

    registerSyncedLobbyHandler(socket, 'session:lobby_renamed', (_data, _lobby) => ({
      name: 'NewName',
    }));

    handlers.get('session:lobby_renamed')!({ name: 'NewName', seq: 1, timestamp: 0 });

    expect(setLobbySpy).toHaveBeenCalledOnce();
    // Should be called with merged lobby (spread of currentLobby + update)
    const arg = setLobbySpy.mock.calls[0][0];
    expect(arg.name).toBe('NewName');
    expect(arg.id).toBe('l1');
  });

  it('skips setLobby when updater returns null', () => {
    const { socket, handlers } = makeMockSocket();
    useGameState.setState({
      currentLobby: { id: 'l1', players: [], teams: { developers: [], qa: [], spectators: [] } } as any,
    });

    const setLobbySpy = vi.fn();
    useGameState.setState({ setLobby: setLobbySpy });

    registerSyncedLobbyHandler(socket, 'session:lobby_renamed', () => null);

    handlers.get('session:lobby_renamed')!({ name: 'x', seq: 1, timestamp: 0 });
    expect(setLobbySpy).not.toHaveBeenCalled();
  });

  it('skips updater and setLobby when currentLobby is null', () => {
    const { socket, handlers } = makeMockSocket();
    useGameState.setState({ currentLobby: null });

    const updater = vi.fn();
    const setLobbySpy = vi.fn();
    useGameState.setState({ setLobby: setLobbySpy });

    registerSyncedLobbyHandler(socket, 'session:lobby_renamed', updater);

    handlers.get('session:lobby_renamed')!({ name: 'x', seq: 1, timestamp: 0 });
    expect(updater).not.toHaveBeenCalled();
    expect(setLobbySpy).not.toHaveBeenCalled();
  });

  it('registers the event name (tracked for teardown)', () => {
    const { socket } = makeMockSocket();
    // Fresh teardown socket to count offs after re-registration
    const { socket: teardownSocket } = makeMockSocket();

    registerSyncedLobbyHandler(socket, 'session:player_left', () => null);
    teardownSyncedHandlers(teardownSocket);

    expect(teardownSocket.off).toHaveBeenCalledWith('session:player_left');
  });
});

describe('registerSyncedHandler', () => {
  beforeEach(() => {
    useEventSync.getState().reset();
    useGameState.setState({ currentLobby: null });
    const { socket } = makeMockSocket();
    teardownSyncedHandlers(socket);
  });

  it('calls handler only when processed=true', () => {
    const { socket, handlers } = makeMockSocket();
    const handler = vi.fn();

    registerSyncedHandler(socket, 'session:game_reset', handler);

    handlers.get('session:game_reset')!({ lobby: {}, seq: 1, timestamp: 0 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('skips handler when processed=false (seq gap triggers recovery)', () => {
    const { socket, handlers } = makeMockSocket();
    const handler = vi.fn();

    registerSyncedHandler(socket, 'session:game_reset', handler);

    // lastSeq=0; seq=5 creates a gap → handleEvent returns false
    handlers.get('session:game_reset')!({ lobby: {}, seq: 5, timestamp: 0 });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('teardownSyncedHandlers', () => {
  beforeEach(() => {
    // Clear _registeredEvents before each test
    const { socket } = makeMockSocket();
    teardownSyncedHandlers(socket);
  });

  it('calls socket.off for each registered event', () => {
    const { socket: regSocket } = makeMockSocket();
    registerSyncedLobbyHandler(regSocket, 'session:player_left', () => null);
    registerSyncedLobbyHandler(regSocket, 'session:lobby_renamed', () => null);

    const { socket: teardownSocket } = makeMockSocket();
    teardownSyncedHandlers(teardownSocket);

    expect(teardownSocket.off).toHaveBeenCalledWith('session:player_left');
    expect(teardownSocket.off).toHaveBeenCalledWith('session:lobby_renamed');
  });

  it('clears the _registeredEvents array after teardown so re-registration works cleanly', () => {
    const { socket: regSocket } = makeMockSocket();
    registerSyncedHandler(regSocket, 'session:game_reset', () => {});

    const { socket: teardownSocket } = makeMockSocket();
    teardownSyncedHandlers(teardownSocket);
    // After teardown the array is empty — a second teardown should call off 0 times
    const { socket: teardownSocket2 } = makeMockSocket();
    teardownSyncedHandlers(teardownSocket2);
    expect(teardownSocket2.off).not.toHaveBeenCalled();
  });
});
