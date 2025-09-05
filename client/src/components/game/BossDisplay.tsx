import React, { useEffect, useState } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { Boss } from '@/lib/gameTypes';

// Import boss images
import bugHydraImg from '@/assets/bosses/Bug_Hydra_Boss_8b867e3e.png';
import sprintDemonImg from '@/assets/bosses/Sprint_Demon_Boss_a43a8439.png';
import deadlineDragonImg from '@/assets/bosses/Deadline_Dragon_Boss_4f628254.png';
import techDebtGolemImg from '@/assets/bosses/Technical_Debt_Golem_882e6943.png';
import scopeCreepBeastImg from '@/assets/bosses/Scope_Creep_Beast_3a9ec6b7.png';

// Boss image mapping (outside component for performance)
const BOSS_IMAGE_MAP: Record<string, string> = {
  'Bug_Hydra_Boss_8b867e3e.png': bugHydraImg,
  'Sprint_Demon_Boss_a43a8439.png': sprintDemonImg,
  'Deadline_Dragon_Boss_4f628254.png': deadlineDragonImg,
  'Technical_Debt_Golem_882e6943.png': techDebtGolemImg,
  'Scope_Creep_Beast_3a9ec6b7.png': scopeCreepBeastImg,
};

const getBossImage = (sprite: string): string => {
  const image = BOSS_IMAGE_MAP[sprite];
  if (!image) {
    console.warn(`Unknown boss sprite: ${sprite}, falling back to Bug Hydra`);
    return bugHydraImg;
  }
  return image;
};

interface BossDisplayProps {
  boss: Boss;
  onAttack?: () => void;
}

export function BossDisplay({ boss, onAttack }: BossDisplayProps) {
  const [isDamaged, setIsDamaged] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { attackAnimations } = useGameState();

  const healthPercentage = (boss.currentHealth / boss.maxHealth) * 100;

  const handleBossClick = () => {
    if (onAttack) {
      onAttack();
      setIsDamaged(true);
      setTimeout(() => setIsDamaged(false), 500);
    }
  };

  const renderBossSprite = () => {
    const bossImage = getBossImage(boss.sprite);
    
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
            imageRendering: 'crisp-edges', // Safari fallback
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
        {attackAnimations.map(animation => (
          <div
            key={animation.id}
            className="damage-animation"
            style={{
              left: `${animation.x}px`,
              top: `${animation.y}px`
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
