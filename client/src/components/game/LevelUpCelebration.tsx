import { useEffect, useCallback } from 'react';
import { Html } from '@react-three/drei';
import type { AvatarClass } from '@shared/gameEvents';
import { useProgression } from '@/lib/stores/useProgression';
import { useAudio } from '@/lib/stores/useAudio';
import './LevelUpCelebration.css';

interface LevelUpCelebrationProps {
  playerClass: AvatarClass;
  onComplete?: () => void;
}

// Class-specific particle colors
const CLASS_EFFECTS: Record<AvatarClass, { color: string; secondary: string }> = {
  paladin: { color: '#FFD700', secondary: '#FFFFFF' },  // Golden light
  cleric: { color: '#FFFFFF', secondary: '#87CEEB' },   // Holy white
  rogue: { color: '#F39C12', secondary: '#D4AF37' },    // Gold coins
  warrior: { color: '#FF4500', secondary: '#8B0000' },  // Fiery red
  ranger: { color: '#228B22', secondary: '#98FB98' },   // Forest green
  wizard: { color: '#4169E1', secondary: '#9370DB' },   // Arcane blue
  sorcerer: { color: '#FF4500', secondary: '#FF6347' }, // Flame orange
  bard: { color: '#9370DB', secondary: '#DDA0DD' },     // Musical purple
  oathbreaker: { color: '#8A2BE2', secondary: '#4B0082' }, // Dark purple
  monk: { color: '#8B4513', secondary: '#DEB887' },     // Earth tones
};

export function LevelUpCelebration({ playerClass, onComplete }: LevelUpCelebrationProps) {
  const { levelUp, clearLevelUp } = useProgression();
  const { playSuccess } = useAudio();

  const duration = 2500; // 2.5 seconds per CONTEXT.md

  // Play sound and auto-dismiss on mount
  useEffect(() => {
    if (!levelUp?.active) return;

    // Play level-up fanfare (using success sound as fallback)
    // TODO: Add dedicated level-up sound in future task
    playSuccess?.();

    // Cleanup after duration
    const timer = setTimeout(() => {
      clearLevelUp();
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [levelUp?.active, clearLevelUp, onComplete, playSuccess]);

  // Handle skip (click/keypress)
  const handleSkip = useCallback(() => {
    clearLevelUp();
    onComplete?.();
  }, [clearLevelUp, onComplete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSkip]);

  if (!levelUp?.active) return null;

  const effects = CLASS_EFFECTS[playerClass] || CLASS_EFFECTS.warrior;

  // Generate particles for radial burst
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    angle: (i / 30) * 360,
  }));

  return (
    <Html fullscreen>
      <div
        className="level-up-overlay"
        onClick={handleSkip}
      >
        {/* Full-screen flash */}
        <div className="level-up-flash" />

        {/* Radial burst effect */}
        <div
          className="level-up-burst"
          style={{
            background: `radial-gradient(circle, ${effects.color}40 0%, transparent 70%)`,
          }}
        />

        {/* Class-specific particles */}
        <div className="level-up-particles">
          {particles.map((p) => (
            <div
              key={p.id}
              className="level-up-particle"
              style={{
                backgroundColor: Math.random() > 0.5 ? effects.color : effects.secondary,
                '--angle': `${p.angle}deg`,
                '--delay': `${Math.random() * 0.3}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Level text */}
        <div className="level-up-text" style={{ color: effects.color }}>
          <div className="level-up-label">LEVEL UP!</div>
          <div className="level-up-number">{levelUp.newLevel}</div>
        </div>

        {/* Skip hint */}
        <div className="level-up-skip">Click or press ESC to skip</div>
      </div>
    </Html>
  );
}
