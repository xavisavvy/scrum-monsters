import { useState, useEffect, useRef } from 'react';
import { useProgression } from '@/lib/stores/useProgression';
import { StatBar } from '@/components/ui/StatBar';
import './XPBar.css';

export function XPBar() {
  const { currentXP, currentLevel, getProgressToNextLevel } = useProgression();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [levelUpFlash, setLevelUpFlash] = useState(false);
  const prevXPRef = useRef(currentXP);
  const prevLevelRef = useRef(currentLevel);

  const progress = getProgressToNextLevel();

  // Pulse animation when XP changes
  useEffect(() => {
    if (currentXP > prevXPRef.current) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 600);
      prevXPRef.current = currentXP;
      return () => clearTimeout(timer);
    }
    prevXPRef.current = currentXP;
  }, [currentXP]);

  // Level-up flash on the XP bar
  useEffect(() => {
    if (currentLevel > prevLevelRef.current) {
      setLevelUpFlash(true);
      const timer = setTimeout(() => setLevelUpFlash(false), 3000);
      prevLevelRef.current = currentLevel;
      return () => clearTimeout(timer);
    }
    prevLevelRef.current = currentLevel;
  }, [currentLevel]);

  return (
    <div
      className={`xp-bar-container ${isPulsing ? 'pulsing' : ''} ${levelUpFlash ? 'level-up-flash-bar' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="xp-level">
        {levelUpFlash ? 'UP!' : `Lv ${currentLevel}`}
      </div>

      <StatBar
        value={progress.current}
        max={progress.needed}
        variant="xp"
        size="sm"
        className="flex-1"
      />

      {isExpanded && (
        <div className="xp-details">
          <span className="xp-current">{progress.current}</span>
          <span className="xp-separator">/</span>
          <span className="xp-needed">{progress.needed} XP</span>
        </div>
      )}
    </div>
  );
}
