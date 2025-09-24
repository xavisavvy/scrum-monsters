import { Lobby, Boss } from '@shared/gameEvents';

/**
 * Base interface that all phase components must implement.
 * This ensures consistency and makes it easy to add new phases.
 */
export interface PhaseComponentProps {
  lobby: Lobby;
  currentPlayer?: any;
  boss?: Boss;
  onBossAttack?: () => void;
  onPlayerPositionsUpdate?: (positions: Record<string, { x: number, y: number }>) => void;
  
  // Sidebar state management
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  
  // Common handlers
  emit: (event: string, data?: any) => void;
  
  // Transition state
  isTransitioning?: boolean;
}