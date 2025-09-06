import React, { useState, useEffect, useRef } from 'react';
import { AvatarClass, AVATAR_CLASSES } from '@/lib/gameTypes';
import { useGameState } from '@/lib/stores/useGameState';

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
}

type AnimationState = 'idle' | 'walk' | 'jump' | 'death';

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
  playerId
}: PlayerCharacterProps) {
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [spriteFrame, setSpriteFrame] = useState(0);
  const [facingRight, setFacingRight] = useState(true);
  const [isDamaged, setIsDamaged] = useState(false);
  const animationFrameRef = useRef<number>();
  const lastFrameTime = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedAttackId = useRef<string | null>(null);
  
  const { currentLobby, attackAnimations } = useGameState();

  const character = AVATAR_CLASSES[avatarClass];
  const characterSize = 64; // Size of character sprite
  
  // Get current player's combat state
  const combatState = currentLobby && playerId ? currentLobby.playerCombatStates?.[playerId] : null;
  const currentHp = combatState?.hp || 100;
  const maxHp = combatState?.maxHp || 100;
  const healthPercentage = (currentHp / maxHp) * 100;

  // Sprite frame counts for each animation
  const frameConfig = {
    idle: { frames: 4, speed: 500 }, // Change frame every 500ms
    walk: { frames: 6, speed: 150 }, // Change frame every 150ms
    jump: { frames: 3, speed: 200 }, // Change frame every 200ms
    death: { frames: 5, speed: 300 }  // Change frame every 300ms
  };

  // Update animation state based on props
  useEffect(() => {
    if (isDead) {
      setAnimationState('death');
    } else if (isJumping) {
      setAnimationState('jump');
    } else {
      setAnimationState('idle');
    }
  }, [isDead, isJumping]);

  // Animation loop
  useEffect(() => {
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastFrameTime.current;
      const config = frameConfig[animationState];
      
      if (deltaTime >= config.speed) {
        setSpriteFrame(prev => (prev + 1) % config.frames);
        lastFrameTime.current = currentTime;
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animationState]);

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

  // Generate emoji sprite based on class and animation
  const getCharacterEmoji = (): string => {
    const classEmojis = {
      ranger: { idle: '🏹', walk: '🏃‍♂️', jump: '🤸‍♂️', death: '💀' },
      rogue: { idle: '🗡️', walk: '🥷', jump: '🤸‍♂️', death: '💀' },
      bard: { idle: '🎵', walk: '🕺', jump: '🤸‍♂️', death: '💀' },
      sorcerer: { idle: '🔮', walk: '🧙‍♂️', jump: '🤸‍♂️', death: '💀' },
      wizard: { idle: '🧙‍♂️', walk: '🧙‍♂️', jump: '🤸‍♂️', death: '💀' },
      warrior: { idle: '⚔️', walk: '🛡️', jump: '🤸‍♂️', death: '💀' },
      paladin: { idle: '✨', walk: '🛡️', jump: '🤸‍♂️', death: '💀' },
      cleric: { idle: '✨', walk: '🙏', jump: '🤸‍♂️', death: '💀' }
    };
    
    return classEmojis[avatarClass][animationState];
  };

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
        transform: `scaleX(${facingRight ? 1 : -1})`,
        transition: 'bottom 0.3s ease-out', // Smooth jump animation
        zIndex: 20
      }}
      onClick={handleClick}
    >
      {/* Character Sprite */}
      <div
        className="w-full h-full flex items-center justify-center text-4xl"
        style={{
          filter: isDamaged 
            ? `brightness(2.5) contrast(2) saturate(1.5) hue-rotate(15deg) drop-shadow(2px 2px 4px ${character.color})`
            : `drop-shadow(2px 2px 4px ${character.color})`,
          animation: animationState === 'walk' ? 'character-bob 0.3s ease-in-out infinite' : 'none',
          transform: isDamaged ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.1s ease, filter 0.1s ease'
        }}
      >
        {getCharacterEmoji()}
      </div>
      
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