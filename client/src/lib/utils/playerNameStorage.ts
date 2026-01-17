/**
 * Utility for persisting player name across sessions
 */

const PLAYER_NAME_KEY = 'scrum-monsters-player-name';

export class PlayerNameStorage {
  /**
   * Load saved player name from localStorage
   */
  static loadName(): string {
    try {
      const stored = localStorage.getItem(PLAYER_NAME_KEY);
      if (stored) {
        return stored;
      }
    } catch (error) {
      console.warn('Failed to load player name:', error);
    }
    return '';
  }

  /**
   * Save player name to localStorage
   */
  static saveName(name: string): void {
    try {
      if (name.trim()) {
        localStorage.setItem(PLAYER_NAME_KEY, name.trim());
      }
    } catch (error) {
      console.warn('Failed to save player name:', error);
    }
  }

  /**
   * Clear saved player name
   */
  static clearName(): void {
    try {
      localStorage.removeItem(PLAYER_NAME_KEY);
    } catch (error) {
      console.warn('Failed to clear player name:', error);
    }
  }
}
