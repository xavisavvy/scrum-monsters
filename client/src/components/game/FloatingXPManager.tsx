import { useEffect, useRef, useCallback, useState } from 'react';
import { useProgression, type XPSource } from '@/lib/stores/useProgression';
import { FloatingXP } from './FloatingXP';

// Screen position percentages for XP sources (per CONTEXT.md: source-specific positioning)
const SOURCE_POSITIONS: Record<XPSource, { x: string; y: string }> = {
  vote: { x: '15%', y: '40%' },       // Left side (voting area)
  boss_damage: { x: '50%', y: '30%' }, // Center (boss area)
  consensus: { x: '50%', y: '50%' },   // Center
  revival: { x: '75%', y: '40%' },     // Right side (team area)
};

// Stack offset in pixels
const STACK_OFFSET = 30;

interface ActiveXPGain {
  id: string;
  amount: number;
  source: XPSource;
  position: { x: number; y: number };
}

export function FloatingXPManager() {
  const { pendingXPGains, clearPendingGain } = useProgression();
  const [activeGains, setActiveGains] = useState<ActiveXPGain[]>([]);
  const stackCountRef = useRef<Record<XPSource, number>>({
    vote: 0,
    boss_damage: 0,
    consensus: 0,
    revival: 0,
  });
  const processedRef = useRef(new Set<string>());

  // Process new pending gains
  useEffect(() => {
    pendingXPGains.forEach((gain) => {
      if (!processedRef.current.has(gain.id)) {
        processedRef.current.add(gain.id);

        // Calculate pixel position from percentage
        const basePos = SOURCE_POSITIONS[gain.source];
        const stackOffset = stackCountRef.current[gain.source] * STACK_OFFSET;
        const x = (parseFloat(basePos.x) / 100) * window.innerWidth;
        const y = (parseFloat(basePos.y) / 100) * window.innerHeight - stackOffset;

        setActiveGains(prev => [...prev, {
          id: gain.id,
          amount: gain.amount,
          source: gain.source,
          position: { x, y },
        }]);

        stackCountRef.current[gain.source]++;

        // Reset stack count after animation
        setTimeout(() => {
          stackCountRef.current[gain.source] = Math.max(
            0,
            stackCountRef.current[gain.source] - 1
          );
        }, 1200);
      }
    });
  }, [pendingXPGains]);

  const handleComplete = useCallback((id: string) => {
    setActiveGains(prev => prev.filter(g => g.id !== id));
    processedRef.current.delete(id);
    clearPendingGain(id);
  }, [clearPendingGain]);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 55 }}>
      {activeGains.map((gain) => (
        <FloatingXP
          key={gain.id}
          amount={gain.amount}
          source={gain.source}
          startPosition={gain.position}
          onComplete={() => handleComplete(gain.id)}
        />
      ))}
    </div>
  );
}
