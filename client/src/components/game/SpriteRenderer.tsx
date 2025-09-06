import React from 'react';
import { useSpriteAnimation, SpriteAnimation, SpriteDirection } from '@/hooks/useSpriteAnimation';
import { useImageDimensions } from '@/hooks/useImageDimensions';
import { AvatarClass } from '@/lib/gameTypes';

interface SpriteRendererProps {
  avatarClass: AvatarClass;
  animation: SpriteAnimation;
  direction?: SpriteDirection;
  isMoving?: boolean;
  size?: number; // Size multiplier (default 1 = 24px)
  className?: string;
  style?: React.CSSProperties;
}

export function SpriteRenderer({
  avatarClass,
  animation,
  direction = 'down',
  isMoving = false,
  size = 2.5, // Default to 2.5x scale (60px)
  className = '',
  style = {}
}: SpriteRendererProps) {
  const {
    spriteSheetUrl,
    spriteFrame,
    shouldFlip,
    frameSize
  } = useSpriteAnimation({
    avatarClass,
    animation,
    direction,
    isMoving
  });

  const imageDimensions = useImageDimensions(spriteSheetUrl);
  
  // Fixed display size
  const displaySize = 60;
  
  if (imageDimensions.loaded) {
    // For 1024x1024 images with 4x4 grid: each frame is 256x256
    const actualFrameWidth = imageDimensions.width / 4;
    const actualFrameHeight = imageDimensions.height / 4;
    
    // Calculate which frame we want (column and row)
    const frameCol = Math.floor(spriteFrame.x / frameSize.width);
    const frameRow = Math.floor(spriteFrame.y / frameSize.height);
    
    console.log(`🎯 ${avatarClass}: frame(${frameCol},${frameRow}) size=${actualFrameWidth}x${actualFrameHeight}`);
    
    // Scale to fit our display size
    const scale = displaySize / actualFrameWidth;
    
    return (
      <div
        className={`sprite-renderer ${className}`}
        style={{
          width: displaySize,
          height: displaySize,
          backgroundImage: `url(${spriteSheetUrl})`,
          backgroundPosition: `-${frameCol * displaySize}px -${frameRow * displaySize}px`,
          backgroundSize: `${imageDimensions.width * scale}px ${imageDimensions.height * scale}px`,
          backgroundRepeat: 'no-repeat',
          transform: shouldFlip ? 'scaleX(-1)' : 'scaleX(1)',
          imageRendering: 'pixelated',
          ...style
        }}
      />
    );
  }

  // Fallback for when image hasn't loaded yet
  return (
    <div
      className={`sprite-renderer ${className}`}
      style={{
        width: displaySize,
        height: displaySize,
        backgroundImage: `url(${spriteSheetUrl})`,
        backgroundPosition: `-${spriteFrame.x * size / frameSize.width * displaySize}px -${spriteFrame.y * size / frameSize.height * displaySize}px`,
        backgroundSize: `${displaySize * 4}px ${displaySize * 4}px`, // 4x4 grid fallback
        backgroundRepeat: 'no-repeat',
        transform: shouldFlip ? 'scaleX(-1)' : 'scaleX(1)',
        imageRendering: 'pixelated',
        ...style
      }}
    />
  );
}