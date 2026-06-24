import React from 'react';
import { motion } from 'framer-motion';
import { SpriteRenderer } from './SpriteRenderer';
import { SpeechBubble } from './SpeechBubble';
import { MagicEffect } from './MagicEffect';
import type { SpriteDirection } from '@/hooks/useSpriteAnimation';
import type { Player, AvatarClass } from '@/lib/gameTypes';
import type { MagicEffectType } from '@/lib/utils/magicWords';

// Pure helper — deduped from both local-player and other-player branches in Lobby.tsx.
// Enlarge: 1.5x per stack. Reduce: [0.7, 0.5, 0.35] per stack.
export function computeSizeScale(sizeBuff?: { type: 'enlarge' | 'reduce'; stacks: number }): number {
  if (!sizeBuff) return 1;
  if (sizeBuff.type === 'enlarge') return 1 + (sizeBuff.stacks * 0.5);
  const reduceScales = [0.7, 0.5, 0.35];
  return reduceScales[sizeBuff.stacks - 1] || 0.35;
}

interface LobbyAvatarProps {
  player: Player;
  avatarClass: AvatarClass;                              // resolved from getAvatarClass(player) at call site
  position: { x: number; direction: SpriteDirection };
  jumpHeight: number;
  isMoving: boolean;
  isJumping: boolean;
  isDead: boolean;
  isFrozen: boolean;
  isPetrified: boolean;
  isFlying: boolean;
  isInvisible: boolean;
  showInvisibleBadge: boolean;    // true only for local player
  showReadyBadge: boolean;        // true only for other players
  sizeBuff?: { type: 'enlarge' | 'reduce'; stacks: number };
  speedBuff?: { type: 'haste' | 'slow'; stacks: number };
  emote?: { message: string };
  magicEffects?: MagicEffectType[];
  characterSize: number;
  interactive: boolean;           // true for local player (onClick, onTouchStart, cursor-pointer)
  opacity: number;                // caller computes: 0.5 (local invisible) | 0/0.2 (other invisible/flickering) | 1
  flyRotation?: number;           // local player only — computed from keys; 0 for other players
  pointerEventsDisabled?: boolean; // other invisible non-flickering players
  onTap?: () => void;
  onEmoteComplete?: () => void;
  onMagicEffectComplete?: () => void;
}

export const LobbyAvatar = React.memo(function LobbyAvatar({
  player,
  avatarClass,
  position,
  jumpHeight,
  isMoving,
  isJumping,
  isDead,
  isFrozen,
  isPetrified,
  isFlying,
  isInvisible,
  showInvisibleBadge,
  showReadyBadge,
  sizeBuff,
  speedBuff,
  emote,
  magicEffects,
  characterSize,
  interactive,
  opacity,
  flyRotation = 0,
  pointerEventsDisabled = false,
  onTap,
  onEmoteComplete,
  onMagicEffectComplete,
}: LobbyAvatarProps) {
  const sizeScale = computeSizeScale(sizeBuff);
  // Local player applies a 1.05x scale bonus while jumping
  const baseScale = (interactive && isJumping) ? 1.05 : 1;
  const totalScale = baseScale * sizeScale;

  const transformStr = isDead
    ? `scale(${totalScale}) rotate(90deg)`
    : (isFlying && interactive)
      ? `scale(${totalScale}) rotate(${flyRotation}deg)`
      : `scale(${totalScale})`;

  // Transition differs: local has no opacity transition; others do. Both suppress on jump/fly.
  const transitionStr = isDead
    ? 'transform 0.5s ease-out, bottom 0.5s ease-out'
    : interactive
      ? ((isJumping || isFlying) ? 'none' : 'transform 0.2s ease-out')
      : 'transform 0.2s ease-out, opacity 0.3s ease-in-out';

  // Local player is above other players in z-stack
  const zIndex = interactive ? 10 : 9;

  // Local player uses cursor-pointer/select-none and a tighter transition duration
  const wrapperClass = interactive
    ? 'absolute transition-transform duration-100 ease-linear cursor-pointer select-none'
    : 'absolute transition-transform duration-200 ease-out';

  const title = interactive
    ? (isFlying ? 'Use W/S or Up/Down to fly!' : (isInvisible ? 'You are invisible!' : 'Tap to jump!'))
    : undefined;

  // SpriteRenderer: idle when not moving, not dead, not jumping
  const showIdle = !isMoving && !isDead && !isJumping;

  const spriteAnimation = isDead ? 'death' : (isJumping ? 'victory' : 'walk');

  // Status filter for the inner wrapper (dead/frozen/petrified/spectator)
  const statusFilter = isDead
    ? 'grayscale(100%) brightness(0.7)'
    : isPetrified
    ? 'sepia(100%) saturate(50%) brightness(0.8) contrast(1.1)'
    : isFrozen
    ? 'hue-rotate(180deg) saturate(1.5) brightness(1.2)'
    : (player.team === 'spectators' ? 'hue-rotate(200deg) saturate(1.2)' : 'none');

  const statusAnimation = (isFrozen || isPetrified)
    ? 'none'
    : (player.team === 'spectators' && !isDead
      ? 'spectatorPulse 2s ease-in-out infinite'
      : 'none');

  return (
    <div
      className={wrapperClass}
      style={{
        left: `${position.x}px`,
        bottom: `${isDead ? -20 : jumpHeight}px`,
        zIndex,
        transform: transformStr,
        transformOrigin: 'bottom center',
        transition: transitionStr,
        opacity,
        pointerEvents: pointerEventsDisabled ? 'none' : 'auto',
      }}
      onClick={interactive ? onTap : undefined}
      onTouchStart={interactive ? (e) => { e.preventDefault(); onTap?.(); } : undefined}
      title={title}
    >
      {/* Player name + status badges */}
      <div className="text-center text-xs text-white bg-black/50 rounded px-1 mb-1">
        {player.name}
        {showReadyBadge && player.isReady && (
          <span className="text-green-400 ml-1" aria-label="Ready">
            ✓
          </span>
        )}
        {isDead && ' 💀'}
        {isFrozen && ' 🧊'}
        {isPetrified && ' 🗿'}
        {isFlying && ' 🪶'}
        {showInvisibleBadge && isInvisible && ' 👻'}
        {sizeBuff?.type === 'enlarge' && (
          <span className="text-orange-400">
            {' '}{'🔺'.repeat(sizeBuff.stacks)}
          </span>
        )}
        {sizeBuff?.type === 'reduce' && (
          <span className="text-blue-400">
            {' '}{'🔻'.repeat(sizeBuff.stacks)}
          </span>
        )}
        {speedBuff?.type === 'haste' && (
          <span className="text-lime-400">
            {' '}{'⚡'.repeat(speedBuff.stacks)}
          </span>
        )}
        {speedBuff?.type === 'slow' && ' 🐌'}
      </div>

      {/* Character sprite */}
      <div
        className={player.team === 'spectators' ? 'spectator-character' : ''}
        style={{
          filter: statusFilter,
          animation: statusAnimation,
        }}
      >
        {showIdle ? (
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
              repeatType: 'loop',
            }}
          >
            <SpriteRenderer
              avatarClass={avatarClass}
              animation="idle"
              direction={position.direction}
              isMoving={false}
              size={characterSize}
            />
          </motion.div>
        ) : (
          <SpriteRenderer
            avatarClass={avatarClass}
            animation={spriteAnimation}
            direction={position.direction}
            isMoving={isMoving}
            size={characterSize}
          />
        )}
      </div>

      {/* Speech bubble */}
      {emote && (
        <SpeechBubble
          message={emote.message}
          x={0}
          y={0}
          onComplete={() => onEmoteComplete?.()}
        />
      )}

      {/* Magic effects */}
      {magicEffects && magicEffects.map((effect, index) => (
        <MagicEffect
          key={`${player.id}-${effect}-${index}`}
          type={effect}
          x={characterSize / 2}
          y={0}
          onComplete={() => onMagicEffectComplete?.()}
        />
      ))}
    </div>
  );
});
