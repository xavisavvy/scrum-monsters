import React, { useEffect, useState, useRef } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { Boss } from '@/lib/gameTypes';

// Import boss images
import bugHydraImg from '@/assets/bosses/Bug_Hydra_Boss_8b867e3e.png';
import sprintDemonImg from '@/assets/bosses/Sprint_Demon_Boss_a43a8439.png';
import deadlineDragonImg from '@/assets/bosses/Deadline_Dragon_Boss_4f628254.png';
import techDebtGolemImg from '@/assets/bosses/Technical_Debt_Golem_882e6943.png';
import scopeCreepBeastImg from '@/assets/bosses/Scope_Creep_Beast_3a9ec6b7.png';

// Lair background paths (using public URLs)
const bugHydraLair = '/images/lairs/Bug_Hydra_Cave_Lair_a07f8108.png';
const sprintDemonLair = '/images/lairs/Sprint_Demon_Volcano_Lair_01853ccf.png';
const deadlineDragonLair = '/images/lairs/Deadline_Dragon_Clocktower_Lair_5c2916e4.png';
const techDebtGolemLair = '/images/lairs/Technical_Debt_Golem_Temple_f7e377fe.png';
const scopeCreepBeastLair = '/images/lairs/Scope_Creep_Beast_Void_bd13cec0.png';

// Boss image mapping (outside component for performance)
const BOSS_IMAGE_MAP: Record<string, string> = {
  'Bug_Hydra_Boss_8b867e3e.png': bugHydraImg,
  'Sprint_Demon_Boss_a43a8439.png': sprintDemonImg,
  'Deadline_Dragon_Boss_4f628254.png': deadlineDragonImg,
  'Technical_Debt_Golem_882e6943.png': techDebtGolemImg,
  'Scope_Creep_Beast_3a9ec6b7.png': scopeCreepBeastImg,
};

// Lair background mapping
const LAIR_BACKGROUND_MAP: Record<string, string> = {
  'Bug_Hydra_Boss_8b867e3e.png': bugHydraLair,
  'Sprint_Demon_Boss_a43a8439.png': sprintDemonLair,
  'Deadline_Dragon_Boss_4f628254.png': deadlineDragonLair,
  'Technical_Debt_Golem_882e6943.png': techDebtGolemLair,
  'Scope_Creep_Beast_3a9ec6b7.png': scopeCreepBeastLair,
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

export function BossDisplay({ boss, onAttack, fullscreen = false }: BossDisplayProps) {
  const [isDamaged, setIsDamaged] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { attackAnimations } = useGameState();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

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
              <img
                src={bossImage}
                alt={boss.name}
                className={`boss-sprite ${isDamaged ? 'boss-damaged' : ''}`}
                style={{
                  maxWidth: '400px',
                  maxHeight: '400px',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                  transition: 'all 0.3s ease',
                  transform: isDamaged ? 'scale(1.1)' : 'scale(1)',
                  filter: isDamaged ? 'brightness(1.5) contrast(1.2)' : 'none',
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
                    animation: 'pulse 2s infinite',
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
        <img
          src={bossImage}
          alt={boss.name}
          className={`boss-sprite ${isDamaged ? 'boss-damaged' : ''}`}
          style={{
            maxWidth: '300px',
            maxHeight: '300px',
            objectFit: 'contain',
            imageRendering: 'pixelated',
            cursor: onAttack ? 'pointer' : 'default',
            transition: 'all 0.3s ease',
            filter: isDamaged ? 'brightness(1.5) contrast(1.2)' : 'none'
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
              animation: 'glow 2s infinite alternate',
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
                  Click anywhere on the boss to attack!
                </p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="boss-container">
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
