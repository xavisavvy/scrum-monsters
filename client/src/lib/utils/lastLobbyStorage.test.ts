import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LastLobbyStorage } from './lastLobbyStorage';

const STORAGE_KEY = 'scrum-monsters-last-lobby';

describe('LastLobbyStorage', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null when there is no stored lobby', () => {
    expect(LastLobbyStorage.loadLastLobby()).toBeNull();
  });

  it('saves and reloads a fresh lobby entry', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    LastLobbyStorage.saveLastLobby('ABC123', 'Alpha Team');

    expect(localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({
        lobbyId: 'ABC123',
        lobbyName: 'Alpha Team',
        timestamp: 1_700_000_000_000,
      }),
    );
    expect(LastLobbyStorage.loadLastLobby()).toEqual({
      lobbyId: 'ABC123',
      lobbyName: 'Alpha Team',
      timestamp: 1_700_000_000_000,
    });
  });

  it('returns null for stale lobby entries older than 24 hours', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        lobbyId: 'OLD123',
        lobbyName: 'Yesterday Squad',
        timestamp: 1_700_000_000_000 - 24 * 60 * 60 * 1000,
      }),
    );

    expect(LastLobbyStorage.loadLastLobby()).toBeNull();
  });

  it('returns null and warns when stored JSON is invalid', () => {
    localStorage.setItem(STORAGE_KEY, '{broken-json');

    expect(LastLobbyStorage.loadLastLobby()).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to load last lobby:',
      expect.any(SyntaxError),
    );
  });

  it('warns and does not throw when saving fails', () => {
    const setItemSpy = vi.fn(() => {
      throw new Error('quota exceeded');
    });

    vi.stubGlobal('localStorage', {
      ...localStorage,
      getItem: localStorage.getItem.bind(localStorage),
      setItem: setItemSpy,
      removeItem: localStorage.removeItem.bind(localStorage),
      clear: localStorage.clear.bind(localStorage),
    });

    expect(() => LastLobbyStorage.saveLastLobby('ABC123', 'Alpha Team')).not.toThrow();
    expect(setItemSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to save last lobby:',
      expect.objectContaining({ message: 'quota exceeded' }),
    );
  });

  it('removes the stored lobby and warns when clearing fails', () => {
    LastLobbyStorage.saveLastLobby('ABC123', 'Alpha Team');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    LastLobbyStorage.clearLastLobby();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const removeItemSpy = vi.fn(() => {
      throw new Error('locked storage');
    });

    vi.stubGlobal('localStorage', {
      ...localStorage,
      getItem: localStorage.getItem.bind(localStorage),
      setItem: localStorage.setItem.bind(localStorage),
      removeItem: removeItemSpy,
      clear: localStorage.clear.bind(localStorage),
    });

    expect(() => LastLobbyStorage.clearLastLobby()).not.toThrow();
    expect(removeItemSpy).toHaveBeenCalledWith(STORAGE_KEY);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to clear last lobby:',
      expect.objectContaining({ message: 'locked storage' }),
    );
  });
});
