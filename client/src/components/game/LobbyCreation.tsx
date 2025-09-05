import React, { useState } from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';

interface LobbyCreationProps {
  onLobbyCreated: () => void;
}

export function LobbyCreation({ onLobbyCreated }: LobbyCreationProps) {
  const [lobbyName, setLobbyName] = useState('');
  const [hostName, setHostName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { emit } = useWebSocket();

  const handleCreateLobby = () => {
    if (!lobbyName.trim() || !hostName.trim()) return;
    
    setIsCreating(true);
    emit('create_lobby', { 
      lobbyName: lobbyName.trim(), 
      hostName: hostName.trim() 
    });
    
    // onLobbyCreated will be called when server responds
    setTimeout(() => setIsCreating(false), 1000);
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <RetroCard title="Create Battle Lobby" className="w-full max-w-md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">
              Your Name:
            </label>
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="retro-input"
              placeholder="Enter your name..."
              maxLength={20}
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold mb-2">
              Lobby Name:
            </label>
            <input
              type="text"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              className="retro-input"
              placeholder="Enter lobby name..."
              maxLength={30}
            />
          </div>
          
          <RetroButton
            onClick={handleCreateLobby}
            disabled={!lobbyName.trim() || !hostName.trim() || isCreating}
            className="w-full"
          >
            {isCreating ? 'Creating...' : 'Create Battle Lobby'}
          </RetroButton>
          
          <div className="text-center text-sm text-gray-400">
            As the host, you'll control the battle progression
          </div>
        </div>
      </RetroCard>
    </div>
  );
}
