import React from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './PhaseComponent';
import { Discussion } from '@/components/game/Discussion';

interface DiscussionPhaseProps extends PhaseComponentProps {}

export function DiscussionPhase({
  lobby,
  boss,
  onBossAttack,
  sidebarCollapsed,
  onToggleSidebar,
  isTransitioning = false
}: DiscussionPhaseProps) {
  // Don't render if no boss is available
  if (!boss) {
    return (
      <PhaseContainer
        layout="simple"
        mainContent={
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">💬</div>
              <div className="text-xl">Preparing Discussion...</div>
              <div className="text-sm opacity-75 mt-2">Loading discussion data</div>
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
      sidebarContent={<Discussion />}
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