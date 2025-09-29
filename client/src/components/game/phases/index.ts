import { Lobby, Boss } from '@shared/gameEvents';

/**
 * Base interface that all phase components must implement.
 */
export interface PhaseComponentProps {
  lobby: Lobby;
  currentPlayer?: any;
  boss?: Boss;
  onBossAttack?: () => void;
  onPlayerPositionsUpdate?: (positions: Record<string, { x: number, y: number }>) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  emit: (event: string, data?: any) => void;
  isTransitioning?: boolean;
}

// Phase system exports for easy importing
export { PhaseContainer } from './PhaseContainer';
export { PhaseComponent, withPhaseWrapper } from './PhaseComponent';
export { PhaseRegistry, PhaseConfig, usePhaseRegistry } from './PhaseRegistry';
export { PhaseTransition, usePhaseTransition } from './PhaseTransition';
export { PhaseRenderer, usePhaseRenderer } from './PhaseRenderer';

// Individual phase components
export { BattlePhase } from './BattlePhase';
export { RevealPhase } from './RevealPhase';
export { DiscussionPhase } from './DiscussionPhase';
export { VictoryPhase } from './VictoryPhase';
export { NextLevelPhase } from './NextLevelPhase';
export { GameOverPhase } from './GameOverPhase';