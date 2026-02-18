import React, { useState, useEffect } from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { PlayerNameStorage } from '@/lib/utils/playerNameStorage';

interface LobbyJoinProps {
  lobbyId?: string;
  onLobbyJoined: () => void;
}

export function LobbyJoin({ lobbyId: initialLobbyId, onLobbyJoined }: Readonly<LobbyJoinProps>) {
  const [lobbyId, setLobbyId] = useState(initialLobbyId || '');
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const { emit } = useWebSocket();

  // Load saved player name on mount
  useEffect(() => {
    const savedName = PlayerNameStorage.loadName();
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  const handleJoinLobby = () => {
    if (!lobbyId.trim() || !playerName.trim()) return;

    setIsJoining(true);

    // Save player name for future sessions
    PlayerNameStorage.saveName(playerName.trim());

    emit('join_lobby', {
      lobbyId: lobbyId.trim().toUpperCase(),
      playerName: playerName.trim()
    });

    // onLobbyJoined will be called when server responds
    setTimeout(() => setIsJoining(false), 1000);
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 pb-safe" style={{ minHeight: '100dvh' }}>
      <RetroCard title="Join Battle" className="w-full max-w-md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2" htmlFor='playerName'>
              Your Name:
            </label>
            <input
              id='playerName'
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="retro-input"
              placeholder="Enter your name..."
              maxLength={20}
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold mb-2" htmlFor='lobbyId'>
              Lobby Code:
            </label>
            <input
              id='lobbyId'
              type="text"
              value={lobbyId}
              onChange={(e) => setLobbyId(e.target.value.toUpperCase())}
              className="retro-input"
              placeholder="Enter lobby code..."
              maxLength={6}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          
          <RetroButton
            onClick={handleJoinLobby}
            disabled={!lobbyId.trim() || !playerName.trim() || isJoining}
            className="w-full"
          >
            {isJoining ? 'Joining...' : 'Join Battle'}
          </RetroButton>
          
          <div className="text-center text-sm text-gray-400">
            Enter the 6-character lobby code from your Scrum Master
          </div>
        </div>
      </RetroCard>
    </div>
  );
}
