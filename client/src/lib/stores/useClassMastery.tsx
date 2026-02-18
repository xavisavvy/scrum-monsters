import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { MasteryTier, ClassMasteryXPCurve } from '@shared/classMasteryTypes';

interface PendingTierUp {
  avatarClass: string;
  oldTier: MasteryTier;
  newTier: MasteryTier;
}

interface ClassMasteryState {
  // Per-class mastery data: avatarClass → { classXP, currentTier }
  masteryData: Record<string, { classXP: number; currentTier: MasteryTier }>;

  // Pending tier-up notification (for celebration/toast)
  pendingTierUp: PendingTierUp | null;

  // Actions
  handleXPAwarded: (data: { playerId: string; avatarClass: string; amount: number; source: string; newTotal: number }) => void;
  handleTierUp: (data: { playerId: string; avatarClass: string; oldTier: string; newTier: string }) => void;
  handleSync: (data: { playerId: string; masteryData: Record<string, { classXP: number; currentTier: string }> }) => void;
  clearTierUp: () => void;
  reset: () => void;

  // Computed helpers
  getMasteryForClass: (avatarClass: string) => { classXP: number; currentTier: MasteryTier } | null;
  getProgressToNextTier: (avatarClass: string) => { current: number; needed: number; percentage: number; currentTier: MasteryTier; nextTier: MasteryTier | null };
}

// Instance of the XP curve calculator
const xpCurve = new ClassMasteryXPCurve();

export const useClassMastery = create<ClassMasteryState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    masteryData: {},
    pendingTierUp: null,

    // Actions
    handleXPAwarded: (data) => {
      const { masteryData } = get();

      // Update masteryData[avatarClass].classXP to newTotal
      const currentTier = xpCurve.calculateTier(data.newTotal);

      set({
        masteryData: {
          ...masteryData,
          [data.avatarClass]: {
            classXP: data.newTotal,
            currentTier,
          },
        },
      });
    },

    handleTierUp: (data) => {
      set({
        pendingTierUp: {
          avatarClass: data.avatarClass,
          oldTier: data.oldTier as MasteryTier,
          newTier: data.newTier as MasteryTier,
        },
      });
    },

    handleSync: (data) => {
      // Replace entire masteryData with synced data
      const syncedMasteryData: Record<string, { classXP: number; currentTier: MasteryTier }> = {};

      Object.entries(data.masteryData).forEach(([avatarClass, masteryInfo]) => {
        syncedMasteryData[avatarClass] = {
          classXP: masteryInfo.classXP,
          currentTier: masteryInfo.currentTier as MasteryTier,
        };
      });

      set({ masteryData: syncedMasteryData });
    },

    clearTierUp: () => {
      set({ pendingTierUp: null });
    },

    reset: () => {
      set({
        masteryData: {},
        pendingTierUp: null,
      });
    },

    // Computed helpers
    getMasteryForClass: (avatarClass: string) => {
      const { masteryData } = get();
      return masteryData[avatarClass] || null;
    },

    getProgressToNextTier: (avatarClass: string) => {
      const { masteryData } = get();
      const classData = masteryData[avatarClass];

      if (!classData) {
        // No data for this class yet - return default Novice state
        return {
          current: 0,
          needed: 1000, // Expert threshold
          percentage: 0,
          currentTier: 'Novice' as MasteryTier,
          nextTier: 'Expert' as MasteryTier,
        };
      }

      return xpCurve.getProgressToNextTier(classData.classXP);
    },
  }))
);
