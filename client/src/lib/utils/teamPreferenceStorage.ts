/**
 * Utility for persisting team preference across sessions
 */

import { TeamType } from '@shared/gameEvents';

const TEAM_PREFERENCE_KEY = 'scrum-monsters-team-preference';

export class TeamPreferenceStorage {
  /**
   * Load saved team preference from localStorage
   */
  static loadTeam(): TeamType | null {
    try {
      const stored = localStorage.getItem(TEAM_PREFERENCE_KEY);
      if (stored && ['developers', 'qa', 'spectators'].includes(stored)) {
        return stored as TeamType;
      }
    } catch (error) {
      console.warn('Failed to load team preference:', error);
    }
    return null;
  }

  /**
   * Save team preference to localStorage
   */
  static saveTeam(team: TeamType): void {
    try {
      localStorage.setItem(TEAM_PREFERENCE_KEY, team);
    } catch (error) {
      console.warn('Failed to save team preference:', error);
    }
  }

  /**
   * Clear saved team preference
   */
  static clearTeam(): void {
    try {
      localStorage.removeItem(TEAM_PREFERENCE_KEY);
    } catch (error) {
      console.warn('Failed to clear team preference:', error);
    }
  }
}
