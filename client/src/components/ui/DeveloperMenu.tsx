import React from 'react';
import { RetroButton } from './retro-button';
import { RetroCard } from './retro-card';

interface DeveloperMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCharacterTools: () => void;
  onOpenBossTools: () => void;
}

export function DeveloperMenu({ isOpen, onClose, onOpenCharacterTools, onOpenBossTools }: DeveloperMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="animate-in fade-in-0 duration-200">
        <RetroCard className="w-96 mx-4">
          <h2 className="text-xl font-bold mb-4 retro-text-glow-light text-center">
            🔧 Developer Tools
          </h2>
          
          <div className="space-y-3">
            <RetroButton
              onClick={() => {
                onOpenCharacterTools();
                onClose();
              }}
              className="w-full"
            >
              🎭 Character Tools
            </RetroButton>
            
            <RetroButton
              onClick={() => {
                onOpenBossTools();
                onClose();
              }}
              className="w-full"
            >
              👹 Boss Tools
            </RetroButton>
            
            <RetroButton
              onClick={onClose}
              variant="secondary"
              className="w-full"
            >
              Cancel
            </RetroButton>
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs">`</kbd> to toggle
            </p>
          </div>
        </RetroCard>
      </div>
    </div>
  );
}