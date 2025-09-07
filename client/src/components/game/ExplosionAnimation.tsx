import React, { useEffect, useState } from 'react';

interface ExplosionAnimationProps {
  isActive: boolean;
  onComplete: () => void;
}

export function ExplosionAnimation({ isActive, onComplete }: ExplosionAnimationProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [particles, setParticles] = useState<Array<{id: number, x: number, y: number, vx: number, vy: number}>>([]);

  useEffect(() => {
    if (!isActive) {
      setCurrentFrame(0);
      setParticles([]);
      return;
    }

    // Generate particles
    const newParticles = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 50 + Math.random() * 100, // Start near center
      y: 50 + Math.random() * 100,
      vx: (Math.random() - 0.5) * 400, // Random velocity
      vy: (Math.random() - 0.5) * 400
    }));
    setParticles(newParticles);

    // Animate explosion frames (9 frames over ~1.5 seconds)
    const frameInterval = setInterval(() => {
      setCurrentFrame(prev => {
        if (prev >= 8) { // 0-8 = 9 frames total
          clearInterval(frameInterval);
          return 8;
        }
        return prev + 1;
      });
    }, 170); // ~170ms per frame = 1.53s total

    // Complete animation after 3 seconds
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => {
      clearInterval(frameInterval);
      clearTimeout(completeTimer);
    };
  }, [isActive, onComplete]);

  if (!isActive) return null;

  // Calculate sprite position (3x3 grid)
  const frameX = (currentFrame % 3) * 33.33; // Each frame is 1/3 width
  const frameY = Math.floor(currentFrame / 3) * 33.33; // Each frame is 1/3 height

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Main explosion sprite animation */}
      <div
        className="absolute inset-0 bg-cover bg-no-repeat"
        style={{
          backgroundImage: `url(/images/effects/explosion-spritesheet.png)`,
          backgroundPosition: `-${frameX}% -${frameY}%`,
          backgroundSize: '300% 300%', // 3x3 grid
          opacity: currentFrame >= 8 ? 0 : 1,
          transition: currentFrame >= 8 ? 'opacity 1.5s ease-out' : 'none'
        }}
      />
      
      {/* Particle effects */}
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute w-2 h-2 bg-orange-400 rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            animation: `particle-float-${particle.id} 3s ease-out forwards`,
            opacity: currentFrame >= 6 ? 0 : 1,
            transition: 'opacity 1s ease-out'
          }}
        />
      ))}
      
      {/* Dynamic particle animations via CSS variables */}
      <style>{`
        ${particles.map(particle => `
          .particle-${particle.id} {
            animation: particle-float-${particle.id} 3s ease-out forwards;
          }
          @keyframes particle-float-${particle.id} {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            100% { 
              transform: translate(${particle.vx}px, ${particle.vy}px) scale(0); 
              opacity: 0; 
            }
          }
        `).join('')}
      `}</style>
    </div>
  );
}