import { useState, useEffect, useCallback, useRef } from 'react';
import { useGameState } from '@/lib/stores/useGameState';

// Fixed 16:9 world dimensions - this creates consistent gameplay across all devices
export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;
export const WORLD_ASPECT_RATIO = WORLD_WIDTH / WORLD_HEIGHT;

export interface ViewportPosition {
  x: number;
  y: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface ViewportState {
  // World dimensions (fixed 16:9)
  worldWidth: number;
  worldHeight: number;
  
  // Current viewport dimensions (actual screen space)
  viewportWidth: number;
  viewportHeight: number;
  
  // Camera position in world coordinates
  cameraX: number;
  cameraY: number;
  
  // Scale factor for rendering
  scale: number;
  
  // Conversion functions
  worldToScreen: (worldX: number, worldY: number) => { x: number; y: number };
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
  
  // Camera control
  setCameraTarget: (worldX: number, worldY: number) => void;
}

export function useViewport(): ViewportState {
  const { currentPlayer, currentLobby } = useGameState();
  const [viewportDimensions, setViewportDimensions] = useState<ViewportDimensions>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [cameraPosition, setCameraPosition] = useState<ViewportPosition>({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  const animationFrameRef = useRef<number>();
  const targetCameraPosition = useRef<ViewportPosition>({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });

  // Update viewport dimensions on window resize
  useEffect(() => {
    const handleResize = () => {
      setViewportDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate scale factor - the game world should fit in the viewport
  const scale = Math.min(
    viewportDimensions.width / WORLD_WIDTH,
    viewportDimensions.height / WORLD_HEIGHT
  );

  // Smooth camera movement with easing
  useEffect(() => {
    const animate = () => {
      setCameraPosition(current => {
        const target = targetCameraPosition.current;
        const easeAmount = 0.08; // Lower = smoother, higher = snappier
        
        const deltaX = target.x - current.x;
        const deltaY = target.y - current.y;
        
        // If we're close enough, snap to target to prevent jittering
        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
          return target;
        }
        
        return {
          x: current.x + deltaX * easeAmount,
          y: current.y + deltaY * easeAmount,
        };
      });
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Convert world coordinates to screen coordinates
  const worldToScreen = useCallback((worldX: number, worldY: number) => {
    const screenX = (worldX - cameraPosition.x) * scale + viewportDimensions.width / 2;
    const screenY = (worldY - cameraPosition.y) * scale + viewportDimensions.height / 2;
    
    return { x: screenX, y: screenY };
  }, [cameraPosition, scale, viewportDimensions]);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const worldX = (screenX - viewportDimensions.width / 2) / scale + cameraPosition.x;
    const worldY = (screenY - viewportDimensions.height / 2) / scale + cameraPosition.y;
    
    return { x: worldX, y: worldY };
  }, [cameraPosition, scale, viewportDimensions]);

  // Set camera target with bounds checking
  const setCameraTarget = useCallback((worldX: number, worldY: number) => {
    // Calculate visible world area at current scale
    const visibleWorldWidth = viewportDimensions.width / scale;
    const visibleWorldHeight = viewportDimensions.height / scale;
    
    // Clamp camera to world boundaries
    const clampedX = Math.max(
      visibleWorldWidth / 2,
      Math.min(WORLD_WIDTH - visibleWorldWidth / 2, worldX)
    );
    const clampedY = Math.max(
      visibleWorldHeight / 2,
      Math.min(WORLD_HEIGHT - visibleWorldHeight / 2, worldY)
    );
    
    targetCameraPosition.current = { x: clampedX, y: clampedY };
  }, [scale, viewportDimensions]);

  // Follow current player's position
  useEffect(() => {
    if (currentPlayer && currentLobby?.playerPositions) {
      const playerPos = currentLobby.playerPositions[currentPlayer.id];
      if (playerPos) {
        // Convert player position from percentage to world coordinates
        const worldX = (playerPos.x / 100) * WORLD_WIDTH;
        const worldY = (playerPos.y / 100) * WORLD_HEIGHT;
        
        setCameraTarget(worldX, worldY);
      }
    }
  }, [currentPlayer, currentLobby?.playerPositions, setCameraTarget]);

  return {
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    viewportWidth: viewportDimensions.width,
    viewportHeight: viewportDimensions.height,
    cameraX: cameraPosition.x,
    cameraY: cameraPosition.y,
    scale,
    worldToScreen,
    screenToWorld,
    setCameraTarget,
  };
}