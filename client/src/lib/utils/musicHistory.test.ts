import { describe, it, expect, beforeEach } from 'vitest';
import { loadHistory, saveHistory, historyKey, MusicHistoryItem } from './musicHistory';

describe('historyKey', () => {
  it('returns the correct localStorage key for a given hostId', () => {
    expect(historyKey('abc123')).toBe('scrum-monsters-music-history-abc123');
  });
});

describe('loadHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns [] when key is absent', () => {
    expect(loadHistory('no-such-host')).toEqual([]);
  });

  it('returns [] (not throw) when stored JSON is corrupt', () => {
    localStorage.setItem(historyKey('bad-host'), '{ not valid json {{');
    expect(() => loadHistory('bad-host')).not.toThrow();
    expect(loadHistory('bad-host')).toEqual([]);
  });

  it('round-trips a single item', () => {
    const item: MusicHistoryItem = { url: 'https://youtu.be/abc', title: 'Test', usedAt: 1000 };
    saveHistory('host1', item);
    const result = loadHistory('host1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(item);
  });
});

describe('saveHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('trims to 10 entries when saving 11 distinct urls', () => {
    for (let i = 1; i <= 11; i++) {
      saveHistory('host1', {
        url: `https://youtu.be/video${i}`,
        title: `Video ${i}`,
        usedAt: i * 1000,
      });
    }
    const result = loadHistory('host1');
    expect(result).toHaveLength(10);
  });

  it('drops the oldest entry (lowest usedAt) when trimming', () => {
    for (let i = 1; i <= 11; i++) {
      saveHistory('host1', {
        url: `https://youtu.be/video${i}`,
        title: `Video ${i}`,
        usedAt: i * 1000,
      });
    }
    const result = loadHistory('host1');
    // video1 had usedAt=1000 (oldest) — should be dropped
    expect(result.find((h) => h.url === 'https://youtu.be/video1')).toBeUndefined();
    // video11 had usedAt=11000 (newest) — should be present
    expect(result.find((h) => h.url === 'https://youtu.be/video11')).toBeDefined();
  });

  it('de-dupes: saving an existing url keeps only one entry, newer usedAt wins', () => {
    const first: MusicHistoryItem = { url: 'https://youtu.be/same', title: 'First', usedAt: 1000 };
    const second: MusicHistoryItem = { url: 'https://youtu.be/same', title: 'Second', usedAt: 2000 };
    saveHistory('host1', first);
    saveHistory('host1', second);
    const result = loadHistory('host1');
    expect(result).toHaveLength(1);
    expect(result[0].usedAt).toBe(2000);
    expect(result[0].title).toBe('Second');
  });

  it('returns entries sorted descending by usedAt', () => {
    saveHistory('host1', { url: 'https://youtu.be/a', title: 'A', usedAt: 3000 });
    saveHistory('host1', { url: 'https://youtu.be/b', title: 'B', usedAt: 1000 });
    saveHistory('host1', { url: 'https://youtu.be/c', title: 'C', usedAt: 2000 });
    const result = loadHistory('host1');
    expect(result[0].usedAt).toBeGreaterThan(result[1].usedAt);
    expect(result[1].usedAt).toBeGreaterThan(result[2].usedAt);
  });

  it('returns the saved array (at most 10 items)', () => {
    const item: MusicHistoryItem = { url: 'https://youtu.be/x', title: 'X', usedAt: 999 };
    const result = saveHistory('host1', item);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('never contains two entries with the same url', () => {
    saveHistory('host1', { url: 'https://youtu.be/dup', title: 'Dup1', usedAt: 1000 });
    saveHistory('host1', { url: 'https://youtu.be/dup', title: 'Dup2', usedAt: 2000 });
    saveHistory('host1', { url: 'https://youtu.be/dup', title: 'Dup3', usedAt: 3000 });
    const result = loadHistory('host1');
    const urls = result.map((h) => h.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('uses independent keys for two different hostIds (no cross-contamination)', () => {
    saveHistory('host-A', { url: 'https://youtu.be/forA', title: 'For A', usedAt: 1000 });
    saveHistory('host-B', { url: 'https://youtu.be/forB', title: 'For B', usedAt: 2000 });

    const historyA = loadHistory('host-A');
    const historyB = loadHistory('host-B');

    expect(historyA).toHaveLength(1);
    expect(historyA[0].url).toBe('https://youtu.be/forA');

    expect(historyB).toHaveLength(1);
    expect(historyB[0].url).toBe('https://youtu.be/forB');
  });
});
