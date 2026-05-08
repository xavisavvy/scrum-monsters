import { useState } from 'react';
import { useNavigate } from 'react-router';
import { RetroButton } from '@/components/ui/retro-button';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { LobbyCreation } from '@/components/game/LobbyCreation';
import { LobbyJoin } from '@/components/game/LobbyJoin';
import { useAudio } from '@/lib/stores/useAudio';
import { LastLobbyStorage } from '@/lib/utils/lastLobbyStorage';
import { PageMeta } from '@/components/seo/PageMeta';
import { META_CONFIG } from '@/components/seo/metaConfig';

type MenuState = 'main' | 'create_lobby' | 'join_lobby';

/**
 * Game menu page - Create/Join lobby flows
 * Navigates to /game/:lobbyId when lobby is created/joined
 */
export default function MenuPage() {
  const navigate = useNavigate();
  const [menuState, setMenuState] = useState<MenuState>('main');
  const [joinLobbyId] = useState<string>('');
  const [lastLobby, setLastLobby] = useState(LastLobbyStorage.loadLastLobby());

  const { fadeOutMenuMusic, playButtonSelect, switchToNextTrack } = useAudio();
  const currentTrackName = useAudio(state =>
    state.musicTracks[state.currentTrackIndex]?.name ?? 'Loading...'
  );

  const handleCreateLobby = () => {
    playButtonSelect();
    fadeOutMenuMusic();
    setMenuState('create_lobby');
  };

  const handleJoinLobby = () => {
    playButtonSelect();
    fadeOutMenuMusic();
    setMenuState('join_lobby');
  };

  const handleRejoin = () => {
    if (!lastLobby) return;

    playButtonSelect();
    fadeOutMenuMusic();

    // Navigate to /game/:lobbyId so GamePage mounts and runs its auto-join
    // useEffect. GamePage handles the full rejoin flow (snapshot hydration →
    // token reconnect → join_lobby fallback) AND registers the lobby_sync
    // handler that actually sets currentLobby in useGameState. Emitting
    // reconnect_with_token from here without navigating left the user stuck
    // on /play because no GamePage was mounted to receive lobby_sync.
    navigate(`/game/${lastLobby.lobbyId.toUpperCase()}`);
  };

  if (menuState === 'create_lobby') {
    return <LobbyCreation onLobbyCreated={() => {}} />;
  }

  if (menuState === 'join_lobby') {
    return <LobbyJoin lobbyId={joinLobbyId} onLobbyJoined={() => {}} />;
  }

  // Main menu
  return (
    <>
      <PageMeta meta={META_CONFIG.play} />
      <CinematicBackground />

      {/* Back Button */}
      <div className="absolute top-4 left-4 z-[100]">
        <RetroButton
          onClick={() => {
            playButtonSelect();
            navigate('/');
          }}
          size="sm"
          variant="secondary"
        >
          ← Back to Home
        </RetroButton>
      </div>

      <div className="flex items-center justify-center min-h-screen p-6 relative z-20">
        <div className="retro-card text-center max-w-md w-full">
          <div className="flex items-center justify-center gap-4 mb-2">
            <img
              src="/scrum-monster-icon.png"
              alt="Scrum Monster"
              className="w-12 h-12 pixelated object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
            <h1 className="text-4xl font-bold retro-text-glow">
              SCRUM MONSTERS
            </h1>
            <img
              src="/scrum-monster-icon.png"
              alt="Scrum Monster"
              className="w-12 h-12 pixelated object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <p className="text-lg text-gray-400 mb-8">
            Battle Tickets in Epic JRPG Style!
          </p>

          <div className="space-y-4">
            {lastLobby && (
              <div className="mb-2">
                <RetroButton
                  onClick={handleRejoin}
                  className="w-full"
                  variant="primary"
                >
                  🔄 Rejoin: {lastLobby.lobbyName}
                </RetroButton>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  Lobby Code: {lastLobby.lobbyId}
                </p>
              </div>
            )}

            <RetroButton
              onClick={handleCreateLobby}
              className="w-full"
            >
              Create Battle Lobby
            </RetroButton>

            <RetroButton
              onClick={handleJoinLobby}
              className="w-full"
              variant="secondary"
            >
              Join Battle
            </RetroButton>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-600 space-y-3">
            <RetroButton
              onClick={() => {
                playButtonSelect();
                switchToNextTrack();
              }}
              size="sm"
              variant="secondary"
              className="w-full"
            >
              🎵 {currentTrackName}
            </RetroButton>
          </div>

          {/* Credits Section */}
          <div className="mt-6 pt-4 border-t border-gray-700 text-center">
            <div className="text-sm text-gray-400 mb-3">
              Made with ❤️ by{' '}
              <a
                href="https://prestonfarr.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                Preston Farr
              </a>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Consider Supporting my work
            </p>
            <RetroButton
              onClick={() => window.open('https://donate.stripe.com/5kQ00j4Up7yf7Nj9Uee7m00', '_blank')}
              size="sm"
              variant="secondary"
              className="text-xs"
            >
              💳 Donate via Stripe
            </RetroButton>
          </div>
        </div>
      </div>
    </>
  );
}
