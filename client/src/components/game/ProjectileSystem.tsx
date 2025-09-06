import React, { useEffect, useState } from 'react';
import { Projectile } from './PlayerCharacter';

interface ProjectileSystemProps {
  projectiles: Projectile[];
  onProjectileComplete: (projectile: Projectile) => void;
}

export function ProjectileSystem({ projectiles, onProjectileComplete }: ProjectileSystemProps) {
  const [animatedProjectiles, setAnimatedProjectiles] = useState<Projectile[]>([]);

  useEffect(() => {
    console.log('🎯 ProjectileSystem received projectiles:', projectiles);
    setAnimatedProjectiles(projectiles);
  }, [projectiles]);

  useEffect(() => {
    let animationFrame: number;
    
    const animateProjectiles = () => {
      setAnimatedProjectiles(prev => {
        if (prev.length === 0) return prev;
        
        const updatedProjectiles = prev.map(projectile => {
          const newProgress = Math.min(1, projectile.progress + 0.03); // 3% progress per frame for smoother animation
          return { ...projectile, progress: newProgress };
        });
        
        // Find completed projectiles and call completion handler
        const completedProjectiles = updatedProjectiles.filter(p => p.progress >= 1);
        completedProjectiles.forEach(projectile => {
          // Call completion handler immediately 
          onProjectileComplete(projectile);
        });
        
        // Remove completed projectiles for better performance
        const activeProjectiles = updatedProjectiles.filter(p => p.progress < 1);
        
        return activeProjectiles;
      });
      
      // Continue animation if there are still projectiles
      animationFrame = requestAnimationFrame(animateProjectiles);
    };

    if (animatedProjectiles.length > 0) {
      animationFrame = requestAnimationFrame(animateProjectiles);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [animatedProjectiles.length, onProjectileComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
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
            className="absolute text-6xl"
            style={{
              left: x - 30,
              top: y - 30,
              transform: `rotate(${rotation}deg)`,
              transition: 'none',
              textShadow: '3px 3px 6px rgba(0,0,0,0.9)',
              zIndex: 25,
              filter: 'drop-shadow(0 0 8px rgba(255,0,0,0.5))'
            }}
          >
            {projectile.emoji}
          </div>
        );
      })}
    </div>
  );
}