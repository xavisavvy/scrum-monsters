import React from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { RetroButton } from '@/components/ui/retro-button';
import { AVATAR_CLASSES } from '@/lib/gameTypes';

export function PlayerHUD() {
  const { currentLobby, currentPlayer } = useGameState();
  const { emit } = useWebSocket();

  const handleProceedNext = () => {
    emit('proceed_next_level', {});
  };

  const handleAbandonQuest = () => {
    if (confirm('Are you sure you want to abandon the quest and return to the lobby? All progress will be lost.')) {
      emit('abandon_quest', {});
    }
  };

  if (!currentLobby || !currentPlayer) return null;

  const isHost = currentPlayer.isHost;
  const showProceedButton = isHost && currentLobby.gamePhase === 'next_level';
  const showAbandonButton = isHost && currentLobby.gamePhase !== 'lobby';

  return (
    <div className="player-hud">
      <div className="flex justify-between items-center">
        {/* Player Info */}
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded border-2 border-gray-400 flex items-center justify-center"
            style={{ backgroundColor: AVATAR_CLASSES[currentPlayer.avatar]?.color || '#666' }}
          >
            <span className="text-xl font-bold text-white">
              {currentPlayer.avatar.charAt(0).toUpperCase()}
            </span>
          </div>
          
          <div>
            <div className="font-bold">{currentPlayer.name}</div>
            <div className="text-sm text-gray-400">
              {AVATAR_CLASSES[currentPlayer.avatar]?.name} • {currentPlayer.team}
            </div>
          </div>
        </div>

        {/* Game Info */}
        <div className="text-center">
          <div className="text-sm text-gray-400">Battle Progress</div>
          <div className="font-bold">
            {Array.isArray(currentLobby.completedTickets) ? currentLobby.completedTickets.length : 0} / {currentLobby.tickets.length} Objectives
          </div>
        </div>

        {/* Host Controls */}
        <div className="flex gap-2 items-center">
          {showAbandonButton && (
            <RetroButton
              onClick={handleAbandonQuest}
              variant="primary"
              size="sm"
              className="bg-red-600 hover:bg-red-700 border-red-500"
            >
              Abandon Quest
            </RetroButton>
          )}
          
          {showProceedButton && (
            <RetroButton
              onClick={handleProceedNext}
              variant="accent"
            >
              Next Level
            </RetroButton>
          )}
          
          {isHost && (
            <div className="text-xs text-yellow-400">
              HOST
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
