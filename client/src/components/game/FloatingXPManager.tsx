import { useEffect, useRef, useCallback } from 'react';
import { useProgression, type XPSource } from '@/lib/stores/useProgression';
import { FloatingXP } from './FloatingXP';

// Position offsets for stacking - each new gain appears slightly higher
const STACK_OFFSET = 0.5;

// Base positions for XP sources
const SOURCE_POSITIONS: Record<XPSource, [number, number, number]> = {
  vote: [-2, 0, 0],        // Left side (voting area)
  boss_damage: [0, 1, 0],  // Center (boss area)
  consensus: [0, 0.5, 0],  // Center
  revival: [2, 0, 0],      // Right side (team area)
};

interface ActiveXPGain {
  id: string;
  amount: number;
  source: XPSource;
  position: [number, number, number];
}

export function FloatingXPManager() {
  const { pendingXPGains, clearPendingGain } = useProgression();
  const activeGainsRef = useRef<Map<string, ActiveXPGain>>(new Map());
  const stackCountRef = useRef<Record<XPSource, number>>({
    vote: 0,
    boss_damage: 0,
    consensus: 0,
    revival: 0,
  });

  // Process new pending gains
  useEffect(() => {
    pendingXPGains.forEach((gain) => {
      if (!activeGainsRef.current.has(gain.id)) {
        // Calculate stacked position
        const basePos = SOURCE_POSITIONS[gain.source];
        const stackOffset = stackCountRef.current[gain.source] * STACK_OFFSET;
        const position: [number, number, number] = [
          basePos[0],
          basePos[1] + stackOffset,
          basePos[2],
        ];

        activeGainsRef.current.set(gain.id, {
          id: gain.id,
          amount: gain.amount,
          source: gain.source,
          position,
        });

        stackCountRef.current[gain.source]++;

        // Reset stack count after all current gains of this source complete
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
    activeGainsRef.current.delete(id);
    clearPendingGain(id);
  }, [clearPendingGain]);

  // Render active floating numbers
  const activeGains = Array.from(activeGainsRef.current.values());

  return (
    <group>
      {activeGains.map((gain) => (
        <FloatingXP
          key={gain.id}
          amount={gain.amount}
          source={gain.source}
          startPosition={gain.position}
          onComplete={() => handleComplete(gain.id)}
        />
      ))}
    </group>
  );
}
