import React, { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useOrientation } from '@/hooks/useOrientation';
import { useGameState } from '@/lib/stores/useGameState';

const BATTLE_PHASES = new Set(['battle', 'scoring', 'reveal', 'discussion']);

/**
 * Soft "rotate device" overlay for portrait mobile during battle phases.
 * Dismissed state resets on phase change so the nudge reappears per phase.
 * Never blocks interaction — users can always dismiss and continue.
 */
export function RotateDeviceOverlay() {
  const isMobile = useIsMobile();
  const isPortrait = useOrientation();
  const { currentLobby } = useGameState();
  const [dismissed, setDismissed] = useState(false);

  const gamePhase = currentLobby?.gamePhase;

  // Reset dismissed state whenever the game phase changes
  useEffect(() => {
    setDismissed(false);
  }, [gamePhase]);

  const shouldShow =
    isMobile &&
    isPortrait &&
    gamePhase !== undefined &&
    BATTLE_PHASES.has(gamePhase) &&
    !dismissed;

  if (!shouldShow) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label="Rotate device prompt"
    >
      {/* Rotate icon */}
      <div
        className="text-7xl mb-6 select-none"
        style={{ animation: 'spin 2s linear infinite' }}
        aria-hidden="true"
      >
        &#10227;
      </div>

      <h2 className="font-jrpg text-2xl text-yellow-400 mb-3 text-center px-6">
        Rotate Your Device
      </h2>

      <p className="text-gray-300 text-sm text-center px-8 mb-8 leading-relaxed">
        Turn your phone to landscape for the best battle experience
      </p>

      <button
        onClick={() => setDismissed(true)}
        className="retro-button px-6 py-3 text-sm font-jrpg border-2 border-retro-accent
                   bg-black text-retro-accent hover:bg-retro-accent hover:text-black
                   transition-colors duration-200 rounded"
      >
        Continue Anyway
      </button>
    </div>
  );
}
