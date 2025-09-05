import React, { useEffect, useState } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { Boss } from '@/lib/gameTypes';

interface BossDisplayProps {
  boss: Boss;
  onAttack?: () => void;
}

export function BossDisplay({ boss, onAttack }: BossDisplayProps) {
  const [isDamaged, setIsDamaged] = useState(false);
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
    // Create a pixel art style boss using CSS
    return (
      <div
        className={`boss-sprite ${isDamaged ? 'boss-damaged' : ''}`}
        style={{
          width: '200px',
          height: '200px',
          background: 'linear-gradient(145deg, #8B0000, #FF4500)',
          border: '4px solid #4A0E0E',
          borderRadius: '20px',
          position: 'relative',
          cursor: onAttack ? 'pointer' : 'default',
          transition: 'all 0.3s ease'
        }}
        onClick={handleBossClick}
      >
        {/* Boss eyes */}
        <div
          style={{
            position: 'absolute',
            top: '30%',
            left: '25%',
            width: '20px',
            height: '20px',
            background: '#FF0000',
            borderRadius: '50%',
            boxShadow: '0 0 10px #FF0000'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '30%',
            right: '25%',
            width: '20px',
            height: '20px',
            background: '#FF0000',
            borderRadius: '50%',
            boxShadow: '0 0 10px #FF0000'
          }}
        />
        
        {/* Boss mouth */}
        <div
          style={{
            position: 'absolute',
            bottom: '30%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '60px',
            height: '20px',
            background: '#000',
            borderRadius: '0 0 30px 30px'
          }}
        />
        
        {/* Damage phase indicator */}
        {boss.phase > 1 && (
          <div
            style={{
              position: 'absolute',
              top: '-10px',
              left: '-10px',
              right: '-10px',
              bottom: '-10px',
              border: '2px solid #FF6600',
              borderRadius: '25px',
              animation: 'glow 2s infinite alternate'
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
