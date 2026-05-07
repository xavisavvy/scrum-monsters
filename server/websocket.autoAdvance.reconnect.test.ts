import { describe, it, expect } from 'vitest';
import { gameState } from './gameState';

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
 */
describe('autoAdvance reconnect round-trip (Phase 41 regression)', () => {
  function setupHostWithAutoAdvance(autoAdvance: boolean): { lobbyId: string; hostId: string } {
    const lobby = gameState.createLobby('TestHost', 'Reconnect Test Lobby', {
      estimationSettings: { scaleType: 'fibonacci', autoAdvance },
    });
    return { lobbyId: lobby.id, hostId: lobby.hostId };
  }

  it('preserves autoAdvance: true through disconnect → reconnect', () => {
    const { lobbyId, hostId } = setupHostWithAutoAdvance(true);

    // Sanity: the lobby was created with the toggle ON
    expect(gameState.getLobby(lobbyId)?.estimationSettings?.autoAdvance).toBe(true);

    // Disconnect → token issued
    const dc = gameState.handlePlayerDisconnect(hostId);
    expect(dc).not.toBeNull();
    expect(dc!.reconnectToken).toBeTruthy();

    // Reconnect via the token
    const result = gameState.attemptPlayerReconnect(dc!.reconnectToken);
    expect(result.result).toBe('success');
    expect(result.lobbySync).toBeTruthy();
    expect(result.lobbySync!.lobby.estimationSettings?.autoAdvance).toBe(true);
  });

  it('preserves autoAdvance: false (default) through disconnect → reconnect', () => {
    const { lobbyId, hostId } = setupHostWithAutoAdvance(false);

    expect(gameState.getLobby(lobbyId)?.estimationSettings?.autoAdvance).toBe(false);

    const dc = gameState.handlePlayerDisconnect(hostId);
    expect(dc).not.toBeNull();

    const result = gameState.attemptPlayerReconnect(dc!.reconnectToken);
    expect(result.result).toBe('success');
    expect(result.lobbySync!.lobby.estimationSettings?.autoAdvance).toBe(false);
  });
});
