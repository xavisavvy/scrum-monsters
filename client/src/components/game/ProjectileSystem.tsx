import React, { useEffect, useState } from 'react';
import { Projectile } from './PlayerCharacter';

interface ProjectileSystemProps {
  projectiles: Projectile[];
  onProjectileComplete: (projectileId: string) => void;
}

export function ProjectileSystem({ projectiles, onProjectileComplete }: ProjectileSystemProps) {
  const [animatedProjectiles, setAnimatedProjectiles] = useState<Projectile[]>([]);

  useEffect(() => {
    setAnimatedProjectiles(projectiles);
  }, [projectiles]);

  useEffect(() => {
    const animateProjectiles = () => {
      setAnimatedProjectiles(prev => 
        prev.map(projectile => {
          const newProgress = projectile.progress + 0.05; // 5% progress per frame
          
          if (newProgress >= 1) {
            // Projectile reached target
            setTimeout(() => onProjectileComplete(projectile.id), 100);
            return { ...projectile, progress: 1 };
          }
          
          return { ...projectile, progress: newProgress };
        }).filter(p => p.progress < 1)
      );
    };

    const interval = setInterval(animateProjectiles, 32); // ~30 FPS
    return () => clearInterval(interval);
  }, [onProjectileComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {animatedProjectiles.map(projectile => {
        // Calculate current position using bezier curve for arc
        const startX = projectile.startX;
        const startY = projectile.startY;
        const endX = projectile.targetX;
        const endY = projectile.targetY;
        
        // Create an arc by adding height at midpoint
        const midX = startX + (endX - startX) * 0.5;
        const midY = Math.min(startY, endY) - 100; // Arc 100px above
        
        // Quadratic bezier curve
        const t = projectile.progress;
        const x = Math.pow(1 - t, 2) * startX + 2 * (1 - t) * t * midX + Math.pow(t, 2) * endX;
        const y = Math.pow(1 - t, 2) * startY + 2 * (1 - t) * t * midY + Math.pow(t, 2) * endY;
        
        // Calculate rotation based on velocity direction
        const prevT = Math.max(0, t - 0.05);
        const prevX = Math.pow(1 - prevT, 2) * startX + 2 * (1 - prevT) * prevT * midX + Math.pow(prevT, 2) * endX;
        const prevY = Math.pow(1 - prevT, 2) * startY + 2 * (1 - prevT) * prevT * midY + Math.pow(prevT, 2) * endY;
        
        const velocityX = x - prevX;
        const velocityY = y - prevY;
        const rotation = Math.atan2(velocityY, velocityX) * (180 / Math.PI);
        
        return (
          <div
            key={projectile.id}
            className="absolute text-2xl"
            style={{
              left: x - 12,
              top: y - 12,
              transform: `rotate(${rotation}deg)`,
              transition: 'none',
              textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
              zIndex: 25
            }}
          >
            {projectile.emoji}
          </div>
        );
      })}
    </div>
  );
}