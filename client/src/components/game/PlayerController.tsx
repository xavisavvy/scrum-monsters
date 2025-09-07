import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PlayerCharacter, PlayerPosition, Projectile } from './PlayerCharacter';
import { ProjectileSystem } from './ProjectileSystem';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useAudio } from '@/lib/stores/useAudio';
import { AvatarClass } from '@/lib/gameTypes';
import { SpriteDirection } from '@/hooks/useSpriteAnimation';
import { useViewport } from '@/lib/hooks/useViewport';

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

  const characterSize = 64;
  const moveSpeed = 5;
  const jumpDuration = 600; // Jump duration in ms

  // Sync player position from server lobby data (only on initial load)
  useEffect(() => {
    if (currentPlayer && currentLobby?.playerPositions?.[currentPlayer.id]) {
      const serverPos = currentLobby.playerPositions[currentPlayer.id];
      
      // Convert server position (percentage) to world coordinates, then to screen pixels
      const worldX = (serverPos.x / 100) * viewport.worldWidth;
      const worldY = (serverPos.y / 100) * viewport.worldHeight;
      const screenPos = viewport.worldToScreen(worldX, worldY);
      
      const isInitialSync = playerPosition.x === 100 && playerPosition.y === 100; // Default values
      const isSignificantDifference = Math.abs(playerPosition.x - screenPos.x) > 100 || Math.abs(playerPosition.y - screenPos.y) > 100;
      
      if (isInitialSync) {
        setPlayerPosition({ x: screenPos.x, y: screenPos.y });
        console.log(`🔄 Synced player position from server: (${serverPos.x}%, ${serverPos.y}%) -> (${screenPos.x}px, ${screenPos.y}px)`);
      }
    }
  }, [currentPlayer?.id, currentLobby?.id, viewport, characterSize]); // Only trigger on player/lobby change

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setKeys(prev => new Set(prev).add(event.code));
      
      // Handle jump
      if (event.code === 'Space' && !isJumping) {
        event.preventDefault();
        setIsJumping(true);
        
        // Send jumping state to server
        emit('player_jump', { isJumping: true });
        console.log('🦘 Started jumping - invincible to damage!');
        
        setTimeout(() => {
          setIsJumping(false);
          // Send jumping state to server
          emit('player_jump', { isJumping: false });
          console.log('🦘 Stopped jumping - vulnerable to damage again!');
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
        console.log('⌨️ Ctrl key pressed for shooting!');
        
        let targetX, targetY, targetPlayerId = null;
        
        if (currentPlayer.team === 'spectators') {
          // Spectators target nearest dev/qa player
          const nearestPlayer = findNearestTargetPlayer();
          if (nearestPlayer) {
            targetX = nearestPlayer.x;
            targetY = nearestPlayer.y;
            targetPlayerId = nearestPlayer.id;
            console.log(`🎯 Spectator targeting nearest player: ${nearestPlayer.id} at (${targetX}, ${targetY})`);
          } else {
            // Fallback to center if no targets found - use world coordinates
            const centerWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
            targetX = centerWorld.x;
            targetY = centerWorld.y;
            console.log('🎯 No target players found, shooting center');
          }
        } else {
          // Dev/QA players shoot toward boss - use world coordinates
          const bossWorld = viewport.worldToScreen(viewport.worldWidth * 0.5, viewport.worldHeight * 0.4);
          targetX = bossWorld.x;
          targetY = bossWorld.y;
        }
        
        // Calculate character center position (use bottom-based Y coordinate system)
        const characterCenterX = playerPosition.x + characterSize / 2;
        const characterCenterY = playerPosition.y + characterSize / 2;
        
        console.log(`🎯 Keyboard shoot from (${characterCenterX}, ${characterCenterY}) to (${targetX}, ${targetY})`);
        
        // Create projectile from character to target
        const projectileData = {
          startX: characterCenterX,
          startY: characterCenterY,
          targetX,
          targetY,
          emoji: getProjectileEmoji(currentPlayer.avatar),
          targetPlayerId: targetPlayerId || undefined // For spectator attacks
        };
        
        console.log('🚀 Keyboard projectile data:', projectileData);
        
        // Create projectile directly
        const newProjectile = {
          ...projectileData,
          id: Math.random().toString(36).substring(2, 15),
          progress: 0
        };
        
        console.log('✨ Creating keyboard projectile:', newProjectile);
        setProjectiles(prev => {
          const updated = [...prev, newProjectile];
          console.log('📦 Updated projectiles from keyboard:', updated);
          return updated;
        });
        
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
          targetPlayerId
        });
      }
      
      // Handle special attack with Q key (single attack per keydown, with cooldown)
      if (event.code === 'KeyQ' && currentPlayer && !qPressed && specialAttackCooldown <= 0) {
        setQPressed(true); // Prevent multiple attacks while held
        event.preventDefault();
        console.log('⌨️ Q key pressed for special attack!');
        
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
  }, [isJumping, jumpDuration, currentPlayer, viewport, playerPosition, characterSize]);

  // Handle movement based on pressed keys
  // WebSocket listeners for multiplayer features
  useEffect(() => {
    if (!socket) return;

    // Create handler functions that can be properly removed
    const handleBossRingAttack = ({ projectiles: ringProjectiles }: any) => {
      console.log('💀 Boss ring attack received!', ringProjectiles.length, 'projectiles');
      
      // Convert percentage coordinates to world coordinates, then to screen coordinates
      const convertedProjectiles = ringProjectiles.map((proj: any) => {
        const targetWorld = { x: (proj.targetX / 100) * viewport.worldWidth, y: (proj.targetY / 100) * viewport.worldHeight };
        const targetScreen = viewport.worldToScreen(targetWorld.x, targetWorld.y);
        console.log(`🎯 Converting projectile target: (${proj.targetX}%, ${proj.targetY}%) -> (${targetScreen.x}px, ${targetScreen.y}px)`);
        
        // Use projectile's startX/startY as boss position (server sends boss center as 50%, 40%)
        const bossWorld = { x: (proj.startX / 100) * viewport.worldWidth, y: (proj.startY / 100) * viewport.worldHeight };
        const bossScreen = viewport.worldToScreen(bossWorld.x, bossWorld.y);
        console.log(`🎯 Converting boss position: (${proj.startX}%, ${proj.startY}%) -> (${bossScreen.x}px, ${bossScreen.y}px)`);
        
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
      console.log('👥 Updated other players positions:', Object.keys(otherPositions).length, 'players');
      
      // Pass all positions (current player + other players) to parent component
      if (onPlayerPositionsUpdate && currentPlayer) {
        const allPositions = {
          ...otherPositions,
          [currentPlayer.id]: { x: playerPosition.x + characterSize / 2, y: playerPosition.y + characterSize / 2 }
        };
        onPlayerPositionsUpdate(allPositions);
      }
    };

    const handlePlayerProjectileFired = ({ playerId, playerName, startX, startY, targetX, targetY, emoji, targetPlayerId, projectileId }: any) => {
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
      console.log(`🚀 Received projectile from ${playerName}: ${emoji}`);
    };

    // Add listeners with specific handler references
    socket.on('boss_ring_attack', handleBossRingAttack);
    socket.on('players_pos', handlePlayersPos);
    socket.on('player_projectile_fired', handlePlayerProjectileFired);

    return () => {
      socket.off('boss_ring_attack', handleBossRingAttack);
      socket.off('players_pos', handlePlayersPos);
      socket.off('player_projectile_fired', handlePlayerProjectileFired);
    };
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
  }, [playerPosition, otherPlayersPositions, onPlayerPositionsUpdate, currentPlayer?.id, characterSize]);

  // Throttled network updates - industry standard approach
  const lastNetworkUpdate = useRef({ x: 0, y: 0, time: 0 });
  const networkUpdateThrottle = 100; // 10 updates per second max

  useEffect(() => {
    const movePlayer = () => {
      setPlayerPosition(prev => {
        let newX = prev.x;
        let newY = prev.y;
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

        // Apply movement with bounds checking
        newX = Math.max(0, Math.min(viewport.viewportWidth - characterSize, prev.x + deltaX));
        newY = Math.max(0, Math.min(viewport.viewportHeight - characterSize - 100, prev.y + deltaY));

        // Update movement state and direction
        setIsMoving(moving);
        if (moving) {
          setCurrentDirection(direction);
        }

        // Throttled network updates - only send if enough time has passed and position changed
        const now = Date.now();
        const timeDelta = now - lastNetworkUpdate.current.time;
        const positionChanged = Math.abs(newX - lastNetworkUpdate.current.x) > 2 || 
                               Math.abs(newY - lastNetworkUpdate.current.y) > 2;

        if (positionChanged && timeDelta >= networkUpdateThrottle) {
          // Convert screen coordinates to world coordinates, then to percentage for server
          const worldPos = viewport.screenToWorld(newX, newY);
          const percentX = (worldPos.x / viewport.worldWidth) * 100;
          const percentY = (worldPos.y / viewport.worldHeight) * 100;
          
          emit('player_pos', { x: percentX, y: percentY });
          
          // Update throttle tracking
          lastNetworkUpdate.current = { x: newX, y: newY, time: now };
          console.log('🔄 Synced player position to server: (' + percentX.toFixed(1) + '%, ' + percentY.toFixed(1) + '%) -> (' + newX.toFixed(0) + 'px, ' + newY.toFixed(0) + 'px)');
        }

        return { x: newX, y: newY };
      });
    };

    if (keys.size > 0) {
      const interval = setInterval(movePlayer, 16); // ~60 FPS
      return () => clearInterval(interval);
    } else {
      // No keys pressed, not moving
      setIsMoving(false);
    }
  }, [keys, viewport, characterSize, moveSpeed, emit, currentDirection]);

  const handleShoot = useCallback((projectileData: Omit<Projectile, 'id' | 'progress'>) => {
    const newProjectile: Projectile = {
      ...projectileData,
      id: Math.random().toString(36).substring(2, 15),
      progress: 0
    };
    
    console.log('✨ Creating new projectile:', newProjectile);
    setProjectiles(prev => {
      const updated = [...prev, newProjectile];
      console.log('📦 Updated projectiles array:', updated);
      return updated;
    });
  }, []);

  // Handle screen clicks for shooting
  const handleScreenClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('🖱️ Click detected!', event.clientX, event.clientY, 'Target:', event.target);
    
    // Don't shoot if clicking on UI elements
    const target = event.target as HTMLElement;
    console.log('🔍 Target element:', target.tagName, target.className, target);
    
    // Only ignore clicks on interactive UI elements marked with data-no-shoot
    if (target.closest('[data-no-shoot]')) {
      console.log('⛔ Click on UI element, ignoring');
      return;
    }
    
    // Allow clicks on player controller or its direct children (like character)
    const isValidTarget = target === event.currentTarget || 
                         event.currentTarget.contains(target);
    
    if (!isValidTarget) {
      console.log('⛔ Click outside controller container, ignoring');
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const targetX = event.clientX - rect.left;
    const targetY = event.clientY - rect.top;
    
    // Calculate character center position (use bottom-based Y coordinate system)
    const characterCenterX = playerPosition.x + characterSize / 2;
    const characterCenterY = playerPosition.y + characterSize / 2;
    
    console.log(`🎯 Preparing to shoot from (${characterCenterX}, ${characterCenterY}) to (${targetX}, ${targetY})`);
    
    // Create projectile from character to click position
    const projectileData = {
      startX: characterCenterX,
      startY: characterCenterY,
      targetX,
      targetY,
      emoji: currentPlayer ? getProjectileEmoji(currentPlayer.avatar) : '⚡'
    };
    
    console.log('🚀 Projectile data:', projectileData);
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
    
    console.log(`🎯 Shot ${currentPlayer ? getProjectileEmoji(currentPlayer.avatar) : '⚡'} from character!`);
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

  // Special attack system with class-specific effects
  const handleSpecialAttack = useCallback((avatarClass: AvatarClass) => {
    console.log(`🌟 Casting special attack for ${avatarClass}!`);
    
    // Create special effect element
    const specialEffect = document.createElement('div');
    specialEffect.style.position = 'fixed';
    specialEffect.style.pointerEvents = 'none';
    specialEffect.style.zIndex = '9999';
    specialEffect.style.fontSize = '4rem';
    specialEffect.style.textAlign = 'center';
    specialEffect.style.transition = 'all 1.5s ease-out';
    
    // Calculate character center
    const characterCenterX = playerPosition.x + characterSize / 2;
    const characterCenterY = playerPosition.y + characterSize / 2;
    
    let effectEmoji = '✨';
    let effectColor = '#ffffff';
    let damage = 25; // Base damage
    let effectText = 'Special Attack';
    
    // Class-specific special attack effects
    switch (avatarClass) {
      case 'ranger':
        effectEmoji = '🏹💨';
        effectColor = '#228B22';
        damage = 30;
        effectText = 'ARROW STORM';
        break;
      case 'rogue':
        effectEmoji = '🗡️💀';
        effectColor = '#2F4F4F';
        damage = 35;
        effectText = 'SHADOW STRIKE';
        break;
      case 'bard':
        effectEmoji = '🎵🎶';
        effectColor = '#9370DB';
        damage = 20;
        effectText = 'SONIC BLAST';
        break;
      case 'sorcerer':
        effectEmoji = '🔥💥';
        effectColor = '#FF4500';
        damage = 40;
        effectText = 'FIREBALL';
        break;
      case 'wizard':
        effectEmoji = '⚡🌩️';
        effectColor = '#4169E1';
        damage = 38;
        effectText = 'LIGHTNING BOLT';
        break;
      case 'warrior':
        effectEmoji = '⚔️🛡️';
        effectColor = '#B22222';
        damage = 32;
        effectText = 'BERSERKER RAGE';
        break;
      case 'paladin':
        effectEmoji = '✨⚡';
        effectColor = '#FFD700';
        damage = 28;
        effectText = 'DIVINE SMITE';
        break;
      case 'cleric':
        effectEmoji = '💫🌟';
        effectColor = '#F0F8FF';
        damage = 25;
        effectText = 'HOLY LIGHT';
        break;
      case 'oathbreaker':
        effectEmoji = '🖤💀';
        effectColor = '#8A2BE2';
        damage = 42;
        effectText = 'DARK COVENANT';
        break;
      case 'monk':
        effectEmoji = '👊💨';
        effectColor = '#8B4513';
        damage = 33;
        effectText = 'CHI BLAST';
        break;
    }
    
    // Position effect at character location
    specialEffect.style.left = `${characterCenterX - 100}px`;
    specialEffect.style.top = `${characterCenterY - 50}px`;
    specialEffect.style.color = effectColor;
    specialEffect.style.textShadow = `0 0 20px ${effectColor}, 0 0 40px ${effectColor}`;
    specialEffect.innerHTML = `
      <div style="font-size: 4rem; margin-bottom: 0.5rem;">${effectEmoji}</div>
      <div style="font-size: 1.5rem; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">${effectText}</div>
    `;
    
    document.body.appendChild(specialEffect);
    
    // Animate the effect
    setTimeout(() => {
      specialEffect.style.transform = 'scale(1.5) translateY(-100px)';
      specialEffect.style.opacity = '0';
    }, 100);
    
    // Create particle explosion effect
    createParticleExplosion(characterCenterX, characterCenterY, effectColor, effectEmoji);
    
    // Attack the boss directly with higher damage
    emit('attack_boss', { damage });
    console.log(`🎯 Special attack deals ${damage} damage to boss!`);
    
    // Play audio feedback
    if (playHit) {
      playHit();
    }
    
    // Remove effect after animation
    setTimeout(() => {
      if (document.body.contains(specialEffect)) {
        document.body.removeChild(specialEffect);
      }
    }, 1500);
  }, [playerPosition, characterSize, emit, playHit]);

  // Create particle explosion effect
  const createParticleExplosion = (x: number, y: number, color: string, emoji: string) => {
    const particleCount = 12;
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.style.position = 'fixed';
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.pointerEvents = 'none';
      particle.style.zIndex = '9998';
      particle.style.fontSize = '2rem';
      particle.textContent = emoji.split('')[i % emoji.length] || '✨';
      particle.style.color = color;
      particle.style.textShadow = `0 0 10px ${color}`;
      particle.style.transition = 'all 1s ease-out';
      
      document.body.appendChild(particle);
      
      // Random direction for particles
      const angle = (i / particleCount) * 2 * Math.PI;
      const distance = 150 + Math.random() * 100;
      const targetX = x + Math.cos(angle) * distance;
      const targetY = y + Math.sin(angle) * distance;
      
      setTimeout(() => {
        particle.style.transform = `translate(${targetX - x}px, ${targetY - y}px) scale(0.5)`;
        particle.style.opacity = '0';
      }, 50);
      
      setTimeout(() => {
        if (document.body.contains(particle)) {
          document.body.removeChild(particle);
        }
      }, 1000);
    }
  };

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

  // Boss projectile collision handler
  const handleBossProjectileComplete = useCallback((projectile: Projectile) => {
    // Remove the boss projectile
    setBossProjectiles(prev => prev.filter(p => p.id !== projectile.id));
    
    if (!currentPlayer) return;
    
    // Use screen coordinates for both player and projectile (projectiles are already in screen coordinates)
    const playerPixelX = playerPosition.x + characterSize / 2;
    const playerPixelY = viewport.viewportHeight - (playerPosition.y + characterSize / 2); // Convert to top-based Y
    
    console.log(`🎯 Boss projectile collision check: Player at (${playerPixelX.toFixed(1)}, ${playerPixelY.toFixed(1)}), Projectile target (${projectile.targetX}, ${projectile.targetY})`);
    
    // Check collision with projectile target (both in pixel coordinates)
    const distance = Math.sqrt(
      Math.pow(playerPixelX - projectile.targetX, 2) + 
      Math.pow(playerPixelY - projectile.targetY, 2)
    );
    
    console.log(`🎯 Distance: ${distance.toFixed(1)} (threshold: 300)`);
    
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
      
      console.log(`💀 Boss ring attack hit ${currentPlayer.name} for ${damage} damage!`);
    } else {
      console.log(`💨 Boss projectile missed ${currentPlayer.name}`);
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
      
      console.log(`💥 Spectator ${currentPlayer.name} hit player ${projectile.targetPlayerId} for ${damage} damage with ${projectile.emoji}!`);
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
        
        console.log(`💥 ${currentPlayer.name} hit boss for ${damage} damage with ${projectile.emoji}!`);
      }
    }
  }, [viewport, currentPlayer, currentLobby, playHit, addAttackAnimation, emit]);

  // Don't render if not in battle or no current player
  if (!currentPlayer || !currentLobby || currentLobby.gamePhase !== 'battle') {
    console.log('❌ PlayerController not rendering - missing player or not in battle', {
      hasCurrentPlayer: !!currentPlayer,
      hasCurrentLobby: !!currentLobby,
      gamePhase: currentLobby?.gamePhase
    });
    return null;
  }

  return (
    <div 
      className="absolute inset-0 pointer-events-auto cursor-crosshair"
      onClick={handleScreenClick}
    >
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
          isDead={false} // Could be tied to game state later
          containerWidth={viewport.viewportWidth}
          containerHeight={viewport.viewportHeight}
          playerId={currentPlayer.id}
          isMoving={isMoving}
          direction={currentDirection}
        />
      </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 pointer-events-auto">
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
    </div>
  );
}