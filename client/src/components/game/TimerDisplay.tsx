import React, { useState, useEffect } from 'react';
import { useGameState } from '@/lib/stores/useGameState';

export function TimerDisplay() {
  const { currentLobby } = useGameState();
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  
  useEffect(() => {
    if (!currentLobby?.currentTimer?.isActive) {
      setRemainingTime(null);
      return;
    }
    
    const updateTimer = () => {
      if (!currentLobby?.currentTimer) {
        setRemainingTime(null);
        return;
      }
      
      const elapsed = Date.now() - currentLobby.currentTimer.startedAt;
      const remaining = currentLobby.currentTimer.durationMs - elapsed;
      setRemainingTime(Math.max(0, remaining));
    };
    
    // Update immediately
    updateTimer();
    
    // Update every second
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [currentLobby?.currentTimer]);
  
  if (!currentLobby?.timerSettings?.enabled || remainingTime === null) {
    return null;
  }
  
  const minutes = Math.floor(remainingTime / 60000);
  const seconds = Math.floor((remainingTime % 60000) / 1000);
  const isUrgent = remainingTime < 60000; // Less than 1 minute
  const isCritical = remainingTime < 30000; // Less than 30 seconds
  
  return (
    <div className={`
      fixed top-6 left-6 z-50 px-4 py-2 rounded-lg border-2 font-mono text-lg font-bold
      ${isCritical 
        ? 'bg-red-900 border-red-500 text-red-100 animate-pulse' 
        : isUrgent 
          ? 'bg-yellow-900 border-yellow-500 text-yellow-100' 
          : 'bg-blue-900 border-blue-500 text-blue-100'
      }
    `}>
      <div className="flex items-center gap-2">
        <span className="text-xl">⏰</span>
        <div>
          <div className="text-xs uppercase opacity-75">Timer</div>
          <div className="leading-none">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        </div>
      </div>
    </div>
  );
}