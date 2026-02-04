import React, { useEffect, useState, useMemo } from 'react';
import { MagicEffectType } from '@/lib/utils/magicWords';

interface MagicEffectProps {
  type: MagicEffectType;
  x: number; // Position relative to character
  y: number; // Position relative to character
  onComplete?: () => void;
  duration?: number; // Duration in milliseconds
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  rotation: number;
  character?: string;
}

// Effect configurations
const EFFECT_CONFIGS: Record<MagicEffectType, {
  particleCount: number;
  colors: string[];
  characters?: string[];
  spreadX: number;
  spreadY: number;
  animation: string;
  glow?: string;
}> = {
  fire: {
    particleCount: 15,
    colors: ['#ff4500', '#ff6b35', '#ffa500', '#ffcc00'],
    characters: ['🔥', '✨'],
    spreadX: 40,
    spreadY: 80,
    animation: 'fire-rise',
    glow: 'rgba(255, 100, 0, 0.5)',
  },
  ice: {
    particleCount: 12,
    colors: ['#00bfff', '#87ceeb', '#e0ffff', '#ffffff'],
    characters: ['❄️', '✨', '💠'],
    spreadX: 50,
    spreadY: 60,
    animation: 'ice-float',
    glow: 'rgba(135, 206, 235, 0.5)',
  },
  heal: {
    particleCount: 10,
    colors: ['#00ff00', '#32cd32', '#98fb98', '#adff2f'],
    characters: ['✚', '✨', '💚'],
    spreadX: 40,
    spreadY: 70,
    animation: 'heal-rise',
    glow: 'rgba(50, 205, 50, 0.5)',
  },
  lightning: {
    particleCount: 8,
    colors: ['#ffff00', '#ffd700', '#ffffff', '#87ceeb'],
    characters: ['⚡', '✨', '💫'],
    spreadX: 60,
    spreadY: 80,
    animation: 'lightning-flash',
    glow: 'rgba(255, 255, 0, 0.6)',
  },
  magic: {
    particleCount: 14,
    colors: ['#9932cc', '#da70d6', '#ff69b4', '#4169e1'],
    characters: ['✨', '⭐', '💫', '🌟'],
    spreadX: 50,
    spreadY: 70,
    animation: 'magic-spiral',
    glow: 'rgba(153, 50, 204, 0.5)',
  },
  love: {
    particleCount: 10,
    colors: ['#ff69b4', '#ff1493', '#ff6b6b', '#ffb6c1'],
    characters: ['❤️', '💕', '💗', '💖'],
    spreadX: 50,
    spreadY: 80,
    animation: 'love-float',
    glow: 'rgba(255, 105, 180, 0.4)',
  },
  confetti: {
    particleCount: 20,
    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
    characters: ['🎉', '🎊', '✨'],
    spreadX: 80,
    spreadY: 100,
    animation: 'confetti-burst',
  },
  rage: {
    particleCount: 8,
    colors: ['#ff0000', '#dc143c', '#ff4500', '#8b0000'],
    characters: ['💢', '😤', '🔥'],
    spreadX: 45,
    spreadY: 50,
    animation: 'rage-pulse',
    glow: 'rgba(255, 0, 0, 0.5)',
  },
  sleep: {
    particleCount: 6,
    colors: ['#6495ed', '#4169e1', '#87ceeb'],
    characters: ['💤', 'Z', 'z'],
    spreadX: 40,
    spreadY: 60,
    animation: 'sleep-drift',
  },
  sparkle: {
    particleCount: 12,
    colors: ['#ffd700', '#ffec8b', '#ffffff', '#fffacd'],
    characters: ['✨', '⭐', '💫', '🌟'],
    spreadX: 50,
    spreadY: 70,
    animation: 'sparkle-twinkle',
    glow: 'rgba(255, 215, 0, 0.5)',
  },
  die: {
    particleCount: 8,
    colors: ['#4a4a4a', '#2d2d2d', '#666666', '#1a1a1a'],
    characters: ['💀', '☠️', '👻', '✖️'],
    spreadX: 40,
    spreadY: 60,
    animation: 'die-fall',
    glow: 'rgba(50, 50, 50, 0.6)',
  },
  revive: {
    particleCount: 14,
    colors: ['#ffd700', '#ffff00', '#ffffff', '#87ceeb'],
    characters: ['✨', '🌟', '💫', '⭐', '🔆'],
    spreadX: 50,
    spreadY: 80,
    animation: 'revive-burst',
    glow: 'rgba(255, 215, 0, 0.6)',
  },
  haste: {
    particleCount: 10,
    colors: ['#00ff00', '#7fff00', '#adff2f', '#ffff00'],
    characters: ['💨', '⚡', '✨', '→'],
    spreadX: 60,
    spreadY: 40,
    animation: 'haste-streak',
    glow: 'rgba(127, 255, 0, 0.5)',
  },
  slow: {
    particleCount: 8,
    colors: ['#4169e1', '#6495ed', '#87ceeb', '#b0c4de'],
    characters: ['🐌', '💤', '🕐', '~'],
    spreadX: 40,
    spreadY: 50,
    animation: 'slow-drift',
    glow: 'rgba(65, 105, 225, 0.4)',
  },
  fly: {
    particleCount: 12,
    colors: ['#87ceeb', '#add8e6', '#ffffff', '#e0ffff'],
    characters: ['🪶', '✨', '💫', '☁️', '🕊️'],
    spreadX: 60,
    spreadY: 80,
    animation: 'fly-rise',
    glow: 'rgba(135, 206, 235, 0.5)',
  },
  hold: {
    particleCount: 10,
    colors: ['#4a90d9', '#6bb3f0', '#9dd5ff', '#ffffff'],
    characters: ['❄️', '🔮', '⛓️', '✨'],
    spreadX: 45,
    spreadY: 60,
    animation: 'hold-freeze',
    glow: 'rgba(74, 144, 217, 0.6)',
  },
  earthbind: {
    particleCount: 14,
    colors: ['#8b4513', '#a0522d', '#6b4423', '#daa520'],
    characters: ['🪨', '⛰️', '🌍', '⬇️', '💀'],
    spreadX: 80,
    spreadY: 100,
    animation: 'earthbind-crash',
    glow: 'rgba(139, 69, 19, 0.6)',
  },
  massacre: {
    particleCount: 16,
    colors: ['#00ff00', '#32cd32', '#006400', '#000000'],
    characters: ['💀', '☠️', '⚡', '💚', '🐍'],
    spreadX: 100,
    spreadY: 120,
    animation: 'massacre-flash',
    glow: 'rgba(0, 255, 0, 0.8)',
  },
  massrevive: {
    particleCount: 20,
    colors: ['#ffd700', '#ffffff', '#87ceeb', '#ff69b4'],
    characters: ['✨', '🌟', '💫', '⭐', '👼', '🦅'],
    spreadX: 100,
    spreadY: 120,
    animation: 'massrevive-burst',
    glow: 'rgba(255, 215, 0, 0.7)',
  },
  dragon: {
    particleCount: 12,
    colors: ['#ff4500', '#ff6b35', '#ffd700', '#8b0000'],
    characters: ['🔥', '🐉', '💀', '✨'],
    spreadX: 60,
    spreadY: 80,
    animation: 'fire-rise',
    glow: 'rgba(255, 69, 0, 0.7)',
  },
  dispel: {
    particleCount: 14,
    colors: ['#ffffff', '#e6e6fa', '#dda0dd', '#98fb98'],
    characters: ['✨', '💫', '🌟', '⭐', '🔮'],
    spreadX: 70,
    spreadY: 90,
    animation: 'dispel-burst',
    glow: 'rgba(255, 255, 255, 0.6)',
  },
  chaos: {
    particleCount: 20,
    colors: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#8b00ff'],
    characters: ['🌈', '✨', '💫', '🎵', '🎶', '💃', '🕺'],
    spreadX: 100,
    spreadY: 100,
    animation: 'chaos-spin',
    glow: 'rgba(255, 0, 255, 0.5)',
  },
  invisibility: {
    particleCount: 12,
    colors: ['#808080', '#a0a0a0', '#c0c0c0', '#e0e0e0', '#ffffff'],
    characters: ['👻', '✨', '💨', '🌫️', '👤'],
    spreadX: 50,
    spreadY: 70,
    animation: 'invisibility-fade',
    glow: 'rgba(200, 200, 200, 0.3)',
  },
  enlarge: {
    particleCount: 14,
    colors: ['#ff8c00', '#ffa500', '#ffd700', '#ffff00'],
    characters: ['🔺', '⬆️', '✨', '💪', '📈'],
    spreadX: 70,
    spreadY: 90,
    animation: 'enlarge-grow',
    glow: 'rgba(255, 165, 0, 0.5)',
  },
  reduce: {
    particleCount: 12,
    colors: ['#4169e1', '#6495ed', '#87ceeb', '#add8e6'],
    characters: ['🔻', '⬇️', '✨', '🔬', '📉'],
    spreadX: 50,
    spreadY: 60,
    animation: 'reduce-shrink',
    glow: 'rgba(65, 105, 225, 0.4)',
  },
  petrify: {
    particleCount: 14,
    colors: ['#808080', '#696969', '#a9a9a9', '#c0c0c0', '#8b7355'],
    characters: ['🗿', '🪨', '⬛', '✨', '💎'],
    spreadX: 55,
    spreadY: 75,
    animation: 'petrify-stone',
    glow: 'rgba(128, 128, 128, 0.5)',
  },
};

// CSS keyframes for each animation type
const animationStyles = `
  @keyframes fire-rise {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-80px) scale(0.5); opacity: 0; }
  }

  @keyframes ice-float {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    50% { transform: translateY(-40px) rotate(180deg); opacity: 0.8; }
    100% { transform: translateY(-70px) rotate(360deg); opacity: 0; }
  }

  @keyframes heal-rise {
    0% { transform: translateY(0) scale(0.5); opacity: 0; }
    20% { transform: translateY(-10px) scale(1); opacity: 1; }
    100% { transform: translateY(-70px) scale(0.8); opacity: 0; }
  }

  @keyframes lightning-flash {
    0%, 100% { opacity: 0; transform: scale(0.8); }
    10%, 30%, 50% { opacity: 1; transform: scale(1.2); }
    20%, 40% { opacity: 0.3; transform: scale(1); }
  }

  @keyframes magic-spiral {
    0% { transform: rotate(0deg) translateX(0) scale(0); opacity: 0; }
    20% { transform: rotate(72deg) translateX(20px) scale(1); opacity: 1; }
    100% { transform: rotate(360deg) translateX(40px) scale(0); opacity: 0; }
  }

  @keyframes love-float {
    0% { transform: translateY(0) scale(0.5); opacity: 0; }
    20% { transform: translateY(-20px) scale(1.2); opacity: 1; }
    100% { transform: translateY(-80px) scale(0.8); opacity: 0; }
  }

  @keyframes confetti-burst {
    0% { transform: translateY(0) translateX(0) rotate(0deg) scale(1); opacity: 1; }
    100% { transform: translateY(var(--end-y)) translateX(var(--end-x)) rotate(720deg) scale(0.3); opacity: 0; }
  }

  @keyframes rage-pulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    25% { transform: scale(1.3); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.9; }
    75% { transform: scale(1.4); opacity: 1; }
  }

  @keyframes sleep-drift {
    0% { transform: translateY(0) translateX(0) scale(0.5); opacity: 0; }
    20% { transform: translateY(-10px) translateX(5px) scale(1); opacity: 1; }
    100% { transform: translateY(-60px) translateX(30px) scale(1.5); opacity: 0; }
  }

  @keyframes sparkle-twinkle {
    0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
    25% { transform: scale(1.2) rotate(90deg); opacity: 1; }
    50% { transform: scale(0.8) rotate(180deg); opacity: 0.7; }
    75% { transform: scale(1) rotate(270deg); opacity: 1; }
  }

  @keyframes die-fall {
    0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
    30% { transform: translateY(-20px) rotate(-10deg) scale(1.1); opacity: 1; }
    100% { transform: translateY(30px) rotate(15deg) scale(0.8); opacity: 0; }
  }

  @keyframes revive-burst {
    0% { transform: translateY(20px) scale(0); opacity: 0; }
    30% { transform: translateY(-10px) scale(1.3); opacity: 1; }
    60% { transform: translateY(-40px) scale(1); opacity: 0.8; }
    100% { transform: translateY(-70px) scale(0.5); opacity: 0; }
  }

  @keyframes haste-streak {
    0% { transform: translateX(0) scaleX(1); opacity: 1; }
    50% { transform: translateX(-30px) scaleX(1.5); opacity: 0.8; }
    100% { transform: translateX(-60px) scaleX(2); opacity: 0; }
  }

  @keyframes slow-drift {
    0% { transform: translateY(0) scale(1); opacity: 0.8; }
    50% { transform: translateY(-20px) scale(1.2); opacity: 0.6; }
    100% { transform: translateY(-40px) scale(0.8); opacity: 0; }
  }

  @keyframes fly-rise {
    0% { transform: translateY(0) translateX(0) scale(0.5); opacity: 0; }
    20% { transform: translateY(-20px) translateX(5px) scale(1); opacity: 1; }
    60% { transform: translateY(-50px) translateX(-5px) scale(1.1); opacity: 0.8; }
    100% { transform: translateY(-90px) translateX(10px) scale(0.6); opacity: 0; }
  }

  @keyframes hold-freeze {
    0% { transform: scale(0) rotate(0deg); opacity: 0; }
    20% { transform: scale(1.2) rotate(90deg); opacity: 1; }
    40% { transform: scale(1) rotate(180deg); opacity: 0.9; }
    60% { transform: scale(1.1) rotate(270deg); opacity: 0.7; }
    100% { transform: scale(0.8) rotate(360deg); opacity: 0; }
  }

  @keyframes earthbind-crash {
    0% { transform: translateY(-80px) scale(0.5); opacity: 0; }
    20% { transform: translateY(-60px) scale(1); opacity: 1; }
    60% { transform: translateY(0) scale(1.2); opacity: 1; }
    80% { transform: translateY(10px) scale(1.4); opacity: 0.8; }
    100% { transform: translateY(0) scale(0.5); opacity: 0; }
  }

  @keyframes massacre-flash {
    0%, 100% { transform: scale(0); opacity: 0; }
    10% { transform: scale(1.5); opacity: 1; }
    20% { transform: scale(1); opacity: 0.3; }
    30% { transform: scale(1.3); opacity: 1; }
    40% { transform: scale(0.9); opacity: 0.5; }
    50% { transform: scale(1.4); opacity: 1; }
    70% { transform: scale(1.1); opacity: 0.7; }
    90% { transform: scale(0.5); opacity: 0.3; }
  }

  @keyframes massrevive-burst {
    0% { transform: translateY(30px) scale(0); opacity: 0; }
    20% { transform: translateY(0) scale(1.3); opacity: 1; }
    40% { transform: translateY(-30px) scale(1); opacity: 0.9; }
    60% { transform: translateY(-50px) scale(1.2); opacity: 0.7; }
    100% { transform: translateY(-80px) scale(0.5); opacity: 0; }
  }

  @keyframes dispel-burst {
    0% { transform: scale(0) rotate(0deg); opacity: 0; }
    30% { transform: scale(1.5) rotate(180deg); opacity: 1; }
    60% { transform: scale(1.2) rotate(360deg); opacity: 0.8; }
    100% { transform: scale(2) rotate(540deg); opacity: 0; }
  }

  @keyframes chaos-spin {
    0% { transform: translateY(0) rotate(0deg) scale(0.5); opacity: 0; }
    20% { transform: translateY(-20px) rotate(180deg) scale(1.2); opacity: 1; }
    50% { transform: translateY(-40px) rotate(360deg) scale(1); opacity: 0.9; }
    80% { transform: translateY(-60px) rotate(540deg) scale(1.1); opacity: 0.6; }
    100% { transform: translateY(-80px) rotate(720deg) scale(0.3); opacity: 0; }
  }

  @keyframes invisibility-fade {
    0% { transform: scale(1) translateY(0); opacity: 1; }
    20% { transform: scale(1.1) translateY(-10px); opacity: 0.8; }
    40% { transform: scale(0.9) translateY(-20px); opacity: 0.5; }
    60% { transform: scale(1.05) translateY(-30px); opacity: 0.3; }
    80% { transform: scale(0.8) translateY(-40px); opacity: 0.15; }
    100% { transform: scale(0.5) translateY(-50px); opacity: 0; }
  }

  @keyframes enlarge-grow {
    0% { transform: scale(0.5) translateY(0); opacity: 0; }
    20% { transform: scale(1.5) translateY(-15px); opacity: 1; }
    50% { transform: scale(1.2) translateY(-30px); opacity: 0.9; }
    70% { transform: scale(1.8) translateY(-50px); opacity: 0.7; }
    100% { transform: scale(2) translateY(-70px); opacity: 0; }
  }

  @keyframes reduce-shrink {
    0% { transform: scale(1.5) translateY(0); opacity: 1; }
    20% { transform: scale(1) translateY(-10px); opacity: 0.9; }
    50% { transform: scale(0.6) translateY(-25px); opacity: 0.7; }
    70% { transform: scale(0.4) translateY(-40px); opacity: 0.5; }
    100% { transform: scale(0.2) translateY(-50px); opacity: 0; }
  }

  @keyframes petrify-stone {
    0% { transform: scale(0.8) translateY(0); opacity: 0; }
    20% { transform: scale(1.2) translateY(-5px); opacity: 1; }
    40% { transform: scale(1) translateY(-15px); opacity: 0.9; }
    60% { transform: scale(1.1) translateY(-25px); opacity: 0.7; }
    80% { transform: scale(0.9) translateY(-35px); opacity: 0.4; }
    100% { transform: scale(0.6) translateY(-45px); opacity: 0; }
  }

  @keyframes glow-pulse {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.1); }
  }
`;

export function MagicEffect({
  type,
  x,
  y,
  onComplete,
  duration = 2000
}: MagicEffectProps) {
  const [isVisible, setIsVisible] = useState(true);
  const config = EFFECT_CONFIGS[type];

  // Generate particles
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: config.particleCount }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * config.spreadX,
      y: (Math.random() - 0.5) * config.spreadY,
      size: 12 + Math.random() * 12,
      delay: Math.random() * 0.5,
      duration: 0.8 + Math.random() * 0.6,
      rotation: Math.random() * 360,
      character: config.characters?.[Math.floor(Math.random() * config.characters.length)],
    }));
  }, [config]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  if (!isVisible) return null;

  return (
    <>
      <style>{animationStyles}</style>
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${x}px`,
          bottom: `${y}px`,
          transform: 'translateX(-50%)',
          width: config.spreadX * 2,
          height: config.spreadY + 20,
          zIndex: 25,
        }}
      >
        {/* Glow effect for some types */}
        {config.glow && (
          <div
            className="absolute rounded-full"
            style={{
              left: '50%',
              bottom: '0',
              transform: 'translateX(-50%)',
              width: config.spreadX * 1.5,
              height: config.spreadY * 0.8,
              background: `radial-gradient(ellipse, ${config.glow} 0%, transparent 70%)`,
              animation: 'glow-pulse 1s ease-in-out infinite',
            }}
          />
        )}

        {/* Particles */}
        {particles.map((particle) => {
          const color = config.colors[Math.floor(Math.random() * config.colors.length)];

          // Special handling for confetti - needs end position CSS variables
          const confettiStyle = type === 'confetti' ? {
            '--end-x': `${(Math.random() - 0.5) * 100}px`,
            '--end-y': `${50 + Math.random() * 50}px`,
          } as React.CSSProperties : {};

          return (
            <div
              key={particle.id}
              className="absolute"
              style={{
                left: `calc(50% + ${particle.x}px)`,
                bottom: `${20 + particle.y * 0.3}px`,
                fontSize: `${particle.size}px`,
                color,
                textShadow: config.glow ? `0 0 8px ${color}` : undefined,
                animation: `${config.animation} ${particle.duration}s ease-out ${particle.delay}s forwards`,
                transform: `rotate(${particle.rotation}deg)`,
                ...confettiStyle,
              }}
            >
              {particle.character || '●'}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default MagicEffect;
