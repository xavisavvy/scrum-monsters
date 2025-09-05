import React, { useState } from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';

interface LobbyJoinProps {
  lobbyId?: string;
  onLobbyJoined: () => void;
}

export function LobbyJoin({ lobbyId: initialLobbyId, onLobbyJoined }: LobbyJoinProps) {
  const [lobbyId, setLobbyId] = useState(initialLobbyId || '');
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const { emit } = useWebSocket();

  const handleJoinLobby = () => {
    if (!lobbyId.trim() || !playerName.trim()) return;
    
    setIsJoining(true);
    emit('join_lobby', { 
      lobbyId: lobbyId.trim().toUpperCase(), 
      playerName: playerName.trim() 
    });
    
    // onLobbyJoined will be called when server responds
    setTimeout(() => setIsJoining(false), 1000);
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <RetroCard title="Join Battle" className="w-full max-w-md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">
              Your Name:
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="retro-input"
              placeholder="Enter your name..."
              maxLength={20}
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold mb-2">
              Lobby Code:
            </label>
            <input
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
