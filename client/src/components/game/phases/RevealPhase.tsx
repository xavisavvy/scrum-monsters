import React from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './index';
import { RetroCard } from '@/components/ui/retro-card';
import { useFirstEncounter } from '@/lib/hooks/useFirstEncounter';
import { useGameState } from '@/lib/stores/useGameState';

interface RevealPhaseProps extends PhaseComponentProps {}

export function RevealPhase({
  lobby: _lobby,
  isTransitioning = false
}: RevealPhaseProps) {
  // Phase 40: first-vote-reveal hint (Sage narrator, fires once on first reveal entry).
  const phase = useGameState((s) => s.currentLobby?.gamePhase);
  useFirstEncounter('first-vote-reveal', phase === 'reveal');

  return (
    <PhaseContainer
      layout="overlay"
      mainContent={
        <div className="text-center p-6" data-hint-target="reveal-summary">
          <RetroCard title="Revealing Estimates...">
            <div className="space-y-4">
              <div className="text-2xl">⏳</div>
              <p>Calculating team consensus...</p>
              {isTransitioning && (
                <div className="text-xs text-gray-400 mt-2">
                  Transitioning...
                </div>
              )}
            </div>
          </RetroCard>
        </div>
      }
      contentClassName="flex items-center justify-center h-full"
      className={isTransitioning ? 'transitioning' : ''}
    />
  );
}
