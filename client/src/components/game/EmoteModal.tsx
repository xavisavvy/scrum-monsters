import React, { useState, useEffect, useRef } from 'react';
import { RetroButton } from '../ui/retro-button';
import { RetroCard } from '../ui/retro-card';

interface EmoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
}

export function EmoteModal({ isOpen, onClose, onSubmit }: EmoteModalProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus input when modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
      setMessage(''); // Clear previous message
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSubmit(message.trim());
      setMessage('');
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="animate-in fade-in-0 duration-200">
        <RetroCard className="w-96 mx-4">
          <h2 className="text-xl font-bold mb-4 retro-text-glow-light text-center">
            💬 Say Something
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Your Message:
              </label>
              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your emote message..."
                maxLength={100}
                className="w-full p-3 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                {message.length}/100 characters
              </p>
            </div>

            <div className="flex gap-3">
              <RetroButton
                type="button"
                onClick={onClose}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </RetroButton>
              <RetroButton
                type="submit"
                disabled={!message.trim()}
                className="flex-1"
              >
                Say It!
              </RetroButton>
            </div>
          </form>

          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs">Esc</kbd> to cancel
            </p>
          </div>
        </RetroCard>
      </div>
    </div>
  );
}