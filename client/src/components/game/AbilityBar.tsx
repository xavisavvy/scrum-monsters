import React from 'react';
import { CLASS_ABILITY_CONFIGS } from '@shared/abilityTypes';
import { MasteryTier } from '@shared/classMasteryTypes';
import { AbilityButton } from './AbilityButton';
import { useGameState } from '@/lib/stores/useGameState';
import { useAbilities } from '@/lib/stores/useAbilities';
import { useClassMastery } from '@/lib/stores/useClassMastery';

export function AbilityBar() {
  const { currentPlayer, currentLobby } = useGameState();
  const { activateAbility, pendingAbility } = useAbilities();
  const { getMasteryForClass } = useClassMastery();

  // Only show during battle phase
  if (!currentLobby || currentLobby.gamePhase !== 'battle') return null;
  if (!currentPlayer?.avatar) return null;

  const playerClass = currentPlayer.avatar;
  const config = CLASS_ABILITY_CONFIGS[playerClass];
  if (!config) return null;

  // Get mastery tier for unlock checks
  const masteryData = getMasteryForClass(playerClass);
  const currentTier = masteryData?.currentTier ?? 'Novice';

  // Check which abilities are unlocked
  const isTierAtLeast = (required: MasteryTier): boolean => {
    const tiers: MasteryTier[] = ['Novice', 'Expert', 'Master'];
    return tiers.indexOf(currentTier) >= tiers.indexOf(required);
  };

  const handleActivate = (abilityId: string) => {
    activateAbility(abilityId);
  };

  return (
    <div className="flex gap-2 items-center">
      <AbilityButton
        ability={config.ability_1}
        isUnlocked={isTierAtLeast(config.ability_1.tier)}
        requiredTier={config.ability_1.tier}
        onActivate={handleActivate}
        disabled={pendingAbility !== null}
      />
      <AbilityButton
        ability={config.ability_2}
        isUnlocked={isTierAtLeast(config.ability_2.tier)}
        requiredTier={config.ability_2.tier}
        onActivate={handleActivate}
        disabled={pendingAbility !== null}
      />
    </div>
  );
}
