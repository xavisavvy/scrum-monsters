import React, { useEffect, useState } from 'react';
import { useComboState } from '@/lib/stores/useComboState';

export function ComboNotification() {
  const activeCombo = useComboState(state => state.activeCombo);
  const dismissCombo = useComboState(state => state.dismissCombo);
  const [visible, setVisible] = useState(false);
  const [displayCombo, setDisplayCombo] = useState<typeof activeCombo>(null);

  useEffect(() => {
    if (activeCombo) {
      setDisplayCombo(activeCombo);
      setVisible(true);

      // Auto-dismiss after 2.5 seconds
      const timer = setTimeout(() => {
        setVisible(false);
        // Wait for fade-out animation then clear
        setTimeout(() => {
          dismissCombo();
          setDisplayCombo(null);
        }, 500);
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [activeCombo, dismissCombo]);

  if (!displayCombo) return null;

  return (
    <div
      className={`fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none
        transition-all duration-500 ease-out
        ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 -translate-y-4'}`}
    >
      <div className={`
        px-8 py-4 rounded-xl text-center min-w-[250px]
        ${displayCombo.isConsensusUltimate
          ? 'bg-gradient-to-br from-purple-600 via-violet-500 to-indigo-600 border-2 border-yellow-400 shadow-[0_0_30px_rgba(168,85,247,0.6)]'
          : 'bg-gradient-to-br from-amber-700 via-yellow-600 to-amber-500 border-2 border-yellow-300 shadow-[0_0_20px_rgba(245,158,11,0.5)]'}
      `}>
        {/* Combo name */}
        <div className="text-2xl font-bold text-white drop-shadow-lg tracking-wide">
          {displayCombo.comboName}!
        </div>

        {/* Damage and multiplier */}
        <div className="mt-1 flex items-center justify-center gap-3 text-lg">
          <span className="text-yellow-200 font-semibold">
            {displayCombo.damage} DMG
          </span>
          <span className="text-white/80">|</span>
          <span className="text-yellow-100 font-bold">
            {displayCombo.damageMultiplier.toFixed(1)}x
          </span>
        </div>

        {/* Consensus ultimate extra info */}
        {displayCombo.isConsensusUltimate && displayCombo.votingDurationMs && (
          <div className="mt-1 text-sm text-purple-200">
            Team voted in {(displayCombo.votingDurationMs / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  );
}
