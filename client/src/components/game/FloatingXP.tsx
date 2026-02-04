import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { XPSource } from '@/lib/stores/useProgression';

// Color coding per CONTEXT.md decisions
const XP_COLORS: Record<XPSource, string> = {
  vote: '#4A90E2',      // Blue
  boss_damage: '#E74C3C', // Red
  consensus: '#F39C12', // Gold
  revival: '#2ECC71',   // Green
};

// Bonus sources get larger text with glow
const BONUS_SOURCES: XPSource[] = ['consensus', 'revival'];

interface FloatingXPProps {
  amount: number;
  source: XPSource;
  startPosition: [number, number, number];
  onComplete: () => void;
}

export function FloatingXP({ amount, source, startPosition, onComplete }: FloatingXPProps) {
  const textRef = useRef<THREE.Mesh>(null);
  const startTime = useRef(Date.now());
  const duration = 1000; // 1 second per CONTEXT.md
  const isBonus = BONUS_SOURCES.includes(source);

  useEffect(() => {
    const timer = setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  useFrame(() => {
    if (!textRef.current) return;

    const elapsed = Date.now() - startTime.current;
    const progress = Math.min(elapsed / duration, 1);

    // Rise animation (ease-out curve: fast start, slow end)
    const yOffset = progress * 1.5 * (2 - progress);
    textRef.current.position.y = startPosition[1] + yOffset;

    // Fade out during last 40% of animation
    const fadeStart = 0.6;
    const opacity = progress < fadeStart
      ? 1
      : 1 - ((progress - fadeStart) / (1 - fadeStart));

    if (textRef.current.material) {
      (textRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }

    // Slight scale pulse for bonus XP
    if (isBonus) {
      const pulse = 1 + 0.1 * Math.sin(progress * Math.PI * 4);
      textRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <Text
      ref={textRef}
      position={startPosition}
      fontSize={isBonus ? 0.6 : 0.4}
      color={XP_COLORS[source]}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.02}
      outlineColor="#000000"
      material-transparent={true}
    >
      +{amount} XP
    </Text>
  );
}
