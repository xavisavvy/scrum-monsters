import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSession,
  saveSession,
  clearSession,
  decodeReconnectToken,
  LAST_LOBBY_KEY,
  LOBBY_SNAPSHOT_KEY,
  RECONNECT_TOKEN_KEY,
} from '@/lib/utils/sessionStorage';
import type { LobbySnapshot } from '@shared/gameEvents';

const makeSnapshot = (lobbyId: string): LobbySnapshot => ({
  lobby: {
    id: lobbyId,
    name: 'Test Lobby',
    code: lobbyId,
    players: [],
    gamePhase: 'lobby',
  } as any,
  player: { id: 'p1', name: 'Alice' } as any,
  timestamp: Date.now(),
  reconnectToken: 'token-' + lobbyId,
});

const makeToken = (lobbyId: string, expiresAt = Date.now() + 60_000): string => {
  const payload = {
    playerId: 'p1',
    lobbyId,
    playerName: 'Alice',
    issuedAt: Date.now(),
    expiresAt,
    signature: 'sig-fake',
  };
  return btoa(JSON.stringify(payload));
};

describe('sessionStorage helper', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('write/read roundtrip returns coherent=true and matching values', () => {
    const snapshot = makeSnapshot('ABCDEF');
    const token = makeToken('ABCDEF');
    saveSession({
      lobbyId: 'ABCDEF',
      lobbyName: 'Test Lobby',
      playerName: 'Alice',
      snapshot,
      token,
    });

    const result = loadSession();
    expect(result.coherent).toBe(true);
    expect(result.lobbyId).toBe('ABCDEF');
    expect(result.token).toBe(token);
    expect(result.snapshot?.lobby.id).toBe('ABCDEF');
    expect(result.lastLobby?.lobbyId).toBe('ABCDEF');
  });

  it('drift detection — last-lobby differs', () => {
    const snapshot = makeSnapshot('ABCDEF');
    saveSession({
      lobbyId: 'ABCDEF',
      lobbyName: 'Test Lobby',
      playerName: 'Alice',
      snapshot,
      token: makeToken('ABCDEF'),
    });
    // Stomp last-lobby with a different lobbyId
    localStorage.setItem(
      LAST_LOBBY_KEY,
      JSON.stringify({ lobbyId: 'XYZ123', lobbyName: 'Other', timestamp: Date.now() }),
    );

    const result = loadSession();
    expect(result.coherent).toBe(false);
    expect(result.lobbyId).toBeNull();
  });

  it('drift detection — snapshot differs', () => {
    const snapshot = makeSnapshot('ABCDEF');
    saveSession({
      lobbyId: 'ABCDEF',
      lobbyName: 'Test Lobby',
      playerName: 'Alice',
      snapshot,
      token: makeToken('ABCDEF'),
    });
    // Stomp snapshot with a different lobbyId
    const otherSnap = makeSnapshot('XYZ123');
    localStorage.setItem(
      LOBBY_SNAPSHOT_KEY,
      JSON.stringify({ lobbyId: 'XYZ123', snapshot: otherSnap }),
    );

    const result = loadSession();
    expect(result.coherent).toBe(false);
    expect(result.lobbyId).toBeNull();
  });

  it('drift detection — missing token', () => {
    const snapshot = makeSnapshot('ABCDEF');
    saveSession({
      lobbyId: 'ABCDEF',
      lobbyName: 'Test Lobby',
      playerName: 'Alice',
      snapshot,
      token: makeToken('ABCDEF'),
    });
    localStorage.removeItem(RECONNECT_TOKEN_KEY);

    const result = loadSession();
    expect(result.coherent).toBe(false);
    expect(result.lobbyId).toBeNull();
  });

  it('clearSession is atomic — removes all three keys', () => {
    const snapshot = makeSnapshot('ABCDEF');
    saveSession({
      lobbyId: 'ABCDEF',
      lobbyName: 'Test Lobby',
      playerName: 'Alice',
      snapshot,
      token: makeToken('ABCDEF'),
    });
    clearSession();

    expect(localStorage.getItem(LAST_LOBBY_KEY)).toBeNull();
    expect(localStorage.getItem(LOBBY_SNAPSHOT_KEY)).toBeNull();
    expect(localStorage.getItem(RECONNECT_TOKEN_KEY)).toBeNull();

    const result = loadSession();
    expect(result.coherent).toBe(false);
    expect(result.lastLobby).toBeNull();
    expect(result.snapshot).toBeNull();
    expect(result.token).toBeNull();
  });

  it('decodeReconnectToken happy path', () => {
    const token = makeToken('ABCDEF', 99_999);
    const decoded = decodeReconnectToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.lobbyId).toBe('ABCDEF');
    expect(decoded?.expiresAt).toBe(99_999);
    expect(decoded?.playerId).toBe('p1');
    expect(decoded?.playerName).toBe('Alice');
  });

  it('decodeReconnectToken returns null on malformed input without throwing', () => {
    expect(decodeReconnectToken('not-base64!!!')).toBeNull();
    expect(decodeReconnectToken('')).toBeNull();
    expect(decodeReconnectToken(btoa('{not json'))).toBeNull();
  });

  it('loadSession robust to corrupted JSON in snapshot', () => {
    localStorage.setItem(LOBBY_SNAPSHOT_KEY, 'GARBAGE{{{');
    localStorage.setItem(RECONNECT_TOKEN_KEY, makeToken('ABCDEF'));
    localStorage.setItem(
      LAST_LOBBY_KEY,
      JSON.stringify({ lobbyId: 'ABCDEF', lobbyName: 'X', timestamp: Date.now() }),
    );

    const result = loadSession();
    expect(result.coherent).toBe(false);
  });
});
