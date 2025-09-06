import React from 'react';
import { useViewport } from '@/lib/hooks/useViewport';

interface ViewportContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ViewportContainer({ children, className = '' }: ViewportContainerProps) {
  const viewport = useViewport();
  
  // Calculate the actual rendered dimensions - the game world will be scaled to fit
  const renderedWidth = viewport.worldWidth * viewport.scale;
  const renderedHeight = viewport.worldHeight * viewport.scale;
  
  // Center the game world in the viewport
  const offsetX = (viewport.viewportWidth - renderedWidth) / 2;
  const offsetY = (viewport.viewportHeight - renderedHeight) / 2;

  return (
    <div 
      className={`viewport-container ${className}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#000' // Black background outside game world
      }}
    >
      {/* Game World Container - Fixed 16:9 aspect ratio */}
      <div
        className="game-world"
        style={{
          position: 'absolute',
          left: offsetX,
          top: offsetY,
          width: renderedWidth,
          height: renderedHeight,
          transform: `translate(${-viewport.cameraX * viewport.scale + renderedWidth / 2}px, ${-viewport.cameraY * viewport.scale + renderedHeight / 2}px)`,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
      
      {/* Debug overlay - only visible in development */}
      {process.env.NODE_ENV === 'development' && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            color: '#fff',
            fontSize: '12px',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: '8px',
            borderRadius: '4px',
            zIndex: 9999,
            pointerEvents: 'none'
          }}
        >
          <div>Viewport: {viewport.viewportWidth}x{viewport.viewportHeight}</div>
          <div>World: {viewport.worldWidth}x{viewport.worldHeight}</div>
          <div>Scale: {viewport.scale.toFixed(3)}</div>
          <div>Camera: ({viewport.cameraX.toFixed(0)}, {viewport.cameraY.toFixed(0)})</div>
        </div>
      )}
    </div>
  );
}