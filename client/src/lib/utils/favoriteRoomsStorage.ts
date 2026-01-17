/**
 * Utility for saving and loading favorite recurring meeting rooms
 */

const FAVORITE_ROOMS_KEY = 'scrum-monsters-favorite-rooms';

export interface FavoriteRoom {
  roomId: string;
  displayName: string;
  lastAccessed: number;
  accessCount: number;
}

export class FavoriteRoomsStorage {
  /**
   * Load favorite rooms from localStorage
   */
  static loadFavorites(): FavoriteRoom[] {
    try {
      const stored = localStorage.getItem(FAVORITE_ROOMS_KEY);
      if (stored) {
        const rooms = JSON.parse(stored) as FavoriteRoom[];
        // Sort by last accessed (most recent first)
        return rooms.sort((a, b) => b.lastAccessed - a.lastAccessed);
      }
    } catch (error) {
      console.warn('Failed to load favorite rooms:', error);
    }
    return [];
  }

  /**
   * Save favorite rooms to localStorage
   */
  static saveFavorites(rooms: FavoriteRoom[]): void {
    try {
      localStorage.setItem(FAVORITE_ROOMS_KEY, JSON.stringify(rooms));
    } catch (error) {
      console.warn('Failed to save favorite rooms:', error);
    }
  }

  /**
   * Add or update a room access
   */
  static recordRoomAccess(roomId: string, displayName: string): void {
    const favorites = this.loadFavorites();
    const existing = favorites.find((r) => r.roomId === roomId);

    if (existing) {
      // Update existing
      existing.lastAccessed = Date.now();
      existing.accessCount++;
      existing.displayName = displayName; // Update display name in case it changed
    } else {
      // Add new
      favorites.push({
        roomId,
        displayName,
        lastAccessed: Date.now(),
        accessCount: 1,
      });
    }

    // Keep only the 10 most recent rooms
    const trimmed = favorites
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, 10);

    this.saveFavorites(trimmed);
  }

  /**
   * Remove a room from favorites
   */
  static removeRoom(roomId: string): void {
    const favorites = this.loadFavorites();
    const filtered = favorites.filter((r) => r.roomId !== roomId);
    this.saveFavorites(filtered);
  }

  /**
   * Get the most frequently accessed room
   */
  static getMostFrequent(): FavoriteRoom | null {
    const favorites = this.loadFavorites();
    if (favorites.length === 0) return null;

    return favorites.reduce((prev, current) =>
      current.accessCount > prev.accessCount ? current : prev
    );
  }

  /**
   * Clear all favorites
   */
  static clearAll(): void {
    try {
      localStorage.removeItem(FAVORITE_ROOMS_KEY);
    } catch (error) {
      console.warn('Failed to clear favorite rooms:', error);
    }
  }
}
