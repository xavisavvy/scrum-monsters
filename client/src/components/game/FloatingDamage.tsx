import { useEffect, useState } from 'react';

// Damage red — matches FloatingXP boss_damage palette for visual consistency
const DAMAGE_COLOR = '#E74C3C';
// Phase 45-04: heal green — matches the cleric/heal palette.
const HEAL_COLOR = '#2ECC71';

export interface FloatingDamageProps {
  amount: number;
  startPosition: { x: number; y: number };
  onComplete: () => void;
  duration?: number;
  /** Phase 45-04: 'damage' (default) renders red `-N`; 'heal' renders green `+N`. */
  type?: 'damage' | 'heal';
}

export function FloatingDamage({
  amount,
  startPosition,
  onComplete,
  duration = 1000,
  type = 'damage',
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

  const color = type === 'heal' ? HEAL_COLOR : DAMAGE_COLOR;
  const prefix = type === 'heal' ? '+' : '-';

  return (
    <div
      className="floating-damage"
      style={{
        position: 'absolute',
        left: startPosition.x,
        top: startPosition.y,
        color,
        fontSize: '1.4rem',
        fontWeight: 'bold',
        fontFamily: '"Press Start 2P", monospace',
        textShadow: `0 0 6px ${color}80, 2px 2px 4px rgba(0,0,0,0.9)`,
        pointerEvents: 'none',
        zIndex: 60,
        animation: `floatUp ${duration}ms ease-out forwards`,
        whiteSpace: 'nowrap',
      }}
    >
      {prefix}{amount}
    </div>
  );
}
