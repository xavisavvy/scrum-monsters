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
      onRehydrateStorage: () => (_state, error) => {
        if (!error) {
          useTutorial.setState({ isHydrated: true });
        }
      },
    },
  ),
);
