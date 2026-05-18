import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { FloatingDamage } from './FloatingDamage';

interface ActiveDamage {
  id: string;
  amount: number;
  position: { x: number; y: number };
  /** Phase 45-04: forward the damage/heal discriminator to FloatingDamage. */
  type?: 'damage' | 'heal';
}

export function FloatingDamageManager() {
  const { pendingDamageEvents, clearPendingDamage } = useGameState();
  const [active, setActive] = useState<ActiveDamage[]>([]);
  const processedRef = useRef(new Set<string>());

  // Process new pending damage events (mirrors FloatingXPManager processedRef gate)
  useEffect(() => {
    pendingDamageEvents.forEach((evt) => {
      if (!processedRef.current.has(evt.id)) {
        processedRef.current.add(evt.id);
        setActive((prev) => [
          ...prev,
          { id: evt.id, amount: evt.amount, position: evt.position, type: evt.type },
        ]);
      }
    });
  }, [pendingDamageEvents]);

  const handleComplete = useCallback(
    (id: string) => {
      setActive((prev) => prev.filter((g) => g.id !== id));
      processedRef.current.delete(id);
      clearPendingDamage(id);
    },
    [clearPendingDamage]
  );

  // zIndex 55 — below Phase 39 ladder (SpotlightMask 100, HintBubble 101, HelpMenu 200)
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 55 }}>
      {active.map((d) => (
        <FloatingDamage
          key={d.id}
          amount={d.amount}
          startPosition={d.position}
          type={d.type}
          onComplete={() => handleComplete(d.id)}
        />
      ))}
    </div>
  );
}
