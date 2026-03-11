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
import { MagicEffect } from './MagicEffect';
import { LobbyReadyButton } from './LobbyReadyButton';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { useAudio } from '@/lib/stores/useAudio';
import { SpriteDirection } from '@/hooks/useSpriteAnimation';
import { TEAM_NAMES, AVATAR_CLASSES, TeamType, JiraTicket, TimerSettings, JiraSettings, EstimationScaleType, ESTIMATION_SCALES, EstimationSettings } from '@/lib/gameTypes';
import { LobbySettingsStorage } from '@/lib/utils/lobbySettingsStorage';
import { TeamPreferenceStorage } from '@/lib/utils/teamPreferenceStorage';
import { detectMagicWords, extractSpellTargets, getSpellWords, MagicEffectType } from '@/lib/utils/magicWords';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlayerListSkeleton } from '@/components/ui/LoadingSkeleton';

// CSS Animation for spectator pulsing effect
const spectatorStyles = `
  @keyframes spectatorPulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.8; }
  }

  @keyframes tavernDarkPulse {
    0%, 100% {
      background: rgba(0, 0, 0, 0.85);
      box-shadow: inset 0 0 100px rgba(139, 0, 0, 0.3);
    }
    50% {
      background: rgba(20, 0, 0, 0.9);
      box-shadow: inset 0 0 150px rgba(255, 0, 0, 0.5);
    }
  }

  @keyframes dragonFlyAcross {
    0% {
      transform: translateX(-200px) translateY(-50px) scaleX(-1);
      opacity: 0;
    }
    10% {
      transform: translateX(0) translateY(-30px) scaleX(-1);
      opacity: 1;
    }
    45% {
      transform: translateX(var(--target-x)) translateY(0) scaleX(-1);
    }
    55% {
      transform: translateX(var(--target-x)) translateY(20px) scaleX(-1) scale(1.2);
    }
    70% {
      transform: translateX(calc(var(--target-x) + 100px)) translateY(-20px) scaleX(-1);
    }
    100% {
      transform: translateX(calc(100vw + 200px)) translateY(-100px) scaleX(-1);
      opacity: 0;
    }
  }

  @keyframes chaosRainbow {
    0% { background: linear-gradient(45deg, rgba(255,0,0,0.3), rgba(255,127,0,0.3)); }
    14% { background: linear-gradient(90deg, rgba(255,127,0,0.3), rgba(255,255,0,0.3)); }
    28% { background: linear-gradient(135deg, rgba(255,255,0,0.3), rgba(0,255,0,0.3)); }
    42% { background: linear-gradient(180deg, rgba(0,255,0,0.3), rgba(0,0,255,0.3)); }
    57% { background: linear-gradient(225deg, rgba(0,0,255,0.3), rgba(75,0,130,0.3)); }
    71% { background: linear-gradient(270deg, rgba(75,0,130,0.3), rgba(148,0,211,0.3)); }
    85% { background: linear-gradient(315deg, rgba(148,0,211,0.3), rgba(255,0,0,0.3)); }
    100% { background: linear-gradient(360deg, rgba(255,0,0,0.3), rgba(255,127,0,0.3)); }
  }

  @keyframes discoFlash {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.5; }
  }

  @keyframes screenShake1 {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(-2px, 1px); }
    50% { transform: translate(2px, -1px); }
    75% { transform: translate(-1px, 2px); }
  }

  @keyframes screenShake2 {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(-4px, 2px); }
    50% { transform: translate(4px, -2px); }
    75% { transform: translate(-2px, 4px); }
  }

  @keyframes screenShake3 {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(-6px, 3px); }
    50% { transform: translate(6px, -3px); }
    75% { transform: translate(-3px, 6px); }
  }
`;

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
  const isMobile = useIsMobile();
  const [dpr, setDpr] = useState<number>(Math.min(window.devicePixelRatio, 2));
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const [showQRCode, setShowQRCode] = useState(false);
  const [showCopiedNotification, setShowCopiedNotification] = useState(false);
  const [duplicateNotification, setDuplicateNotification] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isEditingLobbyName, setIsEditingLobbyName] = useState(false);
  const [editedLobbyName, setEditedLobbyName] = useState('');
  
  // Player movement state for lobby walking
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [playerPositions, setPlayerPositions] = useState<Record<string, { x: number; direction: SpriteDirection; isMoving: boolean; isJumping?: boolean; jumpHeight?: number; lastUpdate?: number; timeoutId?: NodeJS.Timeout; isCharging?: boolean; chargePower?: number }>>({});
  const [myPosition, setMyPosition] = useState({ x: 200, direction: 'right' as SpriteDirection });
  
  // Simple jumping state
  const [jumpState, setJumpState] = useState({
    isJumping: false,
    jumpHeight: 0
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

  // Magic effects state - tracks active effects per player
  const [magicEffects, setMagicEffects] = useState<Record<string, {
    effects: MagicEffectType[];
    x: number;
    timestamp: number;
  }>>({});

  // Dead players state - tracks players who used "die" magic word
  const [deadPlayers, setDeadPlayers] = useState<Set<string>>(new Set());

  // Flying players state - tracks players who used "fly" magic word
  const [flyingPlayers, setFlyingPlayers] = useState<Set<string>>(new Set());
  const [flyHeight, setFlyHeight] = useState(0); // Current fly height for local player

  // Frozen players state - tracks players affected by "hold person" spell
  const [frozenPlayers, setFrozenPlayers] = useState<Set<string>>(new Set());

  // Petrified players state - tracks players turned to stone
  const [petrifiedPlayers, setPetrifiedPlayers] = useState<Set<string>>(new Set());

  // Dark tavern state - triggered by massacre spell
  const [tavernDarkMode, setTavernDarkMode] = useState(false);

  // Chaos/disco mode state - triggered by chaos mode spell
  const [chaosMode, setChaosMode] = useState(false);

  // Invisible players state - half opacity for self, invisible to others
  const [invisiblePlayers, setInvisiblePlayers] = useState<Set<string>>(new Set());
  // Flicker state - controls random brief visibility of invisible players for others
  const [invisibleFlicker, setInvisibleFlicker] = useState<Record<string, boolean>>({});

  // Dragon attack state - triggered by "clever girl" spell
  const [dragonAttack, setDragonAttack] = useState<{
    active: boolean;
    targetX: number;
    targetPlayerId: string | null;
  }>({ active: false, targetX: 0, targetPlayerId: null });

  // Refs to track current state for socket event handlers (avoids stale closures)
  // Note: currentLobbyRef is declared after useGameState hook below
  const flyingPlayersRef = React.useRef(flyingPlayers);
  const playerPositionsRef = React.useRef(playerPositions);
  const myPositionRef = React.useRef(myPosition);
  const invisiblePlayersRef = React.useRef(invisiblePlayers);

  // Keep refs in sync with state
  React.useEffect(() => { flyingPlayersRef.current = flyingPlayers; }, [flyingPlayers]);
  React.useEffect(() => { playerPositionsRef.current = playerPositions; }, [playerPositions]);
  React.useEffect(() => { myPositionRef.current = myPosition; }, [myPosition]);
  React.useEffect(() => { invisiblePlayersRef.current = invisiblePlayers; }, [invisiblePlayers]);

  // Speed buff state - tracks haste stacks (1-3) or slow per player
  // Haste stacks: 1 = 1.5x, 2 = 2x, 3 = 2.5x speed
  const [speedBuffs, setSpeedBuffs] = useState<Record<string, { type: 'haste' | 'slow'; stacks: number }>>({});

  // Size buff state - tracks enlarge/reduce stacks (1-3) per player
  // Enlarge stacks: 1 = 1.5x, 2 = 2x, 3 = 2.5x size
  // Reduce stacks: 1 = 0.7x, 2 = 0.5x, 3 = 0.35x size (minimum to stay visible)
  const [sizeBuffs, setSizeBuffs] = useState<Record<string, { type: 'enlarge' | 'reduce'; stacks: number }>>({});

  // Screen shake state - intensity 0-3 based on enlarged player movement
  const [screenShake, setScreenShake] = useState(0);

  // Afterimage trail state for haste/slow effects
  const [afterimages, setAfterimages] = useState<Array<{
    id: string;
    playerId: string;
    x: number;
    y: number; // Jump height at time of creation
    timestamp: number;
    type: 'haste' | 'slow';
  }>>([]);

  const { emit, socket } = useWebSocket();
  const { currentLobby, currentPlayer, inviteLink } = useGameState();

  // Ref for currentLobby (declared here because it depends on useGameState)
  const currentLobbyRef = React.useRef(currentLobby);
  React.useEffect(() => { currentLobbyRef.current = currentLobby; }, [currentLobby]);
  const { 
    toggleMute, 
    isMuted, 
    setLobbyMusic, 
    playLobbyMusic, 
    stopLobbyMusic 
  } = useAudio();

  // Removed old charge system variables - using simple jump instead

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

  // Auto-apply saved team preference when joining lobby
  useEffect(() => {
    if (!currentLobby || !currentPlayer || currentLobby.gamePhase !== 'lobby') return;

    const savedTeam = TeamPreferenceStorage.loadTeam();
    if (savedTeam && savedTeam !== currentPlayer.team) {
      // Apply saved team preference
      emit('change_own_team', { team: savedTeam });
    }
  }, [currentLobby?.id]); // Only run when joining a new lobby

  // Reset dead players, speed buffs, flying, frozen, and invisible when battle starts (phase changes from lobby)
  useEffect(() => {
    if (currentLobby?.gamePhase && currentLobby.gamePhase !== 'lobby') {
      // Clear all states when leaving lobby
      setDeadPlayers(new Set());
      setSpeedBuffs({});
      setAfterimages([]);
      setFlyingPlayers(new Set());
      setFlyHeight(0);
      setFrozenPlayers(new Set());
      setPetrifiedPlayers(new Set());
      setInvisiblePlayers(new Set());
      setInvisibleFlicker({});
      setSizeBuffs({});
    }
  }, [currentLobby?.gamePhase]);

  // Random flicker effect for invisible players (makes them briefly visible to others)
  useEffect(() => {
    if (invisiblePlayers.size === 0) return;

    const flickerInterval = setInterval(() => {
      // For each invisible player, randomly decide if they flicker visible
      const newFlicker: Record<string, boolean> = {};
      invisiblePlayers.forEach(playerId => {
        // 15% chance to flicker visible every 2 seconds
        newFlicker[playerId] = Math.random() < 0.15;
      });
      setInvisibleFlicker(newFlicker);

      // Auto-hide after 400ms
      setTimeout(() => {
        setInvisibleFlicker({});
      }, 400);
    }, 2000);

    return () => clearInterval(flickerInterval);
  }, [invisiblePlayers]);

  // Clean up old afterimages
  useEffect(() => {
    if (afterimages.length === 0) return;

    const cleanup = setInterval(() => {
      const now = Date.now();
      setAfterimages(prev => prev.filter(img => now - img.timestamp < 300)); // 300ms lifetime
    }, 50);

    return () => clearInterval(cleanup);
  }, [afterimages.length]);

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

      // Handle jump (Spacebar)
      if (event.code === 'Space') {
        event.preventDefault();
        if (!jumpState.isJumping) {
          // Start simple jump
          setJumpState({
            isJumping: true,
            jumpHeight: 0
          });
          // Emit jump start to other players
          emit('lobby_player_jump', { isJumping: true });
        }
        return;
      }

      // Prevent default for movement keys to avoid page scrolling
      // Include up/down for flying players
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) {
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

      // No spacebar handling needed in keyup for simple jump

      // Always remove the key on keyup
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) {
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
      // Check if player is frozen or petrified - no movement allowed
      const playerId = currentPlayer?.id;
      if (playerId && (frozenPlayers.has(playerId) || petrifiedPlayers.has(playerId))) {
        return; // Can't move while frozen or petrified
      }

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

        // Calculate speed multiplier based on buffs
        const isDead = playerId ? deadPlayers.has(playerId) : false;
        const speedBuff = playerId ? speedBuffs[playerId] : undefined;

        let speedMultiplier = 1;
        if (isDead) {
          speedMultiplier = 0.25; // Dead = 1/4 speed
        } else if (speedBuff?.type === 'haste') {
          // Haste stacks: 1 = 1.5x, 2 = 2x, 3 = 2.5x
          speedMultiplier = 1 + (speedBuff.stacks * 0.5);
        } else if (speedBuff?.type === 'slow') {
          speedMultiplier = 0.5; // Slow = 1/2 speed
        }

        const effectiveSpeed = moveSpeed * speedMultiplier;

        // Use percent-based movement for consistency across screen sizes
        const movePercentage = (effectiveSpeed / maxX) * 100;
        const currentPercent = (prev.x / maxX) * 100;

        // Horizontal movement (left/right)
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

        // Vertical movement (only when flying)
        const isFlying = playerId ? flyingPlayers.has(playerId) : false;
        if (isFlying) {
          const maxFlyHeight = 150; // Max height in pixels
          if (keys.has('ArrowUp') || keys.has('KeyW')) {
            setFlyHeight(prev => Math.min(prev + effectiveSpeed * 2, maxFlyHeight));
            moving = true;
          }
          if (keys.has('ArrowDown') || keys.has('KeyS')) {
            setFlyHeight(prev => Math.max(prev - effectiveSpeed * 2, 0));
            moving = true;
          }
        }

        // Emit position to server for other players to see
        if (moving) {
          const percentX = (newX / maxX) * 100;
          emit('lobby_player_pos', { x: percentX, y: 85, direction });

          // Generate afterimages for haste/slow effects
          if (speedBuff && playerId) {
            const currentJumpHeight = jumpState.jumpHeight;
            setAfterimages(prevImages => [
              ...prevImages.slice(-10), // Keep only last 10 afterimages
              {
                id: `${playerId}-${Date.now()}`,
                playerId,
                x: prev.x,
                y: currentJumpHeight,
                timestamp: Date.now(),
                type: speedBuff.type
              }
            ]);
          }

          // Trigger screen shake for enlarged players
          const sizeBuff = playerId ? sizeBuffs[playerId] : undefined;
          if (sizeBuff?.type === 'enlarge') {
            setScreenShake(sizeBuff.stacks);
            // Reset shake after short duration
            setTimeout(() => setScreenShake(0), 100);
          }
        }

        return { x: newX, direction };
      });
    };

    const interval = setInterval(movePlayer, 16); // ~60 FPS for smooth movement
    return () => clearInterval(interval);
  }, [keys, currentLobby?.gamePhase, emit, deadPlayers, speedBuffs, sizeBuffs, currentPlayer?.id, jumpState.jumpHeight, flyingPlayers, frozenPlayers, petrifiedPlayers]);

  // Simple jump animation
  useEffect(() => {
    if (!jumpState.isJumping) return;

    const jumpDuration = 600; // 600ms total jump time
    const maxHeight = 50; // 50px max jump height
    const startTime = Date.now();
    let lastAfterimageTime = 0;

    const animateJump = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / jumpDuration, 1);

      // Sine wave for smooth up/down motion
      const height = Math.sin(progress * Math.PI) * maxHeight;

      setJumpState(prev => ({
        ...prev,
        jumpHeight: height
      }));

      // Generate afterimages during jump if player has speed buff
      const playerId = currentPlayer?.id;
      const speedBuff = playerId ? speedBuffs[playerId] : undefined;
      if (speedBuff && playerId && elapsed - lastAfterimageTime > 50) {
        lastAfterimageTime = elapsed;
        setAfterimages(prevImages => [
          ...prevImages.slice(-10),
          {
            id: `${playerId}-jump-${Date.now()}`,
            playerId,
            x: myPosition.x,
            y: height, // Capture current jump height
            timestamp: Date.now(),
            type: speedBuff.type
          }
        ]);
      }

      if (progress < 1) {
        requestAnimationFrame(animateJump);
      } else {
        // Jump complete
        setJumpState({
          isJumping: false,
          jumpHeight: 0
        });
        // Emit landing event to other players
        emit('lobby_player_jump', { isJumping: false });
      }
    };

    requestAnimationFrame(animateJump);
  }, [jumpState.isJumping, emit, currentPlayer?.id, speedBuffs, myPosition.x]);

  // Mobile touch jump handler
  const handleAvatarTap = () => {
    if (!jumpState.isJumping) {
      // Emit jump event to other players for mobile tap
      emit('lobby_player_jump', { isJumping: true });
      
      setJumpState({
        isJumping: true,
        jumpHeight: 0
      });
    }
  };

  // Listen for other players' positions in lobby
  useEffect(() => {
    if (!socket || currentLobby?.gamePhase !== 'lobby') return;

    const handleLobbyPlayerPos = ({ playerId, x, y, direction }: { playerId: string; x: number; y: number; direction?: string }) => {
      if (playerId === currentPlayer?.id) return; // Skip own updates

      setPlayerPositions(prev => {
        const movementArea = movementAreaRef.current;
        if (!movementArea) return prev;
        
        const movementAreaWidth = movementArea.clientWidth;
        const maxX = Math.max(0, movementAreaWidth - characterSize);
        
        // Clear any existing timeout for this player
        const currentPlayer = prev[playerId];
        if (currentPlayer?.timeoutId) {
          clearTimeout(currentPlayer.timeoutId);
        }
        
        // Set a timeout to stop animation after 300ms of no updates
        const timeoutId = setTimeout(() => {
          setPlayerPositions(prevPositions => ({
            ...prevPositions,
            [playerId]: {
              ...prevPositions[playerId],
              isMoving: false
            }
          }));
        }, 300);
        
        return {
          ...prev,
          [playerId]: {
            ...currentPlayer,
            x: Math.max(0, Math.min(maxX, (x / 100) * maxX)),
            direction: (direction as SpriteDirection) || 'right',
            isMoving: true,
            lastUpdate: Date.now(),
            timeoutId
          }
        };
      });
    };

    const handleLobbyPlayerJump = ({ playerId, isJumping }: { playerId: string; isJumping: boolean }) => {
      if (playerId === currentPlayer?.id) return; // Skip own updates

      if (isJumping) {
        // Animate the jump for other players
        const jumpDuration = 600; // Same as local player
        const maxHeight = 50; // Same as local player
        const startTime = Date.now();

        const animateOtherPlayerJump = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / jumpDuration, 1);
          const height = Math.sin(progress * Math.PI) * maxHeight;

          setPlayerPositions(prev => ({
            ...prev,
            [playerId]: {
              ...prev[playerId],
              isJumping: progress < 1,
              jumpHeight: height,
              isCharging: false,
              chargePower: 0
            }
          }));

          if (progress < 1) {
            requestAnimationFrame(animateOtherPlayerJump);
          }
        };

        requestAnimationFrame(animateOtherPlayerJump);
      } else {
        // Just set not jumping
        setPlayerPositions(prev => ({
          ...prev,
          [playerId]: {
            ...prev[playerId],
            isJumping: false,
            jumpHeight: 0,
            isCharging: false,
            chargePower: 0
          }
        }));
      }
    };

    const handleLobbyPlayerCharge = ({ playerId, isCharging, chargePower }: { playerId: string; isCharging: boolean; chargePower?: number }) => {
      if (playerId === currentPlayer?.id) return; // Skip own updates

      setPlayerPositions(prev => ({
        ...prev,
        [playerId]: {
          ...prev[playerId],
          isCharging,
          chargePower: chargePower || 0
        }
      }));
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

      // Detect magic words and trigger effects
      const detectedEffects = detectMagicWords(message);
      if (detectedEffects.length > 0) {
        const lobby = currentLobbyRef.current;

        // Helper to resolve target IDs for a spell
        // Returns array of player IDs - either targets from message or just the caster
        const resolveTargets = (effectType: MagicEffectType): string[] => {
          const spellWords = getSpellWords(effectType);
          const targetNames = extractSpellTargets(message, spellWords);

          if (!targetNames || !lobby) {
            return [playerId]; // Self-cast
          }

          // Find matching players by name
          const targetIds: string[] = [];
          for (const name of targetNames) {
            const player = lobby.players.find(
              p => p.name.toLowerCase() === name.toLowerCase()
            );
            if (player) {
              targetIds.push(player.id);
            }
          }

          return targetIds.length > 0 ? targetIds : [playerId]; // Fall back to self if no valid targets
        };

        // Handle die - targetable
        if (detectedEffects.includes('die')) {
          const targets = resolveTargets('die');
          targets.forEach(targetId => {
            setDeadPlayers(prev => new Set([...prev, targetId]));
          });
        }

        // Handle revive - targetable
        if (detectedEffects.includes('revive')) {
          const targets = resolveTargets('revive');
          targets.forEach(targetId => {
            setDeadPlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
          });
        }

        // Handle haste - targetable, stacks up to 3
        if (detectedEffects.includes('haste')) {
          const targets = resolveTargets('haste');
          targets.forEach(targetId => {
            setSpeedBuffs(prev => {
              const current = prev[targetId];
              if (current?.type === 'haste') {
                return { ...prev, [targetId]: { type: 'haste', stacks: Math.min(current.stacks + 1, 3) } };
              }
              return { ...prev, [targetId]: { type: 'haste', stacks: 1 } };
            });
          });
        }

        // Handle slow - targetable
        if (detectedEffects.includes('slow')) {
          const targets = resolveTargets('slow');
          targets.forEach(targetId => {
            setSpeedBuffs(prev => ({ ...prev, [targetId]: { type: 'slow', stacks: 1 } }));
          });
        }

        // Handle enlarge - targetable, stacks up to 3
        if (detectedEffects.includes('enlarge')) {
          const targets = resolveTargets('enlarge');
          targets.forEach(targetId => {
            setSizeBuffs(prev => {
              const current = prev[targetId];
              if (current?.type === 'enlarge') {
                return { ...prev, [targetId]: { type: 'enlarge', stacks: Math.min(current.stacks + 1, 3) } };
              }
              return { ...prev, [targetId]: { type: 'enlarge', stacks: 1 } };
            });
          });
        }

        // Handle reduce - targetable, stacks up to 3
        if (detectedEffects.includes('reduce')) {
          const targets = resolveTargets('reduce');
          targets.forEach(targetId => {
            setSizeBuffs(prev => {
              const current = prev[targetId];
              if (current?.type === 'reduce') {
                return { ...prev, [targetId]: { type: 'reduce', stacks: Math.min(current.stacks + 1, 3) } };
              }
              return { ...prev, [targetId]: { type: 'reduce', stacks: 1 } };
            });
          });
        }

        // Handle fly - targetable
        if (detectedEffects.includes('fly')) {
          const targets = resolveTargets('fly');
          targets.forEach(targetId => {
            setFlyingPlayers(prev => new Set([...prev, targetId]));
          });
        }

        // Handle hold (freeze) - targetable, 5 second duration
        if (detectedEffects.includes('hold')) {
          const targets = resolveTargets('hold');
          targets.forEach(targetId => {
            setFrozenPlayers(prev => new Set([...prev, targetId]));
            // Auto-unfreeze after 5 seconds
            setTimeout(() => {
              setFrozenPlayers(prev => {
                const newSet = new Set(prev);
                newSet.delete(targetId);
                return newSet;
              });
            }, 5000);
          });
        }

        // Handle petrify - targetable
        if (detectedEffects.includes('petrify')) {
          const targets = resolveTargets('petrify');
          targets.forEach(targetId => {
            setPetrifiedPlayers(prev => new Set([...prev, targetId]));
            // Show effect on target
            const targetPos = playerPositionsRef.current[targetId]?.x ?? 0;
            setMagicEffects(prev => ({
              ...prev,
              [targetId]: { effects: ['petrify'], x: targetPos, timestamp: Date.now() }
            }));
          });
        }

        // Handle invisibility - targetable
        if (detectedEffects.includes('invisibility')) {
          const targets = resolveTargets('invisibility');
          targets.forEach(targetId => {
            setInvisiblePlayers(prev => new Set([...prev, targetId]));
          });
          // Note: Breaking invisibility on spell cast is handled separately below
        }

        // Handle dispel - targetable, removes all effects
        if (detectedEffects.includes('dispel')) {
          const targets = resolveTargets('dispel');
          targets.forEach(targetId => {
            setSpeedBuffs(prev => {
              const newBuffs = { ...prev };
              delete newBuffs[targetId];
              return newBuffs;
            });
            setFlyingPlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
            setFrozenPlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
            setDeadPlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
            setInvisiblePlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
            setSizeBuffs(prev => {
              const newBuffs = { ...prev };
              delete newBuffs[targetId];
              return newBuffs;
            });
            setPetrifiedPlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
          });
        }

        // === LOBBY-WIDE SPELLS (no targeting) ===

        // Handle earthbind spell - all flying players crash and die
        if (detectedEffects.includes('earthbind')) {
          // Get all currently flying players from ref
          const flyersToKill = Array.from(flyingPlayersRef.current);
          if (flyersToKill.length > 0) {
            // Remove all flyers from flying state
            setFlyingPlayers(new Set());
            // Kill all flyers
            setDeadPlayers(prev => new Set([...prev, ...flyersToKill]));
            // Show earthbind effect on each falling player
            flyersToKill.forEach(flyerId => {
              const flyerPos = playerPositionsRef.current[flyerId]?.x ?? 0;
              setMagicEffects(prev => ({
                ...prev,
                [flyerId]: { effects: ['earthbind'], x: flyerPos, timestamp: Date.now() }
              }));
            });
          }
        }

        // Handle massacre spell (avada kedavra) - kills all OTHER players, darkens tavern
        if (detectedEffects.includes('massacre')) {
          const lobby = currentLobbyRef.current;
          if (lobby) {
            // Kill all players except the caster
            const playersToKill = lobby.players
              .filter(p => p.id !== playerId)
              .map(p => p.id);
            setDeadPlayers(prev => new Set([...prev, ...playersToKill]));
            // Remove flying state from killed players
            setFlyingPlayers(prev => {
              const newSet = new Set(prev);
              playersToKill.forEach(id => newSet.delete(id));
              return newSet;
            });
            // Darken the tavern for 15 seconds
            setTavernDarkMode(true);
            setTimeout(() => setTavernDarkMode(false), 15000);
          }
        }

        // Handle mass revive spell - revives entire lobby
        if (detectedEffects.includes('massrevive')) {
          // Clear all dead players
          setDeadPlayers(new Set());
          // Also clear frozen state
          setFrozenPlayers(new Set());
        }

        // Handle dragon attack spell - dragon eats a random player
        if (detectedEffects.includes('dragon')) {
          const lobby = currentLobbyRef.current;
          if (lobby && lobby.players.length > 1) {
            // Pick a random player (excluding the caster)
            const eligiblePlayers = lobby.players.filter(p => p.id !== playerId);
            if (eligiblePlayers.length > 0) {
              const victim = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
              const victimPos = playerPositionsRef.current[victim.id]?.x ?? 200;
              // Start dragon animation
              setDragonAttack({ active: true, targetX: victimPos, targetPlayerId: victim.id });
              // Kill the victim after dragon reaches them (at ~50% of animation)
              setTimeout(() => {
                setDeadPlayers(prev => new Set([...prev, victim.id]));
                setFlyingPlayers(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(victim.id);
                  return newSet;
                });
              }, 1500);
              // End dragon animation
              setTimeout(() => {
                setDragonAttack({ active: false, targetX: 0, targetPlayerId: null });
              }, 3500);
            }
          }
        }

        // Handle chaos mode - rainbow disco effect for 5 seconds (lobby-wide)
        if (detectedEffects.includes('chaos')) {
          setChaosMode(true);
          setTimeout(() => setChaosMode(false), 5000);
        }

        // Breaking invisibility: if invisible player casts any spell OTHER than invisibility, break it
        if (!detectedEffects.includes('invisibility') && invisiblePlayersRef.current.has(playerId)) {
          setInvisiblePlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(playerId);
            return newSet;
          });
        }

        // Get player's X position from playerPositions ref
        const playerPos = playerPositionsRef.current[playerId];
        const effectX = playerPos?.x ?? (x / 100) * (movementAreaRef.current?.clientWidth || 800);

        setMagicEffects(prev => ({
          ...prev,
          [playerId]: { effects: detectedEffects, x: effectX, timestamp }
        }));

        // Auto-remove magic effects after 2.5 seconds
        setTimeout(() => {
          setMagicEffects(prev => {
            const newEffects = { ...prev };
            delete newEffects[playerId];
            return newEffects;
          });
        }, 2500);
      }

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
    socket.on('lobby_player_jump', handleLobbyPlayerJump);
    socket.on('lobby_player_charge', handleLobbyPlayerCharge);

    return () => {
      socket.off('lobby_player_pos', handleLobbyPlayerPos);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('lobby_emote', handleLobbyEmote);
      socket.off('lobby_player_jump', handleLobbyPlayerJump);
      socket.off('lobby_player_charge', handleLobbyPlayerCharge);
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
    emit('start_battle');
  };

  const changeTeam = (team: TeamType) => {
    // Only allow team changes in lobby phase
    if (currentLobby?.gamePhase !== 'lobby') return;

    // Save preference for future sessions
    TeamPreferenceStorage.saveTeam(team);

    emit('change_own_team', { team });
  };

  const startEditingLobbyName = () => {
    if (!isHost || !currentLobby) return;
    setEditedLobbyName(currentLobby.name);
    setIsEditingLobbyName(true);
  };

  const saveLobbyName = () => {

    const trimmedName = editedLobbyName.trim();

    if (!trimmedName) {
      setIsEditingLobbyName(false);
      return;
    }
    if (trimmedName !== currentLobby?.name) {
      emit('update_lobby_name', { name: trimmedName });
    } else {
    }
    setIsEditingLobbyName(false);
  };

  const cancelEditingLobbyName = () => {
    setIsEditingLobbyName(false);
    setEditedLobbyName('');
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

  const copyLobbyCode = () => {
    if (currentLobby?.id) {
      navigator.clipboard.writeText(currentLobby.id);
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

    // Detect magic words and trigger effects for local player
    const detectedEffects = detectMagicWords(message);
    if (detectedEffects.length > 0) {
      // Helper to resolve target IDs for a spell
      // Returns array of player IDs - either targets from message or just the caster
      const resolveTargets = (effectType: MagicEffectType): string[] => {
        const spellWords = getSpellWords(effectType);
        const targetNames = extractSpellTargets(message, spellWords);

        if (!targetNames || !currentLobby) {
          return [currentPlayer.id]; // Self-cast
        }

        // Find matching players by name
        const targetIds: string[] = [];
        for (const name of targetNames) {
          const player = currentLobby.players.find(
            p => p.name.toLowerCase() === name.toLowerCase()
          );
          if (player) {
            targetIds.push(player.id);
          }
        }

        return targetIds.length > 0 ? targetIds : [currentPlayer.id]; // Fall back to self if no valid targets
      };

      // Handle die - targetable
      if (detectedEffects.includes('die')) {
        const targets = resolveTargets('die');
        targets.forEach(targetId => {
          setDeadPlayers(prev => new Set([...prev, targetId]));
          // Break invisibility when dying
          if (invisiblePlayersRef.current.has(targetId)) {
            setInvisiblePlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
          }
        });
      }

      // Handle revive - targetable
      if (detectedEffects.includes('revive')) {
        const targets = resolveTargets('revive');
        targets.forEach(targetId => {
          setDeadPlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetId);
            return newSet;
          });
        });
      }

      // Handle haste - targetable, stacks up to 3
      if (detectedEffects.includes('haste')) {
        const targets = resolveTargets('haste');
        targets.forEach(targetId => {
          setSpeedBuffs(prev => {
            const current = prev[targetId];
            if (current?.type === 'haste') {
              return { ...prev, [targetId]: { type: 'haste', stacks: Math.min(current.stacks + 1, 3) } };
            }
            return { ...prev, [targetId]: { type: 'haste', stacks: 1 } };
          });
        });
      }

      // Handle slow - targetable
      if (detectedEffects.includes('slow')) {
        const targets = resolveTargets('slow');
        targets.forEach(targetId => {
          setSpeedBuffs(prev => ({ ...prev, [targetId]: { type: 'slow', stacks: 1 } }));
        });
      }

      // Handle enlarge - targetable, stacks up to 3
      if (detectedEffects.includes('enlarge')) {
        const targets = resolveTargets('enlarge');
        targets.forEach(targetId => {
          setSizeBuffs(prev => {
            const current = prev[targetId];
            if (current?.type === 'enlarge') {
              return { ...prev, [targetId]: { type: 'enlarge', stacks: Math.min(current.stacks + 1, 3) } };
            }
            return { ...prev, [targetId]: { type: 'enlarge', stacks: 1 } };
          });
        });
      }

      // Handle reduce - targetable, stacks up to 3
      if (detectedEffects.includes('reduce')) {
        const targets = resolveTargets('reduce');
        targets.forEach(targetId => {
          setSizeBuffs(prev => {
            const current = prev[targetId];
            if (current?.type === 'reduce') {
              return { ...prev, [targetId]: { type: 'reduce', stacks: Math.min(current.stacks + 1, 3) } };
            }
            return { ...prev, [targetId]: { type: 'reduce', stacks: 1 } };
          });
        });
      }

      // Handle fly - targetable
      if (detectedEffects.includes('fly')) {
        const targets = resolveTargets('fly');
        targets.forEach(targetId => {
          setFlyingPlayers(prev => new Set([...prev, targetId]));
        });
      }

      // Handle hold (freeze) - targetable, 5 second duration
      if (detectedEffects.includes('hold')) {
        const targets = resolveTargets('hold');
        targets.forEach(targetId => {
          setFrozenPlayers(prev => new Set([...prev, targetId]));
          // Show magic effect on the target
          const targetPos = targetId === currentPlayer.id
            ? myPosition.x
            : (playerPositions[targetId]?.x ?? 0);
          setMagicEffects(prev => ({
            ...prev,
            [targetId]: { effects: ['hold'], x: targetPos, timestamp: Date.now() }
          }));
          // Auto-unfreeze after 5 seconds
          setTimeout(() => {
            setFrozenPlayers(prev => {
              const newSet = new Set(prev);
              newSet.delete(targetId);
              return newSet;
            });
          }, 5000);
        });
      }

      // Handle petrify - targetable
      if (detectedEffects.includes('petrify')) {
        const targets = resolveTargets('petrify');
        targets.forEach(targetId => {
          setPetrifiedPlayers(prev => new Set([...prev, targetId]));
          // Show effect on target
          const targetPos = targetId === currentPlayer.id
            ? myPosition.x
            : (playerPositions[targetId]?.x ?? 0);
          setMagicEffects(prev => ({
            ...prev,
            [targetId]: { effects: ['petrify'], x: targetPos, timestamp: Date.now() }
          }));
        });
      }

      // Handle invisibility - targetable
      if (detectedEffects.includes('invisibility')) {
        const targets = resolveTargets('invisibility');
        targets.forEach(targetId => {
          setInvisiblePlayers(prev => new Set([...prev, targetId]));
        });
      }

      // Handle dispel - targetable, removes all effects
      if (detectedEffects.includes('dispel')) {
        const targets = resolveTargets('dispel');
        targets.forEach(targetId => {
          setSpeedBuffs(prev => {
            const newBuffs = { ...prev };
            delete newBuffs[targetId];
            return newBuffs;
          });
          // Reset fly height if dispelling self
          if (targetId === currentPlayer.id && flyingPlayersRef.current.has(targetId)) {
            setFlyHeight(0);
          }
          setFlyingPlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetId);
            return newSet;
          });
          setFrozenPlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetId);
            return newSet;
          });
          setDeadPlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetId);
            return newSet;
          });
          setInvisiblePlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetId);
            return newSet;
          });
          setSizeBuffs(prev => {
            const newBuffs = { ...prev };
            delete newBuffs[targetId];
            return newBuffs;
          });
          setPetrifiedPlayers(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetId);
            return newSet;
          });
        });
      }

      // === LOBBY-WIDE SPELLS (no targeting) ===

      // Handle earthbind spell - all flying players crash and die
      if (detectedEffects.includes('earthbind')) {
        // Get all currently flying players from ref
        const flyersToKill = Array.from(flyingPlayersRef.current);
        if (flyersToKill.length > 0) {
          // Reset local fly height if we're flying
          if (flyingPlayersRef.current.has(currentPlayer.id)) {
            setFlyHeight(0);
          }
          // Remove all flyers from flying state
          setFlyingPlayers(new Set());
          // Kill all flyers
          setDeadPlayers(prev => new Set([...prev, ...flyersToKill]));
          // Show earthbind effect on each falling player
          flyersToKill.forEach(flyerId => {
            const flyerPos = flyerId === currentPlayer.id
              ? myPosition.x
              : (playerPositions[flyerId]?.x ?? 0);
            setMagicEffects(prev => ({
              ...prev,
              [flyerId]: { effects: ['earthbind'], x: flyerPos, timestamp: Date.now() }
            }));
          });
        }
      }

      // Handle massacre spell (avada kedavra) - kills all OTHER players, darkens tavern
      if (detectedEffects.includes('massacre')) {
        if (currentLobby) {
          // Kill all players except the caster
          const playersToKill = currentLobby.players
            .filter(p => p.id !== currentPlayer.id)
            .map(p => p.id);
          setDeadPlayers(prev => new Set([...prev, ...playersToKill]));
          // Remove flying state from killed players
          setFlyingPlayers(prev => {
            const newSet = new Set(prev);
            playersToKill.forEach(id => newSet.delete(id));
            return newSet;
          });
          // Show massacre effect on each killed player
          playersToKill.forEach(targetId => {
            const targetPos = playerPositions[targetId]?.x ?? 0;
            setMagicEffects(prev => ({
              ...prev,
              [targetId]: { effects: ['massacre'], x: targetPos, timestamp: Date.now() }
            }));
          });
          // Darken the tavern for 15 seconds
          setTavernDarkMode(true);
          setTimeout(() => setTavernDarkMode(false), 15000);
        }
      }

      // Handle mass revive spell - revives entire lobby
      if (detectedEffects.includes('massrevive')) {
        // Clear all dead players
        setDeadPlayers(new Set());
        // Also clear frozen state
        setFrozenPlayers(new Set());
      }

      // Handle dragon attack spell - dragon eats a random player
      if (detectedEffects.includes('dragon')) {
        if (currentLobby && currentLobby.players.length > 1) {
          // Pick a random player (excluding the caster)
          const eligiblePlayers = currentLobby.players.filter(p => p.id !== currentPlayer.id);
          if (eligiblePlayers.length > 0) {
            const victim = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
            const victimPos = playerPositions[victim.id]?.x ?? 200;
            // Start dragon animation
            setDragonAttack({ active: true, targetX: victimPos, targetPlayerId: victim.id });
            // Kill the victim after dragon reaches them
            setTimeout(() => {
              setDeadPlayers(prev => new Set([...prev, victim.id]));
              setFlyingPlayers(prev => {
                const newSet = new Set(prev);
                newSet.delete(victim.id);
                return newSet;
              });
              // Show fire effect on victim
              setMagicEffects(prev => ({
                ...prev,
                [victim.id]: { effects: ['dragon', 'fire'], x: victimPos, timestamp: Date.now() }
              }));
            }, 1500);
            // End dragon animation
            setTimeout(() => {
              setDragonAttack({ active: false, targetX: 0, targetPlayerId: null });
            }, 3500);
          }
        }
      }

      // Handle chaos mode - rainbow disco effect for 5 seconds (lobby-wide)
      if (detectedEffects.includes('chaos')) {
        setChaosMode(true);
        setTimeout(() => setChaosMode(false), 5000);
      }

      // Breaking invisibility: if invisible player casts any spell OTHER than invisibility, break it
      if (!detectedEffects.includes('invisibility') && invisiblePlayersRef.current.has(currentPlayer.id)) {
        setInvisiblePlayers(prev => {
          const newSet = new Set(prev);
          newSet.delete(currentPlayer.id);
          return newSet;
        });
      }

      setMagicEffects(prev => ({
        ...prev,
        [currentPlayer.id]: { effects: detectedEffects, x: myPosition.x, timestamp }
      }));

      // Auto-remove magic effects after 2.5 seconds
      setTimeout(() => {
        setMagicEffects(prev => {
          const newEffects = { ...prev };
          delete newEffects[currentPlayer.id];
          return newEffects;
        });
      }, 2500);
    }

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
    // Save to persistent storage for future lobbies
    LobbySettingsStorage.updateTimerSettings(timerSettings);
  };

  const updateJiraSettings = (jiraSettings: JiraSettings) => {
    emit('update_jira_settings', { jiraSettings });
    // Save to persistent storage for future lobbies
    LobbySettingsStorage.updateJiraSettings(jiraSettings);
  };

  const updateEstimationSettings = (estimationSettings: EstimationSettings) => {
    if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;
    emit('update_estimation_settings', { estimationSettings });
    // Save to persistent storage for future lobbies
    LobbySettingsStorage.updateEstimationSettings(estimationSettings);
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

  if (!currentLobby) {
    return (
      <div className="retro-container relative overflow-x-hidden">
        <div className="max-w-4xl mx-auto p-4 sm:p-6 relative z-10">
          <RetroCard title="Battle Teams">
            <PlayerListSkeleton count={3} />
          </RetroCard>
        </div>
      </div>
    );
  }

  // Determine screen shake animation based on intensity
  const shakeAnimation = screenShake > 0 ? `screenShake${screenShake} 0.1s ease-in-out` : 'none';

  return (
    <div
      className="retro-container relative overflow-x-hidden"
      style={{ animation: shakeAnimation }}
    >
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
          {isEditingLobbyName ? (
            <div className="flex items-center justify-center gap-2 mb-2">
              <input
                type="text"
                value={editedLobbyName}
                onChange={(e) => setEditedLobbyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveLobbyName();
                  if (e.key === 'Escape') cancelEditingLobbyName();
                }}
                className="retro-input text-2xl font-bold text-center w-64"
                autoFocus
                maxLength={50}
              />
              <button
                type="button"
                onClick={saveLobbyName}
                className="text-green-400 hover:text-green-300 text-xl p-1"
                title="Save"
              >
                ✓
              </button>
              <button
                type="button"
                onClick={cancelEditingLobbyName}
                className="text-red-400 hover:text-red-300 text-xl p-1"
                title="Cancel"
              >
                ✕
              </button>
            </div>
          ) : (
            <h1
              className={`text-3xl font-bold retro-text-glow mb-2 inline-flex items-center justify-center gap-2 ${isHost ? 'cursor-pointer hover:text-blue-300 transition-colors' : ''}`}
              onClick={isHost ? startEditingLobbyName : undefined}
              title={isHost ? 'Click to edit lobby name' : undefined}
            >
              <span>{currentLobby.name}</span>
              {isHost && <span className="text-sm opacity-50">✏️</span>}
            </h1>
          )}
          <div className="flex items-center justify-center gap-2">
            <p className="text-gray-400">
              Lobby Code: <span className="retro-text-glow-light text-xl font-mono">{currentLobby.id}</span>
            </p>
            <button
              onClick={copyLobbyCode}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Copy lobby code"
            >
              📋
            </button>
          </div>
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
                                  <label className="block text-sm font-medium text-gray-300" htmlFor="timerDuration">
                                    Timer Duration
                                  </label>
                                  <select
                                    name='timerDuration'
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
                                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor='jiraBaseUrl'>
                                  JIRA Base URL
                                </label>
                                <input
                                  name='jiraBaseUrl'
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
                          
                          {/* Estimation Scale Section */}
                          <div className="border-t border-gray-700 pt-6">
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">Estimation Scale</h3>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300" htmlFor='estimationScaleType'>
                                  Scale Type
                                </label>
                                <select
                                  name='estimationScaleType'
                                  className="retro-input w-full"
                                  value={currentLobby.estimationSettings?.scaleType || 'fibonacci'}
                                  onChange={(e) => updateEstimationSettings({
                                    scaleType: e.target.value as EstimationScaleType,
                                    customTshirtMapping: currentLobby.estimationSettings?.customTshirtMapping
                                  })}
                                >
                                  <option value="fibonacci">Fibonacci (1, 2, 3, 5, 8, 13...)</option>
                                  <option value="doubling">Doubling (1, 2, 4, 8, 16, 32...)</option>
                                  <option value="tshirt">T-Shirt Sizes (XS, S, M, L, XL)</option>
                                </select>
                              </div>
                              
                              {/* T-shirt size point mapping */}
                              {(currentLobby.estimationSettings?.scaleType || 'fibonacci') === 'tshirt' && (
                                <div className="space-y-2">
                                  <label className="block text-sm font-medium text-gray-300" htmlFor='customTshirtMapping'>
                                    T-Shirt Size Point Values
                                  </label>
                                  <div className="grid grid-cols-5 gap-2" id='customTshirtMapping'>
                                    {['XS', 'S', 'M', 'L', 'XL'].map(size => (
                                      <div key={size} className="space-y-1">
                                        <label className="block text-xs text-gray-400 text-center">{size}</label>
                                        <input
                                          type="number"
                                          min="0"
                                          className="retro-input w-full text-center text-xs"
                                          value={currentLobby.estimationSettings?.customTshirtMapping?.[size] || ESTIMATION_SCALES.tshirt.pointMapping![size]}
                                          onChange={(e) => {
                                            const newMapping = {
                                              ...ESTIMATION_SCALES.tshirt.pointMapping,
                                              ...currentLobby.estimationSettings?.customTshirtMapping,
                                              [size]: parseInt(e.target.value) || 0
                                            };
                                            updateEstimationSettings({
                                              scaleType: 'tshirt',
                                              customTshirtMapping: newMapping
                                            });
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
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
          {/* Teams Section - Combined team selection and roster */}
          <div className="space-y-4 min-w-0">
            <RetroCard title="Battle Teams">
              <p className="text-sm text-gray-400 mb-4">
                Click a team to join. Your current team is highlighted.
              </p>
              {currentLobby.players.length === 0 && (
                <EmptyState
                  icon="👥"
                  title="No Adventurers Yet"
                  message="Share the lobby code to invite your party!"
                />
              )}
              <div className="space-y-3">
                {Object.entries(TEAM_NAMES).map(([teamKey, teamName]) => {
                  const team = teamKey as TeamType;
                  const teamPlayers = currentLobby.teams[team] || [];
                  const isCurrentTeam = currentPlayer?.team === team;

                  const teamDescriptions: Record<TeamType, string> = {
                    developers: 'Estimate story points and develop features',
                    qa: 'Provide testing perspective and quality insights',
                    spectators: 'Observe the session without voting'
                  };

                  return (
                    <button
                      key={team}
                      onClick={() => changeTeam(team)}
                      className={`w-full p-3 text-left rounded border-2 transition-all ${
                        isCurrentTeam
                          ? 'border-blue-500 bg-blue-500 bg-opacity-20'
                          : 'border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className={`font-bold text-sm sm:text-base ${isCurrentTeam ? 'text-blue-200' : 'text-white'}`}>
                            {teamName}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {teamDescriptions[team]}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 whitespace-nowrap ml-2">
                          {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''}
                        </div>
                      </div>

                      {/* Player roster */}
                      {teamPlayers.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-700">
                          {teamPlayers.map(player => (
                            <div
                              key={player.id}
                              className={`flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg text-xs ${
                                player.id === currentPlayer?.id
                                  ? 'bg-blue-600 bg-opacity-30 border border-blue-400'
                                  : 'bg-gray-700 bg-opacity-50'
                              }`}
                            >
                              <div className="flex-shrink-0 scale-75 origin-center">
                                {renderPlayerSprite(player.avatar)}
                              </div>
                              <span className="truncate max-w-[80px]">{player.name}</span>
                              {player.level > 1 && (
                                <span className="text-amber-400 opacity-75 text-[10px] font-bold ml-0.5">
                                  Lv{player.level}
                                </span>
                              )}
                              {player.isHost && <span className="text-yellow-400">*</span>}
                              {player.isReady && (
                                <span className="text-green-400 text-xs ml-1" aria-label="Ready">
                                  ✓
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
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
              
              <div className="space-y-2 mb-4 max-h-[50vh] overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500">
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
        </div>
        
        
      </div>
      
      {/* 4-Layer Tavern Background System */}
      {currentLobby?.gamePhase === 'lobby' && (
        <div 
          ref={movementAreaRef}
          className="fixed inset-0"
          style={{ zIndex: 1 }}
        >
          {/* Layer 1: Pixel Art Tavern Background (Furthest Back) */}
          <div className="absolute inset-0" style={{ zIndex: 1 }}>
            {/* Clouds Background */}
            <div 
              className="absolute bottom-0 h-full"
              style={{
                height: '500px',
                width: '100%',
                backgroundImage: 'url(/textures/sky.png)',
                backgroundSize: 'contain',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'repeat-x',
                imageRendering: 'pixelated',
                zIndex: 4,
                bottom: '250px',
                //Fade out at top
                WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskSize: '100% 100%',
                maskImage: 'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))',
                maskRepeat: 'no-repeat',
                maskSize: '100% 100%',
                // animation
                animation: 'moveClouds 60s linear infinite',
                opacity: 0.6
              }}
            >
            </div>

            {/* Center Door Section */}
            <div 
              className="absolute bottom-0 left-1/2 transform -translate-x-1/2"
              style={{
                height: '250px',
                width: '375px',
                backgroundImage: 'url(/textures/tavern/center.png)',
                backgroundSize: 'contain',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
                zIndex: 5
              }}
            >
            </div>
            
            {/* Left Background Extension */}
            <div 
              className="absolute bottom-0 left-1/2 h-full"
              style={{
                height: '250px',
                width: '100%',
                backgroundImage: 'url(/textures/tavern/repeat.png)',
                backgroundSize: 'contain',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'repeat-x',
                imageRendering: 'pixelated',
                zIndex: 2
              }}
            >
            </div>
            
            {/* Right Background Extension */}
            <div 
              className="absolute bottom-0 right-1/2 h-full"
              style={{
                height: '250px',
                width: '100%',
                backgroundImage: 'url(/textures/tavern/repeat.png)',
                backgroundSize: 'contain',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'repeat-x',
                imageRendering: 'pixelated',
                scale: -1,
                transform: 'scaleX(-1)',
                zIndex: 2
              }}
            >
            </div>
            
            {/* Minimal Floor Pattern */}
            <div 
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: '5px',
                background: 'repeating-linear-gradient(90deg, #170b01ff 0px, #2d1809ff 4px, #351f15ff 4px, #301f18ff 8px)',
                imageRendering: 'pixelated',
                zIndex: 6
              }}
            />
          </div>
          
          {/* Layer 2: Particle Lighting Effects */}
          <div className="absolute inset-0" style={{ zIndex: 8, pointerEvents: 'none' }}>
            <Canvas
              camera={{ position: [0, 2, 8], fov: 120 }}
              style={{ width: '100%', height: '100%', touchAction: 'none' }}
              dpr={dpr}
              gl={{ antialias: !isMobile, alpha: true }}
            >
              <PerformanceMonitor
                onDecline={() => setDpr((d) => Math.max(d - 0.5, 1))}
                onIncline={() => setDpr((d) => Math.min(d + 0.5, 2))}
              >
                <Suspense fallback={null}>
                  <TavernLighting />
                </Suspense>
              </PerformanceMonitor>
            </Canvas>
          </div>
          
          {/* Layer 3: Player Movement Area */}
          <div className="absolute inset-0" style={{ zIndex: 10, pointerEvents: 'none' }}>
          
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

          {/* Afterimages for haste/slow effects */}
          {afterimages.map(img => {
            const age = Date.now() - img.timestamp;
            const opacity = Math.max(0, 1 - age / 300); // Fade out over 300ms
            const player = currentLobby?.players.find(p => p.id === img.playerId);
            if (!player) return null;

            return (
              <div
                key={img.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${img.x}px`,
                  bottom: `${img.y}px`,
                  zIndex: 8,
                  opacity: opacity * 0.6,
                  filter: img.type === 'haste'
                    ? 'hue-rotate(90deg) brightness(1.3)'
                    : 'hue-rotate(200deg) brightness(0.8)',
                  transform: `scaleX(${img.type === 'haste' ? 1.2 : 0.9})`
                }}
              >
                <SpriteRenderer
                  avatarClass={getAvatarClass(player)}
                  animation="walk"
                  direction={myPosition.direction}
                  isMoving={true}
                  size={characterSize}
                />
              </div>
            );
          })}

          {/* My Player Character */}
          {currentPlayer && (() => {
            // Calculate fly rotation based on movement direction
            const isFlying = flyingPlayers.has(currentPlayer.id);
            let flyRotation = 0;
            if (isFlying && !frozenPlayers.has(currentPlayer.id)) {
              // Vertical tilt: up = tilt back (-15deg), down = tilt forward (15deg)
              if (keys.has('ArrowUp') || keys.has('KeyW')) flyRotation -= 15;
              if (keys.has('ArrowDown') || keys.has('KeyS')) flyRotation += 15;
              // Horizontal tilt: add slight banking
              if (keys.has('ArrowLeft') || keys.has('KeyA')) flyRotation -= 8;
              if (keys.has('ArrowRight') || keys.has('KeyD')) flyRotation += 8;
            }

            const isInvisible = invisiblePlayers.has(currentPlayer.id);

            // Calculate size scale based on size buffs
            // Enlarge: 1.5x, 2x, 2.5x | Reduce: 0.7x, 0.5x, 0.35x
            const sizeBuff = sizeBuffs[currentPlayer.id];
            let sizeScale = 1;
            if (sizeBuff?.type === 'enlarge') {
              sizeScale = 1 + (sizeBuff.stacks * 0.5); // 1.5x, 2x, 2.5x
            } else if (sizeBuff?.type === 'reduce') {
              const reduceScales = [0.7, 0.5, 0.35];
              sizeScale = reduceScales[sizeBuff.stacks - 1] || 0.35;
            }
            const baseScale = jumpState.isJumping ? 1.05 : 1;
            const totalScale = baseScale * sizeScale;

            return (
            <div
              className="absolute transition-transform duration-100 ease-linear cursor-pointer select-none"
              style={{
                left: `${myPosition.x}px`,
                bottom: `${deadPlayers.has(currentPlayer.id) ? -20 : (isFlying ? flyHeight : jumpState.jumpHeight)}px`,
                zIndex: 10,
                transform: `scale(${totalScale}) ${deadPlayers.has(currentPlayer.id) ? 'rotate(90deg)' : (isFlying ? `rotate(${flyRotation}deg)` : '')}`,
                transformOrigin: 'bottom center',
                transition: deadPlayers.has(currentPlayer.id) ? 'transform 0.5s ease-out, bottom 0.5s ease-out' : (jumpState.isJumping || isFlying ? 'none' : 'transform 0.2s ease-out'),
                opacity: isInvisible ? 0.5 : 1
              }}
              onClick={handleAvatarTap}
              onTouchStart={(e) => {
                e.preventDefault(); // Prevent default touch behaviors
                handleAvatarTap();
              }}
              title={isFlying ? "Use W/S or Up/Down to fly!" : (isInvisible ? "You are invisible!" : "Tap to jump!")}
            >
              {/* Player name above character */}
              <div className="text-center text-xs text-white bg-black/50 rounded px-1 mb-1">
                {currentPlayer.name}
                {deadPlayers.has(currentPlayer.id) && ' 💀'}
                {frozenPlayers.has(currentPlayer.id) && ' 🧊'}
                {petrifiedPlayers.has(currentPlayer.id) && ' 🗿'}
                {flyingPlayers.has(currentPlayer.id) && ' 🪶'}
                {isInvisible && ' 👻'}
                {sizeBuff?.type === 'enlarge' && (
                  <span className="text-orange-400">
                    {' '}{'🔺'.repeat(sizeBuff.stacks)}
                  </span>
                )}
                {sizeBuff?.type === 'reduce' && (
                  <span className="text-blue-400">
                    {' '}{'🔻'.repeat(sizeBuff.stacks)}
                  </span>
                )}
                {speedBuffs[currentPlayer.id]?.type === 'haste' && (
                  <span className="text-lime-400">
                    {' '}{'⚡'.repeat(speedBuffs[currentPlayer.id].stacks)}
                  </span>
                )}
                {speedBuffs[currentPlayer.id]?.type === 'slow' && ' 🐌'}
              </div>

              <div
                className={currentPlayer.team === 'spectators' ? 'spectator-character' : ''}
                style={{
                  filter: deadPlayers.has(currentPlayer.id)
                    ? 'grayscale(100%) brightness(0.7)'
                    : petrifiedPlayers.has(currentPlayer.id)
                    ? 'sepia(100%) saturate(50%) brightness(0.8) contrast(1.1)'
                    : frozenPlayers.has(currentPlayer.id)
                    ? 'hue-rotate(180deg) saturate(1.5) brightness(1.2)'
                    : (currentPlayer.team === 'spectators' ? 'hue-rotate(200deg) saturate(1.2)' : 'none'),
                  animation: (frozenPlayers.has(currentPlayer.id) || petrifiedPlayers.has(currentPlayer.id))
                    ? 'none' // Frozen/Petrified = no animation
                    : (currentPlayer.team === 'spectators' && !deadPlayers.has(currentPlayer.id)
                      ? 'spectatorPulse 2s ease-in-out infinite'
                      : 'none')
                }}
              >
                {keys.size === 0 && !deadPlayers.has(currentPlayer.id) && !jumpState.isJumping ? (
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      repeatType: 'loop',
                    }}
                  >
                    <SpriteRenderer
                      avatarClass={getAvatarClass(currentPlayer)}
                      animation="idle"
                      direction={myPosition.direction}
                      isMoving={false}
                      size={characterSize}
                    />
                  </motion.div>
                ) : (
                  <SpriteRenderer
                    avatarClass={getAvatarClass(currentPlayer)}
                    animation={deadPlayers.has(currentPlayer.id) ? 'death' : (jumpState.isJumping ? 'victory' : 'walk')}
                    direction={myPosition.direction}
                    isMoving={keys.size > 0}
                    size={characterSize}
                  />
                )}
              </div>
              
              
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

              {/* Current Player's Magic Effects */}
              {magicEffects[currentPlayer.id] && magicEffects[currentPlayer.id].effects.map((effect, index) => (
                <MagicEffect
                  key={`${currentPlayer.id}-${effect}-${index}`}
                  type={effect}
                  x={characterSize / 2} // Center on character
                  y={0}
                  onComplete={() => {
                    setMagicEffects(prev => {
                      const newEffects = { ...prev };
                      delete newEffects[currentPlayer.id];
                      return newEffects;
                    });
                  }}
                />
              ))}
            </div>
          );
          })()}

          {/* Other Players */}
          {currentLobby.players
            .filter(player => player.id !== currentPlayer?.id)
            .map(player => {
              const position = playerPositions[player.id];
              if (!position) return null;

              const isDead = deadPlayers.has(player.id);
              const isInvisible = invisiblePlayers.has(player.id);
              const isFlickering = invisibleFlicker[player.id];
              // Invisible players: normally hidden (0), flicker at 20%
              const playerOpacity = isInvisible ? (isFlickering ? 0.2 : 0) : 1;

              // Calculate size scale for other players
              const otherSizeBuff = sizeBuffs[player.id];
              let otherSizeScale = 1;
              if (otherSizeBuff?.type === 'enlarge') {
                otherSizeScale = 1 + (otherSizeBuff.stacks * 0.5); // 1.5x, 2x, 2.5x
              } else if (otherSizeBuff?.type === 'reduce') {
                const reduceScales = [0.7, 0.5, 0.35];
                otherSizeScale = reduceScales[otherSizeBuff.stacks - 1] || 0.35;
              }

              return (
                <div
                  key={player.id}
                  className="absolute transition-transform duration-200 ease-out"
                  style={{
                    left: `${position.x}px`,
                    bottom: `${isDead ? -20 : (position.jumpHeight || 0)}px`,
                    zIndex: 9,
                    transform: `scale(${otherSizeScale}) ${isDead ? 'rotate(90deg)' : ''}`,
                    transformOrigin: 'bottom center',
                    transition: isDead ? 'transform 0.5s ease-out, bottom 0.5s ease-out' : 'transform 0.2s ease-out, opacity 0.3s ease-in-out',
                    opacity: playerOpacity,
                    pointerEvents: isInvisible && !isFlickering ? 'none' : 'auto'
                  }}
                >
                  {/* Player name above character */}
                  <div className="text-center text-xs text-white bg-black/50 rounded px-1 mb-1">
                    {player.name}
                    {player.isReady && (
                      <span className="text-green-400 ml-1" aria-label="Ready">
                        ✓
                      </span>
                    )}
                    {isDead && ' 💀'}
                    {frozenPlayers.has(player.id) && ' 🧊'}
                    {petrifiedPlayers.has(player.id) && ' 🗿'}
                    {flyingPlayers.has(player.id) && ' 🪶'}
                    {otherSizeBuff?.type === 'enlarge' && (
                      <span className="text-orange-400">
                        {' '}{'🔺'.repeat(otherSizeBuff.stacks)}
                      </span>
                    )}
                    {otherSizeBuff?.type === 'reduce' && (
                      <span className="text-blue-400">
                        {' '}{'🔻'.repeat(otherSizeBuff.stacks)}
                      </span>
                    )}
                    {speedBuffs[player.id]?.type === 'haste' && (
                      <span className="text-lime-400">
                        {' '}{'⚡'.repeat(speedBuffs[player.id].stacks)}
                      </span>
                    )}
                    {speedBuffs[player.id]?.type === 'slow' && ' 🐌'}
                  </div>

                  <div
                    className={player.team === 'spectators' ? 'spectator-character' : ''}
                    style={{
                      filter: isDead
                        ? 'grayscale(100%) brightness(0.7)'
                        : petrifiedPlayers.has(player.id)
                        ? 'sepia(100%) saturate(50%) brightness(0.8) contrast(1.1)'
                        : frozenPlayers.has(player.id)
                        ? 'hue-rotate(180deg) saturate(1.5) brightness(1.2)'
                        : (player.team === 'spectators' ? 'hue-rotate(200deg) saturate(1.2)' : 'none'),
                      animation: (frozenPlayers.has(player.id) || petrifiedPlayers.has(player.id))
                        ? 'none' // Frozen/Petrified = no animation
                        : (player.team === 'spectators' && !isDead
                          ? 'spectatorPulse 2s ease-in-out infinite'
                          : 'none')
                    }}
                  >
                    {!position.isMoving && !isDead && !position.isJumping ? (
                      <motion.div
                        animate={{ y: [0, -3, 0] }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          repeatType: 'loop',
                        }}
                      >
                        <SpriteRenderer
                          avatarClass={getAvatarClass(player)}
                          animation="idle"
                          direction={position.direction}
                          isMoving={false}
                          size={characterSize}
                        />
                      </motion.div>
                    ) : (
                      <SpriteRenderer
                        avatarClass={getAvatarClass(player)}
                        animation={isDead ? 'death' : (position.isJumping ? 'victory' : 'walk')}
                        direction={position.direction}
                        isMoving={position.isMoving}
                        size={characterSize}
                      />
                    )}
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

                  {/* Other Player's Magic Effects */}
                  {magicEffects[player.id] && magicEffects[player.id].effects.map((effect, index) => (
                    <MagicEffect
                      key={`${player.id}-${effect}-${index}`}
                      type={effect}
                      x={characterSize / 2} // Center on character
                      y={0}
                      onComplete={() => {
                        setMagicEffects(prev => {
                          const newEffects = { ...prev };
                          delete newEffects[player.id];
                          return newEffects;
                        });
                      }}
                    />
                  ))}
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

          {/* Dark Tavern Overlay - triggered by massacre spell */}
          {tavernDarkMode && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 50,
                animation: 'tavernDarkPulse 3s ease-in-out infinite',
              }}
            >
              {/* Ominous text - positioned at bottom of screen */}
              <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 text-center">
                <div className="text-red-600 text-4xl font-bold animate-pulse" style={{ textShadow: '0 0 20px #ff0000' }}>
                  ☠️ AVADA KEDAVRA ☠️
                </div>
                <div className="text-gray-400 text-sm mt-2">The darkness will lift soon...</div>
              </div>
            </div>
          )}

          {/* Chaos Mode Disco Overlay */}
          {chaosMode && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 45,
                animation: 'chaosRainbow 0.5s linear infinite',
              }}
            >
              {/* Disco ball sparkles */}
              <div className="absolute inset-0" style={{ animation: 'discoFlash 0.2s ease-in-out infinite' }}>
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute text-2xl"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      animation: `sparkle-twinkle ${0.3 + Math.random() * 0.5}s ease-in-out infinite`,
                      animationDelay: `${Math.random() * 0.5}s`,
                    }}
                  >
                    ✨
                  </div>
                ))}
              </div>
              {/* Party text */}
              <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 text-center">
                <div
                  className="text-4xl font-bold"
                  style={{
                    background: 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: '0 0 20px rgba(255,255,255,0.5)',
                    animation: 'pulse 0.3s ease-in-out infinite',
                  }}
                >
                  🌈 CHAOS MODE 🌈
                </div>
                <div className="text-white text-lg mt-2" style={{ textShadow: '0 0 10px #fff' }}>
                  🎵 💃 🕺 🎶
                </div>
              </div>
            </div>
          )}

          {/* Dragon Attack Animation */}
          {dragonAttack.active && (
            <div
              className="absolute pointer-events-none"
              style={{
                zIndex: 100,
                left: 0,
                bottom: '100px',
                '--target-x': `${dragonAttack.targetX}px`,
                animation: 'dragonFlyAcross 3.5s ease-in-out forwards',
              } as React.CSSProperties}
            >
              <div className="relative">
                {/* Dragon emoji with fire breath */}
                <span className="text-8xl" style={{ filter: 'drop-shadow(0 0 20px rgba(255, 100, 0, 0.8))' }}>
                  🐉
                </span>
                {/* Fire trail */}
                <span className="absolute -left-8 top-6 text-4xl animate-pulse">🔥</span>
                <span className="absolute -left-16 top-8 text-3xl animate-pulse" style={{ animationDelay: '0.1s' }}>🔥</span>
              </div>
              {/* "Clever girl" text */}
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                <span className="text-orange-400 font-bold text-lg" style={{ textShadow: '0 0 10px #ff6600' }}>
                  Clever girl...
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Lobby Action Bar - Emote + Ready buttons */}
      {currentLobby?.gamePhase === 'lobby' && currentPlayer && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex gap-3 items-center">
          <button
            onClick={() => setShowEmoteModal(true)}
            className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 shadow-lg flex items-center justify-center text-xl hover:scale-110 active:scale-95 transition-transform touch-manipulation"
            title="Open Emote Menu (E)"
            aria-label="Send emote message"
            style={{
              boxShadow: '0 4px 14px rgba(147, 51, 234, 0.5)',
            }}
          >
            💬
          </button>
          <LobbyReadyButton />
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
