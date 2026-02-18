import React, { useState, useEffect } from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { LobbySettingsStorage } from '@/lib/utils/lobbySettingsStorage';
import { PlayerNameStorage } from '@/lib/utils/playerNameStorage';

interface LobbyCreationProps {
  onLobbyCreated: () => void;
}

export function LobbyCreation({ onLobbyCreated }: LobbyCreationProps) {
  const [lobbyName, setLobbyName] = useState('');
  const [hostName, setHostName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { emit } = useWebSocket();

  // Load saved player name on mount
  useEffect(() => {
    const savedName = PlayerNameStorage.loadName();
    if (savedName) {
      setHostName(savedName);
    }
  }, []);

  const handleCreateLobby = () => {
    if (!lobbyName.trim() || !hostName.trim()) return;

    setIsCreating(true);

    // Save player name for future sessions
    PlayerNameStorage.saveName(hostName.trim());

    // Load saved settings and send them with lobby creation
    const savedSettings = LobbySettingsStorage.loadSettings();

    emit('create_lobby', {
      lobbyName: lobbyName.trim(),
      hostName: hostName.trim(),
      initialSettings: savedSettings
    });

    // onLobbyCreated will be called when server responds
    setTimeout(() => setIsCreating(false), 1000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCreateLobby();
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-8 pb-safe" style={{ minHeight: '100dvh' }}>
      <RetroCard title="Create Battle Lobby" className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2" htmlFor='hostName'>
              Your Name:
            </label>
            <input
              name='hostName'
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="retro-input"
              placeholder="Enter your name..."
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2" htmlFor='lobbyName'>
              Lobby Name:
            </label>
            <input
              name='lobbyName'
              type="text"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              className="retro-input"
              placeholder="Enter lobby name..."
              maxLength={30}
            />
          </div>

          <RetroButton
            type="submit"
            disabled={!lobbyName.trim() || !hostName.trim() || isCreating}
            className="w-full"
          >
            {isCreating ? 'Creating...' : 'Create Battle Lobby'}
          </RetroButton>

          <div className="text-center text-sm text-gray-400">
            As the host, you'll control the battle progression
          </div>
        </form>
      </RetroCard>
    </div>
  );
}
