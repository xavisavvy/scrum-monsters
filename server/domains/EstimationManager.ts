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
import {
  EstimationNotActiveError,
  VoteNotEligibleError,
  InvalidVoteValueError,
} from '../errors/EstimationErrors';

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
 * Valid vote values (Fibonacci sequence + abstain)
 */
const VALID_VOTES = [1, 2, 3, 5, 8, 13, 21, '?'] as const;
type ValidVote = typeof VALID_VOTES[number];

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
   * Adds a player to the eligible voters list for their team
   */
  addEligibleVoter(lobbyId: string, playerId: string, team: TeamType): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return; // No active estimation, nothing to do
    }

    // Spectators cannot vote
    if (team === 'spectators') {
      return;
    }

    const teamState = estimation.teams[team];
    teamState.eligibleVoters.add(playerId);
  }

  /**
   * Removes a player from eligible voters and their vote if cast
   */
  removeEligibleVoter(lobbyId: string, playerId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    // Remove from both teams (player can only be on one, but check both for safety)
    for (const team of ['developers', 'qa'] as const) {
      const teamState = estimation.teams[team];

      if (teamState.eligibleVoters.has(playerId)) {
        teamState.eligibleVoters.delete(playerId);

        // Remove their vote if they had one
        const hadVote = teamState.votes.delete(playerId);

        // Recheck consensus after removing voter
        if (hadVote) {
          this.checkConsensus(lobbyId, team);
        }

        break; // Found the player's team, no need to check the other
      }
    }
  }

  /**
   * Records a vote from a player
   */
  castVote(lobbyId: string, playerId: string, team: TeamType, vote: number | '?'): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    // Validate vote value
    if (!this.isValidVote(vote)) {
      throw new InvalidVoteValueError(vote);
    }

    const teamState = estimation.teams[team];

    // Check if player is eligible to vote
    if (!teamState.eligibleVoters.has(playerId)) {
      throw new VoteNotEligibleError(playerId, 'Player not eligible to vote');
    }


    // Store the vote
    teamState.votes.set(playerId, vote);

    // Emit vote cast event
    this.eventBus.emit('estimation:vote_cast', {
      lobbyId,
      playerId,
      team,
      vote,
    });

    // Check for consensus
    this.checkConsensus(lobbyId, team);
  }

  /**
   * Checks if consensus has been reached for a team
   */
  private checkConsensus(lobbyId: string, team: TeamType): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    const teamState = estimation.teams[team];

    // Reset consensus state (will recalculate)
    teamState.hasConsensus = false;
    teamState.consensusValue = undefined;

    // Skip if team has no eligible voters
    if (teamState.eligibleVoters.size === 0) {
      teamState.hasConsensus = true; // Team skipped
      teamState.consensusValue = undefined;
      return;
    }

    // All eligible voters must have voted
    const allVoted = teamState.eligibleVoters.size === teamState.votes.size;
    if (!allVoted) {
      return;
    }

    // Filter out abstentions ('?') - they don't block consensus
    const numericVotes = Array.from(teamState.votes.values())
      .filter((v): v is number => typeof v === 'number');

    // Need at least one numeric vote for consensus
    if (numericVotes.length === 0) {
      return;
    }

    // Check if all numeric votes are the same value (strict consensus)
    const firstVote = numericVotes[0];
    const allSame = numericVotes.every(v => v === firstVote);

    if (allSame) {
      teamState.hasConsensus = true;
      teamState.consensusValue = firstVote;

      // Emit team consensus event
      this.eventBus.emit('estimation:team_consensus_reached', {
        lobbyId,
        team,
        consensusValue: firstVote,
      });

      // Check if both teams have consensus
      this.checkFullConsensus(lobbyId);
    }
  }

  /**
   * Checks if both teams have reached consensus
   */
  private checkFullConsensus(lobbyId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    const devConsensus = estimation.teams.developers.hasConsensus;
    const qaConsensus = estimation.teams.qa.hasConsensus;

    if (devConsensus && qaConsensus) {
      // Brief pause (2.5 seconds) before emitting full consensus
      setTimeout(() => {
        this.eventBus.emit('estimation:full_consensus_reached', {
          lobbyId,
          ticketId: estimation.ticketId,
        });
      }, 2500);
    }
  }

  /**
   * Validates if a vote value is in the accepted Fibonacci sequence or abstain
   */
  private isValidVote(vote: unknown): vote is ValidVote {
    return VALID_VOTES.includes(vote as ValidVote);
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
