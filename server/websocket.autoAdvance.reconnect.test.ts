import { describe, it, expect } from 'vitest';
import { GameStateManager } from './gameState';
import { SessionManager } from './domains/SessionManager';
import { ScopedEventBus } from './events';

/**
 * Phase 42-02a / FIX-05 reconnect regression test.
 *
 * Asserts that `estimationSettings.autoAdvance` survives the Phase 41
 * reconnect-token round-trip. The lobby is the same object referenced from
 * `lobbySync.lobby` (websocket.ts:1487), so this is fundamentally a
 * property-preservation guarantee — but a regression here would silently
 * break the host's auto-advance setting on every disconnect+reconnect cycle.
 *
 * Pitfall 5 in 42-RESEARCH.md: if `getLobbySnapshot` ever shifts to manual
 * field copying, autoAdvance could be skipped silently.
 *
 * Phase 50-01 migration: migrated from gameState singleton to constructed
 * SessionManager instances (production pattern: sessionManager.createLobby +
 * gameStateMgr.syncPlayerToLobby). Reconnect calls routed through
 * sessionManager.handlePlayerDisconnect / sessionManager.attemptPlayerReconnect.
 */
describe('autoAdvance reconnect round-trip (Phase 41 regression)', () => {
  function setupHostWithAutoAdvance(autoAdvance: boolean): {
    lobbyId: string;
    hostId: string;
    sessionManager: SessionManager;
    gameStateMgr: GameStateManager;
  } {
    const eventBus = new ScopedEventBus();
    const sessionManager = new SessionManager({ eventBus });
    const gameStateMgr = new GameStateManager(undefined, { startWatchdogs: false });

    const lobby = sessionManager.createLobby('TestHost', 'Reconnect Test Lobby', {
      estimationSettings: { scaleType: 'fibonacci', autoAdvance },
    });
    // Sync alias so gameStateMgr.getLobbyByPlayerId works (production pattern)
    gameStateMgr.syncPlayerToLobby(lobby.hostId, lobby);

    return { lobbyId: lobby.id, hostId: lobby.hostId, sessionManager, gameStateMgr };
  }

  it('preserves autoAdvance: true through disconnect → reconnect', () => {
    const { lobbyId, hostId, sessionManager } = setupHostWithAutoAdvance(true);

    // Sanity: the lobby was created with the toggle ON
    expect(sessionManager.getLobby(lobbyId)?.estimationSettings?.autoAdvance).toBe(true);

    // Disconnect → token issued
    const dc = sessionManager.handlePlayerDisconnect(hostId);
    expect(dc).not.toBeNull();
    expect(dc!.reconnectToken).toBeTruthy();

    // Reconnect via the token
    const result = sessionManager.attemptPlayerReconnect(dc!.reconnectToken);
    expect(result.result).toBe('success');
    expect(result.lobbySync).toBeTruthy();
    expect(result.lobbySync!.lobby.estimationSettings?.autoAdvance).toBe(true);
  });

  it('preserves autoAdvance: false (default) through disconnect → reconnect', () => {
    const { lobbyId, hostId, sessionManager } = setupHostWithAutoAdvance(false);

    expect(sessionManager.getLobby(lobbyId)?.estimationSettings?.autoAdvance).toBe(false);

    const dc = sessionManager.handlePlayerDisconnect(hostId);
    expect(dc).not.toBeNull();

    const result = sessionManager.attemptPlayerReconnect(dc!.reconnectToken);
    expect(result.result).toBe('success');
    expect(result.lobbySync!.lobby.estimationSettings?.autoAdvance).toBe(false);
  });
});
