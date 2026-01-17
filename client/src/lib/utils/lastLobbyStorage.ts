/**
 * Utility for tracking the last lobby the user was in
 */

const LAST_LOBBY_KEY = 'scrum-monsters-last-lobby';

export interface LastLobbyInfo {
  lobbyId: string;
  lobbyName: string;
  timestamp: number;
}

export class LastLobbyStorage {
  /**
   * Load last lobby information from localStorage
   */
  static loadLastLobby(): LastLobbyInfo | null {
    try {
      const stored = localStorage.getItem(LAST_LOBBY_KEY);
      if (stored) {
        const info = JSON.parse(stored) as LastLobbyInfo;
        // Only return if less than 24 hours old
        const ageInHours = (Date.now() - info.timestamp) / (1000 * 60 * 60);
        if (ageInHours < 24) {
          return info;
        }
      }
    } catch (error) {
      console.warn('Failed to load last lobby:', error);
    }
    return null;
  }

  /**
   * Save last lobby information to localStorage
   */
  static saveLastLobby(lobbyId: string, lobbyName: string): void {
    try {
      const info: LastLobbyInfo = {
        lobbyId,
        lobbyName,
        timestamp: Date.now(),
      };
      localStorage.setItem(LAST_LOBBY_KEY, JSON.stringify(info));
    } catch (error) {
      console.warn('Failed to save last lobby:', error);
    }
  }

  /**
   * Clear last lobby information
   */
  static clearLastLobby(): void {
    try {
      localStorage.removeItem(LAST_LOBBY_KEY);
    } catch (error) {
      console.warn('Failed to clear last lobby:', error);
    }
  }
}
