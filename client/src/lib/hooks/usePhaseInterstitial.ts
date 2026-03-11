import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { GamePhase } from '@shared/gameEvents';

interface InterstitialConfig {
  text: string;
  subtext?: string;
  duration: number;
}

export interface ActiveInterstitial {
  phase: GamePhase;
  text: string;
  subtext?: string;
}

const INTERSTITIAL_CONFIG: Partial<Record<GamePhase, InterstitialConfig>> = {
  battle: { text: 'Encounter!', subtext: 'A boss appears...', duration: 1500 },
  scoring: { text: 'Tallying Results...', duration: 1000 },
  reveal: { text: 'Reveal!', subtext: 'The scores are in!', duration: 1200 },
  victory: { text: 'Victory!', subtext: 'All bosses defeated!', duration: 1800 },
  next_level: { text: 'Stage Clear!', subtext: 'Prepare for the next battle', duration: 1500 },
  game_over: { text: 'Game Over', subtext: 'The quest ends here...', duration: 1500 },
};

/**
 * Hook that manages JRPG-style interstitial display state.
 * Shows themed text overlays during phase transitions that auto-dismiss.
 * Respects reduced-motion preferences by skipping interstitials entirely.
 */
export function usePhaseInterstitial() {
  const [activeInterstitial, setActiveInterstitial] = useState<ActiveInterstitial | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setActiveInterstitial(null);
  }, [clearTimer]);

  const triggerInterstitial = useCallback(
    (newPhase: GamePhase) => {
      // Reduced-motion users skip interstitials entirely
      if (shouldReduceMotion) return;

      const config = INTERSTITIAL_CONFIG[newPhase];
      if (!config) return;

      // Clear any existing timeout before starting a new one
      clearTimer();

      setActiveInterstitial({
        phase: newPhase,
        text: config.text,
        subtext: config.subtext,
      });

      timeoutRef.current = setTimeout(() => {
        setActiveInterstitial(null);
        timeoutRef.current = null;
      }, config.duration);
    },
    [shouldReduceMotion, clearTimer],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { activeInterstitial, triggerInterstitial, dismiss };
}
