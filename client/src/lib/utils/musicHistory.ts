/**
 * Music history localStorage helpers.
 *
 * Stores a per-host top-10 list of recently-used YouTube URLs in localStorage.
 * Key format: scrum-monsters-music-history-<hostId>
 *
 * Pattern mirrors loadMuteSettings / saveMuteSettings in useAudio.tsx.
 */

export interface MusicHistoryItem {
  url: string;
  title: string;
  usedAt: number; // epoch ms (Date.now())
}

/**
 * Returns the localStorage key for a given host player id.
 */
export function historyKey(hostId: string): string {
  return `scrum-monsters-music-history-${hostId}`;
}

/**
 * Loads history for the given host from localStorage.
 * Returns [] when the key is absent or stored JSON is corrupt.
 */
export function loadHistory(hostId: string): MusicHistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey(hostId));
    if (!raw) return [];
    return JSON.parse(raw) as MusicHistoryItem[];
  } catch (e) {
    console.warn('Failed to load music history:', e);
    return [];
  }
}

/**
 * Saves a new history item for the given host.
 *
 * - De-dupes by url (the newer entry wins).
 * - Sorts descending by usedAt.
 * - Trims to at most 10 entries.
 * - Returns the trimmed, sorted array.
 */
export function saveHistory(hostId: string, item: MusicHistoryItem): MusicHistoryItem[] {
  try {
    const existing = loadHistory(hostId).filter((h) => h.url !== item.url);
    const next = [item, ...existing].sort((a, b) => b.usedAt - a.usedAt).slice(0, 10);
    localStorage.setItem(historyKey(hostId), JSON.stringify(next));
    return next;
  } catch (e) {
    console.warn('Failed to save music history:', e);
    return loadHistory(hostId);
  }
}
