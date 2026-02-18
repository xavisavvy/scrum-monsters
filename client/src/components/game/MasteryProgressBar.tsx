import { useClassMastery } from '@/lib/stores';

interface MasteryProgressBarProps {
  avatarClass: string;
  className?: string;
}

/**
 * MasteryProgressBar shows class mastery XP progress toward next tier.
 * Uses JRPG gold aesthetic matching the global XP bar (Phase 15-03 decisions).
 * Progressive disclosure: only renders if player has mastery data for this class.
 */
export function MasteryProgressBar({ avatarClass, className = '' }: MasteryProgressBarProps) {
  const { getMasteryForClass, getProgressToNextTier } = useClassMastery();

  // Progressive disclosure: only show if player has data for this class
  const masteryData = getMasteryForClass(avatarClass);
  if (!masteryData) {
    return null;
  }

  const progress = getProgressToNextTier(avatarClass);

  // Format display text
  let displayText: string;
  if (progress.nextTier === null) {
    // Master tier with no next tier
    displayText = 'Master';
  } else {
    displayText = `${progress.currentTier}: ${progress.current}/${progress.needed} XP (${progress.percentage}%)`;
  }

  // Calculate fill width percentage (capped at 100%)
  const fillWidth = Math.min(progress.percentage, 100);

  return (
    <div className={`relative w-full ${className}`}>
      {/* Container with dark background */}
      <div className="relative h-6 rounded-lg border border-gray-700 bg-gray-900/80 overflow-hidden">
        {/* Fill bar with gold gradient */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-400 transition-all duration-300"
          style={{ width: `${fillWidth}%` }}
        />

        {/* Text overlay */}
        <div className="relative z-10 flex items-center justify-center h-full px-2">
          <span className="text-xs font-bold text-white drop-shadow-lg">
            {displayText}
          </span>
        </div>
      </div>
    </div>
  );
}
