import React, { useEffect, useState, useRef } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { useAudio } from '@/lib/stores/useAudio';
import { Boss } from '@/lib/gameTypes';
import { ExplosionAnimation } from './ExplosionAnimation';

// Boss images and lair backgrounds (using public URLs for better performance)
const bugHydraImg = '/images/bosses/bug-hydra.png';
const sprintDemonImg = '/images/bosses/sprint-demon.png';
const deadlineDragonImg = '/images/bosses/deadline-dragon.png';
const techDebtGolemImg = '/images/bosses/technical-debt-golem.png';
const scopeCreepBeastImg = '/images/bosses/scope-creep-beast.png';

const bugHydraLair = '/images/lairs/Bug_Hydra_Cave_Lair_a07f8108.png';
const sprintDemonLair = '/images/lairs/Sprint_Demon_Volcano_Lair_01853ccf.png';
const deadlineDragonLair = '/images/lairs/Deadline_Dragon_Clocktower_Lair_5c2916e4.png';
const techDebtGolemLair = '/images/lairs/Technical_Debt_Golem_Temple_f7e377fe.png';
const scopeCreepBeastLair = '/images/lairs/Scope_Creep_Beast_Void_bd13cec0.png';

// Boss image mapping with simplified names
const BOSS_IMAGE_MAP: Record<string, string> = {
  'bug-hydra.png': bugHydraImg,
  'sprint-demon.png': sprintDemonImg,
  'deadline-dragon.png': deadlineDragonImg,
  'technical-debt-golem.png': techDebtGolemImg,
  'scope-creep-beast.png': scopeCreepBeastImg,
};

// Lair background mapping
const LAIR_BACKGROUND_MAP: Record<string, string> = {
  'bug-hydra.png': bugHydraLair,
  'sprint-demon.png': sprintDemonLair,
  'deadline-dragon.png': deadlineDragonLair,
  'technical-debt-golem.png': techDebtGolemLair,
  'scope-creep-beast.png': scopeCreepBeastLair,
};

const getBossImage = (sprite: string): string => {
  const image = BOSS_IMAGE_MAP[sprite];
  if (!image) {
    console.warn(`Unknown boss sprite: ${sprite}, falling back to Bug Hydra`);
    return bugHydraImg;
  }
  return image;
};

const getLairBackground = (sprite: string): string => {
  const background = LAIR_BACKGROUND_MAP[sprite];
  if (!background) {
    console.warn(`Unknown lair background for sprite: ${sprite}, falling back to Bug Hydra lair`);
    return bugHydraLair;
  }
  return background;
};

interface BossDisplayProps {
  boss: Boss;
  onAttack?: () => void;
  fullscreen?: boolean;
}

interface DamageEffect {
  id: string;
  damage: number;
  x: number;
  y: number;
  timestamp: number;
}

export function BossDisplay({ boss, onAttack, fullscreen = false }: BossDisplayProps) {
  const [isDamaged, setIsDamaged] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isDeathAnimationActive, setIsDeathAnimationActive] = useState(false);
  const [deathAnimationStarted, setDeathAnimationStarted] = useState(false);
  const { attackAnimations } = useGameState();
  const { playExplosion, fadeOutBossMusicSlowly } = useAudio();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedAttackId = useRef<string | null>(null);
  const deathAnimationRef = useRef<NodeJS.Timeout | null>(null);

  // No need to load explosion sound separately - using central audio store

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (deathAnimationRef.current) {
        clearTimeout(deathAnimationRef.current);
        deathAnimationRef.current = null;
      }
    };
  }, []);

  // Handle boss death animation trigger
  useEffect(() => {
    if (boss.defeated && !deathAnimationStarted) {
      console.log('🔥 Boss defeated! Starting epic death animation');
      setDeathAnimationStarted(true);
      setIsDeathAnimationActive(true);
      
      // Play multiple layered explosion sounds
      setTimeout(() => playExplosion(), 0);
      setTimeout(() => playExplosion(), 200);
      setTimeout(() => playExplosion(), 400);
      setTimeout(() => playExplosion(), 800);
      
      // Fade out boss music slowly over 5 seconds
      fadeOutBossMusicSlowly();
      
      // Reset death animation after it completes
      deathAnimationRef.current = setTimeout(() => {
        setIsDeathAnimationActive(false);
      }, 3000);
    }
    
    // Reset if boss is no longer defeated (new level)
    if (!boss.defeated && deathAnimationStarted) {
      setDeathAnimationStarted(false);
      setIsDeathAnimationActive(false);
      if (deathAnimationRef.current) {
        clearTimeout(deathAnimationRef.current);
        deathAnimationRef.current = null;
      }
    }
  }, [boss.defeated, deathAnimationStarted, playExplosion, fadeOutBossMusicSlowly]);

  // Watch for NEW attack animations to trigger damage flash effects
  useEffect(() => {
    if (attackAnimations.length > 0) {
      const latestAttack = attackAnimations[attackAnimations.length - 1];
      
      // Only trigger flicker for new attacks, not repeated renders
      if (latestAttack.id !== lastProcessedAttackId.current) {
        console.log('🎨 Boss damage effect triggered for NEW attack:', latestAttack.id);
        lastProcessedAttackId.current = latestAttack.id;
        setIsDamaged(true);
        
        // Play explosion sound using central audio store
        playExplosion();
        
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        // Set new timeout and store reference for flickering effect
        timeoutRef.current = setTimeout(() => {
          setIsDamaged(false);
          timeoutRef.current = null;
        }, 300); // Slightly longer flash for projectile hits
      }
    }
  }, [attackAnimations, playExplosion]);

  const healthPercentage = (boss.currentHealth / boss.maxHealth) * 100;

  const handleBossClick = () => {
    if (onAttack) {
      onAttack();
      setIsDamaged(true);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Set new timeout and store reference
      timeoutRef.current = setTimeout(() => {
        setIsDamaged(false);
        timeoutRef.current = null;
      }, 500);
    }
  };

  const renderBossSprite = () => {
    const bossImage = getBossImage(boss.sprite);
    const lairBackground = getLairBackground(boss.sprite);
    
    if (fullscreen) {
      return (
        <div className="fixed inset-0 z-0">
          {/* Lair Background */}
          <img
            src={lairBackground}
            alt={`${boss.name} lair`}
            className="w-full h-full object-cover"
            style={{
              imageRendering: 'pixelated'
            }}
          />
          
          {/* Dimming overlay for better UI readability */}
          <div className="absolute inset-0 bg-black bg-opacity-20 pointer-events-none" />
          
          {/* Boss Sprite positioned in center */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative">
              {/* Explosion Animation Overlay */}
              {isDeathAnimationActive && (
                <ExplosionAnimation 
                  isActive={isDeathAnimationActive} 
                  onComplete={() => {
                    console.log('🎆 Explosion animation completed');
                  }}
                />
              )}
              
              <img
                src={bossImage}
                alt={boss.name}
                className={`boss-sprite ${isDamaged ? 'boss-damaged' : ''} ${!boss.defeated ? 'boss-hovering' : ''} ${isDeathAnimationActive ? 'boss-death-animation' : ''}`}
                style={{
                  maxWidth: '400px',
                  maxHeight: '400px',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                  transition: isDamaged || isDeathAnimationActive ? 'none' : 'all 0.3s ease',
                  transform: isDeathAnimationActive 
                    ? 'scale(1.2) rotate(360deg)' 
                    : isDamaged ? 'scale(1.15)' : 'scale(1)',
                  filter: isDeathAnimationActive
                    ? 'brightness(1.8) contrast(1.5) saturate(2) hue-rotate(0deg) drop-shadow(0 0 20px #ff0000)'
                    : isDamaged ? 'brightness(2.5) contrast(2) saturate(1.5) hue-rotate(15deg)' : 'none',
                  opacity: isDeathAnimationActive ? 0 : 1,
                  animation: isDeathAnimationActive 
                    ? 'boss-death-sequence 3s ease-out forwards, boss-death-flicker 0.2s linear infinite' 
                    : 'none',
                  cursor: onAttack ? 'pointer' : 'default',
                  pointerEvents: 'auto'
                }}
                onClick={handleBossClick}
                onError={() => {
                  console.error(`Failed to load boss image: ${boss.sprite}`);
                  setImageError(true);
                }}
              />
              
              {/* Fallback if boss image fails to load */}
              {imageError && (
                <div 
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    cursor: onAttack ? 'pointer' : 'default',
                    pointerEvents: 'auto'
                  }}
                  onClick={handleBossClick}
                >
                  <div className="text-center text-white">
                    <div className="text-8xl mb-4">👾</div>
                    <div className="text-2xl">{boss.name}</div>
                  </div>
                </div>
              )}
              
              {/* Damage phase indicator around boss */}
              {boss.phase > 1 && (
                <div
                  className="absolute inset-0 border-4 border-orange-500 rounded-full pointer-events-none"
                  style={{
                    animation: 'pulse 8s infinite',
                    boxShadow: '0 0 30px rgba(255, 102, 0, 0.8)'
                  }}
                />
              )}
            </div>
          </div>
          
          {/* Attack Animations for fullscreen */}
          {attackAnimations.map(animation => (
            <div
              key={animation.id}
              className="damage-animation absolute text-4xl font-bold pointer-events-none"
              style={{
                left: `${animation.x}%`,
                top: `${animation.y}%`,
                animation: 'float-up 2s ease-out forwards',
                color: '#ff6600',
                textShadow: '2px 2px 4px #000',
                zIndex: 15
              }}
            >
              -{animation.damage}
            </div>
          ))}
        </div>
      );
    }
    
    return (
      <div className="relative flex justify-center items-center" style={{ width: '300px', height: '300px' }}>
        {/* Explosion Animation Overlay for non-fullscreen */}
        {isDeathAnimationActive && (
          <ExplosionAnimation 
            isActive={isDeathAnimationActive} 
            onComplete={() => {
              console.log('🎆 Explosion animation completed (non-fullscreen)');
            }}
          />
        )}
        
        <img
          src={bossImage}
          alt={boss.name}
          className={`boss-sprite ${isDamaged ? 'boss-damaged' : ''} ${isDeathAnimationActive ? 'boss-death-animation' : ''}`}
          style={{
            maxWidth: '300px',
            maxHeight: '300px',
            objectFit: 'contain',
            imageRendering: 'pixelated',
            cursor: onAttack ? 'pointer' : 'default',
            transition: isDamaged || isDeathAnimationActive ? 'none' : 'all 0.3s ease',
            transform: isDeathAnimationActive 
              ? 'scale(1.2) rotate(360deg)' 
              : 'scale(1)',
            filter: isDeathAnimationActive
              ? 'brightness(1.8) contrast(1.5) saturate(2) hue-rotate(0deg) drop-shadow(0 0 15px #ff0000)'
              : isDamaged ? 'brightness(1.5) contrast(1.2)' : 'none',
            opacity: isDeathAnimationActive ? 0 : 1,
            animation: isDeathAnimationActive 
              ? 'boss-death-sequence 3s ease-out forwards, boss-death-flicker 0.2s linear infinite' 
              : 'none'
          }}
          onClick={handleBossClick}
          onError={() => {
            console.error(`Failed to load boss image: ${boss.sprite}`);
            setImageError(true);
          }}
        />
        
        {/* Fallback if image fails to load */}
        {imageError && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-gray-800 border-2 border-red-500 rounded"
            style={{ cursor: onAttack ? 'pointer' : 'default' }}
            onClick={handleBossClick}
          >
            <div className="text-center text-white">
              <div className="text-4xl mb-2">👾</div>
              <div className="text-sm">{boss.name}</div>
            </div>
          </div>
        )}
        
        {/* Damage phase indicator */}
        {boss.phase > 1 && (
          <div
            className="absolute inset-0 border-4 border-orange-500 rounded-lg pointer-events-none"
            style={{
              animation: 'glow 8s infinite alternate',
              boxShadow: '0 0 20px rgba(255, 102, 0, 0.6)'
            }}
          />
        )}
      </div>
    );
  };

  if (fullscreen) {
    return (
      <>
        {renderBossSprite()}
        
        {/* Fullscreen UI Overlay */}
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20">
          <div className="text-center bg-black bg-opacity-70 rounded-lg p-4 border-2 border-gray-600">
            <h2 className="text-2xl font-bold retro-text-glow mb-2">
              {boss.name}
            </h2>
            <p className="text-sm text-gray-400 mb-3">
              Phase {boss.phase} of {boss.maxPhases}
            </p>
            
            {/* Health Bar */}
            <div className="retro-health-bar mx-auto" style={{ width: '300px' }}>
              <div
                className="retro-health-fill"
                style={{ width: `${healthPercentage}%` }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  right: '0',
                  bottom: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textShadow: '1px 1px 2px #000'
                }}
              >
                {boss.currentHealth} / {boss.maxHealth}
              </div>
            </div>
            
            {onAttack && (
              <div className="text-center mt-3">
                <p className="text-xs text-gray-300">
                  Hit Tab for controls
                </p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="relative">
      {/* Boss Name and Phase */}
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold retro-text-glow mb-2">
          {boss.name}
        </h2>
        <p className="text-sm text-gray-400">
          Phase {boss.phase} of {boss.maxPhases}
        </p>
      </div>

      {/* Boss Sprite */}
      <div className="flex justify-center mb-4 relative">
        {renderBossSprite()}
        
        {/* Attack Animations */}
        {!fullscreen && attackAnimations.map(animation => (
          <div
            key={animation.id}
            className="damage-animation"
            style={{
              left: `${animation.x}%`,
              top: `${animation.y}%`
            }}
          >
            -{animation.damage}
          </div>
        ))}
      </div>

      {/* Health Bar */}
      <div className="retro-health-bar mx-auto" style={{ width: '300px' }}>
        <div
          className="retro-health-fill"
          style={{ width: `${healthPercentage}%` }}
        />
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold',
            textShadow: '1px 1px 2px #000'
          }}
        >
          {boss.currentHealth} / {boss.maxHealth}
        </div>
      </div>

      {onAttack && (
        <div className="text-center mt-4">
          <p className="text-sm text-gray-400">
            Click the boss to attack while waiting for team scores!
          </p>
        </div>
      )}
    </div>
  );
}
