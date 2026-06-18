import { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { useAudio } from '@/lib/stores/useAudio';
import { LastLobbyStorage } from '@/lib/utils/lastLobbyStorage';
import { clearSession } from '@/lib/utils/sessionStorage';
import { PlayerNameStorage } from '@/lib/utils/playerNameStorage';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PageMeta } from '@/components/seo/PageMeta';
import { getGameMeta } from '@/components/seo/metaConfig';
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay';
import { YoutubeAudioPlayer } from '@/components/ui/YoutubeAudioPlayer';

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
  const [isAttemptingJoin, setIsAttemptingJoin] = useState(false);

  const { socket, emit, reconnectToLobby, getReconnectToken, clearReconnectionState: _clearReconnectionState } = useWebSocket();
  const {
    currentLobby,
    currentPlayer,
    setLobby,
    setPlayer,
    setBoss,
    setInviteLink,
    setError,
    clearAll: _clearAll,
    // Phase 42-02b Task 2: BattleScreen remount control migrated from local
    // state into the store so eventHandlers.ts (session:phase_changed +
    // session:ticket_advanced) can trigger the remount centrally.
    battleRemountKey,
    isBattleUnmounting,
  } = useGameState();

  const { fadeOutMenuMusic } = useAudio();

  // Refs that mirror state used inside the socket-listener handlers. Handlers
  // read from these refs (not from the captured state values) so the listener
  // useEffect can register exactly once per `socket` instance and never tear
  // down on currentLobby / currentPlayer changes — the teardown-during-emit
  // race was the root cause of the snapshot/last-lobby drift documented in
  // 41-RESEARCH.md. (Phase 42-02b removed lastGamePhaseRef along with the
  // deprecated `lobby_updated` handler — phase tracking + battle remount now
  // live in the store / eventHandlers.ts.)
  const currentLobbyRef = useRef(currentLobby);
  const currentPlayerRef = useRef(currentPlayer);
  useEffect(() => {
    currentLobbyRef.current = currentLobby;
    currentPlayerRef.current = currentPlayer;
  }, [currentLobby, currentPlayer]);

  // Auto-join lobby when navigating to /game/:lobbyId
  useEffect(() => {
    if (!lobbyId || !socket) return;

    // If already in this lobby, nothing to do
    if (currentLobby?.id === lobbyId.toUpperCase()) return;

    // Prevent duplicate joins
    if (isAttemptingJoin) return;

    setIsAttemptingJoin(true);

    // Phase 41-02: If useWebSocket already has a coherent snapshot for THIS
    // lobby (e.g. host just emitted create_lobby and the lobby_sync handler in
    // useWebSocket populated lastLobbySnapshot synchronously), hydrate
    // useGameState from it and short-circuit. Without this, GamePage mounts
    // with currentLobby=null and races a duplicate join_lobby that mints a
    // phantom self in the roster — see 41-RESEARCH.md.
    const snapshot = useWebSocket.getState().lastLobbySnapshot;
    if (snapshot && snapshot.lobby.id === lobbyId.toUpperCase()) {
      setLobby(snapshot.lobby);
      if (snapshot.player) setPlayer(snapshot.player);
      setIsAttemptingJoin(false);
      return;
    }

    // Try reconnection with token first (preserves avatar)
    const token = getReconnectToken();
    if (token && reconnectToLobby(lobbyId.toUpperCase())) {
      // Connection will be handled via lobby_sync event
      return;
    }

    // Fall back to join_lobby (new player, needs avatar selection)
    const savedName = PlayerNameStorage.loadName();
    if (savedName) {
      fadeOutMenuMusic();
      emit('join_lobby', {
        lobbyId: lobbyId.toUpperCase(),
        playerName: savedName
      });
    } else {
      // No saved name — route to /play with the lobby code preserved as
      // a query param. MenuPage detects ?join=CODE on mount and pre-opens
      // the LobbyJoin form with the lobby ID filled in, so the user just
      // enters their name once and joins. Without the query param, fresh
      // users hitting /join/CODE links would be stranded on /play with
      // no way back into the lobby they came for.
      navigate(`/play?join=${encodeURIComponent(lobbyId.toUpperCase())}`);
    }
    // Rejoin logic depends on URL lobbyId + socket presence; setters/handlers read latest via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setLobby(lobby);
      setPlayer(yourPlayer);
      setIsAttemptingJoin(false);
      // Keep last-lobby in sync with the active snapshot so the three keys
      // cannot drift on transport upgrade or a late lobby_sync arrival.
      LastLobbyStorage.saveLastLobby(lobby.id, lobby.name);
      // Lobby phase will render based on server state
    });

    socket.on('reconnect_response', ({ result, message, newHost }) => {
      if (result !== 'success') {
        setIsAttemptingJoin(false);

        // Belt-and-braces cleanup: useWebSocket already calls clearSession()
        // for every failure result, but doing it here too keeps GamePage's
        // navigation path coherent and ensures last-lobby is wiped before
        // routing back to MenuPage. Show a single user-facing toast.
        clearSession();

        if (result === 'lobby_closed') {
          toast.error('Lobby no longer exists');
        } else if (
          result === 'invalid_token' ||
          result === 'grace_expired' ||
          result === 'server_error'
        ) {
          // Note: ReconnectResult does not include 'lobby_not_found' — server
          // emits that as a game_error message instead (handled below).
          toast.error('Your previous session expired.', {
            description: message || undefined,
            duration: 4000,
          });
        }
        navigate('/play');
      } else if (newHost) {
        toast.info(`${newHost} became the host while you were disconnected.`, {
          duration: 5000,
          icon: '👑'
        });
      }
    });

    // Phase 42-02b Task 2: deleted deprecated `lobby_updated` handler
    // (formerly here at lines 188-219). State updates now flow through
    // fine-grained handlers in client/src/lib/socket/eventHandlers.ts.
    // BattleScreen remount logic moved to session:phase_changed (entry to
    // 'battle') and session:ticket_advanced (mid-battle ticket change),
    // driven by useGameState.requestBattleRemount().

    // Phase 45-05B L6: legacy `avatar_selected` handler removed; the
    // session:avatar_selected handler in eventHandlers.ts already does the
    // same hasSelectedAvatar flip on lobby + currentPlayer.

    socket.on('battle_started', ({ lobby, boss }) => {
      setLobby(lobby);
      setBoss(boss);
    });

    // Phase 45-05B L4/L5: legacy boss_attacked / boss_healed handlers removed;
    // combat:boss_damaged + combat:boss_healed in eventHandlers.ts now mirror
    // health to both currentBoss and currentLobby.boss.

    socket.on('quest_abandoned', ({ lobby }) => {
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

    socket.on('host_transferred', ({ oldHostId: _oldHostId, newHostId, newHostName, reason: _reason }) => {
      const cp = currentPlayerRef.current;
      if (cp?.id === newHostId) {
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
      // Phase 42-02b: lobby_updated handler removed; no listener to detach.
      // Phase 45-05B: avatar_selected handler removed (see session:avatar_selected).
      socket.off('battle_started');
      socket.off('quest_abandoned');
      socket.off('game_error');
      socket.off('host_transferred');
    };
    // Listener registration depends only on `socket` and the static `navigate`.
    // Handlers read latest currentLobby / currentPlayer / lastGamePhase via
    // refs, so the effect never tears down on those state changes — closing
    // the lobby_sync teardown-during-emit race that produced snapshot drift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, navigate]);

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

    // Per-player avatar gate. As of 2026-05-15, `lobby.gamePhase` is no
    // longer driven into 'avatar_selection' on the server — the legacy
    // `GameState.startGame` path was dead code. Each player independently
    // sees AvatarSelection before the Lobby view based on their own
    // `hasSelectedAvatar` flag, regardless of the lobby's shared phase.
    // This satisfies the UX expectation that you pick your class before
    // you ever see the lobby while keeping host actions (ticket import,
    // settings) unblocked once the host picks. See
    // .planning/debug/resolved/avatar-selection-skipped.md.
    // The phase === 'avatar_selection' branch is kept as a fallback in
    // case any external integration sets that phase explicitly, but it
    // should not fire in normal play.
    const needsAvatarSelection =
      !!currentPlayer && currentPlayer.hasSelectedAvatar === false;
    if (needsAvatarSelection || phase === 'avatar_selection') {
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

  return (
    <>
      <PageMeta meta={getGameMeta(currentLobby?.name, lobbyId)} />
      {renderGamePhase()}
      <TutorialOverlay />
      <YoutubeAudioPlayer />
    </>
  );
}
