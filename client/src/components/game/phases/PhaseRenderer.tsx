import React from 'react';
import { GamePhase, Lobby } from '@shared/gameEvents';
import { PhaseRegistry } from './PhaseRegistry';
import { PhaseTransition } from './PhaseTransition';
import { PhaseComponentProps } from './index';

interface PhaseRendererProps {
  lobby: Lobby;
  currentPlayer?: any;
  onBossAttack?: () => void;
  onPlayerPositionsUpdate?: (positions: Record<string, { x: number, y: number }>) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  emit: (event: string, data?: any) => void;
  isTransitioning?: boolean;
  previousPhase?: GamePhase;
}

/**
 * Central phase renderer that manages all game phases using the registry system.
 * This replaces the switch statement approach with a more maintainable registry-based system.
 */
export function PhaseRenderer({
  lobby,
  currentPlayer,
  onBossAttack,
  onPlayerPositionsUpdate,
  sidebarCollapsed,
  onToggleSidebar,
  emit,
  isTransitioning = false,
  previousPhase
}: PhaseRendererProps) {
  
  const currentPhase = lobby.gamePhase;
  
  // Validate phase requirements
  const validation = PhaseRegistry.validatePhase(currentPhase, {
    hasBoss: !!lobby.boss,
    hasPlayer: !!currentPlayer
  });

  if (!validation.valid) {
    console.warn(`Phase ${currentPhase} validation failed:`, validation.missingRequirements);
    
    return (
      <div className="h-screen w-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-xl mb-2">Phase Loading</div>
          <div className="text-sm opacity-75">
            Missing: {validation.missingRequirements.join(', ')}
          </div>
        </div>
      </div>
    );
  }

  // Get the phase component
  const PhaseComponent = PhaseRegistry.getComponent(currentPhase);
  
  if (!PhaseComponent) {
    console.error(`No component registered for phase: ${currentPhase}`);
    
    return (
      <div className="h-screen w-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <div className="text-xl mb-2">Unknown Phase</div>
          <div className="text-sm opacity-75">
            Phase '{currentPhase}' not found in registry
          </div>
        </div>
      </div>
    );
  }

  // Prepare props for the phase component
  const phaseProps: PhaseComponentProps = {
    lobby,
    currentPlayer,
    boss: lobby.boss,
    onBossAttack,
    onPlayerPositionsUpdate,
    sidebarCollapsed,
    onToggleSidebar,
    emit,
    isTransitioning
  };

  // Render the phase with transition support
  return (
    <PhaseTransition
      fromPhase={previousPhase}
      toPhase={currentPhase}
      isTransitioning={isTransitioning}
    >
      <PhaseComponent {...phaseProps} />
    </PhaseTransition>
  );
}

/**
 * Hook for accessing phase renderer utilities
 */
export function usePhaseRenderer() {
  return {
    validatePhase: PhaseRegistry.validatePhase.bind(PhaseRegistry),
    hasPhase: PhaseRegistry.hasPhase.bind(PhaseRegistry),
    getPhaseConfig: PhaseRegistry.getConfig.bind(PhaseRegistry)
  };
}