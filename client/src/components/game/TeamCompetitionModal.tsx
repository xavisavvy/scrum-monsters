import React from 'react';
import { RetroCard } from '../ui/retro-card';
import { TeamScoreboard } from './TeamScoreboard';

interface TeamCompetitionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TeamCompetitionModal({ isOpen, onClose }: TeamCompetitionModalProps) {
  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Close modal only if clicking the overlay itself, not the content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onKeyDown={handleKeyDown}
      onClick={handleOverlayClick}
      tabIndex={-1}
    >
      <div className="animate-in fade-in-0 zoom-in-95 duration-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm border-2 border-red-500"
            title="Close (Tab or ESC)"
          >
            ×
          </button>
          
          {/* Team Competition Content */}
          <TeamScoreboard />
          
          {/* Keyboard hint */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400">
              Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs">TAB</kbd> or 
              <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs ml-1">ESC</kbd> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}