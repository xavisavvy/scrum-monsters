import { useEffect, useState } from 'react';
import type { XPSource } from '@/lib/stores/useProgression';

// Color coding per CONTEXT.md decisions
const XP_COLORS: Record<XPSource, string> = {
  vote: '#4A90E2',      // Blue
  boss_damage: '#E74C3C', // Red
  consensus: '#F39C12', // Gold
  revival: '#2ECC71',   // Green
};

// Bonus sources get larger text with pulse
const BONUS_SOURCES: XPSource[] = ['consensus', 'revival'];

export interface FloatingXPProps {
  amount: number;
  source: XPSource;
  startPosition: { x: number; y: number };
  onComplete: () => void;
  duration?: number;
}

export function FloatingXP({ amount, source, startPosition, onComplete, duration = 1000 }: FloatingXPProps) {
  const [visible, setVisible] = useState(true);
  const isBonus = BONUS_SOURCES.includes(source);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  if (!visible) return null;

  return (
    <div
      className="floating-xp"
      style={{
        position: 'absolute',
        left: startPosition.x,
        top: startPosition.y,
        color: XP_COLORS[source],
        fontSize: isBonus ? '1.5rem' : '1.1rem',
        fontWeight: 'bold',
        fontFamily: '"Press Start 2P", monospace',
        textShadow: `0 0 6px ${XP_COLORS[source]}80, 2px 2px 4px rgba(0,0,0,0.9)`,
        pointerEvents: 'none',
        zIndex: 60,
        animation: `floatUp ${duration}ms ease-out forwards`,
        whiteSpace: 'nowrap',
      }}
    >
      +{amount} XP
    </div>
  );
}
