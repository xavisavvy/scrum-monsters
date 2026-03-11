import React, { useState } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';

import { RetroButton } from '@/components/ui/retro-button';
import { AVATAR_CLASSES } from '@/lib/gameTypes';
import { getAvatarImage } from '@/lib/avatarImages';
import { AbandonQuestModal } from './AbandonQuestModal';
import { XPBar } from './XPBar';
import { HelpMenu } from '@/components/tutorial/HelpMenu';

export function PlayerHUD() {
  const { currentLobby, currentPlayer } = useGameState();
  const { emit } = useWebSocket();
  const [showAbandonModal, setShowAbandonModal] = useState(false);

  const handleProceedNext = () => {
    emit('proceed_next_level');
  };

  const handleAbandonQuest = () => {
    setShowAbandonModal(true);
  };

  const handleConfirmAbandon = () => {
    emit('abandon_quest');
  };

  const handleReturnHome = () => {
    emit('return_to_lobby');
  };

  if (!currentLobby || !currentPlayer) return null;

  const isHost = currentPlayer.isHost;
  const showProceedButton = isHost && currentLobby.gamePhase === 'next_level';
  const showAbandonButton = isHost && currentLobby.gamePhase !== 'lobby' && currentLobby.gamePhase !== 'victory';
  const showReturnHomeButton = isHost && currentLobby.gamePhase === 'victory';

  return (
    <div className="player-hud pb-safe" data-hint-target="player-hud">
      <div className="flex justify-between items-center">
        {/* Player Info */}
        <div className="flex items-center gap-4" data-hint-target="player-info">
          {(() => {
            const avatarImage = getAvatarImage(currentPlayer.avatar);
            if (avatarImage) {
              return (
                <div className="w-12 h-12 rounded border-2 border-gray-400 overflow-hidden">
                  <img
                    src={avatarImage}
                    alt={currentPlayer.avatar}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              );
            }
            
            // Fallback for classes without images
            return (
              <div
                className="w-12 h-12 rounded border-2 border-gray-400 flex items-center justify-center"
                style={{ backgroundColor: AVATAR_CLASSES[currentPlayer.avatar]?.color || '#666' }}
              >
                <span className="text-xl font-bold text-white">
                  {currentPlayer.avatar.charAt(0).toUpperCase()}
                </span>
              </div>
            );
          })()}
          
          <div>
            <div className="font-bold">{currentPlayer.name}</div>
            <div className="text-sm text-gray-400">
              {AVATAR_CLASSES[currentPlayer.avatar]?.name} • {currentPlayer.team}
            </div>
            {currentLobby.gamePhase !== 'lobby' && currentLobby.gamePhase !== 'avatar_selection' && (
              <div className="mt-1">
                <XPBar />
              </div>
            )}
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
          <HelpMenu />
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
          
          {showReturnHomeButton && (
            <RetroButton
              onClick={handleReturnHome}
              variant="primary"
              size="sm"
              className="bg-green-600 hover:bg-green-700 border-green-500"
            >
              Return Home
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

      {/* Abandon Quest Modal */}
      <AbandonQuestModal
        isOpen={showAbandonModal}
        onClose={() => setShowAbandonModal(false)}
        onConfirm={handleConfirmAbandon}
      />
    </div>
  );
}
