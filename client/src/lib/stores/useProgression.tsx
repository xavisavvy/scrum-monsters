import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type XPSource = 'vote' | 'boss_damage' | 'consensus' | 'revival';

interface PendingXPGain {
  id: string;
  amount: number;
  source: XPSource;
  timestamp: number;
}

interface LevelUpState {
  active: boolean;
  oldLevel: number;
  newLevel: number;
  triggeredAt: number;
}

interface ProgressionState {
  // State
  currentXP: number;
  currentLevel: number;
  pendingXPGains: PendingXPGain[];
  levelUp: LevelUpState | null;
  isLoaded: boolean;

  // Computed helpers
  getProgressToNextLevel: () => { current: number; needed: number; percentage: number };

  // Actions
  handleXPAwarded: (data: {
    playerId: string;
    amount: number;
    source: XPSource;
    newTotal: number;
    timestamp: number;
  }) => void;
  handleLevelUp: (data: {
    playerId: string;
    oldLevel: number;
    newLevel: number;
    timestamp: number;
  }) => void;
  handleSync: (data: {
    playerId: string;
    totalXP: number;
    currentLevel: number;
    timestamp: number;
  }) => void;
  clearPendingGain: (id: string) => void;
  clearLevelUp: () => void;
  reset: () => void;
}

// XP curve formula (mirrors server-side calculation)
const getLevelThreshold = (level: number): number => {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.5));
};

export const useProgression = create<ProgressionState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentXP: 0,
    currentLevel: 1,
    pendingXPGains: [],
    levelUp: null,
    isLoaded: false,

    // Computed helper
    getProgressToNextLevel: () => {
      const { currentXP, currentLevel } = get();
      const currentLevelThreshold = getLevelThreshold(currentLevel);
      const nextLevelThreshold = getLevelThreshold(currentLevel + 1);
      const xpInCurrentLevel = currentXP - currentLevelThreshold;
      const xpNeededForLevel = nextLevelThreshold - currentLevelThreshold;
      const percentage = xpNeededForLevel > 0
        ? Math.min(100, Math.floor((xpInCurrentLevel / xpNeededForLevel) * 100))
        : 0;

      return {
        current: xpInCurrentLevel,
        needed: xpNeededForLevel,
        percentage,
      };
    },

    // Actions
    handleXPAwarded: (data) => {
      const { pendingXPGains } = get();

      // Update current XP to the new total
      set({ currentXP: data.newTotal });

      // Add to pending gains for visual feedback
      const newGain: PendingXPGain = {
        id: `xp-${data.timestamp}-${Math.random().toString(36).slice(2, 9)}`,
        amount: data.amount,
        source: data.source,
        timestamp: data.timestamp,
      };

      set({ pendingXPGains: [...pendingXPGains, newGain] });
    },

    handleLevelUp: (data) => {
      set({
        currentLevel: data.newLevel,
        levelUp: {
          active: true,
          oldLevel: data.oldLevel,
          newLevel: data.newLevel,
          triggeredAt: Date.now(),
        },
      });
    },

    handleSync: (data) => {
      set({
        currentXP: data.totalXP,
        currentLevel: data.currentLevel,
        isLoaded: true,
      });
    },

    clearPendingGain: (id) => {
      const { pendingXPGains } = get();
      set({ pendingXPGains: pendingXPGains.filter(gain => gain.id !== id) });
    },

    clearLevelUp: () => {
      set({ levelUp: null });
    },

    reset: () => {
      set({
        currentXP: 0,
        currentLevel: 1,
        pendingXPGains: [],
        levelUp: null,
        isLoaded: false,
      });
    },
  }))
);
