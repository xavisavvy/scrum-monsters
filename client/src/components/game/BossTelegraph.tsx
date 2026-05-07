import { useGameState } from '@/lib/stores/useGameState';
import { useEffect, useState } from 'react';

export function BossTelegraph() {
  const telegraph = useGameState(s => s.telegraph);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!telegraph) {
      setProgress(0);
      return;
    }

    const startTime = Date.now();
    const duration = telegraph.delayMs;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(elapsed / duration, 1);
      setProgress(pct);

      if (pct >= 1) {
        clearInterval(interval);
      }
    }, 50); // Update every 50ms for smooth progress

    return () => clearInterval(interval);
  }, [telegraph]);

  if (!telegraph) return null;

  // Visual effect class mapping
  const effectClass = {
    charge: 'animate-pulse bg-orange-500/20 border-orange-400',
    glow: 'animate-pulse bg-red-500/20 border-red-400',
    shake: 'animate-[shake_0.3s_ease-in-out_infinite] bg-yellow-500/20 border-yellow-400',
    particles: 'animate-pulse bg-purple-500/20 border-purple-400',
    none: 'bg-gray-500/20 border-gray-400',
  }[telegraph.visualEffect] || 'bg-gray-500/20 border-gray-400';

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg border-2 ${effectClass} backdrop-blur-sm`}
      data-hint-target="boss-telegraph"
    >
      {/* Attack warning message */}
      <div className="text-center">
        <span className="text-xs uppercase tracking-wider text-gray-300 font-bold">
          ⚔ Boss Attack ⚔
        </span>
        <p className="text-lg font-bold text-white mt-1">
          {telegraph.message}
        </p>
        {telegraph.targetId && (
          <p className="text-sm text-gray-300 mt-1">
            Targeting: {telegraph.targetId}
          </p>
        )}
      </div>

      {/* Progress bar showing time until attack lands */}
      <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-500 transition-all duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
