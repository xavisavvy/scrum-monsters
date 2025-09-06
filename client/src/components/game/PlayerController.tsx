import React, { useEffect, useState, useCallback } from 'react';
import { PlayerCharacter, PlayerPosition, Projectile } from './PlayerCharacter';
import { ProjectileSystem } from './ProjectileSystem';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useAudio } from '@/lib/stores/useAudio';
import { AvatarClass } from '@/lib/gameTypes';

interface PlayerControllerProps {
  containerWidth: number;
  containerHeight: number;
}

export function PlayerController({ containerWidth, containerHeight }: PlayerControllerProps) {
  const { currentPlayer, currentLobby, addAttackAnimation } = useGameState();
  const { emit, socket } = useWebSocket();
  const { playHit } = useAudio();
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>({ x: 100, y: 100 });
  const [isJumping, setIsJumping] = useState(false);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [bossProjectiles, setBossProjectiles] = useState<Projectile[]>([]);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);

  const characterSize = 64;
  const moveSpeed = 5;
  const jumpDuration = 600; // Jump duration in ms

  // Sync player position from server lobby data (only on initial load)
  useEffect(() => {
    if (currentPlayer && currentLobby?.playerPositions?.[currentPlayer.id]) {
      const serverPos = currentLobby.playerPositions[currentPlayer.id];
      
      // Only sync if we don't have a position yet (initial spawn) or if we're significantly different
      const pixelX = (serverPos.x / 100) * (containerWidth - characterSize);
      const pixelY = (serverPos.y / 100) * (containerHeight - characterSize - 100); // Keep bottom margin
      
      const isInitialSync = playerPosition.x === 100 && playerPosition.y === 100; // Default values
      const isSignificantDifference = Math.abs(playerPosition.x - pixelX) > 50 || Math.abs(playerPosition.y - pixelY) > 50;
      
      if (isInitialSync || isSignificantDifference) {
        setPlayerPosition({ x: pixelX, y: pixelY });
        console.log(`🔄 Synced player position from server: (${serverPos.x}%, ${serverPos.y}%) -> (${pixelX}px, ${pixelY}px)`);
      }
    }
  }, [currentPlayer?.id, currentLobby?.id, containerWidth, containerHeight, characterSize]); // Only trigger on player/lobby change

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
      
      // Handle debug modal toggle with Tab
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
            // Fallback to center if no targets found
            targetX = containerWidth * 0.5;
            targetY = containerHeight * 0.4;
            console.log('🎯 No target players found, shooting center');
          }
        } else {
          // Dev/QA players shoot toward boss
          targetX = containerWidth * 0.5; // Center X
          targetY = containerHeight * 0.4; // Slightly above center Y
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
          targetPlayerId // For spectator attacks
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
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isJumping, jumpDuration, currentPlayer, containerWidth, containerHeight, playerPosition, characterSize]);

  // Handle movement based on pressed keys
  // Boss ring attack WebSocket listener
  useEffect(() => {
    if (!socket) return;

    socket.on('boss_ring_attack', ({ bossX, bossY, projectiles: ringProjectiles }) => {
      console.log('💀 Boss ring attack received!', ringProjectiles.length, 'projectiles');
      
      // Convert percentage coordinates to pixel coordinates and add to boss projectiles
      const convertedProjectiles = ringProjectiles.map(proj => {
        const targetX = (proj.targetX / 100) * containerWidth;
        const targetY = (proj.targetY / 100) * containerHeight;
        console.log(`🎯 Converting projectile target: (${proj.targetX}%, ${proj.targetY}%) -> (${targetX}px, ${targetY}px)`);
        
        return {
          id: proj.id,
          startX: (bossX / 100) * containerWidth,
          startY: (bossY / 100) * containerHeight,
          targetX,
          targetY,
          progress: 0,
          emoji: proj.emoji
        };
      });
      
      setBossProjectiles(convertedProjectiles);
    });

    return () => {
      socket.off('boss_ring_attack');
    };
  }, [socket, containerWidth, containerHeight]);

  useEffect(() => {
    const movePlayer = () => {
      setPlayerPosition(prev => {
        let newX = prev.x;
        let newY = prev.y;

        if (keys.has('ArrowLeft') || keys.has('KeyA')) {
          newX = Math.max(0, prev.x - moveSpeed);
        }
        if (keys.has('ArrowRight') || keys.has('KeyD')) {
          newX = Math.min(containerWidth - characterSize, prev.x + moveSpeed);
        }
        if (keys.has('ArrowUp') || keys.has('KeyW')) {
          newY = Math.min(containerHeight - characterSize - 100, prev.y + moveSpeed); // Keep some bottom margin
        }
        if (keys.has('ArrowDown') || keys.has('KeyS')) {
          newY = Math.max(0, prev.y - moveSpeed);
        }

        return { x: newX, y: newY };
      });
    };

    if (keys.size > 0) {
      const interval = setInterval(movePlayer, 16); // ~60 FPS
      return () => clearInterval(interval);
    }
  }, [keys, containerWidth, containerHeight, characterSize, moveSpeed]);

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
    
    console.log(`🎯 Shot ${currentPlayer ? getProjectileEmoji(currentPlayer.avatar) : '⚡'} from character!`);
  }, [playerPosition, containerHeight, characterSize, handleShoot, currentPlayer]);

  const getProjectileEmoji = (avatarClass: AvatarClass): string => {
    const projectileEmojis = {
      ranger: '🏹',
      rogue: '🔪', 
      bard: '🎵',
      sorcerer: '🔥',
      wizard: '⚡',
      warrior: '⚔️',
      paladin: '✨',
      cleric: '💫'
    };
    
    return projectileEmojis[avatarClass];
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
    
    // Use pixel coordinates for both player and projectile (projectiles are already in pixels)
    const playerPixelX = playerPosition.x + characterSize / 2;
    const playerPixelY = containerHeight - (playerPosition.y + characterSize / 2); // Convert to top-based Y
    
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
  }, [currentPlayer, playerPosition, characterSize, containerWidth, containerHeight, playHit, addAttackAnimation, emit]);

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
      const bossAreaX = containerWidth * 0.3; // Boss takes up center area
      const bossAreaY = containerHeight * 0.2;
      const bossAreaWidth = containerWidth * 0.4;
      const bossAreaHeight = containerHeight * 0.6;
      
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
  }, [containerWidth, containerHeight, currentPlayer, currentLobby, playHit, addAttackAnimation, emit]);

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
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          playerId={currentPlayer.id}
        />
      </div>
      
      <ProjectileSystem
        projectiles={projectiles}
        onProjectileComplete={handleProjectileComplete}
      />
      
      {/* Boss Ring Attack Projectiles */}
      <ProjectileSystem
        projectiles={bossProjectiles}
        onProjectileComplete={handleBossProjectileComplete}
      />
      
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
                <div>🎯 Container: {containerWidth}x{containerHeight}</div>
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
                <div>🔧 <span className="text-yellow-400">Tab:</span> Toggle this modal</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}