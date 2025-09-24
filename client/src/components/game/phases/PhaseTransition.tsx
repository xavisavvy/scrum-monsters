import React, { useState, useEffect } from 'react';
import { GamePhase } from '@shared/gameEvents';
import { PhaseRegistry } from './PhaseRegistry';

interface PhaseTransitionProps {
  fromPhase?: GamePhase;
  toPhase: GamePhase;
  isTransitioning: boolean;
  onTransitionComplete?: () => void;
  children?: React.ReactNode;
}

interface TransitionState {
  phase: 'entering' | 'active' | 'exiting';
  progress: number;
}

/**
 * Component that handles smooth transitions between game phases.
 * Provides visual feedback and prevents DOM reconciliation issues.
 */
export function PhaseTransition({
  fromPhase,
  toPhase,
  isTransitioning,
  onTransitionComplete,
  children
}: PhaseTransitionProps) {
  const [transitionState, setTransitionState] = useState<TransitionState>({
    phase: 'active',
    progress: 1
  });

  useEffect(() => {
    if (!isTransitioning) {
      setTransitionState({ phase: 'active', progress: 1 });
      return;
    }

    // Start transition sequence
    setTransitionState({ phase: 'exiting', progress: 1 });

    const exitTimer = setTimeout(() => {
      setTransitionState({ phase: 'entering', progress: 0 });

      const enterTimer = setTimeout(() => {
        setTransitionState({ phase: 'active', progress: 1 });
        onTransitionComplete?.();
      }, 300); // Enter animation duration

      return () => clearTimeout(enterTimer);
    }, 200); // Exit animation duration

    return () => clearTimeout(exitTimer);
  }, [isTransitioning, onTransitionComplete]);

  const getTransitionStyle = (): React.CSSProperties => {
    const { phase, progress } = transitionState;

    switch (phase) {
      case 'exiting':
        return {
          opacity: progress,
          transform: `scale(${0.95 + (progress * 0.05)})`,
          transition: 'opacity 200ms ease-out, transform 200ms ease-out'
        };

      case 'entering':
        return {
          opacity: progress,
          transform: `scale(${0.95 + (progress * 0.05)})`,
          transition: 'opacity 300ms ease-in, transform 300ms ease-in'
        };

      case 'active':
      default:
        return {
          opacity: 1,
          transform: 'scale(1)',
          transition: 'none'
        };
    }
  };

  const showTransitionOverlay = transitionState.phase !== 'active';

  return (
    <div className="relative h-full w-full">
      {/* Content */}
      <div style={getTransitionStyle()}>
        {children}
      </div>

      {/* Transition Overlay */}
      {showTransitionOverlay && (
        <div 
          className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-100"
          style={{
            opacity: transitionState.phase === 'exiting' ? 1 - transitionState.progress : transitionState.progress
          }}
        >
          <div className="text-center">
            <div className="text-2xl mb-2">⚡</div>
            <div className="text-sm text-gray-300">
              {transitionState.phase === 'exiting' ? 'Transitioning...' : 'Loading...'}
            </div>
            {fromPhase && toPhase && (
              <div className="text-xs text-gray-400 mt-1">
                {PhaseRegistry.getConfig(fromPhase)?.name} → {PhaseRegistry.getConfig(toPhase)?.name}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook for managing phase transitions
 */
export function usePhaseTransition(currentPhase: GamePhase) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [previousPhase, setPreviousPhase] = useState<GamePhase | undefined>();

  const startTransition = (newPhase: GamePhase) => {
    if (currentPhase === newPhase) return;

    setPreviousPhase(currentPhase);
    setIsTransitioning(true);

    // Auto-complete transition after delay
    setTimeout(() => {
      setIsTransitioning(false);
    }, 500);
  };

  const completeTransition = () => {
    setIsTransitioning(false);
  };

  return {
    isTransitioning,
    previousPhase,
    startTransition,
    completeTransition
  };
}