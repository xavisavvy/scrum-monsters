import React, { useState } from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { AVATAR_CLASSES, AvatarClass } from '@/lib/gameTypes';
import { CharacterDetailsPanel } from './CharacterDetailsPanel';

export function AvatarSelection() {
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarClass>('warrior');
  const { emit } = useWebSocket();
  const { currentPlayer } = useGameState();

  const handleConfirmAvatar = () => {
    emit('select_avatar', { avatarClass: selectedAvatar });
  };

  const renderAvatarSprite = (avatarClass: AvatarClass) => {
    const { color } = AVATAR_CLASSES[avatarClass];
    return (
      <div
        className="w-16 h-16 mx-auto mb-2 rounded border-2 border-gray-600 flex items-center justify-center retro-pixel-border"
        style={{ backgroundColor: color }}
      >
        <span className="text-2xl font-bold text-white">
          {avatarClass.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl">
        {/* Left side - Character Selection */}
        <div className="flex-1">
          <RetroCard title="Choose Your Avatar" className="h-full">
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-lg">
                  Welcome, <span className="retro-text-glow">{currentPlayer?.name}</span>!
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Choose your avatar class for the upcoming battle
                </p>
              </div>
              
              <div className="avatar-selection-grid">
                {Object.entries(AVATAR_CLASSES).map(([key, info]) => {
                  const avatarClass = key as AvatarClass;
                  const isSelected = selectedAvatar === avatarClass;
                  
                  return (
                    <div
                      key={avatarClass}
                      className={`avatar-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedAvatar(avatarClass)}
                    >
                      {renderAvatarSprite(avatarClass)}
                      <h4 className="font-bold text-sm">{info.name}</h4>
                      <p className="text-xs text-gray-400 mt-1">{info.description}</p>
                    </div>
                  );
                })}
              </div>
              
              <div className="text-center">
                <RetroButton
                  onClick={handleConfirmAvatar}
                  className="px-8"
                >
                  Confirm Avatar
                </RetroButton>
              </div>
            </div>
          </RetroCard>
        </div>

        {/* Right side - Character Details (Desktop) */}
        <div className="flex-shrink-0 lg:block hidden">
          <CharacterDetailsPanel selectedClass={selectedAvatar} />
        </div>
        
        {/* Character Details (Mobile - Stacked Below) */}
        <div className="lg:hidden w-full">
          <CharacterDetailsPanel selectedClass={selectedAvatar} />
        </div>
      </div>
    </div>
  );
}
