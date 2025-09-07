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

// Configuration for sprite sheet layout (actual images are 256x256 with 4x4 grid)
const SPRITE_CONFIG: SpriteConfig = {
  frameWidth: 64, // Each frame is 64px wide (256/4)
  frameHeight: 64, // Each frame is 64px tall (256/4)
  animations: {
    idle: { row: 0, frames: 1, speed: 1000, loop: true }, // Frame 0: Idle pose
    walk: { row: 0, frames: 4, speed: 200, loop: true }, // Will be overridden by direction
    attack: { row: 3, frames: 1, speed: 150, loop: false }, // Frame 13: Attack action
    cast: { row: 3, frames: 1, speed: 200, loop: false }, // Frame 14: Cast action
    death: { row: 3, frames: 1, speed: 400, loop: false }, // Frame 15: Damage/Death
    victory: { row: 0, frames: 1, speed: 1000, loop: false } // Use idle pose for victory
  },
  directions: {
    down: 0,  // Row 0: Idle + Walk Down (frames 0-3)
    left: 1,  // Row 1: Walk Left (frames 4-7)
    right: 2, // Row 2: Walk Right (frames 8-11)
    up: 3     // Row 3: Walk Up + Combat (frames 12-15)
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

  // Get sprite sheet URL from organized directory
  const spriteSheetUrl = `/images/sprites/${avatarClass}.png`;

  // Determine which animation config to use
  const getAnimationConfig = () => {
    let config = SPRITE_CONFIG.animations[animation];
    
    // For walk animation, use direction-specific row and frames
    if (animation === 'walk' && isMoving) {
      config = {
        ...config,
        row: SPRITE_CONFIG.directions[direction],
        frames: direction === 'up' ? 1 : 4 // Row 3 only has 1 walk frame (frame 12)
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
    let col = currentFrame;
    
    // For specific combat actions, use fixed column positions
    if (animation === 'attack') {
      col = 1; // Frame 13 (row 3, col 1)
    } else if (animation === 'cast') {
      col = 2; // Frame 14 (row 3, col 2)
    } else if (animation === 'death') {
      col = 3; // Frame 15 (row 3, col 3)
    }
    
    // Simplified frame calculation debug
    if (col > 3 || row > 3) {
      console.warn(`⚠️ Frame out of bounds: ${avatarClass} col=${col} row=${row}`);
    }
    
    console.log(`🎯 ${avatarClass}: frame(${col},${row}) size=${frameWidth}x${frameHeight}`);
    
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