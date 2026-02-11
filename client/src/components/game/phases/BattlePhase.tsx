import React from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './index';
import { ScoreSubmission } from '@/components/game/ScoreSubmission';
import { CountdownOverlay } from '@/components/game/CountdownOverlay';
import { MinionDisplay } from '@/components/game/MinionDisplay';
import { XPBar } from '@/components/game/XPBar';
import { FloatingXPManager } from '@/components/game/FloatingXPManager';
import { LevelUpCelebration } from '@/components/game/LevelUpCelebration';
import { TierUpToast } from '@/components/game/TierUpToast';
import { useProgression } from '@/lib/stores/useProgression';
import { useGameState } from '@/lib/stores/useGameState';

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
  const { currentPlayer } = useGameState();
  const { levelUp } = useProgression();

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
    <>
      <PhaseContainer
        layout="battle"
        boss={boss}
        onBossAttack={onBossAttack}
        sidebarContent={
          <>
            <ScoreSubmission />
            <MinionDisplay className="mt-4" />
          </>
        }
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

      {/* XP System UI - Floating numbers in 3D scene */}
      <FloatingXPManager />

      {/* XP Bar - Bottom of screen */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
        <XPBar />
      </div>

      {/* Level-up celebration - Fullscreen overlay */}
      {levelUp?.active && currentPlayer && (
        <LevelUpCelebration playerClass={currentPlayer.avatar} />
      )}

      {/* Tier-up toast - Bottom-right corner, defers to level-up celebration */}
      <TierUpToast />

      <CountdownOverlay />
    </>
  );
}