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
  
  // Configuration
  const cols = 4;
  const rows = 4; // Changed from 3 to 4 since images are 1024x1024 (square)
  
  // Calculate actual frame size based on image dimensions  
  const actualFrameWidth = imageDimensions.loaded ? imageDimensions.width / cols : frameSize.width;
  const actualFrameHeight = imageDimensions.loaded ? imageDimensions.height / rows : frameSize.height;
  
  // Fixed display size for consistency
  const displaySize = 60;
  
  // Calculate scaling factor to fit frame into display size
  const scale = imageDimensions.loaded ? displaySize / actualFrameWidth : size;
  
  // Calculate current frame position in actual pixels
  const frameCol = Math.floor(spriteFrame.x / frameSize.width);
  const frameRow = Math.floor(spriteFrame.y / frameSize.height);
  
  // Position in display coordinates (scaled to fit displaySize)
  const displayFrameX = frameCol * displaySize;
  const displayFrameY = frameRow * displaySize;

  return (
    <div
      className={`sprite-renderer ${className}`}
      style={{
        width: displaySize,
        height: displaySize,
        backgroundImage: `url(${spriteSheetUrl})`,
        backgroundPosition: `-${displayFrameX}px -${displayFrameY}px`,
        backgroundSize: imageDimensions.loaded ? 
          `${imageDimensions.width * scale}px ${imageDimensions.height * scale}px` :
          `${frameSize.width * cols * scale}px ${frameSize.height * rows * scale}px`, // Fallback to 4x4
        backgroundRepeat: 'no-repeat',
        transform: shouldFlip ? 'scaleX(-1)' : 'scaleX(1)',
        imageRendering: 'pixelated', // Maintain pixel art sharpness
        ...style
      }}
    />
  );
}