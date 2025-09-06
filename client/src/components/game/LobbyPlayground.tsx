import React, { useState, useEffect } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { SpriteRenderer } from './SpriteRenderer';
import { SpriteDirection } from '@/hooks/useSpriteAnimation';

interface LobbyPosition {
  x: number; // Pixel position
  y: number; // Pixel position (for jumping)
}

interface LobbyPlayer {
  id: string;
  name: string;
  avatar: string;
  position: LobbyPosition;
  direction: SpriteDirection;
  isMoving: boolean;
  isJumping: boolean;
}

export function LobbyPlayground() {
  const { currentLobby, currentPlayer } = useGameState();
  const { emit, socket } = useWebSocket();
  
  // Movement state
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [playerPosition, setPlayerPosition] = useState<LobbyPosition>({ x: 200, y: 300 });
  const [currentDirection, setCurrentDirection] = useState<SpriteDirection>('right');
  const [isMoving, setIsMoving] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [otherPlayers, setOtherPlayers] = useState<Record<string, LobbyPlayer>>({});
  
  // Constants for 2D sidescroller physics
  const moveSpeed = 5;
  const jumpDuration = 800; // ms
  const groundLevel = 300; // Y position for ground
  const playgroundWidth = 800;
  const playgroundHeight = 400;
  const characterSize = 64;
  
  // Handle keyboard input for lobby movement
  useEffect(() => {
    if (currentLobby?.gamePhase !== 'lobby') return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle movement if we're in lobby phase
      setKeys(prev => new Set(prev).add(event.code));
      
      // Handle jump - Mario-style jumping
      if (event.code === 'Space' && !isJumping && playerPosition.y >= groundLevel) {
        event.preventDefault();
        setIsJumping(true);
        
        // Animate jump
        let jumpHeight = 0;
        const maxJumpHeight = 120;
        const jumpSpeed = 8;
        
        const jumpAnimation = () => {
          jumpHeight += jumpSpeed;
          if (jumpHeight < maxJumpHeight) {
            setPlayerPosition(prev => ({ ...prev, y: groundLevel - jumpHeight }));
            requestAnimationFrame(jumpAnimation);
          } else {
            // Start falling back down
            const fallAnimation = () => {
              jumpHeight -= jumpSpeed;
              if (jumpHeight > 0) {
                setPlayerPosition(prev => ({ ...prev, y: groundLevel - jumpHeight }));
                requestAnimationFrame(fallAnimation);
              } else {
                // Land on ground
                setPlayerPosition(prev => ({ ...prev, y: groundLevel }));
                setIsJumping(false);
              }
            };
            requestAnimationFrame(fallAnimation);
          }
        };
        requestAnimationFrame(jumpAnimation);
        
        // Emit jump state to server
        emit('lobby_player_jump', { isJumping: true });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      setKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(event.code);
        return newKeys;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [currentLobby?.gamePhase, isJumping, playerPosition.y, emit]);

  // Handle movement based on pressed keys
  useEffect(() => {
    if (currentLobby?.gamePhase !== 'lobby' || keys.size === 0) {
      setIsMoving(false);
      return;
    }

    const movePlayer = () => {
      setPlayerPosition(prev => {
        let newX = prev.x;
        let direction: SpriteDirection = currentDirection;
        let moving = false;

        // Only allow left/right movement for sidescroller
        if (keys.has('ArrowLeft') || keys.has('KeyA')) {
          newX = Math.max(0, prev.x - moveSpeed);
          direction = 'left';
          moving = true;
        }
        if (keys.has('ArrowRight') || keys.has('KeyD')) {
          newX = Math.min(playgroundWidth - characterSize, prev.x + moveSpeed);
          direction = 'right';
          moving = true;
        }

        // Update movement state and direction
        setIsMoving(moving);
        if (moving) {
          setCurrentDirection(direction);
        }

        // Emit position to server for other players to see
        if (moving) {
          const percentX = (newX / (playgroundWidth - characterSize)) * 100;
          const percentY = (prev.y / playgroundHeight) * 100;
          emit('lobby_player_pos', { x: percentX, y: percentY, direction });
        }

        return { x: newX, y: prev.y };
      });
    };

    const interval = setInterval(movePlayer, 16); // ~60 FPS
    return () => clearInterval(interval);
  }, [keys, currentLobby?.gamePhase, currentDirection, emit]);

  // Listen for other players' positions in lobby
  useEffect(() => {
    if (!socket || currentLobby?.gamePhase !== 'lobby') return;

    const handleLobbyPlayerPos = ({ playerId, x, y, direction }: { playerId: string; x: number; y: number; direction?: SpriteDirection }) => {
      if (playerId === currentPlayer?.id) return; // Skip own updates

      setOtherPlayers(prev => ({
        ...prev,
        [playerId]: {
          ...prev[playerId],
          id: playerId,
          position: {
            x: (x / 100) * (playgroundWidth - characterSize),
            y: (y / 100) * playgroundHeight
          },
          direction: direction || 'right',
          isMoving: true
        }
      }));
    };

    const handleLobbyPlayerJump = ({ playerId }: { playerId: string }) => {
      if (playerId === currentPlayer?.id) return;
      
      setOtherPlayers(prev => ({
        ...prev,
        [playerId]: {
          ...prev[playerId],
          isJumping: true
        }
      }));

      // Reset jump state after animation
      setTimeout(() => {
        setOtherPlayers(prev => ({
          ...prev,
          [playerId]: {
            ...prev[playerId],
            isJumping: false
          }
        }));
      }, jumpDuration);
    };

    socket.on('lobby_player_pos', handleLobbyPlayerPos);
    socket.on('lobby_player_jump', handleLobbyPlayerJump);

    return () => {
      socket.off('lobby_player_pos', handleLobbyPlayerPos);
      socket.off('lobby_player_jump', handleLobbyPlayerJump);
    };
  }, [socket, currentLobby?.gamePhase, currentPlayer?.id]);

  // Initialize other players from lobby
  useEffect(() => {
    if (!currentLobby || currentLobby.gamePhase !== 'lobby') return;

    const lobbyPlayers: Record<string, LobbyPlayer> = {};
    
    currentLobby.players.forEach(player => {
      if (player.id !== currentPlayer?.id) {
        lobbyPlayers[player.id] = {
          id: player.id,
          name: player.name,
          avatar: player.avatar,
          position: { x: Math.random() * (playgroundWidth - characterSize), y: groundLevel },
          direction: 'right',
          isMoving: false,
          isJumping: false
        };
      }
    });

    setOtherPlayers(lobbyPlayers);
  }, [currentLobby?.players, currentPlayer?.id, currentLobby?.gamePhase]);

  if (!currentLobby || currentLobby.gamePhase !== 'lobby' || !currentPlayer) {
    return null;
  }

  return (
    <div className="lobby-playground-container mb-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-yellow-400">🎮 Lobby Playground</h3>
        <p className="text-sm text-gray-400">
          Walk around and jump! Use A/D or Arrow Keys to move, Space to jump
        </p>
      </div>
      
      <div 
        className="lobby-playground relative border-2 border-gray-600 rounded-lg mx-auto bg-gradient-to-b from-sky-900 to-green-900"
        style={{ 
          width: `${playgroundWidth}px`, 
          height: `${playgroundHeight}px`,
          overflow: 'hidden'
        }}
      >
        {/* Ground indicator */}
        <div 
          className="absolute w-full bg-green-800 border-t border-green-600"
          style={{ 
            height: `${playgroundHeight - groundLevel}px`,
            bottom: 0
          }}
        />
        
        {/* Current player */}
        <div 
          className="absolute transition-transform"
          style={{
            left: `${playerPosition.x}px`,
            top: `${playerPosition.y}px`,
            transform: isJumping ? 'scale(1.1)' : 'scale(1)',
            zIndex: 10
          }}
        >
          <SpriteRenderer
            avatarClass={currentPlayer.avatar}
            animation={isMoving ? 'walk' : 'idle'}
            direction={currentDirection}
            isMoving={isMoving}
            size={2}
          />
          <div className="text-xs text-center text-yellow-400 font-bold mt-1 px-1 bg-black bg-opacity-50 rounded">
            {currentPlayer.name} (YOU)
          </div>
        </div>

        {/* Other players */}
        {Object.values(otherPlayers).map(player => (
          <div
            key={player.id}
            className="absolute transition-transform"
            style={{
              left: `${player.position.x}px`,
              top: `${player.position.y}px`,
              transform: player.isJumping ? 'scale(1.1)' : 'scale(1)',
              zIndex: 5
            }}
          >
            <SpriteRenderer
              avatarClass={player.avatar}
              animation={player.isMoving ? 'walk' : 'idle'}
              direction={player.direction}
              isMoving={player.isMoving}
              size={2}
            />
            <div className="text-xs text-center text-blue-400 font-bold mt-1 px-1 bg-black bg-opacity-50 rounded">
              {player.name}
            </div>
          </div>
        ))}

        {/* Fun background elements */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Clouds */}
          <div className="absolute top-8 left-20 text-2xl opacity-60">☁️</div>
          <div className="absolute top-12 right-32 text-xl opacity-50">☁️</div>
          <div className="absolute top-6 left-1/2 text-lg opacity-40">☁️</div>
          
          {/* Trees */}
          <div className="absolute bottom-20 left-10 text-3xl">🌲</div>
          <div className="absolute bottom-20 right-16 text-2xl">🌳</div>
          <div className="absolute bottom-20 left-2/3 text-3xl">🌲</div>
        </div>
      </div>
      
      <div className="text-center mt-2 text-xs text-gray-500">
        Players can see each other moving around • No combat in lobby
      </div>
    </div>
  );
}