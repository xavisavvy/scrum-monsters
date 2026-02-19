import { useEffect, useState, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { useAudio } from '@/lib/stores/useAudio';
import { LastLobbyStorage } from '@/lib/utils/lastLobbyStorage';
import { PlayerNameStorage } from '@/lib/utils/playerNameStorage';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// Lazy load heavy game components
const Lobby = lazy(() => import('@/components/game/Lobby').then(m => ({ default: m.Lobby })));
const AvatarSelection = lazy(() => import('@/components/game/AvatarSelection').then(m => ({ default: m.AvatarSelection })));
const BattleScreen = lazy(() => import('@/components/game/BattleScreen').then(m => ({ default: m.BattleScreen })));

function GameLoadingFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-yellow-400 font-bold text-lg">Loading Game...</p>
        <p className="text-gray-400 text-sm mt-2">Preparing your quest...</p>
      </div>
    </div>
  );
}

/**
 * Game route component - handles /game/:lobbyId
 * Manages all game phases: avatar_selection, lobby, battle
 * URL stays stable during phase transitions (server state drives rendering)
 */
export default function GamePage() {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();
  const [battleRemountKey, setBattleRemountKey] = useState(0);
  const [lastGamePhase, setLastGamePhase] = useState<string | null>(null);
  const [isBattleUnmounting, setIsBattleUnmounting] = useState(false);
  const [isAttemptingJoin, setIsAttemptingJoin] = useState(false);

  const { socket, emit, reconnectToLobby, getReconnectToken, clearReconnectionState } = useWebSocket();
  const {
    currentLobby,
    currentPlayer,
    setLobby,
    setPlayer,
    setBoss,
    setInviteLink,
    setError,
    clearAll,
  } = useGameState();

  const { fadeOutMenuMusic } = useAudio();

  // Auto-join lobby when navigating to /game/:lobbyId
  useEffect(() => {
    if (!lobbyId || !socket) return;

    // If already in this lobby, nothing to do
    if (currentLobby?.id === lobbyId.toUpperCase()) return;

    // Prevent duplicate joins
    if (isAttemptingJoin) return;

    setIsAttemptingJoin(true);

    // Try reconnection with token first (preserves avatar)
    const token = getReconnectToken();
    if (token && reconnectToLobby()) {
      console.log('✅ Attempting reconnection with token for', lobbyId);
      // Connection will be handled via lobby_sync event
      return;
    }

    // Fall back to join_lobby (new player, needs avatar selection)
    const savedName = PlayerNameStorage.loadName();
    if (savedName) {
      console.log('⚠️ No reconnect token, joining as new player');
      fadeOutMenuMusic();
      emit('join_lobby', {
        lobbyId: lobbyId.toUpperCase(),
        playerName: savedName
      });
    } else {
      // No saved name - user needs to provide one
      // This would typically redirect to a name entry screen
      // For now, we'll just show an error
      toast.error('Please enter your name first');
      navigate('/play');
    }
  }, [lobbyId, socket, currentLobby, isAttemptingJoin]);

  // Setup game-specific WebSocket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('lobby_created', ({ lobby, inviteLink }) => {
      setLobby(lobby);
      setInviteLink(inviteLink);
      const host = lobby.players.find(p => p.isHost);
      if (host) setPlayer(host);
      LastLobbyStorage.saveLastLobby(lobby.id, lobby.name);
      setIsAttemptingJoin(false);
      // Host goes through avatar selection - current phase will render
    });

    socket.on('lobby_joined', ({ lobby, player }) => {
      setLobby(lobby);
      setPlayer(player);
      LastLobbyStorage.saveLastLobby(lobby.id, lobby.name);
      setIsAttemptingJoin(false);
      // Player will go through avatar selection
    });

    socket.on('lobby_sync', ({ lobby, yourPlayer }) => {
      console.log('📥 GamePage received lobby sync from reconnection');
      setLobby(lobby);
      setPlayer(yourPlayer);
      setIsAttemptingJoin(false);
      // Lobby phase will render based on server state
    });

    socket.on('reconnect_response', ({ result, message, newHost }) => {
      if (result !== 'success') {
        console.log('❌ Reconnection failed:', message);
        setIsAttemptingJoin(false);

        if (result === 'lobby_closed') {
          LastLobbyStorage.clearLastLobby();
          toast.error('Lobby no longer exists');
          navigate('/play');
        }
      } else if (newHost) {
        toast.info(`${newHost} became the host while you were disconnected.`, {
          duration: 5000,
          icon: '👑'
        });
      }
    });

    socket.on('lobby_updated', ({ lobby }) => {
      console.warn('Received deprecated lobby_updated event');
      setLobby(lobby);

      // Update currentPlayer with fresh data
      if (currentPlayer) {
        const updatedPlayer = lobby.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setPlayer(updatedPlayer);
        }
      }

      // Force BattleScreen remount on significant state changes
      const shouldRemount = (
        (lastGamePhase && lastGamePhase !== 'battle' && lobby.gamePhase === 'battle') ||
        (lastGamePhase === 'battle' && lobby.gamePhase === 'battle' &&
         JSON.stringify(currentLobby?.currentTicket) !== JSON.stringify(lobby.currentTicket))
      );

      if (shouldRemount) {
        console.log(`🔄 REMOUNT: ${lastGamePhase} → ${lobby.gamePhase}`);
        setIsBattleUnmounting(true);
        setTimeout(() => {
          setBattleRemountKey(prev => prev + 1);
          setIsBattleUnmounting(false);
        }, 100);
      }

      setLastGamePhase(lobby.gamePhase);
    });

    socket.on('avatar_selected', ({ playerId, avatar }) => {
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.map(p =>
            p.id === playerId ? { ...p, avatar, avatarClass: avatar } : p
          )
        };
        setLobby(updatedLobby);
      }

      if (currentPlayer?.id === playerId) {
        setPlayer({ ...currentPlayer, avatar, avatarClass: avatar });
      }
    });

    socket.on('battle_started', ({ lobby, boss }) => {
      setLobby(lobby);
      setBoss(boss);
    });

    socket.on('boss_attacked', ({ playerId, damage, bossHealth }) => {
      const { currentBoss, setBoss, currentLobby, setLobby } = useGameState.getState();
      if (currentBoss) {
        setBoss({ ...currentBoss, currentHealth: bossHealth });
      }
      if (currentLobby?.boss) {
        setLobby({
          ...currentLobby,
          boss: { ...currentLobby.boss, currentHealth: bossHealth },
        });
      }
    });

    socket.on('boss_healed', ({ bossHealth }: { bossHealth: number }) => {
      const { currentBoss, setBoss, currentLobby, setLobby } = useGameState.getState();
      if (currentBoss) {
        setBoss({ ...currentBoss, currentHealth: bossHealth });
      }
      if (currentLobby?.boss) {
        setLobby({
          ...currentLobby,
          boss: { ...currentLobby.boss, currentHealth: bossHealth },
        });
      }
    });

    socket.on('quest_abandoned', ({ lobby }) => {
      console.log('Quest abandoned - returning to lobby');
      setLobby(lobby);
    });

    socket.on('game_error', ({ message }) => {
      setError(message);
      toast.error(message);
      setTimeout(() => setError(null), 100);

      if (message.toLowerCase().includes('lobby not found')) {
        LastLobbyStorage.clearLastLobby();
        setIsAttemptingJoin(false);
        navigate('/play');
      }
    });

    socket.on('host_transferred', ({ oldHostId, newHostId, newHostName, reason }) => {
      if (currentPlayer?.id === newHostId) {
        toast.success(`You are now the host!`, {
          duration: 5000,
          icon: '👑'
        });
      } else {
        toast.info(`${newHostName} is now the host.`, {
          duration: 3000,
          icon: '👑'
        });
      }
    });

    return () => {
      socket.off('lobby_created');
      socket.off('lobby_joined');
      socket.off('lobby_sync');
      socket.off('reconnect_response');
      socket.off('lobby_updated');
      socket.off('avatar_selected');
      socket.off('battle_started');
      socket.off('boss_attacked');
      socket.off('boss_healed');
      socket.off('quest_abandoned');
      socket.off('game_error');
      socket.off('host_transferred');
    };
  }, [socket, currentPlayer, currentLobby, lastGamePhase]);

  const handleBackToMenu = () => {
    if (currentLobby) {
      emit('leave_lobby', {});
    }
    LastLobbyStorage.clearLastLobby();
    clearReconnectionState();
    clearAll();
    navigate('/play');
  };

  // Render appropriate component based on server-driven game phase
  const renderGamePhase = () => {
    if (!currentLobby) {
      return (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="retro-card text-center">
            <h2 className="text-xl font-bold mb-4">Connecting to Lobby...</h2>
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        </div>
      );
    }

    const phase = currentLobby.gamePhase;

    if (phase === 'avatar_selection') {
      return (
        <Suspense fallback={<GameLoadingFallback />}>
          <AvatarSelection />
        </Suspense>
      );
    }

    if (phase === 'lobby') {
      return (
        <Suspense fallback={<GameLoadingFallback />}>
          <Lobby />
        </Suspense>
      );
    }

    if (['battle', 'scoring', 'reveal', 'discussion', 'victory', 'next_level', 'game_over'].includes(phase)) {
      if (isBattleUnmounting) {
        return (
          <div className="retro-container bg-gray-900 flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="text-xl font-bold text-cyan-400 mb-4">⚡ Entering Battle...</div>
              <div className="text-sm text-gray-400">Preparing combat systems...</div>
            </div>
          </div>
        );
      }

      return (
        <Suspense fallback={<GameLoadingFallback />}>
          <ErrorBoundary
            fallback={
              <div className="retro-container bg-gray-900 flex items-center justify-center h-screen">
                <div className="text-center">
                  <div className="text-xl font-bold text-red-400 mb-4">⚡ Battle System Recovered</div>
                  <div className="text-sm text-gray-400">Combat systems automatically restored</div>
                </div>
              </div>
            }
          >
            <BattleScreen
              key={`battle-${battleRemountKey}-${phase}-${currentLobby.currentTicket?.id || 'none'}`}
            />
          </ErrorBoundary>
        </Suspense>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="retro-card text-center">
          <h2 className="text-xl font-bold mb-4">Unknown Game Phase: {phase}</h2>
        </div>
      </div>
    );
  };

  return <>{renderGamePhase()}</>;
}
