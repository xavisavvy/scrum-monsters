import React from 'react';
import { RetroButton } from '../ui/retro-button';
import { RetroCard } from '../ui/retro-card';

interface AbandonQuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function AbandonQuestModal({ isOpen, onClose, onConfirm }: AbandonQuestModalProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="animate-in fade-in-0 duration-200">
        <RetroCard className="w-96 mx-4">
          <h2 className="text-xl font-bold mb-4 retro-text-glow-light text-center text-red-400">
            ⚠️ Abandon Quest? ⚠️
          </h2>
          
          <div className="text-center mb-6">
            <p className="text-yellow-300 font-medium mb-2">
              Are you sure you want to abandon this quest?
            </p>
            <p className="text-gray-400 text-sm">
              All progress will be lost and you'll return to the lobby.
            </p>
            <p className="text-red-300 text-xs mt-2 font-medium">
              This action cannot be undone!
            </p>
          </div>

          <div className="flex gap-3">
            <RetroButton
              onClick={onClose}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </RetroButton>
            <RetroButton
              onClick={handleConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 border-red-500"
            >
              Abandon Quest
            </RetroButton>
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs">ESC</kbd> to cancel
            </p>
          </div>
        </RetroCard>
      </div>
    </div>
  );
}