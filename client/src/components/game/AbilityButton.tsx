import React, { useEffect, useRef, useState } from 'react';
import { AbilityDefinition } from '@shared/abilityTypes';
import { MasteryTier } from '@shared/classMasteryTypes';
import { useAbilities } from '@/lib/stores/useAbilities';

interface AbilityButtonProps {
  ability: AbilityDefinition;
  isUnlocked: boolean;
  requiredTier: MasteryTier;
  onActivate: (abilityId: string) => void;
  disabled?: boolean;
}

export function AbilityButton({
  ability,
  isUnlocked,
  requiredTier,
  onActivate,
  disabled = false,
}: AbilityButtonProps) {
  const { isOnCooldown, getCooldownProgress, getRemainingSeconds } = useAbilities();

  const [progress, setProgress] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const isCooling = isOnCooldown(ability.id);

  // Ref-based animation loop for smooth cooldown visuals
  useEffect(() => {
    if (!isCooling) {
      setProgress(100);
      setRemainingSeconds(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const animate = () => {
      // Read directly from store to avoid re-renders
      const currentProgress = getCooldownProgress(ability.id);
      const currentRemaining = getRemainingSeconds(ability.id);

      setProgress(currentProgress);
      setRemainingSeconds(currentRemaining);

      // Continue animation if still on cooldown
      if (currentProgress < 100) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCooling, ability.id, getCooldownProgress, getRemainingSeconds]);

  // Determine border color based on role (effectType of ability)
  const getBorderColor = () => {
    switch (ability.effectType) {
      case 'taunt':
      case 'shield':
        return 'border-amber-500/80'; // Tank classes
      case 'heal':
        return 'border-green-500/80'; // Healer classes
      case 'damage':
      case 'buff':
      case 'debuff':
      default:
        return 'border-blue-500/80'; // DPS classes
    }
  };

  const handleClick = () => {
    if (!isUnlocked || isCooling || disabled) return;
    onActivate(ability.id);
  };

  const isDisabled = !isUnlocked || isCooling || disabled;
  const borderColor = getBorderColor();

  return (
    <button
      className={`
        relative w-16 h-16 rounded-lg bg-black/80 border-2 transition-transform duration-100
        ${borderColor}
        ${!isDisabled ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
      `}
      onClick={handleClick}
      disabled={isDisabled}
      title={`${ability.name}: ${ability.description}`}
    >
      {/* Ability name and icon area */}
      <div className="ability-content p-1 flex items-center justify-center h-full">
        <span className="text-xs font-bold text-white truncate">{ability.name}</span>
      </div>

      {/* Cooldown overlay - CSS conic-gradient */}
      {isCooling && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `conic-gradient(rgba(0, 0, 0, 0.7) ${100 - progress}%, transparent ${100 - progress}%)`,
          }}
        />
      )}

      {/* Cooldown timer text */}
      {isCooling && remainingSeconds > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white drop-shadow-[0_0_4px_rgba(0,0,0,1)]">
            {remainingSeconds}s
          </span>
        </div>
      )}

      {/* Lock overlay for tier-locked abilities */}
      {!isUnlocked && (
        <div className="absolute inset-0 rounded-lg bg-black/60 flex flex-col items-center justify-center">
          <span className="text-lg">&#x1F512;</span>
          <span className="text-[10px] text-gray-400">{requiredTier}</span>
        </div>
      )}
    </button>
  );
}
