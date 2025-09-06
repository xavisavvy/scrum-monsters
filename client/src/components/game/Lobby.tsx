import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogClose,
  DialogDescription
} from '@/components/ui/dialog';
import { SpriteRenderer } from './SpriteRenderer';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { SpriteDirection } from '@/hooks/useSpriteAnimation';
import { TEAM_NAMES, AVATAR_CLASSES, TeamType, JiraTicket, TimerSettings, JiraSettings } from '@/lib/gameTypes';

export function Lobby() {
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const [showQRCode, setShowQRCode] = useState(false);
  const [showCopiedNotification, setShowCopiedNotification] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Player movement state for lobby walking
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [playerPositions, setPlayerPositions] = useState<Record<string, { x: number; direction: SpriteDirection; isMoving: boolean }>>({});
  const [myPosition, setMyPosition] = useState({ x: 200, direction: 'right' as SpriteDirection });
  
  // Movement constants
  const moveSpeed = 3;
  const characterSize = 64; // Match PlayerController
  const movementAreaRef = React.useRef<HTMLDivElement>(null);
  
  // State for dropping avatar animations
  const [droppingAvatars, setDroppingAvatars] = React.useState<Array<{
    id: string;
    avatar: string;
    x: number;
    startTime: number;
  }>>([]);
  const [doorAnimation, setDoorAnimation] = React.useState({ isOpen: false, isOpening: false });
  const { emit, socket } = useWebSocket();
  const { currentLobby, currentPlayer, inviteLink } = useGameState();
  
  // Handle keyboard input for lobby movement
  useEffect(() => {
    if (currentLobby?.gamePhase !== 'lobby') return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore input if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      // Prevent default for movement keys to avoid page scrolling
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) {
        event.preventDefault();
        
        // Only add key if it's not already pressed (prevents key repeat)
        setKeys(prev => {
          if (prev.has(event.code)) return prev; // Key already pressed
          return new Set(prev).add(event.code);
        });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Ignore input if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      // Always remove the key on keyup
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) {
        setKeys(prev => {
          const newKeys = new Set(prev);
          newKeys.delete(event.code);
          return newKeys;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [currentLobby?.gamePhase]);

  // Handle movement based on pressed keys
  useEffect(() => {
    if (currentLobby?.gamePhase !== 'lobby' || keys.size === 0) {
      return;
    }

    const movePlayer = () => {
      setMyPosition(prev => {
        let newX = prev.x;
        let direction: SpriteDirection = prev.direction;
        let moving = false;
        
        // Get movement area width with proper fallback and safety checks
        const movementArea = movementAreaRef.current;
        if (!movementArea) return prev; // Don't move if area not available yet
        
        const movementAreaWidth = movementArea.clientWidth;
        if (movementAreaWidth <= characterSize) return prev; // Safety check
        
        const maxX = movementAreaWidth - characterSize;

        // Use percent-based movement for consistency across screen sizes
        const movePercentage = (moveSpeed / maxX) * 100;
        const currentPercent = (prev.x / maxX) * 100;

        // Only allow left/right movement
        if (keys.has('ArrowLeft') || keys.has('KeyA')) {
          const newPercent = Math.max(0, currentPercent - movePercentage);
          newX = (newPercent / 100) * maxX;
          direction = 'left';
          moving = true;
        }
        if (keys.has('ArrowRight') || keys.has('KeyD')) {
          const newPercent = Math.min(100, currentPercent + movePercentage);
          newX = (newPercent / 100) * maxX;
          direction = 'right';
          moving = true;
        }

        // Emit position to server for other players to see
        if (moving) {
          const percentX = (newX / maxX) * 100;
          emit('lobby_player_pos', { x: percentX, y: 85, direction });
        }

        return { x: newX, direction };
      });
    };

    const interval = setInterval(movePlayer, 16); // ~60 FPS for smooth movement
    return () => clearInterval(interval);
  }, [keys, currentLobby?.gamePhase, emit]);

  // Listen for other players' positions in lobby
  useEffect(() => {
    if (!socket || currentLobby?.gamePhase !== 'lobby') return;

    const handleLobbyPlayerPos = ({ playerId, x, direction }: { playerId: string; x: number; direction?: SpriteDirection }) => {
      if (playerId === currentPlayer?.id) return; // Skip own updates

      setPlayerPositions(prev => {
        const movementArea = movementAreaRef.current;
        if (!movementArea) return prev;
        
        const movementAreaWidth = movementArea.clientWidth;
        const maxX = Math.max(0, movementAreaWidth - characterSize);
        
        return {
          ...prev,
          [playerId]: {
            x: Math.max(0, Math.min(maxX, (x / 100) * maxX)),
            direction: direction || 'right',
            isMoving: true
          }
        };
      });
    };

    // Handle new player joining - trigger dropping avatar animation
    const handlePlayerJoined = ({ player }: { player: any }) => {
      if (player.id === currentPlayer?.id) return; // Skip own joins
      
      // Trigger door opening animation
      setDoorAnimation({ isOpen: false, isOpening: true });
      
      // After door opens, drop the avatar
      setTimeout(() => {
        setDoorAnimation({ isOpen: true, isOpening: false });
        
        const dropX = Math.random() * 60 + 20; // Random position between 20-80%
        setDroppingAvatars(prev => [...prev, {
          id: player.id,
          avatar: player.avatarClass || 'warrior',
          x: dropX,
          startTime: Date.now()
        }]);
        
        // Close door after avatar drops
        setTimeout(() => {
          setDoorAnimation({ isOpen: false, isOpening: false });
        }, 800);
        
        // Remove dropping animation after 2 seconds
        setTimeout(() => {
          setDroppingAvatars(prev => prev.filter(a => a.id !== player.id));
        }, 2000);
      }, 300);
    };

    socket.on('lobby_player_pos', handleLobbyPlayerPos);
    socket.on('player_joined', handlePlayerJoined);

    return () => {
      socket.off('lobby_player_pos', handleLobbyPlayerPos);
      socket.off('player_joined', handlePlayerJoined);
    };
  }, [socket, currentLobby?.gamePhase, currentPlayer?.id]);

  // Use tickets from server state instead of local state
  const tickets = currentLobby?.tickets || [];

  const isHost = currentPlayer?.isHost;

  const addTicket = () => {
    if (!newTicketTitle.trim()) return;
    
    // Split by comma and create multiple tickets
    const ticketTitles = newTicketTitle
      .split(',')
      .map(title => title.trim())
      .filter(title => title.length > 0);
    
    // Don't proceed if no valid tickets parsed
    if (ticketTitles.length === 0) return;
    
    const newTickets: JiraTicket[] = ticketTitles.map(title => ({
      id: Math.random().toString(36).substring(2, 15),
      title,
      description: 'Jira ticket to be estimated by the team'
    }));
    
    // Send tickets to server for real-time synchronization
    emit('add_tickets', { tickets: newTickets });
    setNewTicketTitle('');
  };

  const removeTicket = (ticketId: string) => {
    // Send remove event to server for real-time synchronization  
    emit('remove_ticket', { ticketId });
  };

  const startBattle = () => {
    const lobbyTickets = currentLobby?.tickets || [];
    if (lobbyTickets.length === 0) return;
    emit('start_battle');
  };

  const changeTeam = (team: TeamType) => {
    // Only allow team changes in lobby phase
    if (currentLobby?.gamePhase !== 'lobby') return;
    
    emit('change_own_team', { team });
  };

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setShowCopiedNotification(true);
      
      // Auto-hide notification after 2 seconds
      setTimeout(() => {
        setShowCopiedNotification(false);
      }, 2000);
    }
  };

  const updateTimerSettings = (timerSettings: TimerSettings) => {
    emit('update_timer_settings', { timerSettings });
  };

  const updateJiraSettings = (jiraSettings: JiraSettings) => {
    emit('update_jira_settings', { jiraSettings });
  };

  // Helper function to safely get avatar class from player
  const getAvatarClass = (player: any) => {
    return player?.avatarClass ?? player?.avatar ?? 'warrior';
  };

  const renderPlayerSprite = (avatarClass: string) => {
    const avatar = AVATAR_CLASSES[avatarClass as keyof typeof AVATAR_CLASSES];
    
    const getClassIcon = (avatarClass: string): string => {
      const icons: Record<string, string> = {
        ranger: '🏹',
        rogue: '🗡️', 
        bard: '🎵',
        sorcerer: '🔥',
        wizard: '🧙',
        warrior: '⚔️',
        paladin: '🛡️',
        cleric: '✨',
        oathbreaker: '⚡'
      };
      return icons[avatarClass] || '⚔️';
    };

    return (
      <div
        className="w-8 h-8 rounded-lg border-2 flex items-center justify-center text-lg"
        style={{ 
          borderColor: avatar?.color || '#666',
          backgroundColor: `${avatar?.color || '#666'}20`
        }}
        title={avatar?.name || avatarClass}
      >
        {getClassIcon(avatarClass)}
      </div>
    );
  };

  if (!currentLobby) return null;

  return (
    <div className="retro-container relative overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">        
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold retro-text-glow mb-2">
            {currentLobby.name}
          </h1>
          <p className="text-gray-400">
            Lobby Code: <span className="retro-text-glow-light text-xl font-mono">{currentLobby.id}</span>
          </p>
          {inviteLink && (
            <div className="mt-4 space-y-3">
              <div className="relative">
                <div className="flex gap-2 justify-center">
                  <RetroButton size="sm" onClick={copyInviteLink}>
                    Copy Invite Link
                  </RetroButton>
                  <RetroButton 
                    size="sm" 
                    variant="secondary"
                    onClick={() => setShowQRCode(!showQRCode)}
                  >
                    {showQRCode ? 'Hide QR Code' : 'Show QR Code'}
                  </RetroButton>
                  {isHost && (
                    <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
                      <DialogTrigger asChild>
                        <RetroButton size="sm" variant="secondary">
                          ⚙️ Settings
                        </RetroButton>
                      </DialogTrigger>
                      <DialogContent className="bg-gray-900 border-gray-600 text-white max-w-md w-[95vw] sm:w-full max-h-[80vh] overflow-y-auto p-4 sm:p-6">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-bold retro-text-glow">⚙️ Lobby Settings</DialogTitle>
                          <DialogDescription className="text-gray-400">
                            Configure settings for this lobby session
                          </DialogDescription>
                        </DialogHeader>
                        
                        {/* Estimation Timer Section */}
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">Estimation Timer</h3>
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                                    checked={currentLobby.timerSettings?.enabled || false}
                                    onChange={(e) => updateTimerSettings({
                                      enabled: e.target.checked,
                                      durationMinutes: currentLobby.timerSettings?.durationMinutes || 5
                                    })}
                                  />
                                  <span className="text-sm font-medium">Enable estimation timer</span>
                                </label>
                              </div>
                              
                              {currentLobby.timerSettings?.enabled && (
                                <div className="space-y-2">
                                  <label className="block text-sm font-medium text-gray-300">
                                    Timer Duration
                                  </label>
                                  <select
                                    className="retro-input w-full"
                                    value={currentLobby.timerSettings?.durationMinutes || 5}
                                    onChange={(e) => updateTimerSettings({
                                      enabled: true,
                                      durationMinutes: parseInt(e.target.value)
                                    })}
                                  >
                                    <option value={1}>1 minute</option>
                                    <option value={2}>2 minutes</option>
                                    <option value={3}>3 minutes</option>
                                    <option value={5}>5 minutes</option>
                                    <option value={10}>10 minutes</option>
                                    <option value={15}>15 minutes</option>
                                  </select>
                                  <p className="text-xs text-gray-400">
                                    ⏰ Scores will auto-reveal when timer expires
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* JIRA Integration Section */}
                          <div className="border-t border-gray-700 pt-6">
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">JIRA Integration</h3>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                  JIRA Base URL
                                </label>
                                <input
                                  type="url"
                                  placeholder="https://yourcompany.atlassian.net/browse/"
                                  className="retro-input w-full"
                                  value={currentLobby.jiraSettings?.baseUrl || ''}
                                  onChange={(e) => updateJiraSettings({
                                    baseUrl: e.target.value.trim() || undefined
                                  })}
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                  🔗 When set, ticket names become clickable links to your JIRA instance
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          {/* Future Settings Section - placeholder for expansion */}
                          <div className="border-t border-gray-700 pt-4">
                            <h3 className="text-lg font-semibold text-gray-200 mb-2">More Settings</h3>
                            <p className="text-sm text-gray-400">Additional settings will appear here in future updates.</p>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                
                {/* Copy notification */}
                {showCopiedNotification && (
                  <div className={`
                    absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-50
                    bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium
                    animate-pulse shadow-lg border border-green-500
                  `}>
                    ✓ Link copied to clipboard!
                  </div>
                )}
              </div>
              
              {showQRCode && (
                <div className="space-y-2">
                  {/* QR Code for easy mobile sharing */}
                  <div className="bg-white p-4 rounded-lg inline-block">
                    <QRCode
                      value={inviteLink}
                      size={128}
                      level="M"
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    📱 Scan QR code to join on mobile
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Teams Section */}
          <div className="space-y-4 min-w-0">
            {/* Team Selection */}
            <RetroCard title="Choose Your Team">
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-3">
                  Select your role for this scrum session:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(TEAM_NAMES).map(([teamKey, teamName]) => {
                    const team = teamKey as TeamType;
                    const isCurrentTeam = currentPlayer?.team === team;
                    
                    return (
                      <button
                        key={team}
                        onClick={() => changeTeam(team)}
                        className={`p-3 text-left rounded border-2 transition-all ${
                          isCurrentTeam 
                            ? 'border-blue-500 bg-blue-500 bg-opacity-20 text-blue-200' 
                            : 'border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-700'
                        }`}
                      >
                        <div className="font-medium">{teamName}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {team === 'developers' && 'Estimate story points and develop features'}
                          {team === 'qa' && 'Provide testing perspective and quality insights'}
                          {team === 'spectators' && 'Observe the session without voting'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </RetroCard>

            <RetroCard title="Battle Teams">
              <div className="space-y-4">
                {Object.entries(TEAM_NAMES).map(([teamKey, teamName]) => {
                  const team = teamKey as TeamType;
                  const teamPlayers = currentLobby.teams[team] || [];
                  
                  return (
                    <div key={team} className="team-section">
                      <h4 className="font-bold text-sm sm:text-lg mb-2 break-words">{teamName}</h4>
                      <p className="text-xs sm:text-sm text-gray-400 mb-3">
                        {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''}
                      </p>
                      
                      <div className="player-list">
                        {teamPlayers.map(player => (
                          <div
                            key={player.id}
                            className={`player-chip ${player.isHost ? 'host' : ''} ${
                              player.id === currentPlayer?.id ? 'border-blue-400' : ''
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {renderPlayerSprite(player.avatar)}
                            </div>
                            <span className="min-w-0 truncate text-xs sm:text-sm">{player.name}</span>
                            {player.isHost && <span className="text-xs whitespace-nowrap">(HOST)</span>}
                            {player.id === currentPlayer?.id && <span className="text-xs text-blue-400 whitespace-nowrap">(YOU)</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </RetroCard>

          </div>

          {/* Tickets Section */}
          <div className="min-w-0">
            <RetroCard title="Battle Objectives">
              {isHost && (
                <div className="mb-4">
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newTicketTitle}
                      onChange={(e) => setNewTicketTitle(e.target.value)}
                      className="retro-input flex-1"
                      placeholder="Add tickets (use commas for multiple: JIRA-123, JIRA-456)..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTicket();
                        }
                      }}
                    />
                    <RetroButton onClick={addTicket} disabled={!newTicketTitle.trim()}>
                      Add
                    </RetroButton>
                  </div>
                  <p className="text-xs text-gray-300 mb-2">
                    💡 Tip: Enter multiple tickets separated by commas to add them all at once
                  </p>
                </div>
              )}
              
              <div className="space-y-2 mb-4">
                {tickets.map((ticket, index) => (
                  <div
                    key={ticket.id}
                    className="bg-gray-800 border border-gray-600 rounded p-3 flex justify-between items-center"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm text-blue-400">#{index + 1}</span>
                      {currentLobby.jiraSettings?.baseUrl ? (
                        <a
                          href={`${currentLobby.jiraSettings.baseUrl}${ticket.title}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 min-w-0 truncate inline-block max-w-full text-blue-300 hover:text-blue-200 hover:underline"
                        >
                          {ticket.title}
                        </a>
                      ) : (
                        <span className="ml-2 min-w-0 truncate inline-block max-w-full">{ticket.title}</span>
                      )}
                    </div>
                    {isHost && (
                      <RetroButton
                        size="sm"
                        variant="accent"
                        onClick={() => removeTicket(ticket.id)}
                      >
                        Remove
                      </RetroButton>
                    )}
                  </div>
                ))}
              </div>
              
              {tickets.length === 0 && (
                <p className="text-center text-gray-400 py-8">
                  {isHost ? 'Add tickets to begin the battle' : 'Waiting for host to add tickets...'}
                </p>
              )}
              
              {isHost && tickets.length > 0 && (
                <RetroButton
                  onClick={startBattle}
                  className="w-full"
                  variant="accent"
                >
                  Begin Battle! ({tickets.length} ticket{tickets.length !== 1 ? 's' : ''})
                </RetroButton>
              )}
            </RetroCard>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Players: {currentLobby.players.length} / 32
          </p>
          {!isHost && (
            <p className="text-sm text-gray-400 mt-2">
              Waiting for host to start the battle...
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Use A/D or arrow keys to walk around the lobby!
          </p>
        </div>
        
        {/* Player Movement Area - Bottom of Screen */}
        {currentLobby?.gamePhase === 'lobby' && (
          <div 
            ref={movementAreaRef}
            className="absolute bottom-4 left-0 right-0 h-24 overflow-hidden"
          >
            {/* Pixelated Door Animation (Center Top) */}
            <div 
              className="absolute top-0 left-1/2 transform -translate-x-1/2 z-20"
              style={{ 
                width: '80px', 
                height: '60px',
                background: doorAnimation.isOpen || doorAnimation.isOpening 
                  ? 'linear-gradient(45deg, #4a5568 25%, transparent 25%, transparent 75%, #4a5568 75%), linear-gradient(45deg, #4a5568 25%, transparent 25%, transparent 75%, #4a5568 75%)'
                  : '#2d3748',
                backgroundSize: doorAnimation.isOpen || doorAnimation.isOpening ? '8px 8px' : '0px 0px',
                backgroundPosition: '0 0, 4px 4px',
                border: '2px solid #1a202c',
                borderRadius: '4px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: `translateX(-50%) ${doorAnimation.isOpening ? 'scaleY(1.1)' : 'scaleY(1)'}`,
                filter: doorAnimation.isOpen ? 'brightness(1.2)' : 'brightness(0.8)'
              }}
            >
              {(doorAnimation.isOpen || doorAnimation.isOpening) && (
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/20 to-cyan-500/40 animate-pulse" />
              )}
            </div>
            
            {/* Dropping Avatars */}
            {droppingAvatars.map(avatar => {
              const elapsed = Date.now() - avatar.startTime;
              const progress = Math.min(elapsed / 1500, 1); // 1.5 second drop
              const dropY = -80 + (progress * 100); // Start above door, drop to bottom
              const bounce = progress > 0.8 ? Math.sin((progress - 0.8) * 20) * 5 : 0;
              
              return (
                <div
                  key={`dropping-${avatar.id}`}
                  className="absolute z-10 transition-all duration-100"
                  style={{
                    left: `${avatar.x}%`,
                    bottom: `${-dropY + bounce}px`,
                    transform: 'translateX(-50%)',
                    opacity: progress < 0.9 ? 1 : 1 - ((progress - 0.9) / 0.1),
                    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'
                  }}
                >
                  <SpriteRenderer
                    avatarClass={avatar.avatar as any}
                    animation="idle"
                    direction="right"
                    size={characterSize}
                  />
                </div>
              );
            })}
            
            {/* My Player Character */}
            {currentPlayer && (
              <div
                className="absolute transition-transform duration-100 ease-linear"
                style={{
                  left: `${myPosition.x}px`,
                  bottom: '0px',
                  // Direction is handled by SpriteRenderer
                  zIndex: 10
                }}
              >
                <SpriteRenderer
                  avatarClass={getAvatarClass(currentPlayer)}
                  animation={keys.size > 0 ? 'walk' : 'idle'}
                  direction={myPosition.direction}
                  isMoving={keys.size > 0}
                  size={characterSize}
                />
                <div className="text-center text-xs text-white bg-black/50 rounded px-1 mt-1">
                  {currentPlayer.name}
                </div>
              </div>
            )}
            
            {/* Other Players */}
            {currentLobby.players
              .filter(player => player.id !== currentPlayer?.id)
              .map(player => {
                const position = playerPositions[player.id];
                if (!position) return null;
                
                return (
                  <div
                    key={player.id}
                    className="absolute transition-transform duration-200 ease-out"
                    style={{
                      left: `${position.x}px`,
                      bottom: '0px',
                      // Direction is handled by SpriteRenderer
                      zIndex: 9
                    }}
                  >
                    <SpriteRenderer
                      avatarClass={getAvatarClass(player)}
                      animation={position.isMoving ? 'walk' : 'idle'}
                      direction={position.direction}
                      isMoving={position.isMoving}
                      size={characterSize}
                    />
                    <div className="text-center text-xs text-white bg-black/50 rounded px-1 mt-1">
                      {player.name}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        
      </div>
    </div>
  );
}
