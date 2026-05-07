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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
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

          <div className="mt-4 text-center space-y-2">
            <p className="text-xs text-gray-400">
              ✨ Magic words: <span className="text-cyan-400">fire</span>, <span className="text-blue-400">ice</span>, <span className="text-green-400">heal</span>, <span className="text-yellow-400">lightning</span>, <span className="text-purple-400">magic</span>, <span className="text-pink-400">love</span>, <span className="text-orange-400">confetti</span>
            </p>
            <p className="text-xs text-gray-400">
              🎭 State: <span className="text-gray-400">die</span>, <span className="text-amber-400">revive</span>, <span className="text-lime-400">haste</span> (stacks 3x), <span className="text-indigo-400">slow</span>, <span className="text-sky-400">fly</span>
            </p>
            <p className="text-xs text-gray-400">
              🎯 Target: <span className="text-cyan-400">hold person [name]</span>, <span className="text-cyan-400">freeze [name]</span>
            </p>
            <p className="text-xs text-gray-400">
              💀 AoE: <span className="text-amber-600">earthbind</span> (kills flyers), <span className="text-green-600">avada kedavra</span> (kills all others)
            </p>
            <p className="text-xs text-gray-400">
              👼 Revive all: <span className="text-yellow-400">for the alliance</span>, <span className="text-yellow-400">legends never die</span>
            </p>
            <p className="text-xs text-gray-400">
              🐉 Dragon: <span className="text-orange-400">clever girl</span>, <span className="text-orange-400">dracarys</span> (eats random player)
            </p>
            <p className="text-xs text-gray-400">
              ✨ Self: <span className="text-purple-400">dispel magic</span> (remove all effects), <span className="text-pink-400">chaos mode</span> (disco!)
            </p>
            <p className="text-xs text-gray-400">
              👻 Stealth: <span className="text-gray-300">invisibility</span> (half opacity for you, invisible to others - breaks on spell cast or death)
            </p>
            <p className="text-xs text-gray-400">
              📏 Size: <span className="text-orange-400">enlarge</span>/<span className="text-blue-400">reduce</span> (stacks 3x - grow huge or shrink tiny!)
            </p>
            <p className="text-xs text-gray-400">
              🗿 Petrify: <span className="text-gray-400">petrify [names]</span> (turn to stone - use dispel to free)
            </p>
            <p className="text-xs text-gray-500">
              Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs">Esc</kbd> to cancel
            </p>
          </div>
        </RetroCard>
      </div>
    </div>
  );
}