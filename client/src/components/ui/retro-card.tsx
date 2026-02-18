import React from 'react';
import { GamePanel, type GamePanelProps } from './GamePanel';

interface RetroCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function RetroCard({ children, className, title }: RetroCardProps) {
  return (
    <GamePanel className={className} title={title}>
      {children}
    </GamePanel>
  );
}

// Re-export for gradual migration
export { GamePanel } from './GamePanel';
export type { GamePanelProps } from './GamePanel';
