import React, { useState, useEffect, useRef } from 'react';
import { AvatarClass, AVATAR_CLASSES } from '@/lib/gameTypes';
import { useGameState } from '@/lib/stores/useGameState';
import { SpriteRenderer } from './SpriteRenderer';
import { SpriteAnimation, SpriteDirection } from '@/hooks/useSpriteAnimation';

export interface PlayerPosition {
  x: number;
  y: number;
}

export interface Projectile {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  emoji: string;
  targetPlayerId?: string;
}

interface PlayerCharacterProps {
  avatarClass: AvatarClass;
  playerName: string;
  position: PlayerPosition;
  onPositionChange: (position: PlayerPosition) => void;
  onShoot: (projectile: Omit<Projectile, 'id' | 'progress'>) => void;
  isJumping: boolean;
  isDead: boolean;
  containerWidth: number;
  containerHeight: number;
  playerId?: string;
  isMoving?: boolean;
  direction?: SpriteDirection;
}


export function PlayerCharacter({
  avatarClass,
  playerName,
  position,
  onPositionChange,
  onShoot,
  isJumping,
  isDead,
  containerWidth,
  containerHeight,
  playerId,
  isMoving = false,
  direction = 'down'
}: PlayerCharacterProps) {
  const [isDamaged, setIsDamaged] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedAttackId = useRef<string | null>(null);
  
  const { currentLobby, attackAnimations } = useGameState();

  const character = AVATAR_CLASSES[avatarClass];
  const characterSize = 60; // Size of character sprite (24px * 2.5 scale)
  
  // Get current player's combat state
  const combatState = currentLobby && playerId ? currentLobby.playerCombatStates?.[playerId] : null;
  const currentHp = combatState?.hp || 100;
  const maxHp = combatState?.maxHp || 100;
  const healthPercentage = (currentHp / maxHp) * 100;

  // Determine sprite animation based on character state
  const getSpriteAnimation = (): SpriteAnimation => {
    if (isDead) return 'death';
    if (isJumping) return 'victory'; // Use victory pose for jumping
    if (isMoving) return 'walk';
    return 'idle';
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Watch for NEW attack animations targeting this player to trigger damage flash
  useEffect(() => {
    if (attackAnimations.length > 0 && playerId) {
      const latestAttack = attackAnimations[attackAnimations.length - 1];
      
      // Only trigger flash for attacks targeting this player that are new
      if (latestAttack.id !== lastProcessedAttackId.current) {
        // Check if this attack is targeting this player (boss attacks or spectator attacks)
        const isTargetedAtThisPlayer = latestAttack.playerId === 'boss' || // Boss attacks affect everyone
                                     latestAttack.playerId === playerId; // Direct player attacks
        
        if (isTargetedAtThisPlayer) {
          console.log('🎨 Player damage effect triggered for attack:', latestAttack.id);
          lastProcessedAttackId.current = latestAttack.id;
          setIsDamaged(true);
          
          // Clear any existing timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          
          // Set new timeout for damage flash
          timeoutRef.current = setTimeout(() => {
            setIsDamaged(false);
            timeoutRef.current = null;
          }, 400); // Flash for 400ms
        }
      }
    }
  }, [attackAnimations, playerId]);

  // Current sprite animation
  const spriteAnimation = getSpriteAnimation();

  // Get projectile emoji based on class
  const getProjectileEmoji = (): string => {
    const projectileEmojis = {
      ranger: '🏹',
      rogue: '🔪', 
      bard: '🎵',
      sorcerer: '🔥',
      wizard: '⚡',
      warrior: '⚔️',
      paladin: '✨',
      cleric: '💫'
    };
    
    return projectileEmojis[avatarClass];
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isDead) return;
    
    // Don't handle clicks on the character itself - let them bubble up to parent
    // This allows clicking anywhere else on the screen to shoot projectiles
  };

  return (
    <div
      className="absolute pointer-events-auto cursor-crosshair"
      style={{
        left: position.x,
        bottom: position.y,
        width: characterSize,
        height: characterSize,
        transition: 'bottom 0.3s ease-out', // Smooth jump animation
        zIndex: 65
      }}
      onClick={handleClick}
    >
      {/* Character Sprite */}
      <SpriteRenderer
        avatarClass={avatarClass}
        animation={spriteAnimation}
        direction={direction}
        isMoving={isMoving}
        size={2.5}
        className="w-full h-full"
        style={{
          filter: isDamaged 
            ? `brightness(2.5) contrast(2) saturate(1.5) hue-rotate(15deg) drop-shadow(2px 2px 4px ${character.color})`
            : `drop-shadow(2px 2px 4px ${character.color})`,
          transform: isDamaged ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.1s ease, filter 0.1s ease'
        }}
      />
      
      {/* Character Name Label */}
      <div 
        className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs font-bold text-white bg-black bg-opacity-70 px-2 py-1 rounded whitespace-nowrap"
        style={{ color: character.color }}
      >
        {playerName}
      </div>
      
      {/* Health Bar */}
      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gray-600 rounded overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ${
            healthPercentage > 60 ? 'bg-green-500' : 
            healthPercentage > 30 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: isDead ? '0%' : `${Math.max(0, healthPercentage)}%` }}
        />
      </div>
    </div>
  );
}