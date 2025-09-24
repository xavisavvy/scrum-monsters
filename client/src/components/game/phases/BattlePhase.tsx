import React from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './PhaseComponent';
import { ScoreSubmission } from '@/components/game/ScoreSubmission';

interface BattlePhaseProps extends PhaseComponentProps {}

export function BattlePhase({
  lobby,
  boss,
  onBossAttack,
  onPlayerPositionsUpdate,
  sidebarCollapsed,
  onToggleSidebar,
  isTransitioning = false
}: BattlePhaseProps) {
  // Don't render if no boss is available
  if (!boss) {
    return (
      <PhaseContainer
        layout="simple"
        mainContent={
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">⚔️</div>
              <div className="text-xl">Preparing Battle...</div>
              <div className="text-sm opacity-75 mt-2">Loading boss data</div>
            </div>
          </div>
        }
      />
    );
  }

  return (
    <PhaseContainer
      layout="battle"
      boss={boss}
      onBossAttack={onBossAttack}
      sidebarContent={<ScoreSubmission />}
      enablePlayerController={true}
      onPlayerPositionsUpdate={onPlayerPositionsUpdate}
      showTimer={true}
      showBossMusic={true}
      showTeamComponents={true}
      showSidebar={true}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={onToggleSidebar}
      className={isTransitioning ? 'transitioning' : ''}
    />
  );
}