import React, { useState, useEffect, Suspense, useMemo } from 'react';
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
import { SpeechBubble } from './SpeechBubble';
import { EmoteModal } from './EmoteModal';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { useAudio } from '@/lib/stores/useAudio';
import { SpriteDirection } from '@/hooks/useSpriteAnimation';
import { TEAM_NAMES, AVATAR_CLASSES, TeamType, JiraTicket, TimerSettings, JiraSettings } from '@/lib/gameTypes';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// CSS Animation for spectator pulsing effect
const spectatorStyles = `
  @keyframes spectatorPulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.8; }
  }
`;

// 3D Tavern Background Components
function TavernBackground() {
  const { scene } = useGLTF('/models/tavern-background.glb');
  
  const clonedScene1 = scene.clone();
  const clonedScene2 = scene.clone();
  const clonedScene3 = scene.clone();
  
  return (
    <>
      <primitive 
        object={clonedScene1} 
        position={[-15, 0, -5]} 
        scale={[2.5, 2.5, 2.5]}
      />
      <primitive 
        object={clonedScene2} 
        position={[0, 0, -5]} 
        scale={[2.5, 2.5, 2.5]}
      />
      <primitive 
        object={clonedScene3} 
        position={[15, 0, -5]} 
        scale={[2.5, 2.5, 2.5]}
      />
    </>
  );
}

function TavernFurniture() {
  const { scene } = useGLTF('/models/tavern-furniture.glb');
  
  const table1 = scene.clone();
  const table2 = scene.clone();
  const table3 = scene.clone();
  
  return (
    <>
      <primitive 
        object={table1} 
        position={[-8, 0, 2]} 
        scale={[2.5, 2.5, 2.5]}
      />
      <primitive 
        object={table2} 
        position={[0, 0, 2]} 
        scale={[2.5, 2.5, 2.5]}
      />
      <primitive 
        object={table3} 
        position={[8, 0, 2]} 
        scale={[2.5, 2.5, 2.5]}
      />
    </>
  );
}

// Particle Lighting Effects Component
function TavernLighting() {
  const particlesRef = React.useRef<THREE.Points>(null);
  
  const particles = React.useMemo(() => {
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20; // X
      positions[i * 3 + 1] = Math.random() * 8; // Y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10; // Z
    }
    
    return positions;
  }, []);
  
  React.useEffect(() => {
    const animateParticles = () => {
      if (particlesRef.current) {
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
        
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] += Math.sin(Date.now() * 0.001 + positions[i]) * 0.01;
        }
        
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
      }
      requestAnimationFrame(animateParticles);
    };
    
    animateParticles();
  }, []);
  
  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffaa44"
        size={0.1}
        transparent
        opacity={0.6}
        alphaTest={0.1}
      />
    </points>
  );
}

export function Lobby() {
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const [showQRCode, setShowQRCode] = useState(false);
  const [showCopiedNotification, setShowCopiedNotification] = useState(false);
  const [duplicateNotification, setDuplicateNotification] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Player movement state for lobby walking
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [playerPositions, setPlayerPositions] = useState<Record<string, { x: number; direction: SpriteDirection; isMoving: boolean }>>({});
  const [myPosition, setMyPosition] = useState({ x: 200, direction: 'right' as SpriteDirection });
  
  // Jumping physics state
  const [jumpState, setJumpState] = useState({
    isJumping: false,
    isCharging: false,
    chargeStartTime: 0,
    jumpPower: 0,
    currentHeight: 0,
    velocityY: 0
  });
  
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
  
  // Emote system state
  const [showEmoteModal, setShowEmoteModal] = useState(false);
  const [emotes, setEmotes] = useState<Record<string, {
    message: string;
    timestamp: number;
    x: number;
    y: number;
  }>>({});
  
  const { emit, socket } = useWebSocket();
  const { currentLobby, currentPlayer, inviteLink } = useGameState();
  const { 
    toggleMute, 
    isMuted, 
    setLobbyMusic, 
    playLobbyMusic, 
    stopLobbyMusic 
  } = useAudio();

  // Get player's STR for jump calculations (with safe fallback)
  const playerSTR = useMemo(() => {
    return currentPlayer?.avatar ? AVATAR_CLASSES[currentPlayer.avatar].stats.str : 12;
  }, [currentPlayer?.avatar]);
  
  const maxJumpHeight = useMemo(() => Math.min(playerSTR * 3, 60), [playerSTR]); // Cap at 60px max jump
  const maxChargeTime = 1000; // 1 second max charge time

  // Lobby background music
  useEffect(() => {
    if (currentLobby?.gamePhase === 'lobby') {
      const lobbyAudio = new Audio('/sounds/lobby-theme.mp3');
      lobbyAudio.preload = 'auto';
      setLobbyMusic(lobbyAudio);
      playLobbyMusic();

      return () => {
        stopLobbyMusic();
      };
    }
  }, [currentLobby?.gamePhase, setLobbyMusic, playLobbyMusic, stopLobbyMusic]);
  
  // Handle keyboard input for lobby movement
  useEffect(() => {
    if (currentLobby?.gamePhase !== 'lobby') return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore input if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      // Handle emote key (E)
      if (event.code === 'KeyE') {
        event.preventDefault();
        setShowEmoteModal(true);
        return;
      }

      // Handle jump charging (Spacebar)
      if (event.code === 'Space') {
        event.preventDefault();
        if (!jumpState.isJumping && !jumpState.isCharging) {
          setJumpState(prev => ({
            ...prev,
            isCharging: true,
            chargeStartTime: Date.now(),
            jumpPower: 0
          }));
        }
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

      // Handle jump release (Spacebar)
      if (event.code === 'Space') {
        event.preventDefault();
        if (jumpState.isCharging) {
          const chargeTime = Date.now() - jumpState.chargeStartTime;
          const chargePower = Math.min(chargeTime / maxChargeTime, 1); // 0 to 1
          const jumpHeight = chargePower * maxJumpHeight;
          const initialVelocity = Math.sqrt(2 * 0.5 * jumpHeight); // Reduced gravity for smoother arc
          
          // Jump triggered with calculated physics
          
          setJumpState(prev => ({
            ...prev,
            isCharging: false,
            isJumping: true,
            jumpPower: jumpHeight,
            velocityY: initialVelocity,
            currentHeight: 0
          }));
        }
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

  // Jumping physics animation loop
  useEffect(() => {
    if (!jumpState.isJumping) return;

    const gravity = 0.5; // Reduced gravity for smoother arc
    const animationInterval = setInterval(() => {
      setJumpState(prev => {
        const newVelocityY = prev.velocityY - gravity; // Apply gravity
        const newHeight = Math.max(0, prev.currentHeight + prev.velocityY); // Ensure height doesn't go negative

        // Check if landed
        if (newHeight <= 0 && prev.velocityY <= 0) {
          return {
            ...prev,
            isJumping: false,
            currentHeight: 0,
            velocityY: 0,
            jumpPower: 0
          };
        }

        return {
          ...prev,
          currentHeight: newHeight,
          velocityY: newVelocityY
        };
      });
    }, 16); // ~60 FPS

    return () => clearInterval(animationInterval);
  }, [jumpState.isJumping]);

  // Charge power animation
  useEffect(() => {
    if (!jumpState.isCharging) return;

    const chargeInterval = setInterval(() => {
      const chargeTime = Date.now() - jumpState.chargeStartTime;
      const chargePower = Math.min(chargeTime / maxChargeTime, 1);
      
      setJumpState(prev => ({
        ...prev,
        jumpPower: chargePower * maxJumpHeight
      }));
    }, 16); // ~60 FPS

    return () => clearInterval(chargeInterval);
  }, [jumpState.isCharging, jumpState.chargeStartTime, maxJumpHeight, maxChargeTime]);

  // Mobile touch jump handler
  const handleAvatarTap = () => {
    if (!jumpState.isJumping && !jumpState.isCharging) {
      // Mobile tap triggers a 60% power jump (good default)
      const jumpHeight = maxJumpHeight * 0.6;
      const initialVelocity = Math.sqrt(2 * 0.5 * jumpHeight);
      
      setJumpState(prev => ({
        ...prev,
        isCharging: false,
        isJumping: true,
        jumpPower: jumpHeight,
        velocityY: initialVelocity,
        currentHeight: 0
      }));
    }
  };

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

    const handleLobbyEmote = ({ playerId, message, x, y }: { 
      playerId: string; 
      message: string; 
      x: number; 
      y: number; 
    }) => {
      const timestamp = Date.now();
      setEmotes(prev => ({
        ...prev,
        [playerId]: { message, timestamp, x, y }
      }));
      
      // Auto-remove emote after 3.5 seconds
      setTimeout(() => {
        setEmotes(prev => {
          const newEmotes = { ...prev };
          delete newEmotes[playerId];
          return newEmotes;
        });
      }, 3500);
    };

    socket.on('lobby_player_pos', handleLobbyPlayerPos);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('lobby_emote', handleLobbyEmote);

    return () => {
      socket.off('lobby_player_pos', handleLobbyPlayerPos);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('lobby_emote', handleLobbyEmote);
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
    
    // Check for duplicates against existing tickets
    const existingTitles = tickets.map(ticket => ticket.title.toLowerCase());
    const duplicates: string[] = [];
    const uniqueTicketTitles: string[] = [];
    
    ticketTitles.forEach(title => {
      const normalizedTitle = title.toLowerCase();
      if (existingTitles.includes(normalizedTitle)) {
        duplicates.push(title);
      } else if (!uniqueTicketTitles.map(t => t.toLowerCase()).includes(normalizedTitle)) {
        uniqueTicketTitles.push(title);
        existingTitles.push(normalizedTitle); // Prevent duplicates within the same batch
      } else {
        duplicates.push(title); // Duplicate within the same input
      }
    });
    
    // Show duplicate notification if any found
    if (duplicates.length > 0) {
      const message = duplicates.length === 1 
        ? `"${duplicates[0]}" is already in the list`
        : `These tickets are already in the list: ${duplicates.join(', ')}`;
      setDuplicateNotification(message);
      
      // Auto-hide notification after 4 seconds
      setTimeout(() => {
        setDuplicateNotification(null);
      }, 4000);
    }
    
    // Only add unique tickets
    if (uniqueTicketTitles.length > 0) {
      const newTickets: JiraTicket[] = uniqueTicketTitles.map(title => ({
        id: Math.random().toString(36).substring(2, 15),
        title,
        description: 'Jira ticket to be estimated by the team'
      }));
      
      // Send tickets to server for real-time synchronization
      emit('add_tickets', { tickets: newTickets });
    }
    
    setNewTicketTitle('');
  };

  const removeTicket = (ticketId: string) => {
    // Send remove event to server for real-time synchronization  
    emit('remove_ticket', { ticketId });
  };

  const startBattle = () => {
    const lobbyTickets = currentLobby?.tickets || [];
    if (lobbyTickets.length === 0) return;
    emit('start_battle', {});
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

  // Handle emote submission
  const handleEmoteSubmit = (message: string) => {
    if (!currentPlayer) return;
    
    // Calculate current player position for emote
    const movementArea = movementAreaRef.current;
    if (!movementArea) return;
    
    const movementAreaWidth = movementArea.clientWidth;
    const maxX = Math.max(0, movementAreaWidth - characterSize);
    const percentX = (myPosition.x / maxX) * 100;
    
    // Emit emote to server for other players to see
    emit('lobby_emote', { 
      message, 
      x: percentX, 
      y: 85 // Same Y position as movement
    });
    
    // Show emote locally for current player
    const timestamp = Date.now();
    setEmotes(prev => ({
      ...prev,
      [currentPlayer.id]: { 
        message, 
        timestamp, 
        x: myPosition.x, 
        y: 0 // Local position for current player
      }
    }));
    
    // Auto-remove emote after 3.5 seconds
    setTimeout(() => {
      setEmotes(prev => {
        const newEmotes = { ...prev };
        delete newEmotes[currentPlayer.id];
        return newEmotes;
      });
    }, 3500);
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
      <style>{spectatorStyles}</style>
      
      {/* Mute Button - Top Right */}
      <div className="absolute top-4 right-4 z-50">
        <RetroButton
          onClick={toggleMute}
          size="sm"
          variant="secondary"
        >
          {isMuted ? '🔇' : '🔊'}
        </RetroButton>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-8 relative" style={{ zIndex: 20 }}>        
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
                  
                  {/* Duplicate notification */}
                  {duplicateNotification && (
                    <div className="bg-yellow-600/20 border border-yellow-500 text-yellow-300 px-3 py-2 rounded-lg text-sm mb-2 animate-pulse">
                      ⚠️ {duplicateNotification}
                    </div>
                  )}
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
            <br />
            Hold SPACEBAR to charge jump • Tap avatar to jump on mobile
            <br />
            (STR: {playerSTR} = Max {Math.round(maxJumpHeight)}px)
          </p>
        </div>
        
        
      </div>
      
      {/* 4-Layer Tavern Background System */}
      {currentLobby?.gamePhase === 'lobby' && (
        <div 
          ref={movementAreaRef}
          className="fixed bottom-0 left-0 right-0 h-40"
          style={{ zIndex: 5 }}
        >
          {/* Layer 1: Pixel Art Tavern Background (Furthest Back) */}
          <div className="absolute inset-0" style={{ zIndex: 1 }}>
            {/* Center Door Section */}
            <div 
              className="absolute top-0 left-1/2 transform -translate-x-1/2 h-full"
              style={{
                width: '400px', // Approximate width of the center image
                backgroundImage: 'url(/textures/tavern/center.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated'
              }}
            />
            
            {/* Left Extension - Window & Weapons Section */}
            <div 
              className="absolute top-0 right-1/2 h-full"
              style={{
                width: '50vw',
                background: '#8B4513',
                imageRendering: 'pixelated',
                transform: 'translateX(-200px)',
                position: 'relative'
              }}
            >
              {/* Stone Texture Pattern */}
              <div style={{
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '15%',
                background: `
                  repeating-linear-gradient(0deg, #654321 0px, #654321 2px, #8B4513 2px, #8B4513 20px),
                  repeating-linear-gradient(90deg, #654321 0px, #654321 2px, #8B4513 2px, #8B4513 30px)
                `,
                opacity: 0.3
              }} />
              
              {/* Pixel Art Window */}
              <div 
                style={{
                  position: 'absolute',
                  top: '20%',
                  right: '8%',
                  width: '100px',
                  height: '80px',
                  background: '#87CEEB',
                  border: '6px solid #654321',
                  zIndex: 20
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '0',
                  right: '0',
                  height: '6px',
                  background: '#654321',
                  transform: 'translateY(-50%)'
                }} />
                <div style={{
                  position: 'absolute',
                  top: '0',
                  bottom: '0',
                  left: '50%',
                  width: '6px',
                  background: '#654321',
                  transform: 'translateX(-50%)'
                }} />
              </div>
              
              {/* Mounted Crossbow */}
              <div 
                style={{
                  position: 'absolute',
                  top: '70%',
                  right: '20%',
                  width: '80px',
                  height: '40px',
                  background: '#654321',
                  zIndex: 20
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '15px',
                  left: '10px',
                  right: '10px',
                  height: '3px',
                  background: '#FFFF99'
                }} />
                <div style={{
                  position: 'absolute',
                  top: '18px',
                  left: '30px',
                  width: '30px',
                  height: '4px',
                  background: '#8B4513'
                }} />
              </div>
            </div>
            
            {/* Right Extension - Trophy & Decorations Section */}
            <div 
              className="absolute top-0 left-1/2 h-full"
              style={{
                width: '50vw',
                background: '#8B4513',
                imageRendering: 'pixelated',
                transform: 'translateX(200px)',
                position: 'relative'
              }}
            >
              {/* Stone Texture Pattern */}
              <div style={{
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '15%',
                background: `
                  repeating-linear-gradient(0deg, #654321 0px, #654321 2px, #8B4513 2px, #8B4513 20px),
                  repeating-linear-gradient(90deg, #654321 0px, #654321 2px, #8B4513 2px, #8B4513 30px)
                `,
                opacity: 0.3
              }} />
              
              {/* Mounted Deer Head */}
              <div 
                style={{
                  position: 'absolute',
                  top: '15%',
                  left: '8%',
                  width: '80px',
                  height: '60px',
                  background: '#8B6914',
                  zIndex: 20
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  left: '20px',
                  width: '8px',
                  height: '8px',
                  background: '#000'
                }} />
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  width: '8px',
                  height: '8px',
                  background: '#000'
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: '15px',
                  left: '50%',
                  width: '10px',
                  height: '8px',
                  background: '#654321',
                  transform: 'translateX(-50%)'
                }} />
              </div>
              
              {/* Antlers */}
              <div style={{
                position: 'absolute',
                top: '5%',
                left: '5%',
                width: '15px',
                height: '40px',
                background: '#A0522D',
                transform: 'rotate(-20deg)',
                zIndex: 20
              }} />
              <div style={{
                position: 'absolute',
                top: '5%',
                left: '75%',
                width: '15px',
                height: '40px',
                background: '#A0522D',
                transform: 'rotate(20deg)',
                zIndex: 20
              }} />
              
              {/* Heraldic Tapestry */}
              <div style={{
                position: 'absolute',
                top: '65%',
                left: '15%',
                width: '70px',
                height: '30px',
                background: '#8B0000',
                border: '4px solid #654321',
                zIndex: 20
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '20px',
                  height: '20px',
                  background: '#FFD700',
                  transform: 'translate(-50%, -50%) rotate(45deg)'
                }} />
              </div>
            </div>
            
            {/* Wooden Floor Extension */}
            <div 
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: '15%',
                background: 'repeating-linear-gradient(90deg, #8B4513 0px, #8B4513 8px, #A0522D 8px, #A0522D 16px)',
                imageRendering: 'pixelated'
              }}
            />
          </div>
          
          {/* Layer 2: Particle Lighting Effects */}
          <div className="absolute inset-0" style={{ zIndex: 2 }}>
            <Canvas
              camera={{ position: [0, 2, 8], fov: 50 }}
              style={{ width: '100%', height: '100%' }}
              gl={{ antialias: true, alpha: true }}
            >
              <Suspense fallback={null}>
                <TavernLighting />
              </Suspense>
            </Canvas>
          </div>
          
          {/* Layer 3: Player Movement Area */}
          <div className="absolute inset-0" style={{ zIndex: 10 }}>
          
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
              className="absolute transition-transform duration-100 ease-linear cursor-pointer select-none"
              style={{
                left: `${myPosition.x}px`,
                bottom: `${jumpState.currentHeight}px`,
                zIndex: 10,
                transform: `scale(${jumpState.isCharging ? 1.1 : jumpState.isJumping ? 1.05 : 1}) translateY(-${jumpState.currentHeight * 0.5}px)`,
                transition: jumpState.isJumping ? 'none' : 'transform 0.1s ease-linear'
              }}
              onClick={handleAvatarTap}
              onTouchStart={(e) => {
                e.preventDefault(); // Prevent default touch behaviors
                handleAvatarTap();
              }}
              title="Tap to jump!"
            >
              {/* Player name above character */}
              <div className="text-center text-xs text-white bg-black/50 rounded px-1 mb-1">
                {currentPlayer.name}
                {jumpState.isCharging && (
                  <div className="text-xs text-yellow-400 animate-pulse">
                    ⚡ {Math.round((jumpState.jumpPower / maxJumpHeight) * 100)}%
                  </div>
                )}
              </div>
              
              <div
                className={currentPlayer.team === 'spectators' ? 'spectator-character' : ''}
                style={{
                  filter: currentPlayer.team === 'spectators' ? 'hue-rotate(200deg) saturate(1.2)' : 'none',
                  animation: currentPlayer.team === 'spectators' ? 'spectatorPulse 2s ease-in-out infinite' : 'none'
                }}
              >
                <SpriteRenderer
                  avatarClass={getAvatarClass(currentPlayer)}
                  animation={keys.size > 0 ? 'walk' : 'idle'}
                  direction={myPosition.direction}
                  isMoving={keys.size > 0}
                  size={characterSize}
                />
              </div>
              
              {/* Jump charge visual effect */}
              {jumpState.isCharging && (
                <div 
                  className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gray-600 rounded overflow-hidden"
                >
                  <div 
                    className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-75"
                    style={{ width: `${(jumpState.jumpPower / maxJumpHeight) * 100}%` }}
                  />
                </div>
              )}
              
              {/* Current Player's Speech Bubble */}
              {emotes[currentPlayer.id] && (
                <SpeechBubble
                  message={emotes[currentPlayer.id].message}
                  x={0} // Relative to character position
                  y={0} // Relative to character position
                  onComplete={() => {
                    setEmotes(prev => {
                      const newEmotes = { ...prev };
                      delete newEmotes[currentPlayer.id];
                      return newEmotes;
                    });
                  }}
                />
              )}
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
                    zIndex: 9
                  }}
                >
                  {/* Player name above character */}
                  <div className="text-center text-xs text-white bg-black/50 rounded px-1 mb-1">
                    {player.name}
                  </div>
                  
                  <div
                    className={player.team === 'spectators' ? 'spectator-character' : ''}
                    style={{
                      filter: player.team === 'spectators' ? 'hue-rotate(200deg) saturate(1.2)' : 'none',
                      animation: player.team === 'spectators' ? 'spectatorPulse 2s ease-in-out infinite' : 'none'
                    }}
                  >
                    <SpriteRenderer
                      avatarClass={getAvatarClass(player)}
                      animation={position.isMoving ? 'walk' : 'idle'}
                      direction={position.direction}
                      isMoving={position.isMoving}
                      size={characterSize}
                    />
                  </div>
                  
                  {/* Other Player's Speech Bubble */}
                  {emotes[player.id] && (
                    <SpeechBubble
                      message={emotes[player.id].message}
                      x={0} // Relative to character position
                      y={0} // Relative to character position
                      onComplete={() => {
                        setEmotes(prev => {
                          const newEmotes = { ...prev };
                          delete newEmotes[player.id];
                          return newEmotes;
                        });
                      }}
                    />
                  )}
                </div>
              );
            })}
          
          </div>
          
          {/* Layer 4: Pixel Art Foreground Elements */}
          <div className="absolute inset-0" style={{ zIndex: 15 }}>
            {/* Simple pixel art shadows and depth elements */}
            <div 
              className="absolute bottom-8 left-1/4 w-16 h-8 opacity-30"
              style={{
                background: 'radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%)',
                imageRendering: 'pixelated'
              }}
            />
            <div 
              className="absolute bottom-8 right-1/4 w-20 h-10 opacity-30"
              style={{
                background: 'radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%)',
                imageRendering: 'pixelated'
              }}
            />
          </div>
        </div>
      )}
      
      {/* Emote Modal */}
      <EmoteModal
        isOpen={showEmoteModal}
        onClose={() => setShowEmoteModal(false)}
        onSubmit={handleEmoteSubmit}
      />
    </div>
  );
}
