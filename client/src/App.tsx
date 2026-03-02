import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from '@/components/ui/sonner';
import { DeveloperMenu } from '@/components/ui/DeveloperMenu';
import { UserMenu } from '@/components/auth/UserMenu';
import { RetroButton } from '@/components/ui/retro-button';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useAudio } from '@/lib/stores/useAudio';
import { useAuth } from '@/lib/stores/useAuth';
import { useBacktickKey } from '@/hooks/useBacktickKey';
import { useKonamiCode } from '@/hooks/useKonamiCode';
import { setupEventHandlers, teardownEventHandlers } from '@/lib/socket/eventHandlers';
import { useEventSync } from '@/lib/stores/useEventSync';
import { CheatMenu } from '@/components/ui/CheatMenu';
import { ReconnectionStatus } from '@/components/ui/ReconnectionStatus';
import { ConnectionIndicator } from '@/components/ui/ConnectionIndicator';
import { ReconnectionDialog } from '@/components/ui/ReconnectionDialog';
import { fetchCsrfToken } from '@/lib/csrfToken';
import '@/styles/retro.css';
import '@/styles/tokens.css';
import '@/styles/mobile.css';

/**
 * App Layout Component
 * Handles global concerns: WebSocket, audio, auth, developer tools
 * Route content renders via <Outlet />
 */
function App() {
  const [showDeveloperMenu, setShowDeveloperMenu] = useState(false);
  const [showCheatMenu, setShowCheatMenu] = useState(false);
  const [showReconnectionDialog, setShowReconnectionDialog] = useState(false);
  const location = useLocation();

  const { socket, connect, disconnect, isConnected, reconnection } = useWebSocket();
  const {
    toggleMute,
    isMuted,
    setMenuMusic,
    setBossMusic,
    setButtonSelectSound,
    setExplosionSound,
    setHitSound,
    setWalkingSound,
    setMusicTracks,
    fadeInMenuMusic,
    fadeOutMenuMusic,
    isMenuMusicPlaying,
  } = useAudio();

  // Auth state
  const { checkAuth } = useAuth();

  // Fetch CSRF token and check auth on mount
  useEffect(() => {
    fetchCsrfToken();
    checkAuth();
  }, [checkAuth]);


  // Developer menu hotkey
  useBacktickKey(() => {
    setShowDeveloperMenu(!showDeveloperMenu);
  });

  // Konami code for cheat menu
  useKonamiCode(() => {
    setShowCheatMenu(true);
  });

  // Connect to WebSocket on mount and setup menu music
  useEffect(() => {
    connect();

    // Load music tracks
    const tracks = [
      {
        name: 'Main Theme',
        file: '/sounds/menu-theme.mp3',
        audio: new Audio('/sounds/menu-theme.mp3')
      },
      {
        name: 'Scrum Battles',
        file: '/sounds/scrum-battles.mp3',
        audio: new Audio('/sounds/scrum-battles.mp3')
      }
    ];

    // Preload all tracks
    tracks.forEach(track => {
      if (track.audio) {
        track.audio.preload = 'auto';
      }
    });

    setMusicTracks(tracks);
    setMenuMusic(tracks[0].audio!); // Set first track as default

    // Load button select sound
    const buttonSelectAudio = new Audio('/sounds/button-select.mp3');
    buttonSelectAudio.preload = 'auto';
    setButtonSelectSound(buttonSelectAudio);

    // Load hit sound
    const hitAudio = new Audio('/sounds/hit.mp3');
    hitAudio.preload = 'auto';
    setHitSound(hitAudio);

    // Load explosion sound
    const explosionAudio = new Audio('/sounds/explosion.mp3');
    explosionAudio.preload = 'auto';
    setExplosionSound(explosionAudio);

    // Load boss music
    const bossAudio = new Audio('/sounds/boss-fight.mp3');
    bossAudio.preload = 'auto';
    setBossMusic(bossAudio);

    // Load walking sound
    const walkingAudio = new Audio('/sounds/walking.mp3');
    walkingAudio.preload = 'auto';
    setWalkingSound(walkingAudio);

    return () => disconnect();
  }, [connect, disconnect, setMenuMusic, setBossMusic, setButtonSelectSound, setExplosionSound, setHitSound, setWalkingSound, setMusicTracks]);

  // Handle reconnection dialog visibility
  useEffect(() => {
    if (reconnection.status === 'failed' && reconnection.attempt >= reconnection.maxAttempts) {
      setShowReconnectionDialog(true);
    } else if (reconnection.status === 'connected') {
      setShowReconnectionDialog(false);
    }
  }, [reconnection.status, reconnection.attempt, reconnection.maxAttempts]);

  // Handle menu music based on current route
  useEffect(() => {
    const marketingRoutes = ['/', '/about', '/features', '/pricing', '/support', '/play'];
    const isMarketingPage = marketingRoutes.includes(location.pathname);

    if (isMarketingPage && !isMuted && !isMenuMusicPlaying) {
      // Small delay to ensure audio is loaded
      setTimeout(() => fadeInMenuMusic(), 500);
    } else if (!isMarketingPage && isMenuMusicPlaying) {
      fadeOutMenuMusic();
    }
  }, [location.pathname, isMuted, isMenuMusicPlaying, fadeInMenuMusic, fadeOutMenuMusic]);

  // Setup fine-grained event handlers
  useEffect(() => {
    if (!socket) return;
    setupEventHandlers(socket);
    return () => {
      teardownEventHandlers(socket);
      useEventSync.getState().reset();
    };
  }, [socket]);

  // Determine if we should show mute button and user menu
  const showTopRightControls = ['/', '/about', '/features', '/pricing', '/support', '/play'].includes(location.pathname);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="retro-card text-center">
          <div className="flex justify-center mb-4">
            <img
              src="/scrum-monster-icon.png"
              alt="Scrum Monster"
              className="w-16 h-16 pixelated object-contain animate-pulse"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <h2 className="text-xl font-bold mb-4">Connecting to Server...</h2>
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <div className="retro-container">
        {/* User Menu and Mute Button (top right) - show on menu and marketing pages */}
        {showTopRightControls && (
          <div className="absolute top-4 right-4 z-[100] flex items-center gap-2">
            <RetroButton
              onClick={toggleMute}
              variant="secondary"
              size="sm"
              className={`${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} flex items-center gap-2`}
            >
              {isMuted ? '🔇' : '🔊'}
            </RetroButton>
            <UserMenu />
          </div>
        )}

        {/* Route content */}
        <Outlet />

      {/* Developer Menu */}
      <DeveloperMenu
        isOpen={showDeveloperMenu}
        onClose={() => setShowDeveloperMenu(false)}
        onOpenCharacterTools={() => { /* Character tools removed from App - TODO: add to route */ }}
        onOpenBossTools={() => { /* Boss tools removed from App - TODO: add to route */ }}
      />

      {/* Cheat Menu (Konami Code) */}
      <CheatMenu
        isOpen={showCheatMenu}
        onClose={() => setShowCheatMenu(false)}
      />

      {/* Reconnection Status */}
      <ReconnectionStatus />

      {/* Connection Indicator */}
      <ConnectionIndicator />

      {/* Reconnection Dialog */}
      <ReconnectionDialog
        isOpen={showReconnectionDialog}
        onClose={() => setShowReconnectionDialog(false)}
        onRefreshPage={() => window.location.reload()}
      />

      {/* Toast Notifications */}
      <Toaster />
      </div>
    </HelmetProvider>
  );
}

export default App;
