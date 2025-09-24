import React, { ReactNode } from 'react';
import { Boss } from '@shared/gameEvents';
import { BossDisplay } from '@/components/game/BossDisplay';
import { TimerDisplay } from '@/components/game/TimerDisplay';
import { BossMusicControls } from '@/components/ui/BossMusicControls';
import { TeamPerformanceTracker } from '@/components/game/TeamPerformanceTracker';
import { TeamCelebration } from '@/components/game/TeamCelebration';
import { PlayerController } from '@/components/game/PlayerController';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CinematicBackground } from '@/components/ui/CinematicBackground';

interface PhaseContainerProps {
  // Phase layout configuration
  layout: 'battle' | 'overlay' | 'cinematic' | 'simple';
  
  // Boss-related props
  boss?: Boss;
  onBossAttack?: () => void;
  
  // Content slots
  mainContent?: ReactNode;
  sidebarContent?: ReactNode;
  overlayContent?: ReactNode;
  
  // Player controller props
  enablePlayerController?: boolean;
  onPlayerPositionsUpdate?: (positions: Record<string, { x: number, y: number }>) => void;
  
  // UI control flags
  showTimer?: boolean;
  showBossMusic?: boolean;
  showTeamComponents?: boolean;
  showSidebar?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  
  // Custom styling
  className?: string;
  contentClassName?: string;
}

/**
 * Stable container component that provides consistent structure across all game phases.
 * This prevents DOM reconciliation issues by maintaining the same component tree structure.
 */
export function PhaseContainer({
  layout,
  boss,
  onBossAttack,
  mainContent,
  sidebarContent,
  overlayContent,
  enablePlayerController = false,
  onPlayerPositionsUpdate,
  showTimer = false,
  showBossMusic = false,
  showTeamComponents = false,
  showSidebar = false,
  sidebarCollapsed = false,
  onToggleSidebar,
  className = "",
  contentClassName = ""
}: PhaseContainerProps) {

  const renderSidebar = () => {
    if (!showSidebar || !sidebarContent) return null;
    
    return (
      <div 
        className={`fixed right-0 top-0 h-full bg-gray-900/95 border-l border-gray-700 transition-all duration-300 z-50 ${
          sidebarCollapsed ? 'w-12' : 'w-96'
        }`}
      >
        {/* Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-full bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-l border border-r-0 border-gray-600 transition-colors z-50"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          data-no-shoot
        >
          {sidebarCollapsed ? "→" : "←"}
        </button>
        
        {/* Sidebar Content */}
        {!sidebarCollapsed && (
          <div className="h-full overflow-y-auto p-4 pt-16">
            {sidebarContent}
          </div>
        )}
      </div>
    );
  };

  const renderBattleLayout = () => (
    <div className="relative h-full w-full">
      {/* Boss Display (Background) */}
      {boss && (
        <BossDisplay boss={boss} onAttack={onBossAttack} fullscreen />
      )}
      
      {/* Sidebar */}
      {renderSidebar()}
      
      {/* Timer Display - Top Left */}
      {showTimer && (
        <div className="absolute top-6 left-6 z-40">
          <TimerDisplay />
        </div>
      )}
      
      {/* Boss Music Controls - Top Right */}
      {showBossMusic && (
        <div className="absolute top-6 right-6 z-40" data-no-shoot>
          <BossMusicControls />
        </div>
      )}

      {/* Player Character Controller */}
      {enablePlayerController && (
        <div className="absolute inset-0 z-70" style={{ pointerEvents: 'auto' }}>
          <ErrorBoundary fallback={<div className="error-recovery-player" />}>
            <PlayerController 
              onPlayerPositionsUpdate={onPlayerPositionsUpdate}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* Team Competition Components */}
      {showTeamComponents && (
        <>
          <TeamPerformanceTracker />
          <TeamCelebration />
        </>
      )}
      
      {/* Main Content Overlay */}
      {mainContent && (
        <div className={`relative z-30 ${contentClassName}`}>
          {mainContent}
        </div>
      )}
    </div>
  );

  const renderCinematicLayout = () => (
    <div className="relative h-full w-full">
      {/* Cinematic Background */}
      <CinematicBackground />
      
      {/* Main Content */}
      {mainContent && (
        <div className={`relative z-20 ${contentClassName}`}>
          {mainContent}
        </div>
      )}
      
      {/* Overlay Content */}
      {overlayContent && (
        <div className="relative z-30">
          {overlayContent}
        </div>
      )}
    </div>
  );

  const renderOverlayLayout = () => (
    <div className="relative h-full w-full flex items-center justify-center">
      {/* Main Content */}
      {mainContent && (
        <div className={`relative z-20 ${contentClassName}`}>
          {mainContent}
        </div>
      )}
      
      {/* Overlay Content */}
      {overlayContent && (
        <div className="absolute inset-0 z-30">
          {overlayContent}
        </div>
      )}
    </div>
  );

  const renderSimpleLayout = () => (
    <div className={`h-full w-full ${contentClassName}`}>
      {mainContent}
      {overlayContent}
    </div>
  );

  const renderLayout = () => {
    switch (layout) {
      case 'battle':
        return renderBattleLayout();
      case 'cinematic':
        return renderCinematicLayout();
      case 'overlay':
        return renderOverlayLayout();
      case 'simple':
        return renderSimpleLayout();
      default:
        return renderSimpleLayout();
    }
  };

  return (
    <div className={`h-screen w-screen bg-black text-white overflow-hidden relative ${className}`}>
      {renderLayout()}
    </div>
  );
}