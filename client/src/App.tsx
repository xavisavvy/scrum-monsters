import React, { useEffect, useState } from 'react';
import { LobbyCreation } from '@/components/game/LobbyCreation';
import { LobbyJoin } from '@/components/game/LobbyJoin';
import { Lobby } from '@/components/game/Lobby';
import { AvatarSelection } from '@/components/game/AvatarSelection';
import { BattleScreen } from '@/components/game/BattleScreen';
import { RetroButton } from '@/components/ui/retro-button';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { useAudio } from '@/lib/stores/useAudio';
import '@/styles/retro.css';

type AppState = 'menu' | 'create_lobby' | 'join_lobby' | 'lobby' | 'avatar_selection' | 'battle';

function App() {
  const [appState, setAppState] = useState<AppState>('menu');
  const [joinLobbyId, setJoinLobbyId] = useState<string>('');
  
  const { socket, connect, disconnect, isConnected } = useWebSocket();
  const { 
    currentLobby, 
    currentPlayer, 
    setLobby, 
    setPlayer, 
    setBoss, 
    setInviteLink, 
    setError,
    clearAll 
  } = useGameState();
  const { toggleMute, isMuted } = useAudio();

  // Connect to WebSocket on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Check for lobby join URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const lobbyParam = urlParams.get('join');
    if (lobbyParam) {
      setJoinLobbyId(lobbyParam);
      setAppState('join_lobby');
    }
  }, []);

  // Setup WebSocket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('lobby_created', ({ lobby, inviteLink }) => {
      setLobby(lobby);
      setInviteLink(inviteLink);
      const host = lobby.players.find(p => p.isHost);
      if (host) setPlayer(host);
      setAppState('lobby');
    });

    socket.on('lobby_joined', ({ lobby, player }) => {
      setLobby(lobby);
      setPlayer(player);
      setAppState('avatar_selection');
    });

    socket.on('lobby_updated', ({ lobby }) => {
      setLobby(lobby);
      
      // Transition to battle if game started
      if (lobby.gamePhase === 'battle' && appState !== 'battle') {
        setAppState('battle');
      }
    });

    socket.on('avatar_selected', ({ playerId, avatar }) => {
      if (currentPlayer?.id === playerId && appState === 'avatar_selection') {
        setAppState('lobby');
      }
    });

    socket.on('battle_started', ({ lobby, boss }) => {
      setLobby(lobby);
      setBoss(boss);
      setAppState('battle');
    });

    socket.on('scores_revealed', ({ scores, consensus }) => {
      console.log('Scores revealed:', { scores, consensus });
      // Game state will be updated via lobby_updated event
    });

    socket.on('boss_attacked', ({ playerId, damage, bossHealth }) => {
      console.log(`Player ${playerId} dealt ${damage} damage. Boss health: ${bossHealth}`);
    });

    socket.on('boss_defeated', ({ lobby }) => {
      console.log('Boss defeated!', lobby);
    });

    socket.on('game_error', ({ message }) => {
      setError(message);
      console.error('Game error:', message);
    });

    socket.on('player_disconnected', ({ playerId }) => {
      console.log(`Player ${playerId} disconnected`);
    });

    return () => {
      socket.off('lobby_created');
      socket.off('lobby_joined');
      socket.off('lobby_updated');
      socket.off('avatar_selected');
      socket.off('battle_started');
      socket.off('scores_revealed');
      socket.off('boss_attacked');
      socket.off('boss_defeated');
      socket.off('game_error');
      socket.off('player_disconnected');
    };
  }, [socket, currentPlayer, appState, setLobby, setPlayer, setBoss, setInviteLink, setError]);

  const handleBackToMenu = () => {
    clearAll();
    setAppState('menu');
    window.history.replaceState(null, '', window.location.pathname);
  };

  const renderCurrentState = () => {
    if (!isConnected) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="retro-card text-center">
            <h2 className="text-xl font-bold mb-4">Connecting to Server...</h2>
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        </div>
      );
    }

    switch (appState) {
      case 'menu':
        return (
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="retro-card text-center max-w-md w-full">
              <h1 className="text-4xl font-bold retro-text-glow mb-2">
                SCRUM QUEST
              </h1>
              <p className="text-lg text-gray-400 mb-8">
                Battle Jira Tickets in Epic JRPG Style!
              </p>
              
              <div className="space-y-4">
                <RetroButton
                  onClick={() => setAppState('create_lobby')}
                  className="w-full"
                >
                  Create Battle Lobby
                </RetroButton>
                
                <RetroButton
                  onClick={() => setAppState('join_lobby')}
                  className="w-full"
                  variant="secondary"
                >
                  Join Battle
                </RetroButton>
              </div>
              
              <div className="mt-8 pt-4 border-t border-gray-600">
                <RetroButton
                  onClick={toggleMute}
                  size="sm"
                  variant="secondary"
                >
                  {isMuted ? '🔇 Unmute' : '🔊 Mute'}
                </RetroButton>
              </div>
            </div>
          </div>
        );

      case 'create_lobby':
        return <LobbyCreation onLobbyCreated={() => {}} />;

      case 'join_lobby':
        return <LobbyJoin lobbyId={joinLobbyId} onLobbyJoined={() => {}} />;

      case 'avatar_selection':
        return <AvatarSelection />;

      case 'lobby':
        return <Lobby />;

      case 'battle':
        return <BattleScreen />;

      default:
        return null;
    }
  };

  return (
    <div className="retro-container">
      {/* Back button (except on menu) */}
      {appState !== 'menu' && appState !== 'battle' && (
        <div className="absolute top-4 left-4 z-50">
          <RetroButton
            onClick={handleBackToMenu}
            size="sm"
            variant="secondary"
          >
            ← Back to Menu
          </RetroButton>
        </div>
      )}

      {renderCurrentState()}
    </div>
  );
}

export default App;
