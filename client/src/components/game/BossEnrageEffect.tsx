import React, { useEffect, useState } from 'react';

interface BossEnrageEffectProps {
  onComplete?: () => void;
  duration?: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  rotation: number;
  character: string;
}

/**
 * Boss enrage visual effect - toned down "massacre" effect
 * Dark green/red energy with skulls and lightning
 */
export function BossEnrageEffect({
  onComplete,
  duration = 3000
}: BossEnrageEffectProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [particles] = useState<Particle[]>(() => {
    const particleCount = 20;
    const colors = ['💀', '☠️', '⚡', '🔥', '💢'];
    
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 200, // Wider spread
      y: (Math.random() - 0.5) * 150,
      size: 20 + Math.random() * 20,
      delay: Math.random() * 0.3,
      duration: 1.2 + Math.random() * 0.8,
      rotation: Math.random() * 360,
      character: colors[Math.floor(Math.random() * colors.length)],
    }));
  });

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
      <style>{`
        @keyframes enrage-pulse {
          0%, 100% { transform: scale(0); opacity: 0; }
          10% { transform: scale(1.8); opacity: 1; }
          20% { transform: scale(1.2); opacity: 0.4; }
          30% { transform: scale(1.6); opacity: 1; }
          40% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 1; }
          70% { transform: scale(1.2); opacity: 0.8; }
          90% { transform: scale(0.7); opacity: 0.4; }
        }

        @keyframes enrage-glow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }

        @keyframes screen-shake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-3px) translateY(2px); }
          20% { transform: translateX(3px) translateY(-2px); }
          30% { transform: translateX(-2px) translateY(1px); }
          40% { transform: translateX(2px) translateY(-1px); }
          50% { transform: translateX(-1px) translateY(2px); }
          60% { transform: translateX(1px) translateY(-2px); }
          70% { transform: translateX(-2px) translateY(1px); }
          80% { transform: translateX(2px) translateY(-1px); }
          90% { transform: translateX(-1px) translateY(1px); }
        }
      `}</style>
      
      {/* Full screen container for effect */}
      <div
        className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
        style={{ animation: 'screen-shake 0.5s ease-out' }}
      >
        {/* Dark red/green glow overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(139, 0, 0, 0.4) 0%, rgba(0, 100, 0, 0.3) 30%, transparent 70%)',
            animation: 'enrage-glow 2s ease-in-out infinite',
          }}
        />

        {/* Central glow burst */}
        <div
          className="absolute rounded-full"
          style={{
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(255, 0, 0, 0.6) 0%, rgba(0, 255, 0, 0.5) 20%, transparent 60%)',
            animation: 'enrage-glow 1.5s ease-in-out infinite',
            filter: 'blur(30px)',
          }}
        />

        {/* Particles */}
        <div className="relative" style={{ width: '400px', height: '300px' }}>
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="absolute"
              style={{
                left: `calc(50% + ${particle.x}px)`,
                top: `calc(50% + ${particle.y}px)`,
                fontSize: `${particle.size}px`,
                textShadow: '0 0 20px rgba(255, 0, 0, 0.8), 0 0 40px rgba(0, 255, 0, 0.6)',
                animation: `enrage-pulse ${particle.duration}s ease-out ${particle.delay}s forwards`,
                transform: `rotate(${particle.rotation}deg)`,
              }}
            >
              {particle.character}
            </div>
          ))}
        </div>

        {/* Warning text */}
        <div
          className="absolute top-1/3 left-0 right-0 transform -translate-y-1/2 text-center px-4"
          style={{
            animation: 'enrage-pulse 2s ease-out forwards',
          }}
        >
          <div
            className="text-4xl sm:text-5xl md:text-6xl font-bold uppercase tracking-wider whitespace-nowrap"
            style={{
              color: '#ff0000',
              textShadow: '0 0 20px rgba(255, 0, 0, 0.9), 0 0 40px rgba(0, 255, 0, 0.6), 0 0 60px rgba(139, 0, 0, 0.8)',
              animation: 'enrage-glow 1s ease-in-out infinite',
            }}
          >
            ⚠️ ENRAGED ⚠️
          </div>
        </div>
      </div>
    </>
  );
}
