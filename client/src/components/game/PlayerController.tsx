import React, { useEffect, useState, useCallback } from 'react';
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
}

export function PlayerController({}: PlayerControllerProps) {
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
      const isSignificantDifference = Math.abs(playerPosition.x - screenPos.x) > 50 || Math.abs(playerPosition.y - screenPos.y) > 50;
      
      if (isInitialSync || isSignificantDifference) {
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
  }, [isJumping, jumpDuration, currentPlayer, viewport, playerPosition, characterSize]);

  // Handle movement based on pressed keys
  // WebSocket listeners for multiplayer features
  useEffect(() => {
    if (!socket) return;

    // Create handler functions that can be properly removed
    const handleBossRingAttack = ({ bossX, bossY, projectiles: ringProjectiles }) => {
      console.log('💀 Boss ring attack received!', ringProjectiles.length, 'projectiles');
      
      // Convert percentage coordinates to world coordinates, then to screen coordinates
      const convertedProjectiles = ringProjectiles.map(proj => {
        const targetWorld = { x: (proj.targetX / 100) * viewport.worldWidth, y: (proj.targetY / 100) * viewport.worldHeight };
        const targetScreen = viewport.worldToScreen(targetWorld.x, targetWorld.y);
        console.log(`🎯 Converting projectile target: (${proj.targetX}%, ${proj.targetY}%) -> (${targetScreen.x}px, ${targetScreen.y}px)`);
        
        const bossWorld = { x: (bossX / 100) * viewport.worldWidth, y: (bossY / 100) * viewport.worldHeight };
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

    const handlePlayersPos = ({ positions }) => {
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
    };

    const handlePlayerProjectileFired = ({ playerId, playerName, startX, startY, targetX, targetY, emoji, targetPlayerId, projectileId }) => {
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

  useEffect(() => {
    const movePlayer = () => {
      setPlayerPosition(prev => {
        let newX = prev.x;
        let newY = prev.y;
        let moving = false;
        let direction: SpriteDirection = currentDirection;

        if (keys.has('ArrowLeft') || keys.has('KeyA')) {
          newX = Math.max(0, prev.x - moveSpeed);
          direction = 'left';
          moving = true;
        }
        if (keys.has('ArrowRight') || keys.has('KeyD')) {
          newX = Math.min(viewport.viewportWidth - characterSize, prev.x + moveSpeed);
          direction = 'right';
          moving = true;
        }
        if (keys.has('ArrowUp') || keys.has('KeyW')) {
          newY = Math.min(viewport.viewportHeight - characterSize - 100, prev.y + moveSpeed); // Keep some bottom margin
          direction = 'up';
          moving = true;
        }
        if (keys.has('ArrowDown') || keys.has('KeyS')) {
          newY = Math.max(0, prev.y - moveSpeed);
          direction = 'down';
          moving = true;
        }

        // Update movement state and direction
        setIsMoving(moving);
        if (moving) {
          setCurrentDirection(direction);
        }

        // Send position update to server if position changed
        if (newX !== prev.x || newY !== prev.y) {
          // Convert pixels to percentage for server
          const percentX = (newX / (containerWidth - characterSize)) * 100;
          const percentY = (newY / (containerHeight - characterSize - 100)) * 100;
          emit('player_pos', { x: percentX, y: percentY });
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
  }, [keys, containerWidth, containerHeight, characterSize, moveSpeed, emit, currentDirection]);

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
    
    // Convert pixel coordinates to percentages before emitting
    const percentStartX = (characterCenterX / containerWidth) * 100;
    const percentStartY = (characterCenterY / containerHeight) * 100;
    const percentTargetX = (targetX / containerWidth) * 100;
    const percentTargetY = (targetY / containerHeight) * 100;
    
    // Emit projectile event for multiplayer visibility with percentage coordinates
    emit('player_projectile', {
      startX: percentStartX,
      startY: percentStartY,
      targetX: percentTargetX,
      targetY: percentTargetY,
      emoji: currentPlayer ? getProjectileEmoji(currentPlayer.avatar) : '⚡'
    });
    
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
              containerWidth={containerWidth}
              containerHeight={containerHeight}
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