import React from 'react';
import { useSpriteAnimation, SpriteAnimation, SpriteDirection } from '@/hooks/useSpriteAnimation';
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

  const displaySize = frameSize.width * size;

  return (
    <div
      className={`sprite-renderer ${className}`}
      style={{
        width: displaySize,
        height: displaySize,
        backgroundImage: `url(${spriteSheetUrl})`,
        backgroundPosition: `-${spriteFrame.x * size}px -${spriteFrame.y * size}px`,
        backgroundSize: `${frameSize.width * 4 * size}px ${frameSize.height * 3 * size}px`, // 4 columns x 3 rows minimum
        backgroundRepeat: 'no-repeat',
        transform: shouldFlip ? 'scaleX(-1)' : 'scaleX(1)',
        imageRendering: 'pixelated', // Maintain pixel art sharpness
        ...style
      }}
    />
  );
}