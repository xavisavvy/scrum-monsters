/**
 * EstimationManager Domain
 *
 * Manages estimation sessions, vote tracking, and consensus detection.
 * Owns the lifecycle of estimation phases and per-team vote state.
 *
 * Responsibilities:
 * - Start/stop estimation sessions for tickets
 * - Track votes per team (developers, qa)
 * - Detect consensus within teams
 * - Manage voting timers
 * - Emit estimation:* events for cross-domain coordination
 */

import { ScopedEventBus } from '../events';
import { TeamType } from '../../shared/gameEvents';

/**
 * Dependencies required by EstimationManager
 */
export interface EstimationManagerDeps {
  eventBus: ScopedEventBus;
}

/**
 * Vote state for a single team during an estimation session
 */
interface TeamVoteState {
  votes: Map<string, number | '?'>;     // playerId -> vote value
  eligibleVoters: Set<string>;           // players who can vote
  hasConsensus: boolean;
  consensusValue?: number;
  timerHandle?: NodeJS.Timeout;
  timerStartedAt?: number;
  timerDurationMs?: number;
  phase: 'voting' | 'revealed' | 'discussion';
}

/**
 * Estimation state for a lobby (contains both team states)
 */
interface LobbyEstimationState {
  lobbyId: string;
  ticketId: string;
  teams: {
    developers: TeamVoteState;
    qa: TeamVoteState;
  };
}

/**
 * EstimationManager manages estimation sessions and vote tracking
 */
export class EstimationManager {
  // State Maps
  private estimations = new Map<string, LobbyEstimationState>();

  // Constants
  private readonly DEFAULT_VOTING_DURATION = 60 * 1000; // 60 seconds

  // Dependencies
  private readonly eventBus: ScopedEventBus;

  constructor(deps: EstimationManagerDeps) {
    this.eventBus = deps.eventBus;
  }

  /**
   * Starts a new estimation session for a ticket
   * TODO: Implement in next plan
   */
  startEstimation(lobbyId: string, ticketId: string): void {
    const estimation: LobbyEstimationState = {
      lobbyId,
      ticketId,
      teams: {
        developers: this.createEmptyTeamState(),
        qa: this.createEmptyTeamState(),
      },
    };

    this.estimations.set(lobbyId, estimation);
  }

  /**
   * Records a vote from a player
   * TODO: Implement in next plan
   */
  castVote(lobbyId: string, playerId: string, team: TeamType, vote: number | '?'): void {
    // TODO: Implement vote validation, storage, and consensus check
  }

  /**
   * Retrieves the current estimation state for a lobby
   */
  getEstimation(lobbyId: string): LobbyEstimationState | null {
    return this.estimations.get(lobbyId) || null;
  }

  /**
   * Cleans up estimation state when a lobby is destroyed
   */
  cleanupLobby(lobbyId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    // Clear any active timers
    if (estimation.teams.developers.timerHandle) {
      clearTimeout(estimation.teams.developers.timerHandle);
    }
    if (estimation.teams.qa.timerHandle) {
      clearTimeout(estimation.teams.qa.timerHandle);
    }

    // Remove from Map
    this.estimations.delete(lobbyId);
  }

  /**
   * Creates an empty team vote state
   */
  private createEmptyTeamState(): TeamVoteState {
    return {
      votes: new Map(),
      eligibleVoters: new Set(),
      hasConsensus: false,
      phase: 'voting',
    };
  }
}
