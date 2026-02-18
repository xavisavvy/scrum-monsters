/**
 * useGameSounds — Semantic mapping layer between game events and the useAudio store.
 *
 * This hook does NOT create new Audio objects. It maps semantic event names to existing
 * useAudio store functions, providing a stable API that components can call without
 * knowing internal sound file names.
 *
 * Temporary mappings (marked with "Temporary"):
 * These reuse existing SFX until dedicated audio files are added. When adding:
 *   - panel-open.mp3  → replace onPanelOpen
 *   - panel-close.mp3 → replace onPanelClose
 *   - error.mp3       → replace onError
 *   - phase-transition.mp3 → replace onPhaseTransition
 */

import { useAudio } from '@/lib/stores/useAudio';

/**
 * React hook version — use inside React components.
 */
export function useGameSounds() {
  const audio = useAudio();

  return {
    // UI interactions
    onButtonClick:     audio.playButtonSelect,
    onConfirm:         audio.playSuccess,
    onError:           audio.playHit,           // Temporary: reuse hit sound for error

    // Game events
    onPhaseTransition: audio.playSuccess,       // Temporary: reuse success sound
    onPanelOpen:       audio.playButtonSelect,  // Temporary: reuse button-select
    onPanelClose:      audio.playButtonSelect,  // Temporary: reuse button-select
    onLevelUp:         audio.playLevelUp,
    onDamage:          audio.playHit,
    onExplosion:       audio.playExplosion,
  };
}

/**
 * Non-hook version — use outside React components (e.g. in plain event handlers
 * or utility functions that don't have React hook access).
 */
export function getGameSounds() {
  const state = useAudio.getState();
  return {
    // UI interactions
    onButtonClick:     state.playButtonSelect,
    onConfirm:         state.playSuccess,
    onError:           state.playHit,           // Temporary: reuse hit sound for error

    // Game events
    onPhaseTransition: state.playSuccess,       // Temporary: reuse success sound
    onPanelOpen:       state.playButtonSelect,  // Temporary: reuse button-select
    onPanelClose:      state.playButtonSelect,  // Temporary: reuse button-select
    onLevelUp:         state.playLevelUp,
    onDamage:          state.playHit,
    onExplosion:       state.playExplosion,
  };
}
