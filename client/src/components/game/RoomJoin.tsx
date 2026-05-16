import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { LobbySettingsStorage } from '@/lib/utils/lobbySettingsStorage';
import { FavoriteRoomsStorage } from '@/lib/utils/favoriteRoomsStorage';
import { PlayerNameStorage } from '@/lib/utils/playerNameStorage';

interface RoomJoinProps {
  roomId: string;
  onLobbyCreatedOrJoined: () => void;
}

export function RoomJoin({ roomId, onLobbyCreatedOrJoined }: Readonly<RoomJoinProps>) {
  const [playerName, setPlayerName] = useState('');
  const [lobbyName, setLobbyName] = useState('');
  const [mode, setMode] = useState<'checking' | 'join' | 'create'>('checking');
  const [isProcessing, setIsProcessing] = useState(false);
  const { emit, socket } = useWebSocket();
  const navigate = useNavigate();

  // Normalize room ID for display
  const displayRoomId = roomId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Load saved player name on mount
  useEffect(() => {
    const savedName = PlayerNameStorage.loadName();
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  // Listen for lobby_created/lobby_joined and navigate to game page
  useEffect(() => {
    if (!socket) return;

    const handleNavigate = ({ lobby }: { lobby: { id: string } }) => {
      onLobbyCreatedOrJoined();
      navigate(`/game/${lobby.id}`);
    };

    socket.on('lobby_created', handleNavigate);
    socket.on('lobby_joined', handleNavigate);
    return () => {
      socket.off('lobby_created', handleNavigate);
      socket.off('lobby_joined', handleNavigate);
    };
  }, [socket, navigate, onLobbyCreatedOrJoined]);

  // Check if lobby already exists when component mounts
  useEffect(() => {
    if (!socket) return;

    // Try to check if the lobby exists by attempting to join
    const checkLobbyExists = () => {
      // We'll attempt a silent check by trying to get lobby info
      // For now, we'll default to 'create' mode and let the server handle existence
      // If the lobby exists, the join will succeed. If not, we'll create it.
      setMode('create');
    };

    checkLobbyExists();
  }, [socket, roomId]);

  const handleCreateLobby = () => {
    if (!playerName.trim() || !lobbyName.trim()) return;

    setIsProcessing(true);

    // Save player name for future sessions
    PlayerNameStorage.saveName(playerName.trim());

    // Record room access in favorites
    FavoriteRoomsStorage.recordRoomAccess(roomId, lobbyName.trim());

    // Load saved settings and add custom lobby ID
    const savedSettings = LobbySettingsStorage.loadSettings();

    emit('create_lobby', {
      lobbyName: lobbyName.trim(),
      hostName: playerName.trim(),
      initialSettings: {
        ...savedSettings,
        customLobbyId: roomId
      }
    });
  };

  const handleJoinLobby = () => {
    if (!playerName.trim()) return;

    setIsProcessing(true);

    // Save player name for future sessions
    PlayerNameStorage.saveName(playerName.trim());

    // Record room access in favorites (will update with actual lobby name once joined)
    FavoriteRoomsStorage.recordRoomAccess(roomId, displayRoomId);

    emit('join_lobby', {
      lobbyId: roomId.toUpperCase(),
      playerName: playerName.trim()
    });
  };

  // If checking, show loading state
  if (mode === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <RetroCard title={`Recurring Room: ${displayRoomId}`} className="w-full max-w-md">
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-400">Checking room status...</p>
          </div>
        </RetroCard>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-8">
      <RetroCard title={`Recurring Room: ${displayRoomId}`} className="w-full max-w-md">
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-900/30 border border-blue-500/50 rounded px-4 py-3 text-sm">
            <p className="text-blue-300 mb-2">
              <strong>🔖 Recurring Meeting Room</strong>
            </p>
            <p className="text-gray-300 text-xs">
              This is a persistent meeting room. Bookmark this URL to return to the same lobby for your recurring scrum sessions.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="flex gap-2 mb-4">
            <RetroButton
              onClick={() => setMode('create')}
              variant={mode === 'create' ? 'primary' : 'secondary'}
              size="sm"
              className="flex-1"
            >
              Create Room
            </RetroButton>
            <RetroButton
              onClick={() => setMode('join')}
              variant={mode === 'join' ? 'primary' : 'secondary'}
              size="sm"
              className="flex-1"
            >
              Join Existing
            </RetroButton>
          </div>

          {/* Create Mode */}
          {mode === 'create' && (
            <>
              <div>
                <label className="block text-sm font-bold mb-2" htmlFor="hostName">
                  Your Name:
                </label>
                <input
                  id="hostName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="retro-input"
                  placeholder="Enter your name..."
                  maxLength={20}
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2" htmlFor="lobbyName">
                  Meeting Name:
                </label>
                <input
                  id="lobbyName"
                  type="text"
                  value={lobbyName}
                  onChange={(e) => setLobbyName(e.target.value)}
                  className="retro-input"
                  placeholder="e.g., Daily Standup, Sprint Planning..."
                  maxLength={30}
                />
              </div>

              <RetroButton
                onClick={handleCreateLobby}
                disabled={!playerName.trim() || !lobbyName.trim() || isProcessing}
                className="w-full"
              >
                {isProcessing ? 'Creating...' : 'Create Recurring Room'}
              </RetroButton>

              <div className="text-center text-sm text-gray-400">
                As the host, you'll control the battle progression
              </div>
            </>
          )}

          {/* Join Mode */}
          {mode === 'join' && (
            <>
              <div>
                <label className="block text-sm font-bold mb-2" htmlFor="playerName">
                  Your Name:
                </label>
                <input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="retro-input"
                  placeholder="Enter your name..."
                  maxLength={20}
                />
              </div>

              <RetroButton
                onClick={handleJoinLobby}
                disabled={!playerName.trim() || isProcessing}
                className="w-full"
              >
                {isProcessing ? 'Joining...' : 'Join Recurring Room'}
              </RetroButton>

              <div className="text-center text-sm text-gray-400">
                Join your team's recurring scrum session
              </div>
            </>
          )}

          {/* Share Link Section */}
          <div className="mt-6 pt-4 border-t border-gray-600">
            <p className="text-xs text-gray-400 mb-2">Share this room:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={`${window.location.origin}/room/${roomId}`}
                readOnly
                className="retro-input text-xs flex-1"
                onClick={(e) => e.currentTarget.select()}
              />
              <RetroButton
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
                }}
                size="sm"
                variant="secondary"
              >
                📋 Copy
              </RetroButton>
            </div>
          </div>
        </div>
      </RetroCard>
    </div>
  );
}
