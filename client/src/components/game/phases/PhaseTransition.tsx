import React, { useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GamePhase } from '@shared/gameEvents';
import { useGameSounds } from '@/lib/hooks/useGameSounds';

interface PhaseTransitionProps {
  fromPhase?: GamePhase;
  toPhase: GamePhase;
  isTransitioning?: boolean;   // Keep for API compat — AnimatePresence handles transition via key
  onTransitionComplete?: () => void;
  children?: React.ReactNode;
}

const phaseVariants = {
  hidden:  { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1 },
  exit:    { opacity: 0, y: -16, scale: 0.97 },
};

/**
 * Wraps game phase content with Framer Motion AnimatePresence for smooth
 * enter/exit animations. Plays a transition sound when the phase changes.
 * Respects prefers-reduced-motion by setting duration to 0.
 *
 * CRITICAL: key={toPhase} drives AnimatePresence — changing toPhase triggers
 * the exit of the old child and enter of the new one automatically.
 */
export function PhaseTransition({
  fromPhase: _fromPhase,
  toPhase,
  isTransitioning: _isTransitioning,
  onTransitionComplete,
  children
}: PhaseTransitionProps) {
  const shouldReduceMotion = useReducedMotion();
  const sounds = useGameSounds();
  const prevPhaseRef = useRef(toPhase);

  // Play phase transition sound when phase actually changes
  useEffect(() => {
    if (prevPhaseRef.current !== toPhase) {
      sounds.onPhaseTransition();
      prevPhaseRef.current = toPhase;
    }
  }, [toPhase, sounds]);

  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.25, ease: 'easeInOut' as const };

  return (
    <AnimatePresence mode="wait" onExitComplete={onTransitionComplete}>
      <motion.div
        key={toPhase}
        variants={phaseVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={transition}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook for tracking phase transitions in the caller.
 * AnimatePresence handles the actual animation — this hook only tracks
 * the previous phase for cases where the caller needs it (e.g. PhaseRenderer).
 */
export function usePhaseTransition(currentPhase: GamePhase) {
  const [previousPhase, setPreviousPhase] = useState<GamePhase | undefined>();

  useEffect(() => {
    return () => {
      setPreviousPhase(currentPhase);
    };
  }, [currentPhase]);

  return {
    previousPhase,
  };
}
