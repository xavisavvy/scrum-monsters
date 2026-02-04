import { useState, useEffect, useRef } from 'react';
import { useProgression } from '@/lib/stores/useProgression';
import './XPBar.css';

export function XPBar() {
  const { currentXP, currentLevel, getProgressToNextLevel } = useProgression();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevXPRef = useRef(currentXP);

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

  return (
    <div
      className={`xp-bar-container ${isPulsing ? 'pulsing' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="xp-level">
        Lv {currentLevel}
      </div>

      <div className="xp-bar-track">
        <div
          className="xp-bar-fill"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

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
