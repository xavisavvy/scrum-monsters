import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { LobbyCreation } from '@/components/game/LobbyCreation';
import { LobbyJoin } from '@/components/game/LobbyJoin';
import { Lobby } from '@/components/game/Lobby';
import { AvatarSelection } from '@/components/game/AvatarSelection';
import { BattleScreen } from '@/components/game/BattleScreen';
import { LandingPage } from '@/components/marketing/LandingPage';
import { AboutPage } from '@/components/marketing/AboutPage';
import { FeaturesPage } from '@/components/marketing/FeaturesPage';
import { PricingPage } from '@/components/marketing/PricingPage';
import { SupportPage } from '@/components/marketing/SupportPage';
import { RetroButton } from '@/components/ui/retro-button';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { DeveloperMenu } from '@/components/ui/DeveloperMenu';
import { CharacterTools } from '@/components/utils/CharacterTools';
import { BossTools } from '@/components/utils/BossTools';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { useAudio } from '@/lib/stores/useAudio';
import { useBacktickKey } from '@/hooks/useBacktickKey';
import { useKonamiCode } from '@/hooks/useKonamiCode';
import { CheatMenu } from '@/components/ui/CheatMenu';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import '@/styles/retro.css';

type AppState = 'landing' | 'about' | 'features' | 'pricing' | 'support' | 'menu' | 'create_lobby' | 'join_lobby' | 'lobby' | 'avatar_selection' | 'battle' | 'character_tools' | 'boss_tools';

function App() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [joinLobbyId, setJoinLobbyId] = useState<string>('');
  const [showDeveloperMenu, setShowDeveloperMenu] = useState(false);
  const [showCheatMenu, setShowCheatMenu] = useState(false);
  
  // Force remount mechanism for critical phase transitions
  const [battleRemountKey, setBattleRemountKey] = useState(0);
  const [lastGamePhase, setLastGamePhase] = useState<string | null>(null);
  
  const { socket, connect, disconnect, isConnected } = useWebSocket();
  const { 
    currentLobby, 
    currentPlayer, 
    error,
    setLobby, 
    setPlayer, 
    setBoss, 
    setInviteLink, 
    setError,
    clearAll 
  } = useGameState();
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
    stopMenuMusic,
    playButtonSelect,
    switchToNextTrack,
    isMenuMusicPlaying 
  } = useAudio();
  
  // Direct selector for current track name to ensure re-renders
  const currentTrackName = useAudio(state => 
    state.musicTracks[state.currentTrackIndex]?.name ?? 'Loading...'
  );

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
  }, [connect, disconnect, setMenuMusic, setBossMusic, setButtonSelectSound, setHitSound, setExplosionSound, setWalkingSound, setMusicTracks]);

  // Check for URL parameters and routing
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const lobbyParam = urlParams.get('join');
    const gameParam = urlParams.get('game');
    const pageParam = urlParams.get('page');
    
    if (lobbyParam) {
      setJoinLobbyId(lobbyParam);
      setAppState('join_lobby');
    } else if (gameParam === 'menu') {
      setAppState('menu');
    } else if (pageParam === 'about') {
      setAppState('about');
    } else if (pageParam === 'features') {
      setAppState('features');
    } else if (pageParam === 'pricing') {
      setAppState('pricing');
    } else if (pageParam === 'support') {
      setAppState('support');
    }
    // Default stays on landing page
  }, []);

  // Auto-scroll to top when navigating to marketing pages
  useEffect(() => {
    const marketingPages = ['about', 'features', 'pricing', 'support'];
    if (marketingPages.includes(appState)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [appState]);

  // Handle menu music based on app state
  useEffect(() => {
    const marketingPages = ['menu', 'landing', 'about', 'features', 'pricing', 'support'];
    if (marketingPages.includes(appState) && !isMuted && !isMenuMusicPlaying) {
      // Small delay to ensure audio is loaded
      setTimeout(() => fadeInMenuMusic(), 500);
    } else if (!marketingPages.includes(appState) && isMenuMusicPlaying) {
      fadeOutMenuMusic();
    }
  }, [appState, isMuted, isMenuMusicPlaying, fadeInMenuMusic, fadeOutMenuMusic]);

  // Setup WebSocket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('lobby_created', ({ lobby, inviteLink }) => {
      setLobby(lobby);
      setInviteLink(inviteLink);
      const host = lobby.players.find(p => p.isHost);
      if (host) setPlayer(host);
      setAppState('avatar_selection'); // Host also goes through avatar selection
    });

    socket.on('lobby_joined', ({ lobby, player }) => {
      setLobby(lobby);
      setPlayer(player);
      setAppState('avatar_selection');
    });

    socket.on('lobby_updated', ({ lobby }) => {
      setLobby(lobby);
      
      // Update currentPlayer with fresh data if they're still in the lobby
      if (currentPlayer) {
        const updatedPlayer = lobby.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setPlayer(updatedPlayer);
        }
      }
      
      // Force BattleScreen remount during ALL transitions TO battle to prevent DOM reconciliation errors
      if (lastGamePhase && lastGamePhase !== 'battle' && lobby.gamePhase === 'battle') {
        console.log(`🔄 CRITICAL TRANSITION: ${lastGamePhase} → battle. Forcing complete component tree remount...`);
        setBattleRemountKey(prev => {
          const newKey = prev + 1;
          console.log(`🎮 BattleScreen remount key: ${prev} → ${newKey}`);
          return newKey;
        });
      }
      
      // Log all phase changes for debugging
      if (lastGamePhase !== lobby.gamePhase) {
        console.log(`📋 Phase transition: ${lastGamePhase} → ${lobby.gamePhase}`);
      }
      
      // Track phase changes
      setLastGamePhase(lobby.gamePhase);
      
      // Note: Removed auto-transition to battle - only transition on explicit battle_started event
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

    socket.on('scores_revealed', ({ teamScores, teamConsensus }) => {
      console.log('Team scores revealed:', { teamScores, teamConsensus });
      // Game state will be updated via lobby_updated event
    });

    socket.on('boss_attacked', ({ playerId, damage, bossHealth }) => {
      console.log(`Player ${playerId} dealt ${damage} damage. Boss health: ${bossHealth}`);
    });

    socket.on('boss_defeated', ({ lobby }) => {
      console.log('Boss defeated!', lobby);
    });

    socket.on('quest_abandoned', ({ lobby }) => {
      console.log('Quest abandoned - returning to lobby');
      setLobby(lobby);
      setAppState('lobby');
    });

    socket.on('game_error', ({ message }) => {
      setError(message);
      toast.error(message);
      console.error('Game error:', message);
      
      // Clear error after showing toast
      setTimeout(() => setError(null), 100);
      
      // If we're trying to join a lobby and it fails, fade menu music back in
      if (appState === 'join_lobby' && !isMuted) {
        setTimeout(() => {
          if (!isMenuMusicPlaying) {
            fadeInMenuMusic();
          }
        }, 500);
      }
    });

    socket.on('player_disconnected', ({ playerId }) => {
      console.log(`Player ${playerId} disconnected`);
    });

    socket.on('boss_ring_attack', ({ bossX, bossY, projectiles }) => {
      console.log('💀 Boss ring attack received!', projectiles.length, 'projectiles');
      // Handle boss ring attack visual effects
    });

    socket.on('youtube_play_synced', ({ videoId, url }) => {
      console.log('🎵 YouTube music synced:', url);
      const { setYoutubeUrl, playYoutubeAudio } = useAudio.getState();
      setYoutubeUrl(url);
      playYoutubeAudio(videoId);
    });

    socket.on('youtube_stop_synced', () => {
      console.log('🎵 YouTube music stopped (synced)');
      const { stopYoutubeAudio } = useAudio.getState();
      stopYoutubeAudio(); // This will now handle URL clearing internally
    });

    socket.on('score_submitted', ({ playerId, team }) => {
      console.log(`Player ${playerId} from ${team} team submitted their score`);
      // Lobby will be updated via lobby_updated event which triggers re-render
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
      socket.off('quest_abandoned');
      socket.off('game_error');
      socket.off('player_disconnected');
      socket.off('youtube_play_synced');
      socket.off('youtube_stop_synced');
    };
  }, [socket, currentPlayer, appState, setLobby, setPlayer, setBoss, setInviteLink, setError]);

  const handleBackToMenu = () => {
    clearAll();
    setAppState('menu');
    window.history.replaceState(null, '', window.location.pathname);
    // Remove duplicate fade-in - let appState effect handle it
  };

  const renderCurrentState = () => {
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

    switch (appState) {
      case 'landing':
        return (
          <LandingPage 
            onStartGame={() => setAppState('menu')} 
            onNavigate={(page) => setAppState(page)}
          />
        );

      case 'about':
        return (
          <AboutPage 
            onBackToHome={() => setAppState('landing')} 
            onNavigate={(page) => setAppState(page)}
          />
        );

      case 'features':
        return (
          <FeaturesPage 
            onBackToHome={() => setAppState('landing')} 
            onNavigate={(page) => setAppState(page)}
          />
        );

      case 'pricing':
        return (
          <PricingPage 
            onBackToHome={() => setAppState('landing')} 
            onNavigate={(page) => setAppState(page)}
          />
        );

      case 'support':
        return (
          <SupportPage 
            onBackToHome={() => setAppState('landing')} 
            onNavigate={(page) => setAppState(page)}
          />
        );

      case 'menu':
        return (
          <>
            <CinematicBackground />
            
            {/* Back Button */}
            <div className="absolute top-4 left-4 z-[100]">
              <RetroButton
                onClick={() => {
                  playButtonSelect();
                  setAppState('landing');
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
                  Battle Jira Tickets in Epic JRPG Style!
                </p>
                
                <div className="space-y-4">
                  <RetroButton
                    onClick={() => {
                      playButtonSelect();
                      fadeOutMenuMusic();
                      setAppState('create_lobby');
                    }}
                    className="w-full"
                  >
                    Create Battle Lobby
                  </RetroButton>
                  
                  <RetroButton
                    onClick={() => {
                      playButtonSelect();
                      fadeOutMenuMusic();
                      setAppState('join_lobby');
                    }}
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
                  
                  <RetroButton
                    onClick={toggleMute}
                    size="sm"
                    variant="secondary"
                  >
                    {isMuted ? '🔇 Unmute' : '🔊 Mute'}
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
                    onClick={() => window.open('https://account.venmo.com/u/preston_farr', '_blank')}
                    size="sm"
                    variant="secondary"
                    className="text-xs"
                  >
                    💳 Donate via Venmo
                  </RetroButton>
                </div>
              </div>
            </div>
          </>
        );

      case 'create_lobby':
        return (
          <div className="p-6">
            <LobbyCreation onLobbyCreated={() => {}} />
          </div>
        );

      case 'join_lobby':
        return (
          <div className="p-6">
            <LobbyJoin lobbyId={joinLobbyId} onLobbyJoined={() => {}} />
          </div>
        );

      case 'avatar_selection':
        return (
          <div className="p-6">
            <AvatarSelection />
          </div>
        );

      case 'lobby':
        return (
          <div className="p-6">
            <Lobby />
          </div>
        );

      case 'battle':
        return (
          <ErrorBoundary>
            <BattleScreen key={`battle-${battleRemountKey}`} />
          </ErrorBoundary>
        );

      case 'character_tools':
        return (
          <CharacterTools onBack={() => setAppState('menu')} />
        );

      case 'boss_tools':
        return (
          <BossTools onBack={() => setAppState('menu')} />
        );

      default:
        return null;
    }
  };

  return (
    <div className="retro-container">
      {/* Back button (except on landing and menu) */}
      {appState !== 'landing' && appState !== 'menu' && appState !== 'battle' && appState !== 'character_tools' && (
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
      
      {/* Developer Menu */}
      <DeveloperMenu 
        isOpen={showDeveloperMenu} 
        onClose={() => setShowDeveloperMenu(false)}
        onOpenCharacterTools={() => setAppState('character_tools')}
        onOpenBossTools={() => setAppState('boss_tools')}
      />
      
      {/* Cheat Menu (Konami Code) */}
      <CheatMenu
        isOpen={showCheatMenu}
        onClose={() => setShowCheatMenu(false)}
      />
      
      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

export default App;
