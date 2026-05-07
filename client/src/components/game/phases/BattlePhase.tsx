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
import { BossTelegraph } from '@/components/game/BossTelegraph';
import { AbilityBar } from '@/components/game/AbilityBar';
import { useProgression } from '@/lib/stores/useProgression';
import { useGameState } from '@/lib/stores/useGameState';
import { useAbilitySync } from '@/lib/stores/useAbilities';
import { ComboNotification } from '@/components/game/ComboNotification';
import { useComboSync, useComboState } from '@/lib/stores/useComboState';
import { ItemBar } from '@/components/game/combat/ItemBar';
import { BattleLoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { useItemSync, useItemStore } from '@/lib/stores/useItemStore';
import { useFirstEncounter } from '@/lib/hooks/useFirstEncounter';

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
  useAbilitySync(); // Wire ability server events
  useComboSync(); // Wire combo server events
  useItemSync(); // Wire item server events

  // Phase 40 contextual hints — fire once per first-encounter, latched via completedHints.
  const activeCombo = useComboState((s) => s.activeCombo);
  const inventorySize = useItemStore((s) => s.inventory.size);
  const telegraph = useGameState((s) => s.telegraph);
  useFirstEncounter('first-combo', activeCombo !== null);
  useFirstEncounter('first-item', inventorySize >= 1);
  useFirstEncounter('first-telegraph', telegraph !== null);

  // Don't render if no boss is available
  if (!boss) {
    return (
      <PhaseContainer
        layout="simple"
        mainContent={<BattleLoadingSpinner />}
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

      {/* Boss telegraph warning - Top center */}
      <BossTelegraph />

      {/* Combo notifications - Upper center */}
      <ComboNotification />

      {/* XP System UI - Floating numbers in 3D scene */}
      <FloatingXPManager />

      {/* XP Bar - Bottom of screen */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
        <XPBar />
      </div>

      {/* Ability Bar - Bottom right, above XP bar */}
      <div className="fixed bottom-20 right-4 z-40">
        <AbilityBar />
      </div>

      {/* Item Bar - Bottom left, above XP bar, only for non-spectators in battle */}
      {currentPlayer && currentPlayer.team !== 'spectators' && (
        <div className="fixed bottom-20 left-4 z-40">
          <ItemBar />
        </div>
      )}

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