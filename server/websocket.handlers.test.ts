/**
 * Handler unit tests (MAINT-03b/c/d)
 *
 * Uses makeMockSocket to exercise handleCreateLobby, handleDisconnect, and
 * handleReconnectWithToken without a live Socket.IO server.
 *
 * Test isolation approach for reconnect_with_token (Pitfall 4):
 *   - The success path calls getClientEventEmitter().sendFullState(...) which
 *     throws if the ClientEventEmitter singleton is not initialized.
 *   - We vi.mock the domains/index module to stub getClientEventEmitter so the
 *     test never touches the real singleton.
 *   - gameState.syncPlayerToLobby is vi.spyOn'd to assert it is called with
 *     the reconnected player's details without leaving lobby state behind.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeMockSocket } from './test/makeMockSocket';
import { handleCreateLobby, handleDisconnect, handleReconnectWithToken, type HandlerDeps } from './websocket.handlers';

// ---------------------------------------------------------------------------
// Mock getClientEventEmitter from domains/index so reconnect tests don't throw
// ---------------------------------------------------------------------------
vi.mock('./domains/index.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getClientEventEmitter: vi.fn(() => ({
      sendFullState: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeMockDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    gameState: {
      syncPlayerToLobby: vi.fn(),
    } as unknown as HandlerDeps['gameState'],
    io: {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      // updateWebsocketMetrics iterates io.sockets.sockets — provide an empty map
      sockets: {
        sockets: new Map(),
      },
    } as unknown as HandlerDeps['io'],
    sessionManager: {
      createLobby: vi.fn(),
      generateReconnectToken: vi.fn(() => 'mock-token'),
      getLobby: vi.fn(() => null),
      attemptPlayerReconnect: vi.fn(),
      handlePlayerDisconnect: vi.fn(() => null),
      removePlayer: vi.fn(),
    } as unknown as HandlerDeps['sessionManager'],
    progressionManager: {
      loadPlayerXP: vi.fn(),
      getPlayerXP: vi.fn(() => 0),
      getPlayerLevel: vi.fn(() => 1),
    } as unknown as HandlerDeps['progressionManager'],
    classMasteryManager: {
      loadAllClassMastery: vi.fn(),
      getAllMasteryData: vi.fn(() => ({})),
    } as unknown as HandlerDeps['classMasteryManager'],
    registerPlayerUserId: vi.fn(),
    activeConnections: { value: 5 },
    disconnectReasons: new Map(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// create_lobby handler tests (MAINT-03b)
// ---------------------------------------------------------------------------

describe('handleCreateLobby', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits lobby_created and joins the lobby room', async () => {
    const { socket, emitted, joinedRooms } = makeMockSocket();
    const fakeLobbyId = 'LOBBY1';
    const fakeHostId = 'host-player-id';
    const fakeLobby = {
      id: fakeLobbyId,
      hostId: fakeHostId,
      players: [{ id: fakeHostId, name: 'Alice' }],
    };
    const deps = makeMockDeps();
    vi.mocked(deps.sessionManager.createLobby).mockReturnValue(fakeLobby as ReturnType<typeof deps.sessionManager.createLobby>);

    await handleCreateLobby(socket as unknown as Parameters<typeof handleCreateLobby>[0], {
      lobbyName: 'Sprint 42',
      hostName: 'Alice',
    }, deps);

    // socket.join called with lobby ID
    expect(joinedRooms).toContain(fakeLobbyId);

    // lobby_created emitted
    const lobbyCreated = emitted.find(e => e.event === 'lobby_created');
    expect(lobbyCreated).toBeDefined();
    expect((lobbyCreated!.data as { lobby: typeof fakeLobby }).lobby.id).toBe(fakeLobbyId);

    // lobby_sync emitted
    const lobbySync = emitted.find(e => e.event === 'lobby_sync');
    expect(lobbySync).toBeDefined();
  });

  it('sets socket.data.playerId and socket.data.lobbyId', async () => {
    const { socket } = makeMockSocket();
    const fakeLobbyId = 'LOBBY2';
    const fakeHostId = 'host-id-2';
    const fakeLobby = {
      id: fakeLobbyId,
      hostId: fakeHostId,
      players: [{ id: fakeHostId, name: 'Bob' }],
    };
    const deps = makeMockDeps();
    vi.mocked(deps.sessionManager.createLobby).mockReturnValue(fakeLobby as ReturnType<typeof deps.sessionManager.createLobby>);

    await handleCreateLobby(socket as unknown as Parameters<typeof handleCreateLobby>[0], {
      lobbyName: 'My Lobby',
      hostName: 'Bob',
    }, deps);

    expect(socket.data.playerId).toBe(fakeHostId);
    expect(socket.data.lobbyId).toBe(fakeLobbyId);
  });

  it('calls gameState.syncPlayerToLobby with hostId and lobby', async () => {
    const { socket } = makeMockSocket();
    const fakeLobbyId = 'LOBBY3';
    const fakeHostId = 'host-id-3';
    const fakeLobby = {
      id: fakeLobbyId,
      hostId: fakeHostId,
      players: [{ id: fakeHostId, name: 'Carol' }],
    };
    const deps = makeMockDeps();
    vi.mocked(deps.sessionManager.createLobby).mockReturnValue(fakeLobby as ReturnType<typeof deps.sessionManager.createLobby>);

    await handleCreateLobby(socket as unknown as Parameters<typeof handleCreateLobby>[0], {
      lobbyName: 'Test',
      hostName: 'Carol',
    }, deps);

    expect(deps.gameState.syncPlayerToLobby).toHaveBeenCalledWith(fakeHostId, fakeLobby);
  });

  it('emits game_error when sessionManager.createLobby throws', async () => {
    const { socket, emitted } = makeMockSocket();
    const deps = makeMockDeps();
    vi.mocked(deps.sessionManager.createLobby).mockImplementation(() => {
      throw new Error('Lobby creation failed');
    });

    await handleCreateLobby(socket as unknown as Parameters<typeof handleCreateLobby>[0], {
      lobbyName: 'Bad Lobby',
      hostName: 'Dave',
    }, deps);

    const errorEmit = emitted.find(e => e.event === 'game_error');
    expect(errorEmit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleDisconnect handler tests (MAINT-03c)
// ---------------------------------------------------------------------------

describe('handleDisconnect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decrements activeConnections.value', () => {
    const { socket } = makeMockSocket();
    socket.data.playerId = undefined; // no player — simplest path
    const deps = makeMockDeps();
    deps.activeConnections.value = 3;

    handleDisconnect(socket as unknown as Parameters<typeof handleDisconnect>[0], 'transport close', deps);

    expect(deps.activeConnections.value).toBe(2);
  });

  it('emits host_transferred to the lobby room when hostTransfer is returned', () => {
    const { socket } = makeMockSocket();
    const lobbyId = 'LOBBY-DISCONNECT';
    const playerId = 'host-player';
    socket.data.playerId = playerId;
    socket.data.lobbyId = lobbyId;

    const hostTransfer = {
      oldHostId: playerId,
      newHostId: 'new-host-id',
      newHostName: 'New Host',
    };
    const disconnectResult = {
      disconnectedPlayer: {
        playerName: 'OldHost',
        graceExpiresAt: Date.now() + 600000,
      },
      hostTransfer,
    };

    // Mock io.to() return
    const emitMock = vi.fn();
    const deps = makeMockDeps({
      io: {
        to: vi.fn().mockReturnValue({ emit: emitMock }),
        sockets: { sockets: new Map() },
      } as unknown as HandlerDeps['io'],
      sessionManager: {
        getLobby: vi.fn().mockReturnValue({ id: lobbyId, hostId: playerId }),
        handlePlayerDisconnect: vi.fn().mockReturnValue(disconnectResult),
        removePlayer: vi.fn(),
      } as unknown as HandlerDeps['sessionManager'],
    });

    handleDisconnect(socket as unknown as Parameters<typeof handleDisconnect>[0], 'transport close', deps);

    expect(deps.io.to).toHaveBeenCalledWith(lobbyId);
    expect(emitMock).toHaveBeenCalledWith('host_transferred', expect.objectContaining({
      oldHostId: playerId,
      newHostId: 'new-host-id',
      newHostName: 'New Host',
    }));
  });

  it('calls sessionManager.removePlayer as fallback when handlePlayerDisconnect returns null', () => {
    const { socket } = makeMockSocket();
    const playerId = 'player-no-reconnect';
    socket.data.playerId = playerId;
    socket.data.lobbyId = 'some-lobby';

    const deps = makeMockDeps({
      sessionManager: {
        getLobby: vi.fn().mockReturnValue(null),
        handlePlayerDisconnect: vi.fn().mockReturnValue(null),
        removePlayer: vi.fn().mockReturnValue(null),
      } as unknown as HandlerDeps['sessionManager'],
    });

    handleDisconnect(socket as unknown as Parameters<typeof handleDisconnect>[0], 'io server disconnect', deps);

    expect(deps.sessionManager.removePlayer).toHaveBeenCalledWith(playerId);
  });
});

// ---------------------------------------------------------------------------
// handleReconnectWithToken handler tests (MAINT-03d)
// ---------------------------------------------------------------------------

describe('handleReconnectWithToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits reconnect_response with failure when token is invalid', async () => {
    const { socket, emitted } = makeMockSocket();
    const failResponse = { result: 'failed' as const, message: 'Token expired' };
    const deps = makeMockDeps({
      sessionManager: {
        attemptPlayerReconnect: vi.fn().mockReturnValue(failResponse),
        getLobby: vi.fn(),
        handlePlayerDisconnect: vi.fn(),
        removePlayer: vi.fn(),
        generateReconnectToken: vi.fn(),
        createLobby: vi.fn(),
      } as unknown as HandlerDeps['sessionManager'],
    });

    await handleReconnectWithToken(socket as unknown as Parameters<typeof handleReconnectWithToken>[0], {
      reconnectToken: 'expired-token',
    }, deps);

    const response = emitted.find(e => e.event === 'reconnect_response');
    expect(response).toBeDefined();
    expect((response!.data as typeof failResponse).result).toBe('failed');
  });

  it('calls gameState.syncPlayerToLobby and joins the lobby room on success', async () => {
    const { socket, emitted, joinedRooms } = makeMockSocket();
    const playerId = 'reconnect-player';
    const lobbyId = 'LOBBY-RECONNECT';
    const fakeLobby = { id: lobbyId, hostId: 'some-host' };
    const successResponse = {
      result: 'success' as const,
      lobbySync: {
        lobby: fakeLobby,
        yourPlayer: { id: playerId, name: 'Alice' },
        reconnectToken: 'new-token',
        pendingActions: {},
        stateChanges: {},
      },
    };
    const deps = makeMockDeps({
      sessionManager: {
        attemptPlayerReconnect: vi.fn().mockReturnValue(successResponse),
        getLobby: vi.fn(),
        handlePlayerDisconnect: vi.fn(),
        removePlayer: vi.fn(),
        generateReconnectToken: vi.fn(),
        createLobby: vi.fn(),
      } as unknown as HandlerDeps['sessionManager'],
    });

    await handleReconnectWithToken(socket as unknown as Parameters<typeof handleReconnectWithToken>[0], {
      reconnectToken: 'valid-token',
    }, deps);

    // gameState.syncPlayerToLobby called with reconnected player
    expect(deps.gameState.syncPlayerToLobby).toHaveBeenCalledWith(playerId, fakeLobby);

    // socket joined the lobby room
    expect(joinedRooms).toContain(lobbyId);

    // reconnect_response emitted
    const response = emitted.find(e => e.event === 'reconnect_response');
    expect(response).toBeDefined();
    expect((response!.data as { result: string }).result).toBe('success');
  });

  it('emits reconnect_response server_error when an exception occurs', async () => {
    const { socket, emitted } = makeMockSocket();
    const deps = makeMockDeps({
      sessionManager: {
        attemptPlayerReconnect: vi.fn().mockImplementation(() => {
          throw new Error('DB error');
        }),
        getLobby: vi.fn(),
        handlePlayerDisconnect: vi.fn(),
        removePlayer: vi.fn(),
        generateReconnectToken: vi.fn(),
        createLobby: vi.fn(),
      } as unknown as HandlerDeps['sessionManager'],
    });

    await handleReconnectWithToken(socket as unknown as Parameters<typeof handleReconnectWithToken>[0], {
      reconnectToken: 'bad-token',
    }, deps);

    const response = emitted.find(e => e.event === 'reconnect_response');
    expect(response).toBeDefined();
    expect((response!.data as { result: string }).result).toBe('server_error');
  });
});
