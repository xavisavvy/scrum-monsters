import React from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './index';
import { RetroCard } from '@/components/ui/retro-card';

interface RevealPhaseProps extends PhaseComponentProps {}

export function RevealPhase({
  lobby,
  isTransitioning = false
}: RevealPhaseProps) {
  
  return (
    <PhaseContainer
      layout="overlay"
      mainContent={
        <div className="text-center p-6">
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