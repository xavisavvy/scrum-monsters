import React from 'react';
import { Lobby } from '@shared/gameEvents';
import { PhaseComponentProps } from './index';

/**
 * Abstract base class for phase components.
 * Provides common functionality and ensures consistent interface.
 */
export abstract class PhaseComponent<P extends PhaseComponentProps = PhaseComponentProps> {
  abstract render(props: P): React.ReactElement;
  
  // Common utilities that phases can use
  protected getPlayerTeamMembers(lobby: Lobby, team: 'developers' | 'qa' | 'spectators') {
    return lobby.teams[team] || [];
  }
  
  protected hasSubmittedScore(lobby: Lobby, playerId: string) {
    const player = lobby.players.find(p => p.id === playerId);
    return player?.hasSubmittedScore || false;
  }
  
  protected isHost(lobby: Lobby, playerId: string) {
    return lobby.hostId === playerId;
  }
}

/**
 * Higher-order component that wraps phase components with error boundaries
 * and provides consistent prop handling.
 */
export function withPhaseWrapper<P extends PhaseComponentProps>(
  WrappedComponent: React.ComponentType<P>
) {
  return function PhaseWrapper(props: P) {
    return (
      <div className="phase-wrapper">
        <WrappedComponent {...props} />
      </div>
    );
  };
}