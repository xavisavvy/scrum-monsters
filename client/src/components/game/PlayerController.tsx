import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PlayerCharacter, PlayerPosition, Projectile } from './PlayerCharacter';
import { ProjectileSystem } from './ProjectileSystem';
import { MobileControls } from './MobileControls';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useAudio } from '@/lib/stores/useAudio';
import { AvatarClass } from '@/lib/gameTypes';
import type { RingAttack, RingAttackProjectile } from '@shared/gameEvents';
import { SpriteDirection } from '@/hooks/useSpriteAnimation';
import { useViewport } from '@/lib/hooks/useViewport';
import { useIsMobile } from '@/hooks/use-is-mobile';

interface PlayerControllerProps {
  // Remove containerWidth/Height - viewport system handles this
  onPlayerPositionsUpdate?: (positions: Record<string, { x: number, y: number }>) => void;
}

export function PlayerController({ onPlayerPositionsUpdate }: PlayerControllerProps) {
  const { currentPlayer, currentLobby, addAttackAnimation } = useGameState();
  const { emit, socket } = useWebSocket();
  const { playHit } = useAudio();
  const viewport = useViewport();
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>({ x: 100, y: 100 });
  const [isJumping, setIsJumping] = useState(false);
  const [jumpHeight, setJumpHeight] = useState(0); // Vertical offset for jump animation
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [bossProjectiles, setBossProjectiles] = useState<Projectile[]>([]);
  const [otherPlayersPositions, setOtherPlayersPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [otherPlayersProjectiles, setOtherPlayersProjectiles] = useState<Projectile[]>([]);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [qPressed, setQPressed] = useState(false);
  const [specialAttackCooldown, setSpecialAttackCooldown] = useState(0);
  const [currentDirection, setCurrentDirection] = useState<SpriteDirection>('down');
  const [isMoving, setIsMoving] = useState(false);

  const isMobile = useIsMobile();

  const characterSize = 64;
  const moveSpeed = 5;
  const jumpDuration = 600; // Jump duration in ms

  // Sync player position from server lobby data (only on initial load)
  useEffect(() => {
    if (currentPlayer && currentLobby?.playerPositions?.[currentPlayer.id]) {
      const serverPos = currentLobby.playerPositions[currentPlayer.id];
      
      // Clamp server positions to valid range and convert to screen coordinates
      const clampedX = Math.max(0, Math.min(100, serverPos.x));
      const clampedY = Math.max(0, Math.min(100, serverPos.y));
      const worldX = (clampedX / 100) * viewport.worldWidth;
      const worldY = (clampedY / 100) * viewport.worldHeight;
      const screenPos = viewport.worldToScreen(worldX, worldY);
      
      const isInitialSync = playerPosition.x === 100 && playerPosition.y === 100; // Default values

      if (isInitialSync) {
        setPlayerPosition({ x: screenPos.x, y: screenPos.y });
      }
    }
    // Only trigger on player/lobby change — playerPosition is intentionally excluded to avoid feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, currentLobby?.id, viewport, characterSize]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent game controls when typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      setKeys(prev => new Set(prev).add(event.code));
      
      // Handle jump
      if (event.code === 'Space' && !isJumping) {
        event.preventDefault();
        setIsJumping(true);
        
        // Send jumping state to server
        emit('player_jump', { isJumping: true });
        
        setTimeout(() => {
          setIsJumping(false);
          setJumpHeight(0); // Reset jump height when landing
          // Send jumping state to server
          emit('player_jump', { isJumping: false });
        }, jumpDuration);
      }
      
      // Handle emote key (E) - from battle screen
      if (event.code === 'KeyE') {
        event.preventDefault();
        // Trigger emote modal via custom event
        window.dispatchEvent(new CustomEvent('openEmoteModal'));
        return;
      }

      // Handle debug modal toggle with Tab key
      if (event.code === 'Tab') {
        event.preventDefault();
        setShowDebugModal(prev => !prev);
        return;
      }
      
      // Handle shooting with Ctrl keys (single shot per keydown, not continuous)
      if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && currentPlayer && !ctrlPressed) {
        setCtrlPressed(true); // Prevent multiple shots while held
        event.preventDefault();
        
        let targetX, targetY, targetPlayerId = null;
        
        if (currentPlayer.team === 'spectators') {
          // Spectators target nearest dev/qa player
          const nearestPlayer = findNearestTargetPlayer();
          if (nearestPlayer) {
            targetX = nearestPlayer.x;
            targetY = nearestPlayer.y;
            targetPlayerId = nearestPlayer.id;
          } else {
            // Fallback to center if no targets found - use world coordinates
            const centerWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
            targetX = centerWorld.x;
            targetY = centerWorld.y;
          }
        } else {
          // Dev/QA players shoot toward boss - use world coordinates
          const bossWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
          targetX = bossWorld.x;
          targetY = bossWorld.y;
        }
        
        // Calculate character center position (corrected for top-based positioning)
        const characterCenterX = playerPosition.x + characterSize / 2;
        const characterCenterY = viewport.viewportHeight - playerPosition.y - characterSize / 2;
        
        // Create projectile from character to target
        const projectileData = {
          startX: characterCenterX,
          startY: characterCenterY,
          targetX,
          targetY,
          emoji: getProjectileEmoji(currentPlayer.avatar),
          targetPlayerId: targetPlayerId || undefined // For spectator attacks
        };
        
        // Create projectile directly
        const newProjectile = {
          ...projectileData,
          id: Math.random().toString(36).substring(2, 15),
          progress: 0
        };
        
        setProjectiles(prev => [...prev, newProjectile]);
        
        // Convert screen coordinates to world coordinates, then to percentages
        const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
        const targetWorld = viewport.screenToWorld(targetX, targetY);
        const percentStartX = (startWorld.x / viewport.worldWidth) * 100;
        const percentStartY = (startWorld.y / viewport.worldHeight) * 100;
        const percentTargetX = (targetWorld.x / viewport.worldWidth) * 100;
        const percentTargetY = (targetWorld.y / viewport.worldHeight) * 100;
        
        // Emit projectile event for multiplayer visibility with percentage coordinates
        emit('player_projectile', {
          startX: percentStartX,
          startY: percentStartY,
          targetX: percentTargetX,
          targetY: percentTargetY,
          emoji: getProjectileEmoji(currentPlayer.avatar),
          targetPlayerId: targetPlayerId || undefined
        });
      }
      
      // Handle special attack with Q key (single attack per keydown, with cooldown)
      if (event.code === 'KeyQ' && currentPlayer && !qPressed && specialAttackCooldown <= 0) {
        setQPressed(true); // Prevent multiple attacks while held
        event.preventDefault();
        
        // Trigger special attack based on character class
        handleSpecialAttack(currentPlayer.avatar);
        
        // Set cooldown (5 seconds)
        setSpecialAttackCooldown(5000);
        
        // Start cooldown countdown
        const cooldownInterval = setInterval(() => {
          setSpecialAttackCooldown(prev => {
            if (prev <= 100) {
              clearInterval(cooldownInterval);
              return 0;
            }
            return prev - 100;
          });
        }, 100);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Prevent game controls when typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      setKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(event.code);
        return newKeys;
      });
      
      // Reset Ctrl key state when released to allow next shot
      if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
        setCtrlPressed(false);
      }
      
      // Reset Q key state when released
      if (event.code === 'KeyQ') {
        setQPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // Keyboard listeners register per jump/viewport change; ctrl/Q state, emit, and special-attack handlers read latest values via closure refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJumping, jumpDuration, currentPlayer, viewport, playerPosition, characterSize]);

  // Jump physics animation
  useEffect(() => {
    if (!isJumping) {
      setJumpHeight(0);
      return;
    }

    let velocity = 15; // Initial upward velocity
    const gravity = 0.8; // Gravity pulling down
    let currentHeight = 0;
    let animationFrame: number;

    const animateJump = () => {
      velocity -= gravity; // Apply gravity
      currentHeight += velocity; // Update height based on velocity
      
      // Prevent going below ground
      if (currentHeight <= 0) {
        currentHeight = 0;
        velocity = 0;
      }
      
      setJumpHeight(currentHeight);
      
      // Continue animation if still jumping and above ground
      if (isJumping && (currentHeight > 0 || velocity > 0)) {
        animationFrame = requestAnimationFrame(animateJump);
      }
    };

    animationFrame = requestAnimationFrame(animateJump);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isJumping]);

  // Handle movement based on pressed keys
  // WebSocket listeners for multiplayer features
  useEffect(() => {
    if (!socket) return;

    // Create handler functions that can be properly removed.
    const handleBossRingAttack = ({ projectiles: ringProjectiles }: RingAttack) => {
      // Convert percentage coordinates to world coordinates, then to screen coordinates
      const convertedProjectiles = ringProjectiles.map((proj: RingAttackProjectile) => {
        const targetWorld = { x: (proj.targetX / 100) * viewport.worldWidth, y: (proj.targetY / 100) * viewport.worldHeight };
        const targetScreen = viewport.worldToScreen(targetWorld.x, targetWorld.y);

        // Use projectile's startX/startY as boss position (server sends boss center as 50%, 40%)
        const bossWorld = { x: (proj.startX / 100) * viewport.worldWidth, y: (proj.startY / 100) * viewport.worldHeight };
        const bossScreen = viewport.worldToScreen(bossWorld.x, bossWorld.y);

        return {
          id: proj.id,
          startX: bossScreen.x,
          startY: bossScreen.y,
          targetX: targetScreen.x,
          targetY: targetScreen.y,
          progress: 0,
          emoji: proj.emoji
        };
      });

      setBossProjectiles(convertedProjectiles);
    };

    // players_pos and player_projectile_fired remain `any` until 45-05 types
    // the full socket boundary — their schemas need cross-checking against
    // server emit sites (Phase 45 H5 cluster).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handlePlayersPos = ({ positions }: any) => {
      if (!currentPlayer || !positions) return;
      
      // Convert server percentage positions to screen coordinates for all other players
      const otherPositions: Record<string, { x: number; y: number }> = {};
      
      Object.entries(positions).forEach(([playerId, serverPos]) => {
        // Skip our own position
        if (playerId === currentPlayer.id) return;
        
        const worldX = ((serverPos as any).x / 100) * viewport.worldWidth;
        const worldY = ((serverPos as any).y / 100) * viewport.worldHeight;
        const screenPos = viewport.worldToScreen(worldX, worldY);
        
        otherPositions[playerId] = { x: screenPos.x, y: screenPos.y };
      });
      
      setOtherPlayersPositions(otherPositions);
      
      // Pass all positions (current player + other players) to parent component.
      // currentPlayer is already guaranteed truthy by the early-return on line 301.
      if (onPlayerPositionsUpdate) {
        const allPositions = {
          ...otherPositions,
          [currentPlayer.id]: { x: playerPosition.x + characterSize / 2, y: playerPosition.y + characterSize / 2 }
        };
        onPlayerPositionsUpdate(allPositions);
      }
    };

    const handlePlayerProjectileFired = ({ playerId, playerName: _playerName, startX, startY, targetX, targetY, emoji, targetPlayerId, projectileId }: any) => {
      if (playerId === currentPlayer?.id) return; // Skip own projectiles
      
      // Convert percentage coordinates to world coordinates, then to screen coordinates
      const startWorld = { x: (startX / 100) * viewport.worldWidth, y: (startY / 100) * viewport.worldHeight };
      const targetWorld = { x: (targetX / 100) * viewport.worldWidth, y: (targetY / 100) * viewport.worldHeight };
      const startScreen = viewport.worldToScreen(startWorld.x, startWorld.y);
      const targetScreen = viewport.worldToScreen(targetWorld.x, targetWorld.y);
      
      const newProjectile = {
        id: projectileId,
        startX: startScreen.x,
        startY: startScreen.y,
        targetX: targetScreen.x,
        targetY: targetScreen.y,
        emoji,
        targetPlayerId,
        progress: 0
      };
      
      setOtherPlayersProjectiles(prev => [...prev, newProjectile]);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Add listeners with specific handler references
    socket.on('boss_ring_attack', handleBossRingAttack);
    socket.on('players_pos', handlePlayersPos);
    socket.on('player_projectile_fired', handlePlayerProjectileFired);

    return () => {
      socket.off('boss_ring_attack', handleBossRingAttack);
      socket.off('players_pos', handlePlayersPos);
      socket.off('player_projectile_fired', handlePlayerProjectileFired);
    };
    // Socket listeners register per socket/viewport change; positions and currentLobby read latest via closure to avoid teardown thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, viewport, characterSize, currentPlayer?.id]);

  // Update parent component with current player position changes
  useEffect(() => {
    if (onPlayerPositionsUpdate && currentPlayer) {
      const currentPositions = {
        ...otherPlayersPositions,
        [currentPlayer.id]: { x: playerPosition.x + characterSize / 2, y: playerPosition.y + characterSize / 2 }
      };
      onPlayerPositionsUpdate(currentPositions);
    }
    // currentPlayer used only for .id (already in deps); onPlayerPositionsUpdate is provided by parent and may not be stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPosition, otherPlayersPositions, onPlayerPositionsUpdate, currentPlayer?.id, characterSize]);

  // Throttled network updates - more responsive
  const lastNetworkUpdate = useRef({ x: 0, y: 0, time: 0 });
  const networkUpdateThrottle = 100; // 10 updates per second - balanced for performance

  useEffect(() => {
    const movePlayer = () => {
      setPlayerPosition(prev => {
        // newX/newY are assigned unconditionally below (lines ~424-425
        // after deltaX/deltaY normalization), so the prev.x/prev.y seed
        // values were dead. CodeQL js/useless-assignment-to-local.
        let moving = false;
        let direction: SpriteDirection = currentDirection;

        // Calculate movement vector for smooth diagonal movement
        let deltaX = 0;
        let deltaY = 0;

        // Horizontal movement
        if (keys.has('ArrowLeft') || keys.has('KeyA')) {
          deltaX -= moveSpeed;
          direction = 'left';
          moving = true;
        }
        if (keys.has('ArrowRight') || keys.has('KeyD')) {
          deltaX += moveSpeed;
          direction = 'right';
          moving = true;
        }
        
        // Vertical movement  
        if (keys.has('ArrowUp') || keys.has('KeyW')) {
          deltaY += moveSpeed; // Up moves toward bottom edge
          direction = 'up';
          moving = true;
        }
        if (keys.has('ArrowDown') || keys.has('KeyS')) {
          deltaY -= moveSpeed; // Down moves toward top edge
          direction = 'down';
          moving = true;
        }

        // Apply diagonal movement normalization for consistent speed
        if (deltaX !== 0 && deltaY !== 0) {
          // Normalize diagonal movement to prevent faster diagonal speed
          const normalizer = Math.sqrt(2) / 2;
          deltaX *= normalizer;
          deltaY *= normalizer;
        }

        // Apply movement with bounds checking (keep character in visible area)
        const newX = Math.max(0, Math.min(viewport.viewportWidth - characterSize, prev.x + deltaX));
        const newY = Math.max(50, Math.min(viewport.viewportHeight - characterSize - 50, prev.y + deltaY)); // Keep away from edges

        // Update movement state and direction
        setIsMoving(moving);
        if (moving) {
          setCurrentDirection(direction);
        }

        // Throttled network updates - only send if enough time has passed and position changed
        const now = Date.now();
        const timeDelta = now - lastNetworkUpdate.current.time;
        const positionChanged = Math.abs(newX - lastNetworkUpdate.current.x) > 1 || 
                               Math.abs(newY - lastNetworkUpdate.current.y) > 1;

        if (positionChanged && timeDelta >= networkUpdateThrottle) {
          // Convert screen coordinates to world coordinates, then to percentage for server
          const worldPos = viewport.screenToWorld(newX, newY);
          const percentX = Math.max(0, Math.min(100, (worldPos.x / viewport.worldWidth) * 100));
          const percentY = Math.max(0, Math.min(100, (worldPos.y / viewport.worldHeight) * 100));
          
          emit('player_pos', { x: percentX, y: percentY });
          
          // Update throttle tracking
          lastNetworkUpdate.current = { x: newX, y: newY, time: now };
        }

        return { x: newX, y: newY };
      });
    };

    const interval = setInterval(movePlayer, 16); // ~60 FPS for immediate response
    return () => clearInterval(interval);
  }, [keys, viewport, characterSize, moveSpeed, emit, currentDirection]);

  const handleShoot = useCallback((projectileData: Omit<Projectile, 'id' | 'progress'>) => {
    const newProjectile: Projectile = {
      ...projectileData,
      id: Math.random().toString(36).substring(2, 15),
      progress: 0
    };
    
    setProjectiles(prev => [...prev, newProjectile]);
  }, []);

  // Handle screen pointer down for shooting (replaces onClick to avoid mobile double-fire)
  const handleScreenPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Prevent synthetic mouse events on touch to avoid double-fire
    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    // Focus the element for keyboard input
    (event.currentTarget as HTMLElement).focus?.();

    event.stopPropagation();

    // Don't shoot if clicking on UI elements
    const target = event.target as HTMLElement;

    // Only ignore clicks on interactive UI elements marked with data-no-shoot
    if (target.closest('[data-no-shoot]')) {
      return;
    }

    // Allow clicks on player controller or its direct children (like character)
    const isValidTarget = target === event.currentTarget ||
                         event.currentTarget.contains(target);

    if (!isValidTarget) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const targetX = event.clientX - rect.left;
    const targetY = event.clientY - rect.top;
    
    // Calculate character center position (corrected for top-based positioning)
    const characterCenterX = playerPosition.x + characterSize / 2;
    const characterCenterY = viewport.viewportHeight - playerPosition.y - characterSize / 2;
    
    // Create projectile from character to click position
    const projectileData = {
      startX: characterCenterX,
      startY: characterCenterY,
      targetX,
      targetY,
      emoji: currentPlayer ? getProjectileEmoji(currentPlayer.avatar) : '⚡'
    };
    
    handleShoot(projectileData);
    
    // Convert screen coordinates to world coordinates, then to percentages before emitting
    const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
    const targetWorld = viewport.screenToWorld(targetX, targetY);
    const percentStartX = (startWorld.x / viewport.worldWidth) * 100;
    const percentStartY = (startWorld.y / viewport.worldHeight) * 100;
    const percentTargetX = (targetWorld.x / viewport.worldWidth) * 100;
    const percentTargetY = (targetWorld.y / viewport.worldHeight) * 100;
    
    // Emit projectile event for multiplayer visibility with percentage coordinates
    emit('player_projectile', {
      startX: percentStartX,
      startY: percentStartY,
      targetX: percentTargetX,
      targetY: percentTargetY,
      emoji: currentPlayer ? getProjectileEmoji(currentPlayer.avatar) : '⚡'
    });
    // emit and other viewport fields read via closure — including them would re-create the callback on every viewport tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPosition, viewport.viewportHeight, characterSize, handleShoot, currentPlayer]);

  const getProjectileEmoji = (avatarClass: AvatarClass): string => {
    const projectileEmojis: Record<AvatarClass, string> = {
      ranger: '🏹',
      rogue: '🔪', 
      bard: '🎵',
      sorcerer: '🔥',
      wizard: '⚡',
      warrior: '⚔️',
      paladin: '✨',
      cleric: '💫',
      oathbreaker: '🖤',
      monk: '👊'
    };
    
    return projectileEmojis[avatarClass];
  };

  // Find nearest downed player for revive
  const findNearestDownedPlayer = useCallback(() => {
    if (!currentLobby || !currentPlayer) return null;
    
    // Get all downed players with positions
    const downedPlayers = currentLobby.players.filter(p => {
      const combatState = currentLobby.playerCombatStates?.[p.id];
      return combatState?.isDowned && currentLobby.playerPositions?.[p.id];
    });
    
    if (downedPlayers.length === 0) return null;
    
    // Calculate distances using real positions from server
    const currentX = playerPosition.x;
    const currentY = playerPosition.y;
    
    let nearestPlayer = null;
    let minDistance = Infinity;
    const REVIVE_DISTANCE = 150; // Proximity threshold for revive
    
    for (const player of downedPlayers) {
      const serverPos = currentLobby.playerPositions[player.id];
      if (!serverPos) continue;
      
      const distance = Math.sqrt(
        Math.pow(serverPos.x - currentX, 2) + Math.pow(serverPos.y - currentY, 2)
      );
      
      if (distance < minDistance && distance <= REVIVE_DISTANCE) {
        minDistance = distance;
        nearestPlayer = { id: player.id, distance };
      }
    }
    
    return nearestPlayer;
  }, [currentLobby, currentPlayer, playerPosition]);

  // Special attack system with class-specific effects
  const handleSpecialAttack = useCallback((avatarClass: AvatarClass) => {
    // CLERIC: Heal entire party 50% HP
    if (avatarClass === 'cleric') {
      emit('heal_party');
      if (playHit) playHit();
      return;
    }
    
    // OTHER CLASSES: Check for nearby downed players to revive
    const nearestDowned = findNearestDownedPlayer();
    if (nearestDowned) {
      emit('revive_start', { targetId: nearestDowned.id });
      if (playHit) playHit();
      return;
    }
    
    // NO DOWNED PLAYERS NEARBY: Attack boss with special attack.
    // (effectText labels were here previously but never consumed —
    // emit('attack_boss') sends damage only. Re-add at the floating-
    // damage layer if class-flavored attack labels are wanted again.)
    let damage = 25;
    switch (avatarClass) {
      case 'ranger':      damage = 30; break;
      case 'rogue':       damage = 35; break;
      case 'bard':        damage = 20; break;
      case 'sorcerer':    damage = 40; break;
      case 'wizard':      damage = 38; break;
      case 'warrior':     damage = 32; break;
      case 'paladin':     damage = 28; break;
      case 'oathbreaker': damage = 42; break;
      case 'monk':        damage = 33; break;
    }
    
    emit('attack_boss', { damage });
    if (playHit) playHit();
  }, [emit, playHit, findNearestDownedPlayer]);

  // Removed createParticleExplosion function to prevent DOM manipulation errors

  const findNearestTargetPlayer = useCallback(() => {
    if (!currentLobby || !currentPlayer) return null;
    
    // Get all dev/qa players with positions
    const targetPlayers = currentLobby.players.filter(p => 
      (p.team === 'developers' || p.team === 'qa') && currentLobby.playerPositions?.[p.id]
    );
    
    if (targetPlayers.length === 0) return null;
    
    // Calculate distances using real positions from server
    const currentX = playerPosition.x;
    const currentY = playerPosition.y;
    
    let nearestPlayer = null;
    let minDistance = Infinity;
    
    for (const player of targetPlayers) {
      const serverPos = currentLobby.playerPositions[player.id];
      if (!serverPos) continue;
      
      const distance = Math.sqrt(
        Math.pow(serverPos.x - currentX, 2) + Math.pow(serverPos.y - currentY, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestPlayer = { id: player.id, x: serverPos.x, y: serverPos.y };
      }
    }
    
    return nearestPlayer;
  }, [currentLobby, currentPlayer, playerPosition]);

  // Mobile touch input handlers — update the same keys Set as keyboard input
  const handleMobileKeyDown = useCallback((code: string) => {
    setKeys(prev => new Set(prev).add(code));

    // Handle jump (same logic as keyboard Space handler)
    if (code === 'Space' && !isJumping) {
      setIsJumping(true);
      emit('player_jump', { isJumping: true });
      setTimeout(() => {
        setIsJumping(false);
        setJumpHeight(0);
        emit('player_jump', { isJumping: false });
      }, jumpDuration);
    }

    // Handle special attack (same logic as keyboard Q handler)
    if (code === 'KeyQ' && !qPressed && specialAttackCooldown <= 0) {
      setQPressed(true);
      if (currentPlayer) {
        handleSpecialAttack(currentPlayer.avatar);
        setSpecialAttackCooldown(5000);
        const cooldownInterval = setInterval(() => {
          setSpecialAttackCooldown(prev => {
            if (prev <= 100) {
              clearInterval(cooldownInterval);
              return 0;
            }
            return prev - 100;
          });
        }, 100);
      }
    }

    // Handle shoot (same logic as keyboard Ctrl handler)
    if (code === 'ControlLeft' && currentPlayer && !ctrlPressed) {
      setCtrlPressed(true);

      let targetX, targetY, targetPlayerId: string | null = null;

      if (currentPlayer.team === 'spectators') {
        const nearestPlayer = findNearestTargetPlayer();
        if (nearestPlayer) {
          targetX = nearestPlayer.x;
          targetY = nearestPlayer.y;
          targetPlayerId = nearestPlayer.id;
        } else {
          const centerWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
          targetX = centerWorld.x;
          targetY = centerWorld.y;
        }
      } else {
        const bossWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
        targetX = bossWorld.x;
        targetY = bossWorld.y;
      }

      const characterCenterX = playerPosition.x + characterSize / 2;
      const characterCenterY = viewport.viewportHeight - playerPosition.y - characterSize / 2;

      const newProjectile: Projectile = {
        id: Math.random().toString(36).substring(2, 15),
        startX: characterCenterX,
        startY: characterCenterY,
        targetX: targetX!,
        targetY: targetY!,
        emoji: getProjectileEmoji(currentPlayer.avatar),
        progress: 0
      };

      setProjectiles(prev => [...prev, newProjectile]);

      const startWorld = viewport.screenToWorld(characterCenterX, characterCenterY);
      const targetWorld = viewport.screenToWorld(targetX!, targetY!);
      const percentStartX = (startWorld.x / viewport.worldWidth) * 100;
      const percentStartY = (startWorld.y / viewport.worldHeight) * 100;
      const percentTargetX = (targetWorld.x / viewport.worldWidth) * 100;
      const percentTargetY = (targetWorld.y / viewport.worldHeight) * 100;

      emit('player_projectile', {
        startX: percentStartX,
        startY: percentStartY,
        targetX: percentTargetX,
        targetY: percentTargetY,
        emoji: getProjectileEmoji(currentPlayer.avatar),
        targetPlayerId: targetPlayerId || undefined
      });
    }
  }, [isJumping, jumpDuration, emit, qPressed, specialAttackCooldown, currentPlayer, ctrlPressed,
      playerPosition, characterSize, viewport, findNearestTargetPlayer, handleSpecialAttack]);

  const handleMobileKeyUp = useCallback((code: string) => {
    setKeys(prev => {
      const next = new Set(prev);
      next.delete(code);
      return next;
    });

    if (code === 'KeyQ') {
      setQPressed(false);
    }
    if (code === 'ControlLeft') {
      setCtrlPressed(false);
    }
  }, []);

  // Boss projectile collision handler
  const handleBossProjectileComplete = useCallback((projectile: Projectile) => {
    // Remove the boss projectile
    setBossProjectiles(prev => prev.filter(p => p.id !== projectile.id));
    
    if (!currentPlayer) return;
    
    // Use screen coordinates for both player and projectile (projectiles are already in screen coordinates)
    const playerPixelX = playerPosition.x + characterSize / 2;
    const playerPixelY = viewport.viewportHeight - (playerPosition.y + characterSize / 2); // Convert to top-based Y
    
    // Check collision with projectile target (both in pixel coordinates)
    const distance = Math.sqrt(
      Math.pow(playerPixelX - projectile.targetX, 2) + 
      Math.pow(playerPixelY - projectile.targetY, 2)
    );
    
    // If hit (within 300 pixels - much larger collision area for boss projectiles)
    if (distance < 300) {
      const damage = Math.floor(Math.random() * 3) + 2; // 2-4 damage
      
      // Play hit sound
      playHit();
      
      // Add attack animation
      addAttackAnimation({
        id: projectile.id,
        playerId: 'boss',
        damage,
        timestamp: Date.now(),
        x: projectile.targetX,
        y: projectile.targetY
      });
      
      // Emit boss damage to server
      emit('boss_damage_player', { playerId: currentPlayer.id, damage });
    }
  }, [currentPlayer, playerPosition, characterSize, viewport, playHit, addAttackAnimation, emit]);

  const handleProjectileComplete = useCallback((projectile: Projectile) => {
    // Remove the projectile from the list
    setProjectiles(prev => prev.filter(p => p.id !== projectile.id));
    
    if (!currentPlayer) return;
    
    if (currentPlayer.team === 'spectators' && projectile.targetPlayerId) {
      // Spectator attacking player
      const damage = Math.floor(Math.random() * 3) + 1; // 1-3 damage
      
      // Play hit sound
      playHit();
      
      // Add attack animation
      addAttackAnimation({
        id: projectile.id,
        playerId: currentPlayer.id,
        damage,
        timestamp: Date.now(),
        x: projectile.targetX,
        y: projectile.targetY
      });
      
      // Emit player attack to server
      emit('attack_player', { targetId: projectile.targetPlayerId, damage });
    } else {
      // Dev/QA attacking boss
      const bossAreaX = viewport.viewportWidth * 0.3; // Boss takes up center area
      const bossAreaY = viewport.viewportHeight * 0.2;
      const bossAreaWidth = viewport.viewportWidth * 0.4;
      const bossAreaHeight = viewport.viewportHeight * 0.6;
      
      const hitBoss = projectile.targetX >= bossAreaX && 
                     projectile.targetX <= bossAreaX + bossAreaWidth &&
                     projectile.targetY >= bossAreaY && 
                     projectile.targetY <= bossAreaY + bossAreaHeight;
      
      if (hitBoss && currentLobby?.boss) {
        // Calculate damage (story points scale)
        const damage = Math.floor(Math.random() * 3) + 1; // 1-3 damage
        
        // Play hit sound
        playHit();
        
        // Add attack animation
        addAttackAnimation({
          id: projectile.id,
          playerId: currentPlayer.id,
          damage,
          timestamp: Date.now(),
          x: projectile.targetX,
          y: projectile.targetY
        });
        
        // Emit attack to server
        emit('attack_boss', { damage });
      }
    }
  }, [viewport, currentPlayer, currentLobby, playHit, addAttackAnimation, emit]);

  // Reset player to visible position when entering battle
  useEffect(() => {
    if (currentLobby?.gamePhase === 'battle' && currentPlayer) {
      // Always reset to center-bottom when entering battle to ensure visibility
      const safeX = viewport.viewportWidth / 2 - characterSize / 2;
      const safeY = 150; // 150px from bottom of screen
      setPlayerPosition({ x: safeX, y: safeY });
    }
    // Position reset reads currentPlayer existence only — id change already triggers re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLobby?.gamePhase, currentPlayer?.id, viewport.viewportWidth, viewport.viewportHeight, characterSize]);

  // Check if should be active (but always render container to prevent DOM reconciliation issues)
  const isActive = currentPlayer && currentLobby && currentLobby.gamePhase === 'battle';

  return (
    <div 
      className={`absolute inset-0 focus:outline-none ${isActive ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={isActive ? handleScreenPointerDown : undefined}
      tabIndex={isActive ? 0 : -1}
      onKeyDown={isActive ? (e) => {
        const event = e.nativeEvent;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        setKeys(prev => new Set(prev).add(event.code));
        
        if (event.code === 'Space' && !isJumping) {
          e.preventDefault();
          setIsJumping(true);
          emit('player_jump', { isJumping: true });
          setTimeout(() => {
            setIsJumping(false);
            emit('player_jump', { isJumping: false });
          }, jumpDuration);
        }
        
        // Handle emote key (E)
        if (event.code === 'KeyE') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('openEmoteModal'));
        }
        
        // Handle shooting with Ctrl keys
        if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && currentPlayer && !ctrlPressed) {
          setCtrlPressed(true);
          e.preventDefault();
          
          let targetX, targetY, targetPlayerId = null;
          
          if (currentPlayer.team === 'spectators') {
            const nearestPlayer = findNearestTargetPlayer();
            if (nearestPlayer) {
              targetX = nearestPlayer.x;
              targetY = nearestPlayer.y;
              targetPlayerId = nearestPlayer.id;
            } else {
              const centerWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
              targetX = centerWorld.x;
              targetY = centerWorld.y;
            }
          } else {
            const bossWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
            targetX = bossWorld.x;
            targetY = bossWorld.y;
          }
          
          const characterCenterX = playerPosition.x + characterSize / 2;
          const characterCenterY = viewport.viewportHeight - playerPosition.y - characterSize / 2;
          
          const emoji = getProjectileEmoji(currentPlayer.avatar);
          const newProjectile: Projectile = {
            id: Math.random().toString(36).substring(2, 15),
            startX: characterCenterX,
            startY: characterCenterY,
            targetX,
            targetY,
            emoji,
            progress: 0
          };
          
          setProjectiles(prev => [...prev, newProjectile]);
          
          if (currentPlayer.team === 'spectators' && targetPlayerId) {
            const damage = 0; // Damage calculated on server based on modifier
            emit('attack_player', {
              targetId: targetPlayerId,
              damage
            });
          } else {
            // Calculate damage for boss attack (same as click attacks)
            const damage = Math.floor(Math.random() * 3) + 1; // 1-3 damage
            
            emit('attack_boss', {
              damage
            });
          }
        }
      } : undefined}
      onKeyUp={isActive ? (e) => {
        const event = e.nativeEvent;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        setKeys(prev => {
          const newKeys = new Set(prev);
          newKeys.delete(event.code);
          return newKeys;
        });
        
        // Reset Ctrl key state when released
        if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
          setCtrlPressed(false);
        }
      } : undefined}
      ref={isActive ? (el) => {
        // Only auto-focus during battle phase to prevent stealing focus from other UI elements
        if (el && document.activeElement !== el && currentLobby?.gamePhase === 'battle') {
          const activeElement = document.activeElement;
          // Don't steal focus if user is typing in an input field (like emote modal)
          if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
            return;
          }
          // Don't steal focus from open popovers/menus/dialogs (Radix UI), or any
          // element inside one. Stealing focus causes Radix to auto-close on focus loss.
          if (activeElement instanceof HTMLElement && activeElement.closest(
            '[data-radix-popper-content-wrapper],[role="dialog"],[role="menu"],[role="listbox"]'
          )) {
            return;
          }
          // Only auto-focus when no meaningful element holds focus (body or null).
          if (activeElement && activeElement !== document.body) {
            return;
          }
          el.focus();
        }
      } : undefined}
    >
      {isActive && currentPlayer && (
        <div style={{ 
          opacity: currentPlayer.team === 'spectators' ? 0.7 : 1,
          filter: currentPlayer.team === 'spectators' ? 'saturate(0.9)' : 'none'
        }}>
          <PlayerCharacter
            avatarClass={currentPlayer.avatar}
            playerName={currentPlayer.name}
            position={playerPosition}
            onPositionChange={setPlayerPosition}
            onShoot={handleShoot}
            isJumping={isJumping}
            jumpHeight={jumpHeight}
            isDead={false} // Could be tied to game state later
            containerWidth={viewport.viewportWidth}
            containerHeight={viewport.viewportHeight}
            playerId={currentPlayer.id}
            isMoving={isMoving}
            direction={currentDirection}
          />
        </div>
      )}

      {/* Other players */}
      {currentLobby && Object.entries(otherPlayersPositions).map(([playerId, position]) => {
        const player = currentLobby.players.find(p => p.id === playerId);
        if (!player) return null;
        
        return (
          <div key={playerId} style={{ 
            opacity: 0.9,
            filter: 'brightness(0.9)'
          }}>
            <PlayerCharacter
              avatarClass={player.avatar}
              playerName={player.name}
              position={position}
              onPositionChange={() => {}} // Other players can't be moved
              onShoot={() => {}} // Other players don't shoot from here
              isJumping={false} // TODO: sync jumping state
              isDead={false}
              containerWidth={viewport.viewportWidth}
              containerHeight={viewport.viewportHeight}
              playerId={playerId}
              isMoving={false} // TODO: sync movement state
              direction="down" // TODO: sync direction
            />
          </div>
        );
      })}
      
      <ProjectileSystem
        projectiles={projectiles}
        onProjectileComplete={handleProjectileComplete}
      />
      
      {/* Boss Ring Attack Projectiles */}
      <ProjectileSystem
        projectiles={bossProjectiles}
        onProjectileComplete={handleBossProjectileComplete}
      />

      {/* Other players' projectiles */}
      <ProjectileSystem
        projectiles={otherPlayersProjectiles}
        onProjectileComplete={(projectile) => {
          setOtherPlayersProjectiles(prev => prev.filter(p => p.id !== projectile.id));
        }}
      />
      
      {/* Bottom Left Controls - Positioned above PlayerHUD */}
      <div className="absolute bottom-24 left-6 z-50 flex flex-col gap-2" data-no-shoot>
        {/* Special Attack Cooldown Indicator */}
        {specialAttackCooldown > 0 && (
          <div className="bg-black bg-opacity-80 rounded-lg p-4 border-2 border-purple-500">
            <div className="text-white font-bold text-sm mb-2">SPECIAL ATTACK</div>
            <div className="w-24 h-3 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-100"
                style={{ width: `${((5000 - specialAttackCooldown) / 5000) * 100}%` }}
              />
            </div>
            <div className="text-purple-300 text-xs mt-1 text-center">
              {(specialAttackCooldown / 1000).toFixed(1)}s
            </div>
          </div>
        )}

        {/* Action Hints */}
        <div className="flex gap-2">
          {/* Q Key Hint */}
          {specialAttackCooldown === 0 && (
            <div className="bg-purple-900 bg-opacity-70 rounded-lg px-3 py-2 border border-purple-400">
              <div className="text-purple-200 font-bold text-sm flex items-center gap-2">
                <span className="bg-purple-600 px-2 py-1 rounded text-xs font-mono">Q</span>
                Special Attack Ready
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Movement Instructions */}
      {/* Debug Modal - Toggle with Tab */}
      {showDebugModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-75 pointer-events-auto">
          <div className="bg-gray-900 border-2 border-green-400 rounded-lg p-6 max-w-md w-full mx-4 text-white">
            {/* Header */}
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-green-400">🎮 Debug Info & Controls</h2>
              <p className="text-sm text-gray-400">Press Tab to close</p>
            </div>
            
            {/* Debug Information */}
            <div className="bg-red-600 bg-opacity-20 border border-red-400 rounded p-3 mb-4">
              <h3 className="text-red-400 font-semibold mb-2">🔧 Debug Info</h3>
              <div className="text-xs space-y-1">
                <div>🎮 Player: {currentPlayer?.name || 'None'}</div>
                <div>📍 Position: ({playerPosition.x}, {playerPosition.y})</div>
                <div>🚀 Projectiles: {projectiles.length}</div>
                <div>💀 Boss Projectiles: {bossProjectiles.length}</div>
                <div>👥 Other Players: {Object.keys(otherPlayersPositions).length}</div>
                <div>⚡ Other Projectiles: {otherPlayersProjectiles.length}</div>
                <div>🎯 Viewport: {viewport.viewportWidth}x{viewport.viewportHeight}</div>
                <div>🌍 World: {viewport.worldWidth}x{viewport.worldHeight}</div>
                <div>📏 Scale: {viewport.scale.toFixed(3)}</div>
                <div>📹 Camera: ({viewport.cameraX.toFixed(1)}, {viewport.cameraY.toFixed(1)})</div>
              </div>
            </div>
            
            {/* Movement Controls */}
            <div className="bg-blue-600 bg-opacity-20 border border-blue-400 rounded p-3">
              <h3 className="text-blue-400 font-semibold mb-2">🎮 Controls</h3>
              <div className="text-sm space-y-1">
                <div>🏃 <span className="text-yellow-400">Arrow Keys / WASD:</span> Move</div>
                <div>🤸 <span className="text-yellow-400">Spacebar:</span> Jump</div>
                <div>🎯 <span className="text-yellow-400">Click anywhere:</span> Shoot</div>
                <div>⌨️ <span className="text-yellow-400">Ctrl (L/R):</span> Shoot at boss</div>
                <div>🌟 <span className="text-yellow-400">Q:</span> Special attack (5s cooldown)</div>
                <div>💬 <span className="text-yellow-400">E:</span> Emote</div>
                <div>🔧 <span className="text-yellow-400">~:</span> Toggle this modal</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile virtual controls */}
      {isMobile && (
        <MobileControls
          onKeyDown={handleMobileKeyDown}
          onKeyUp={handleMobileKeyUp}
          isActive={!!isActive}
        />
      )}
    </div>
  );
}