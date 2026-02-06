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

import { ScopedEventBus } from "../events";
import type {
  SessionPlayerJoinedPayload,
  SessionPlayerLeftPayload,
  SessionLobbyDestroyedPayload,
  CombatBattleCompletePayload,
  PhaseChangedPayload,
} from "../events";
import { TeamType } from "../../shared/gameEvents";
import {
  EstimationNotActiveError,
  VoteNotEligibleError,
  InvalidVoteValueError,
  NotInDiscussionPhaseError,
  ForceEstimateTieError,
  InvalidForcedValueError,
} from "../errors/EstimationErrors";

/**
 * Dependencies required by EstimationManager
 */
export interface EstimationManagerDeps {
  eventBus: ScopedEventBus;
  getPlayerTeam?: (lobbyId: string, playerId: string) => TeamType | null;
}

/**
 * Vote-capable teams (excludes spectators)
 */
type VotingTeam = Exclude<TeamType, 'spectators'>;

/**
 * Vote state for a single team during an estimation session
 */
interface TeamVoteState {
  votes: Map<string, number | "?">; // playerId -> vote value
  eligibleVoters: Set<string>; // players who can vote
  hasConsensus: boolean;
  consensusValue?: number;
  timerHandle?: NodeJS.Timeout;
  timerStartedAt?: number;
  timerDurationMs?: number;
  phase: "voting" | "revealed" | "discussion";
}

/**
 * Discussion phase state tracking
 */
interface DiscussionPhaseState {
  active: boolean;
  timerHandle?: NodeJS.Timeout;
  timerStartedAt?: number;
  timerDurationMs: number;
  endsAt?: number;
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
  discussionPhase: DiscussionPhaseState | null;
}

/**
 * Valid vote values (Fibonacci sequence + abstain)
 */
const VALID_VOTES = [1, 2, 3, 5, 8, 13, 21, "?"] as const;
type ValidVote = (typeof VALID_VOTES)[number];

/**
 * EstimationManager manages estimation sessions and vote tracking
 */
export class EstimationManager {
  // State Maps
  private estimations = new Map<string, LobbyEstimationState>();

  // Constants
  private readonly DEFAULT_VOTING_DURATION = 60 * 1000; // 60 seconds
  private readonly DEFAULT_DISCUSSION_DURATION_MS = 2 * 60 * 1000; // 2 minutes

  // Dependencies
  private readonly eventBus: ScopedEventBus;
  private readonly getPlayerTeam?: (lobbyId: string, playerId: string) => TeamType | null;

  constructor(deps: EstimationManagerDeps) {
    this.eventBus = deps.eventBus;
    this.getPlayerTeam = deps.getPlayerTeam;

    // Subscribe to session events for voter management
    this.eventBus.on('session:player_joined', this.handlePlayerJoined.bind(this));
    this.eventBus.on('session:player_left', this.handlePlayerLeft.bind(this));
    this.eventBus.on('session:lobby_destroyed', this.handleLobbyDestroyed.bind(this));

    // Subscribe to combat events for phase transitions
    this.eventBus.on('combat:battle_complete', this.handleBattleComplete.bind(this));

    // Subscribe to phase changes
    this.eventBus.on('phase:changed', this.handlePhaseChange.bind(this));
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
      discussionPhase: null,
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
    if (team === "spectators") {
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
    for (const team of ["developers", "qa"] as const) {
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
  castVote(
    lobbyId: string,
    playerId: string,
    team: TeamType,
    vote: number | "?",
  ): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    // Validate vote value
    if (!this.isValidVote(vote)) {
      throw new InvalidVoteValueError(vote);
    }

    if (!this.isVotingTeam(team)) {
      throw new VoteNotEligibleError(playerId, 'Spectators cannot vote');
    }

    const teamState = estimation.teams[team];

    // Check if player is eligible to vote
    if (!teamState.eligibleVoters.has(playerId)) {
      throw new VoteNotEligibleError(playerId, "Player not eligible to vote");
    }

    // Start timer on first vote for this team (if not already started)
    if (!teamState.timerHandle && !teamState.timerStartedAt) {
      this.startVotingTimer(lobbyId, team);
    }

    // Store the vote
    teamState.votes.set(playerId, vote);

    // Emit vote cast event
    this.eventBus.emit("estimation:vote_cast", {
      lobbyId,
      playerId,
      team,
      vote,
    });

    // Check for consensus
    this.checkConsensus(lobbyId, team);

    // Check if all eligible voters have now voted
    this.checkAllVotesCast(lobbyId);
  }

  /**
   * Checks if all eligible voters across all teams have cast votes
   * and emits estimation:all_votes_cast if so
   */
  private checkAllVotesCast(lobbyId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    let totalEligible = 0;
    let totalVoted = 0;

    // Count across both teams
    for (const team of ['developers', 'qa'] as const) {
      if (!this.isVotingTeam(team)) continue;
      const teamState = estimation.teams[team];
      totalEligible += teamState.eligibleVoters.size;
      totalVoted += teamState.votes.size;
    }

    // If all eligible voters have voted, emit event
    if (totalEligible > 0 && totalVoted === totalEligible) {
      this.eventBus.emit('estimation:all_votes_cast', {
        lobbyId,
        voteCount: totalVoted,
      });
    }
  }

  /**
   * Returns whether all eligible voters have cast their votes
   * Used by PhaseCoordinator for validation before transitioning to reveal
   */
  public hasAllVotes(lobbyId: string): boolean {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return false;
    }

    for (const team of ['developers', 'qa'] as const) {
      if (!this.isVotingTeam(team)) continue;
      const teamState = estimation.teams[team];
      
      // Skip teams with no eligible voters
      if (teamState.eligibleVoters.size === 0) continue;

      // Check if all eligible voters have voted
      if (teamState.votes.size !== teamState.eligibleVoters.size) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if consensus has been reached for a team
   */
  private checkConsensus(lobbyId: string, team: TeamType): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    if (!this.isVotingTeam(team)) {
      return; // Spectators don't have consensus
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
    const numericVotes = Array.from(teamState.votes.values()).filter(
      (v): v is number => typeof v === "number",
    );

    // Need at least one numeric vote for consensus
    if (numericVotes.length === 0) {
      return;
    }

    // Check if all numeric votes are the same value (strict consensus)
    const firstVote = numericVotes[0];
    const allSame = numericVotes.every((v) => v === firstVote);

    if (allSame) {
      teamState.hasConsensus = true;
      teamState.consensusValue = firstVote;

      // Clear timer when consensus reached (no longer needed)
      if (teamState.timerHandle) {
        clearTimeout(teamState.timerHandle);
        teamState.timerHandle = undefined;
      }

      // Emit team consensus event
      this.eventBus.emit("estimation:team_consensus_reached", {
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
        this.eventBus.emit("estimation:full_consensus_reached", {
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

    // Clear discussion timer if running
    if (estimation.discussionPhase?.timerHandle) {
      clearTimeout(estimation.discussionPhase.timerHandle);
    }

    // Remove from Map
    this.estimations.delete(lobbyId);
  }

  /**
   * Creates an empty team vote state
   */
  /**
   * Starts the voting timer for a team (called on first vote)
   */
  private startVotingTimer(lobbyId: string, team: VotingTeam): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    const teamState = estimation.teams[team];
    const now = Date.now();

    // Set timer metadata
    teamState.timerStartedAt = now;
    teamState.timerDurationMs = this.DEFAULT_VOTING_DURATION;

    // Start the timer
    teamState.timerHandle = setTimeout(() => {
      this.handleVotingTimeout(lobbyId, team);
    }, this.DEFAULT_VOTING_DURATION);

    // Emit timer started event
    this.eventBus.emit("estimation:timer_started", {
      lobbyId,
      team,
      durationMs: this.DEFAULT_VOTING_DURATION,
      startedAt: now,
    });
  }

  /**
   * Handles timer expiry - reveals votes or keeps voting phase
   */
  private handleVotingTimeout(lobbyId: string, team: VotingTeam): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    const teamState = estimation.teams[team];

    // Clear timer handle
    teamState.timerHandle = undefined;

    const votedCount = teamState.votes.size;
    const eligibleCount = teamState.eligibleVoters.size;

    // Emit timer expired event
    this.eventBus.emit("estimation:timer_expired", {
      lobbyId,
      team,
      votedCount,
      eligibleCount,
    });

    // Check if we should transition to reveal (if both teams have had timeout or voted)
    const shouldReveal = this.shouldRevealAfterTimeout(lobbyId);
    if (shouldReveal) {
      // Emit voting timeout event for PhaseCoordinator
      const totalEligible = this.getTotalEligibleVoters(lobbyId);
      const totalVoted = this.getTotalVotes(lobbyId);
      
      this.eventBus.emit('estimation:voting_timeout', {
        lobbyId,
        submittedCount: totalVoted,
        totalCount: totalEligible,
      });
    }

    // If votes were cast, reveal them
    if (votedCount > 0) {
      teamState.phase = "revealed";
    } else {
      // No votes, stay in voting phase
      teamState.phase = "voting";
    }
  }

  /**
   * Returns whether we should transition to reveal after a timeout
   */
  private shouldRevealAfterTimeout(lobbyId: string): boolean {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return false;
    }

    // Check if both teams have either finished voting or timed out
    for (const team of ['developers', 'qa'] as const) {
      if (!this.isVotingTeam(team)) continue;
      const teamState = estimation.teams[team];
      
      // Skip teams with no eligible voters
      if (teamState.eligibleVoters.size === 0) continue;

      // Team hasn't finished if timer is still running and not all voted
      const allVoted = teamState.votes.size === teamState.eligibleVoters.size;
      const timerRunning = teamState.timerHandle !== undefined;
      
      if (timerRunning && !allVoted) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns total number of eligible voters across all teams
   */
  private getTotalEligibleVoters(lobbyId: string): number {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return 0;
    }

    let total = 0;
    for (const team of ['developers', 'qa'] as const) {
      if (!this.isVotingTeam(team)) continue;
      total += estimation.teams[team].eligibleVoters.size;
    }
    return total;
  }

  /**
   * Returns total number of votes cast across all teams
   */
  private getTotalVotes(lobbyId: string): number {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return 0;
    }

    let total = 0;
    for (const team of ['developers', 'qa'] as const) {
      if (!this.isVotingTeam(team)) continue;
      total += estimation.teams[team].votes.size;
    }
    return total;
  }

  /**
   * Pauses the voting timer (host control)
   */
  pauseTimer(lobbyId: string, team: TeamType, hostId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    if (!this.isVotingTeam(team)) {
      return; // Spectators don't have timers
    }

    const teamState = estimation.teams[team];

    // Calculate remaining time
    if (teamState.timerHandle && teamState.timerStartedAt && teamState.timerDurationMs) {
      const elapsed = Date.now() - teamState.timerStartedAt;
      const remaining = Math.max(0, teamState.timerDurationMs - elapsed);

      // Clear the timer
      clearTimeout(teamState.timerHandle);
      teamState.timerHandle = undefined;

      // Store remaining time for resume
      teamState.timerDurationMs = remaining;

      // Emit paused event
      this.eventBus.emit("estimation:timer_paused", {
        lobbyId,
        team,
        remainingMs: remaining,
        pausedBy: hostId,
      });
    }
  }

  /**
   * Resumes the voting timer (host control)
   */
  resumeTimer(lobbyId: string, team: TeamType, hostId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    if (!this.isVotingTeam(team)) {
      return; // Spectators don't have timers
    }

    const teamState = estimation.teams[team];

    // Only resume if timer was paused (no handle, but has duration)
    if (!teamState.timerHandle && teamState.timerDurationMs) {
      const remainingMs = teamState.timerDurationMs;

      // Update start time to now
      teamState.timerStartedAt = Date.now();

      // Restart timer with remaining duration
      teamState.timerHandle = setTimeout(() => {
        this.handleVotingTimeout(lobbyId, team);
      }, remainingMs);

      // Emit resumed event
      this.eventBus.emit("estimation:timer_resumed", {
        lobbyId,
        team,
        remainingMs,
        resumedBy: hostId,
      });
    }
  }

  /**
   * Extends the voting timer (host control)
   */
  extendTimer(lobbyId: string, team: TeamType, additionalMs: number, hostId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return;
    }

    if (!this.isVotingTeam(team)) {
      return; // Spectators don't have timers
    }

    const teamState = estimation.teams[team];

    // Add time to duration
    if (teamState.timerDurationMs !== undefined) {
      // If timer is running, calculate remaining time and restart
      if (teamState.timerHandle && teamState.timerStartedAt) {
        const elapsed = Date.now() - teamState.timerStartedAt;
        const remaining = Math.max(0, teamState.timerDurationMs - elapsed);

        // Clear old timer
        clearTimeout(teamState.timerHandle);

        // Calculate new duration
        const newDuration = remaining + additionalMs;
        teamState.timerDurationMs = newDuration;
        teamState.timerStartedAt = Date.now();

        // Start new timer
        teamState.timerHandle = setTimeout(() => {
          this.handleVotingTimeout(lobbyId, team);
        }, newDuration);
      } else {
        // Timer is paused, just add to duration
        teamState.timerDurationMs += additionalMs;
      }

      // Emit extended event
      this.eventBus.emit("estimation:timer_extended", {
        lobbyId,
        team,
        additionalMs,
        extendedBy: hostId,
      });
    }
  }

  private createEmptyTeamState(): TeamVoteState {
    return {
      votes: new Map(),
      eligibleVoters: new Set(),
      hasConsensus: false,
      phase: "voting",
    };
  }

  /**
   * Type guard to check if team is a voting team
   */
  private isVotingTeam(team: TeamType): team is VotingTeam {
    return team === 'developers' || team === 'qa';
  }

  /**
   * Handles discussion timer expiry - picks majority vote
   */
  private handleDiscussionTimeout(lobbyId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation || !estimation.discussionPhase?.active) return;

    // Clear timer handle
    estimation.discussionPhase.timerHandle = undefined;

    // Get majority vote (tally all votes)
    const voteTally = new Map<number, number>();

    for (const vote of estimation.teams.developers.votes.values()) {
      if (typeof vote === 'number') {
        voteTally.set(vote, (voteTally.get(vote) || 0) + 1);
      }
    }
    for (const vote of estimation.teams.qa.votes.values()) {
      if (typeof vote === 'number') {
        voteTally.set(vote, (voteTally.get(vote) || 0) + 1);
      }
    }

    // Find majority
    let maxCount = 0;
    let majority: number | undefined;
    for (const [value, count] of voteTally.entries()) {
      if (count > maxCount) {
        maxCount = count;
        majority = value;
      }
    }

    if (majority !== undefined) {
      this.endDiscussion(lobbyId, 'timer_expired', majority);
    }
  }

  /**
   * Ends the discussion phase and emits result
   */
  private endDiscussion(
    lobbyId: string,
    reason: 'consensus' | 'host_finalized' | 'timer_expired',
    finalEstimate: number
  ): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) return;

    // Clear timer if running
    if (estimation.discussionPhase?.timerHandle) {
      clearTimeout(estimation.discussionPhase.timerHandle);
      estimation.discussionPhase.timerHandle = undefined;
    }

    // Mark discussion as inactive
    if (estimation.discussionPhase) {
      estimation.discussionPhase.active = false;
    }

    // Emit discussion ended event
    this.eventBus.emit('estimation:discussion_ended', {
      lobbyId,
      reason,
      finalEstimate,
    });
  }

  /**
   * Vote visibility information for a player
   */
  private getVoteVisibility(lobbyId: string, team: VotingTeam): VoteVisibility[] {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return [];
    }

    const teamState = estimation.teams[team];
    const visibility: VoteVisibility[] = [];

    for (const playerId of teamState.eligibleVoters) {
      const hasVoted = teamState.votes.has(playerId);
      const vote = teamState.votes.get(playerId);

      visibility.push({
        playerId,
        hasVoted,
        // Only reveal vote value in revealed/discussion phase
        vote: teamState.phase === 'voting' ? undefined : vote
      });
    }

    return visibility;
  }

  /**
   * Gets vote visibility for all teams
   * Returns cross-team transparency when any team is in revealed/discussion phase
   */
  getAllVoteVisibility(lobbyId: string): {
    developers: VoteVisibility[];
    qa: VoteVisibility[];
    globalPhase: string;
  } {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    // Use most advanced phase (if one team revealed, show all)
    const devPhase = estimation.teams.developers.phase;
    const qaPhase = estimation.teams.qa.phase;

    // Determine global phase: discussion > revealed > voting
    let globalPhase: string;
    if (devPhase === 'discussion' || qaPhase === 'discussion') {
      globalPhase = 'discussion';
    } else if (devPhase === 'revealed' || qaPhase === 'revealed') {
      globalPhase = 'revealed';
    } else {
      globalPhase = 'voting';
    }

    return {
      developers: this.getVoteVisibility(lobbyId, 'developers'),
      qa: this.getVoteVisibility(lobbyId, 'qa'),
      globalPhase
    };
  }

  /**
   * Transitions a team to discussion phase
   */
  enterDiscussionPhase(lobbyId: string, team: TeamType): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    if (!this.isVotingTeam(team)) {
      throw new VoteNotEligibleError('spectators', 'Spectators cannot enter discussion phase');
    }

    const teamState = estimation.teams[team];
    teamState.phase = 'discussion';

    this.eventBus.emit('estimation:discussion_started', {
      lobbyId,
      team
    });
  }

  /**
   * Starts the discussion phase timer with configurable duration
   * Called after battle concludes to begin discussion phase
   */
  public startDiscussionPhase(lobbyId: string, durationMs?: number): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    const duration = durationMs ?? this.DEFAULT_DISCUSSION_DURATION_MS;
    const now = Date.now();
    const endsAt = now + duration;

    // Initialize discussion state
    estimation.discussionPhase = {
      active: true,
      timerStartedAt: now,
      timerDurationMs: duration,
      endsAt,
    };

    // Emit timer started event
    this.eventBus.emit('estimation:discussion_timer_started', {
      lobbyId,
      durationMs: duration,
      endsAt,
    });

    // Start timer
    estimation.discussionPhase.timerHandle = setTimeout(() => {
      this.handleDiscussionTimeout(lobbyId);
    }, duration);
  }

  /**
   * Changes a player's vote during the discussion phase
   * Resets team consensus and re-checks for new consensus
   */
  changeVoteDuringDiscussion(
    lobbyId: string,
    playerId: string,
    team: TeamType,
    newVote: number | '?'
  ): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    if (!this.isVotingTeam(team)) {
      throw new VoteNotEligibleError(playerId, 'Spectators cannot vote');
    }

    const teamState = estimation.teams[team];

    // Must be in discussion phase
    if (teamState.phase !== 'discussion') {
      throw new NotInDiscussionPhaseError(lobbyId, teamState.phase);
    }

    // Player must be eligible voter
    if (!teamState.eligibleVoters.has(playerId)) {
      throw new VoteNotEligibleError(playerId, 'Player not eligible to vote');
    }

    // Validate vote value
    if (!this.isValidVote(newVote)) {
      throw new InvalidVoteValueError(newVote);
    }

    // Store old vote for event
    const oldVote = teamState.votes.get(playerId);

    // Update vote
    teamState.votes.set(playerId, newVote);

    // Reset consensus (they might now disagree)
    teamState.hasConsensus = false;
    teamState.consensusValue = undefined;

    // Emit vote changed event
    this.eventBus.emit('estimation:vote_changed', {
      lobbyId,
      playerId,
      team,
      oldVote,
      newVote
    });

    // Re-check consensus (they might now all agree)
    this.checkConsensus(lobbyId, team);

    // Check for full discussion consensus (auto-end if achieved)
    this.checkDiscussionConsensus(lobbyId);
  }

  /**
   * Checks if both teams have reached consensus during discussion phase
   * Auto-ends discussion if full consensus is achieved
   */
  private checkDiscussionConsensus(lobbyId: string): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation || !estimation.discussionPhase?.active) return;

    const devState = estimation.teams.developers;
    const qaState = estimation.teams.qa;

    // Both teams must have consensus AND same value
    if (devState.hasConsensus && qaState.hasConsensus) {
      const devValue = devState.consensusValue;
      const qaValue = qaState.consensusValue;

      // Check if values match (or one team has no voters)
      if (devValue === qaValue || devValue === undefined || qaValue === undefined) {
        const finalEstimate = devValue ?? qaValue;
        if (finalEstimate !== undefined) {
          this.endDiscussion(lobbyId, 'consensus', finalEstimate);
        }
      }
    }
  }

  /**
   * Gets vote tally for a team (count of each vote value)
   */
  getVoteTally(lobbyId: string, team: TeamType): Map<number | '?', number> {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    if (!this.isVotingTeam(team)) {
      return new Map(); // Spectators have no votes
    }

    const teamState = estimation.teams[team];
    const tally = new Map<number | '?', number>();

    for (const vote of teamState.votes.values()) {
      const count = tally.get(vote) || 0;
      tally.set(vote, count + 1);
    }

    return tally;
  }

  /**
   * Forces an estimate to move discussion along
   * Uses majority vote value by default
   * If tie, host must explicitly choose from tied values
   */
  forceEstimate(
    lobbyId: string,
    team: TeamType,
    hostId: string,
    forcedValue?: number
  ): { consensusValue: number } {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    if (!this.isVotingTeam(team)) {
      throw new VoteNotEligibleError('spectators', 'Cannot force estimate for spectators');
    }

    const teamState = estimation.teams[team];

    // Get vote tally (only numeric votes, ignore abstentions)
    const tally = new Map<number, number>();
    for (const vote of teamState.votes.values()) {
      if (typeof vote === 'number') {
        const count = tally.get(vote) || 0;
        tally.set(vote, count + 1);
      }
    }

    // Find majority (highest count)
    let maxCount = 0;
    const valuesWithMaxCount: number[] = [];

    for (const [value, count] of tally.entries()) {
      if (count > maxCount) {
        maxCount = count;
        valuesWithMaxCount.length = 0; // Clear array
        valuesWithMaxCount.push(value);
      } else if (count === maxCount) {
        valuesWithMaxCount.push(value);
      }
    }

    // Determine consensus value
    let consensusValue: number;

    if (valuesWithMaxCount.length === 1) {
      // Clear majority - use it (unless forcedValue provided)
      consensusValue = forcedValue ?? valuesWithMaxCount[0];
    } else if (valuesWithMaxCount.length > 1) {
      // Tie - host must choose
      if (forcedValue === undefined) {
        throw new ForceEstimateTieError(lobbyId, valuesWithMaxCount);
      }

      // Verify forcedValue is one of the tied values
      if (!valuesWithMaxCount.includes(forcedValue)) {
        throw new InvalidForcedValueError(forcedValue, valuesWithMaxCount);
      }

      consensusValue = forcedValue;
    } else {
      // No numeric votes - shouldn't happen in practice
      throw new EstimationNotActiveError(lobbyId);
    }

    // Set consensus
    teamState.hasConsensus = true;
    teamState.consensusValue = consensusValue;

    // Emit event
    this.eventBus.emit('estimation:estimate_forced', {
      lobbyId,
      team,
      consensusValue,
      forcedBy: hostId,
      wasTied: valuesWithMaxCount.length > 1
    });

    // Check if both teams now have consensus
    this.checkFullConsensus(lobbyId);

    return { consensusValue };
  }

  /**
   * Host finalizes discussion with a specific estimate value
   * Only allows values that were actually voted on
   */
  public hostFinalizeEstimate(lobbyId: string, hostId: string, estimate: number): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation || !estimation.discussionPhase?.active) {
      throw new EstimationNotActiveError(lobbyId);
    }

    // Validate estimate is from actual votes (collect all voted values)
    const allVotes = new Set<number>();
    for (const vote of estimation.teams.developers.votes.values()) {
      if (typeof vote === 'number') allVotes.add(vote);
    }
    for (const vote of estimation.teams.qa.votes.values()) {
      if (typeof vote === 'number') allVotes.add(vote);
    }

    if (!allVotes.has(estimate)) {
      throw new Error(`Invalid estimate: ${estimate}. Must be one of: ${Array.from(allVotes).join(', ')}`);
    }

    this.endDiscussion(lobbyId, 'host_finalized', estimate);
  }

  /**
   * Get team scores (player votes grouped by team)
   * Returns Record<playerId, vote> for each team
   * Used during reveal phase to show what each team member voted
   */
  getTeamScores(lobbyId: string): { developers: Record<string, number | '?'>; qa: Record<string, number | '?'> } {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    const teamScores = {
      developers: {} as Record<string, number | '?'>,
      qa: {} as Record<string, number | '?'>
    };

    // Extract votes for each team
    for (const [playerId, vote] of estimation.teams.developers.votes) {
      teamScores.developers[playerId] = vote;
    }
    for (const [playerId, vote] of estimation.teams.qa.votes) {
      teamScores.qa[playerId] = vote;
    }

    return teamScores;
  }

  /**
   * Get team consensus status (whether each team has consensus and what the value is)
   * Returns hasConsensus and consensusValue for each team
   * Only considers numeric votes (excludes '?' votes)
   */
  getTeamConsensus(lobbyId: string): {
    developers: { hasConsensus: boolean; score?: number };
    qa: { hasConsensus: boolean; score?: number };
  } {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      throw new EstimationNotActiveError(lobbyId);
    }

    // Get numeric votes for each team (exclude '?')
    const devScoreValues = Array.from(estimation.teams.developers.votes.values()).filter(
      (vote): vote is number => typeof vote === 'number'
    );
    const qaScoreValues = Array.from(estimation.teams.qa.votes.values()).filter(
      (vote): vote is number => typeof vote === 'number'
    );

    // Check consensus (all numeric votes are the same)
    const devConsensus = devScoreValues.length > 0 && devScoreValues.every(score => score === devScoreValues[0]);
    const qaConsensus = qaScoreValues.length > 0 && qaScoreValues.every(score => score === qaScoreValues[0]);

    return {
      developers: {
        hasConsensus: devConsensus,
        score: devConsensus ? devScoreValues[0] : undefined
      },
      qa: {
        hasConsensus: qaConsensus,
        score: qaConsensus ? qaScoreValues[0] : undefined
      }
    };
  }

  /**
   * Check if teams agree on consensus
   * Returns true if:
   * - Both teams exist and have same consensus score, OR
   * - Only one team exists and has consensus
   * Takes into account which teams actually have members
   */
  checkTeamsAgree(lobbyId: string, devTeamSize: number, qaTeamSize: number): boolean {
    const teamConsensus = this.getTeamConsensus(lobbyId);
    
    const devTeamExists = devTeamSize > 0;
    const qaTeamExists = qaTeamSize > 0;

    if (devTeamExists && qaTeamExists) {
      // Both teams exist - require both to have consensus and agree on same score
      return (
        teamConsensus.developers.hasConsensus &&
        teamConsensus.qa.hasConsensus &&
        teamConsensus.developers.score === teamConsensus.qa.score
      );
    } else if (devTeamExists && !qaTeamExists) {
      // Only developers exist - just need dev consensus
      return teamConsensus.developers.hasConsensus;
    } else if (!devTeamExists && qaTeamExists) {
      // Only QA exists - just need QA consensus
      return teamConsensus.qa.hasConsensus;
    } else {
      // No teams exist - no consensus possible
      return false;
    }
  }

  /**
   * Handles player joining a lobby (session event subscription)
   * If estimation is active, adds player to eligible voters based on their team
   */
  private handlePlayerJoined(payload: SessionPlayerJoinedPayload): void {
    const estimation = this.estimations.get(payload.lobbyId);
    if (!estimation) {
      return; // No active estimation, nothing to do
    }

    // Get player's team via dependency callback
    if (!this.getPlayerTeam) {
      return; // No way to determine team
    }

    const team = this.getPlayerTeam(payload.lobbyId, payload.playerId);
    if (!team || team === 'spectators') {
      return; // Spectators cannot vote
    }

    // Add to eligible voters (late joiners can vote immediately)
    this.addEligibleVoter(payload.lobbyId, payload.playerId, team);
  }

  /**
   * Handles player leaving a lobby (session event subscription)
   * Removes player from eligible voters and their vote if cast
   */
  private handlePlayerLeft(payload: SessionPlayerLeftPayload): void {
    // removeEligibleVoter handles removal and consensus recheck
    this.removeEligibleVoter(payload.lobbyId, payload.playerId);
  }

  /**
   * Handles lobby destruction (session event subscription)
   * Cleans up all estimation state and timers
   */
  private handleLobbyDestroyed(payload: SessionLobbyDestroyedPayload): void {
    this.cleanupLobby(payload.lobbyId);
  }

  /**
   * Handles player team change (called by SessionManager after team change)
   * If player switches to spectator, their vote is removed
   */
  handleTeamChange(
    lobbyId: string,
    playerId: string,
    oldTeam: TeamType,
    newTeam: TeamType
  ): void {
    const estimation = this.estimations.get(lobbyId);
    if (!estimation) {
      return; // No active estimation
    }

    // Remove from old team if they were a voting team
    if (this.isVotingTeam(oldTeam)) {
      const oldTeamState = estimation.teams[oldTeam];
      if (oldTeamState.eligibleVoters.has(playerId)) {
        oldTeamState.eligibleVoters.delete(playerId);
        const hadVote = oldTeamState.votes.delete(playerId);

        // Recheck consensus on old team after removal
        if (hadVote) {
          this.checkConsensus(lobbyId, oldTeam);
        }
      }
    }

    // Add to new team if they're a voting team
    if (this.isVotingTeam(newTeam)) {
      estimation.teams[newTeam].eligibleVoters.add(playerId);
    }
  }

  /**
   * Handles battle completion event from CombatManager
   * Starts the discussion phase after team attack lands
   */
  private handleBattleComplete(payload: CombatBattleCompletePayload): void {
    this.startDiscussionPhase(payload.lobbyId);
  }

  /**
   * Handle phase changes to initialize or cleanup estimation state
   */
  private handlePhaseChange(payload: PhaseChangedPayload): void {
    const { lobbyId, newPhase } = payload;

    // Cleanup estimation when returning to lobby
    if (newPhase === 'lobby') {
      this.cleanupLobby(lobbyId);
    }

    // Note: Estimation initialization (when entering battle) is still handled
    // by websocket handlers, as it requires the ticket context
    // that isn't available in the phase event payload
  }
}

/**
 * Vote visibility information for UI
 */
export interface VoteVisibility {
  playerId: string;
  hasVoted: boolean;
  vote?: number | '?';  // Only present in revealed/discussion phase
}
