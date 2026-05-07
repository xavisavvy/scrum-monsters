import { useEffect, useState } from 'react';

// Damage red — matches FloatingXP boss_damage palette for visual consistency
const DAMAGE_COLOR = '#E74C3C';

export interface FloatingDamageProps {
  amount: number;
  startPosition: { x: number; y: number };
  onComplete: () => void;
  duration?: number;
}

export function FloatingDamage({
  amount,
  startPosition,
  onComplete,
  duration = 1000,
}: FloatingDamageProps) {
  const [visible, setVisible] = useState(true);

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
      className="floating-damage"
      style={{
        position: 'absolute',
        left: startPosition.x,
        top: startPosition.y,
        color: DAMAGE_COLOR,
        fontSize: '1.4rem',
        fontWeight: 'bold',
        fontFamily: '"Press Start 2P", monospace',
        textShadow: `0 0 6px ${DAMAGE_COLOR}80, 2px 2px 4px rgba(0,0,0,0.9)`,
        pointerEvents: 'none',
        zIndex: 60,
        animation: `floatUp ${duration}ms ease-out forwards`,
        whiteSpace: 'nowrap',
      }}
    >
      -{amount}
    </div>
  );
}
