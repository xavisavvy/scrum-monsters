import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface TutorialState {
  // Persisted (via partialize)
  completedTutorials: Record<string, boolean>;
  completedHints: Record<string, boolean>;
  version: number;

  // Runtime-only (NOT persisted)
  activeTutorial: string | null;
  activeStep: number;
  isSpotlightVisible: boolean;
  isHydrated: boolean;

  // Actions
  startTutorial: (id: string) => void;
  advanceStep: () => void;
  completeTutorial: (id: string) => void;
  dismissHint: (id: string) => void;
  resetTutorial: (id: string) => void;
  resetAllTutorials: () => void;
}

export const useTutorial = create<TutorialState>()(
  persist(
    (set) => ({
      // Persisted state
      completedTutorials: {},
      completedHints: {},
      version: 1,

      // Runtime-only state
      activeTutorial: null,
      activeStep: 0,
      isSpotlightVisible: false,
      isHydrated: false,

      startTutorial: (id: string) =>
        set({
          activeTutorial: id,
          activeStep: 0,
          isSpotlightVisible: true,
        }),

      advanceStep: () =>
        set((state) => ({
          activeStep: state.activeStep + 1,
        })),

      completeTutorial: (id: string) =>
        set((state) => ({
          completedTutorials: { ...state.completedTutorials, [id]: true },
          activeTutorial: null,
          activeStep: 0,
          isSpotlightVisible: false,
        })),

      dismissHint: (id: string) =>
        set((state) => ({
          completedHints: { ...state.completedHints, [id]: true },
        })),

      resetTutorial: (id: string) =>
        set((state) => {
          const { [id]: _, ...rest } = state.completedTutorials;
          return { completedTutorials: rest };
        }),

      resetAllTutorials: () =>
        set({
          completedTutorials: {},
          completedHints: {},
        }),
    }),
    {
      name: 'scrumquest-tutorial',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState, version) => {
        if (version === 0) {
          return { ...(persistedState as TutorialState), version: 1 };
        }
        return persistedState as TutorialState;
      },
      partialize: (state) => ({
        completedTutorials: state.completedTutorials,
        completedHints: state.completedHints,
        version: state.version,
      }),
    },
  ),
);

// Mark isHydrated reliably after persist middleware rehydrates from localStorage.
// The inline onRehydrateStorage callback was observed to not fire in some
// production builds (Phase 39 UAT Gap #1B, 2026-05-15). Using the canonical
// post-creation persist.onFinishHydration API plus a hasHydrated() guard for
// the case where hydration completed before this subscriber registered.
if (useTutorial.persist.hasHydrated()) {
  useTutorial.setState({ isHydrated: true });
}
useTutorial.persist.onFinishHydration(() => {
  useTutorial.setState({ isHydrated: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 40: Narrator config + tutorial content
// ─────────────────────────────────────────────────────────────────────────────

export type NarratorId = 'guild_master' | 'battle_advisor' | 'sage';

export interface NarratorConfig {
  displayName: string;
  /** Tailwind border accent class (e.g. 'border-amber-500/60') */
  accentBorderClass: string;
  /** Tailwind text accent class (e.g. 'text-amber-400') */
  accentTextClass: string;
}

export const NARRATORS: Record<NarratorId, NarratorConfig> = {
  guild_master: {
    displayName: 'Guild Master',
    accentBorderClass: 'border-amber-500/60',
    accentTextClass: 'text-amber-400',
  },
  battle_advisor: {
    displayName: 'Battle Advisor',
    accentBorderClass: 'border-red-500/60',
    accentTextClass: 'text-red-400',
  },
  sage: {
    displayName: 'Sage',
    accentBorderClass: 'border-purple-500/60',
    accentTextClass: 'text-purple-400',
  },
};

export interface TutorialStep {
  targetId: string;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  narrator: NarratorId;
}

export const TUTORIAL_STEPS: Record<string, TutorialStep[]> = {
  'walkthrough:lobby': [
    {
      narrator: 'guild_master',
      targetId: 'lobby-welcome',
      position: 'bottom',
      text: 'Welcome, brave adventurer. The guild has prepared a hall for your party.',
    },
    {
      narrator: 'guild_master',
      targetId: 'lobby-invite',
      position: 'top',
      text: 'Share this rune with your companions — they will join you here.',
    },
    {
      narrator: 'guild_master',
      targetId: 'lobby-start',
      position: 'top',
      text: 'When all are ready, begin the trial. The boss awaits.',
    },
  ],
  'walkthrough:avatar_selection': [
    {
      narrator: 'guild_master',
      targetId: 'avatar-grid',
      position: 'bottom',
      text: 'Choose your class wisely. Each carries a different blade into battle.',
    },
    {
      narrator: 'guild_master',
      targetId: 'avatar-confirm',
      position: 'top',
      text: 'Steady your resolve. Confirm your choice and the trial begins.',
    },
  ],
  'walkthrough:battle': [
    {
      narrator: 'battle_advisor',
      targetId: 'boss-health',
      position: 'bottom',
      text: 'Target. Health bar shows what stands between you and victory.',
    },
    {
      narrator: 'battle_advisor',
      targetId: 'vote-cards',
      position: 'top',
      text: 'Estimate the ticket. Higher consensus, harder hit.',
    },
    {
      narrator: 'battle_advisor',
      targetId: 'vote-submit',
      position: 'top',
      text: 'Lock your card. No second-guessing once it lands.',
    },
    {
      narrator: 'battle_advisor',
      targetId: 'ability-bar',
      position: 'top',
      text: 'Abilities. Spend them on the right phase — boss has tells.',
    },
    {
      narrator: 'battle_advisor',
      targetId: 'boss-health',
      position: 'bottom',
      text: 'Cycle: vote, reveal, discuss, strike. Repeat until the boss falls.',
    },
  ],
  // Anchored to boss-health (persistent) instead of combo-notification (transient)
  // to eliminate the typewriter-vs-dismissal timing race.
  'hint:first-combo': [
    {
      narrator: 'battle_advisor',
      targetId: 'boss-health',
      position: 'bottom',
      text: 'Combo active. Sustain it — bonus damage scales with chain length.',
    },
  ],
  'hint:first-item': [
    {
      narrator: 'battle_advisor',
      targetId: 'item-bar',
      position: 'top',
      text: 'Item dropped. Use it before the next phase — items expire on victory.',
    },
  ],
  'hint:first-telegraph': [
    {
      narrator: 'battle_advisor',
      targetId: 'boss-telegraph',
      position: 'bottom',
      text: 'Warning. Boss is winding up. Read the tell, position accordingly.',
    },
  ],
  'hint:first-vote-reveal': [
    {
      narrator: 'sage',
      targetId: 'reveal-summary',
      position: 'bottom',
      text: 'The party speaks with one voice... or many. Both reveal truth.',
    },
  ],
};
