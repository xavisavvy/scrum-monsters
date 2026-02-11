import { useEffect, useState } from 'react';
import { useClassMastery } from '@/lib/stores/useClassMastery';
import { useProgression } from '@/lib/stores/useProgression';

/**
 * TierUpToast displays a corner-positioned toast notification when player reaches a new mastery tier.
 * Positioned bottom-right to avoid overlap with fullscreen level-up celebration.
 * Delays display if level-up celebration is active (priority handling per Research Pitfall 5).
 */
export function TierUpToast() {
  const { pendingTierUp, clearTierUp } = useClassMastery();
  const { levelUp } = useProgression();
  const [visible, setVisible] = useState(false);

  // Priority handling: Delay tier-up toast if level-up celebration is active
  const showTierUp = pendingTierUp && !levelUp?.active;

  useEffect(() => {
    if (showTierUp) {
      // Show the toast
      setVisible(true);

      // Auto-dismiss after 3 seconds (slightly longer than level-up's 2.5s)
      const dismissTimer = setTimeout(() => {
        setVisible(false);
        // Clear from store after fade-out animation completes
        setTimeout(() => {
          clearTierUp();
        }, 300); // Wait for exit animation
      }, 3000);

      return () => clearTimeout(dismissTimer);
    } else {
      setVisible(false);
    }
  }, [showTierUp, clearTierUp]);

  // Don't render if no pending tier-up
  if (!pendingTierUp) {
    return null;
  }

  // Don't show if level-up is active (queued until level-up clears)
  if (!showTierUp) {
    return null;
  }

  // Format tier name for display
  const tierName = pendingTierUp.newTier;
  const className = pendingTierUp.avatarClass;
  const capitalizedClass = className.charAt(0).toUpperCase() + className.slice(1);

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="bg-gradient-to-r from-amber-900/90 to-yellow-900/90 border-2 border-amber-500 rounded-lg px-6 py-4 shadow-xl shadow-amber-500/30 max-w-sm">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="text-3xl">⭐</div>

          {/* Content */}
          <div className="flex-1">
            <div className="text-yellow-300 font-bold text-lg">
              {capitalizedClass} — {tierName}
            </div>
            <div className="text-amber-200 text-sm">
              Promoted to {tierName}!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
