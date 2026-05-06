/**
 * Atomic session-storage helper for the three reconnection-related localStorage keys.
 *
 * The three keys (last-lobby, lobby-snapshot, reconnect-token) historically drifted
 * apart because they were written from different code paths and never validated
 * against each other. This helper owns all three atomically: every write touches
 * all three; every read validates that all three reference the same lobbyId, and
 * if any one disagrees or is missing the session is considered incoherent.
 *
 * See .planning/phases/41-reconnection-state-bugfix/41-RESEARCH.md.
 */

import type { LobbySnapshot } from '@shared/gameEvents';

import { LastLobbyStorage, type LastLobbyInfo } from '@/lib/utils/lastLobbyStorage';

// Mirror the constant from lastLobbyStorage.ts. Kept in sync by colocation rather
// than re-export because lastLobbyStorage.ts does not export the constant and the
// plan says not to modify that file.
export const LAST_LOBBY_KEY = 'scrum-monsters-last-lobby';

export const RECONNECT_TOKEN_KEY = 'scrum-monsters-reconnect-token';
export const LOBBY_SNAPSHOT_KEY = 'scrum-monsters-lobby-snapshot';

/**
 * Wrapper stored at LOBBY_SNAPSHOT_KEY. The redundant `lobbyId` lets us validate
 * coherence without decoding the reconnect token (and without re-reading the
 * snapshot's nested lobby.id, which keeps the format change-resistant).
 */
export interface StoredSnapshot {
  lobbyId: string;
  snapshot: LobbySnapshot;
}

export interface SaveSessionInput {
  lobbyId: string;
  lobbyName: string;
  playerName: string;
  snapshot: LobbySnapshot;
  token: string;
}

export interface LoadSessionResult {
  lastLobby: LastLobbyInfo | null;
  snapshot: LobbySnapshot | null;
  token: string | null;
  /** True iff all three keys are present AND all three reference the same lobbyId. */
  coherent: boolean;
  /** The shared lobbyId when coherent, otherwise null. */
  lobbyId: string | null;
}

export interface DecodedReconnectToken {
  playerId: string;
  lobbyId: string;
  playerName: string;
  expiresAt: number;
}

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

/**
 * Atomically write all three keys. The lobby-snapshot wrapper stores `lobbyId`
 * redundantly so we never need to decode the token to learn the lobbyId on read.
 */
export function saveSession(input: SaveSessionInput): void {
  if (!isBrowser()) return;
  try {
    LastLobbyStorage.saveLastLobby(input.lobbyId, input.lobbyName);
    const wrapper: StoredSnapshot = {
      lobbyId: input.lobbyId,
      snapshot: input.snapshot,
    };
    localStorage.setItem(LOBBY_SNAPSHOT_KEY, JSON.stringify(wrapper));
    localStorage.setItem(RECONNECT_TOKEN_KEY, input.token);
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('saveSession: failed to persist session keys', error);
    }
  }
}

/**
 * Read all three keys and validate coherence. If any key is missing OR any
 * lobbyId disagrees, returns coherent=false and lobbyId=null.
 *
 * Defensive: every JSON.parse is wrapped in try/catch so corrupted localStorage
 * never throws back to callers.
 */
export function loadSession(): LoadSessionResult {
  const empty: LoadSessionResult = {
    lastLobby: null,
    snapshot: null,
    token: null,
    coherent: false,
    lobbyId: null,
  };
  if (!isBrowser()) return empty;

  let lastLobby: LastLobbyInfo | null = null;
  let snapshot: LobbySnapshot | null = null;
  let snapshotLobbyId: string | null = null;
  let token: string | null = null;

  try {
    lastLobby = LastLobbyStorage.loadLastLobby();
  } catch {
    lastLobby = null;
  }

  try {
    const raw = localStorage.getItem(LOBBY_SNAPSHOT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredSnapshot;
      if (parsed && typeof parsed === 'object' && typeof parsed.lobbyId === 'string' && parsed.snapshot) {
        snapshot = parsed.snapshot;
        snapshotLobbyId = parsed.lobbyId;
      }
    }
  } catch {
    snapshot = null;
    snapshotLobbyId = null;
  }

  try {
    token = localStorage.getItem(RECONNECT_TOKEN_KEY);
  } catch {
    token = null;
  }

  if (!lastLobby || !snapshot || !token || !snapshotLobbyId) {
    return { lastLobby, snapshot, token, coherent: false, lobbyId: null };
  }

  const decoded = decodeReconnectToken(token);
  if (!decoded) {
    return { lastLobby, snapshot, token, coherent: false, lobbyId: null };
  }

  const allMatch =
    lastLobby.lobbyId === snapshotLobbyId &&
    snapshotLobbyId === decoded.lobbyId;

  if (!allMatch) {
    return { lastLobby, snapshot, token, coherent: false, lobbyId: null };
  }

  return {
    lastLobby,
    snapshot,
    token,
    coherent: true,
    lobbyId: snapshotLobbyId,
  };
}

/**
 * Idempotent — safe to call when keys are already absent.
 */
export function clearSession(): void {
  if (!isBrowser()) return;
  try {
    LastLobbyStorage.clearLastLobby();
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LOBBY_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(RECONNECT_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Decode a server-issued reconnect token (base64 JSON). Returns null on any
 * error — never throws. We do NOT verify the signature client-side; that is
 * the server's responsibility. We only read fields needed for client-side
 * validation (lobbyId guard before emit; expiry cosmetic checks).
 */
export function decodeReconnectToken(token: string): DecodedReconnectToken | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const json = typeof atob !== 'undefined' ? atob(token) : Buffer.from(token, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.lobbyId !== 'string' ||
      typeof parsed.playerId !== 'string' ||
      typeof parsed.playerName !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      lobbyId: parsed.lobbyId,
      playerId: parsed.playerId,
      playerName: parsed.playerName,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}
