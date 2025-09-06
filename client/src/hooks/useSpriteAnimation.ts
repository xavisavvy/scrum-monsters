import { useState, useEffect, useRef } from 'react';
import { AvatarClass } from '@/lib/gameTypes';

export type SpriteDirection = 'down' | 'left' | 'right' | 'up';
export type SpriteAnimation = 'idle' | 'walk' | 'attack' | 'cast' | 'death' | 'victory';

interface SpriteConfig {
  frameWidth: number;
  frameHeight: number;
  animations: {
    [key in SpriteAnimation]: {
      row: number;
      frames: number;
      speed: number; // milliseconds per frame
      loop?: boolean;
    };
  };
  directions: {
    [key in SpriteDirection]: number; // row index for directional walk cycles
  };
}

// Configuration for sprite sheet layout
const SPRITE_CONFIG: SpriteConfig = {
  frameWidth: 24, // Each frame is 24px wide
  frameHeight: 24, // Each frame is 24px tall
  animations: {
    idle: { row: 0, frames: 1, speed: 1000, loop: true }, // Use first frame of down walk
    walk: { row: 0, frames: 4, speed: 200, loop: true }, // Will be overridden by direction
    attack: { row: 2, frames: 4, speed: 150, loop: false }, // Third row combat actions
    cast: { row: 2, frames: 4, speed: 200, loop: false }, // Same row, different interpretation
    death: { row: 2, frames: 3, speed: 400, loop: false }, // Death animation frames
    victory: { row: 2, frames: 1, speed: 1000, loop: false } // Victory pose
  },
  directions: {
    down: 0,  // Row 0: Walk down
    left: 1,  // Row 1: Walk left  
    right: 1, // Row 1: Walk left (we'll flip horizontally)
    up: 1     // Row 1: Walk left (placeholder, could be row 3 if available)
  }
};

interface UseSpriteAnimationProps {
  avatarClass: AvatarClass;
  animation: SpriteAnimation;
  direction?: SpriteDirection;
  isMoving?: boolean;
}

interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useSpriteAnimation({
  avatarClass,
  animation,
  direction = 'down',
  isMoving = false
}: UseSpriteAnimationProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const animationRef = useRef<number>();
  const lastFrameTime = useRef(0);

  // Get sprite sheet URL
  const spriteSheetUrl = `/sprites/${avatarClass}.png`;

  // Determine which animation config to use
  const getAnimationConfig = () => {
    let config = SPRITE_CONFIG.animations[animation];
    
    // For walk animation, use direction-specific row
    if (animation === 'walk' && isMoving) {
      config = {
        ...config,
        row: SPRITE_CONFIG.directions[direction]
      };
    } else if (animation === 'walk' && !isMoving) {
      // If not moving, show idle (first frame of walk cycle)
      config = SPRITE_CONFIG.animations.idle;
    }
    
    return config;
  };

  const animConfig = getAnimationConfig();

  // Calculate current frame position in sprite sheet
  const getCurrentSpriteFrame = (): SpriteFrame => {
    const { frameWidth, frameHeight } = SPRITE_CONFIG;
    const row = animConfig.row;
    const col = currentFrame;
    
    return {
      x: col * frameWidth,
      y: row * frameHeight,
      width: frameWidth,
      height: frameHeight
    };
  };

  // Animation loop
  useEffect(() => {
    if (!animConfig.loop && isAnimationComplete) {
      return;
    }

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastFrameTime.current;
      
      if (deltaTime >= animConfig.speed) {
        setCurrentFrame(prev => {
          const nextFrame = prev + 1;
          
          // Check if animation should loop or stop
          if (nextFrame >= animConfig.frames) {
            if (animConfig.loop) {
              return 0; // Loop back to first frame
            } else {
              setIsAnimationComplete(true);
              return prev; // Stay on last frame
            }
          }
          
          return nextFrame;
        });
        
        lastFrameTime.current = currentTime;
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animConfig, isAnimationComplete]);

  // Reset animation when animation type changes
  useEffect(() => {
    setCurrentFrame(0);
    setIsAnimationComplete(false);
    lastFrameTime.current = 0;
  }, [animation, direction, isMoving]);

  const spriteFrame = getCurrentSpriteFrame();
  
  // Determine if sprite should be horizontally flipped
  const shouldFlip = direction === 'right'; // Flip left-facing sprites for right direction

  return {
    spriteSheetUrl,
    spriteFrame,
    shouldFlip,
    isAnimationComplete,
    frameSize: {
      width: SPRITE_CONFIG.frameWidth,
      height: SPRITE_CONFIG.frameHeight
    }
  };
}