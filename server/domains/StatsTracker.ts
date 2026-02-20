/**
 * StatsTracker Domain
 *
 * Tracks lifetime statistics and session summaries via event-driven architecture.
 * Subscribes to estimation and combat events, updates per-lobby session summaries,
 * and persists stats to storage with fire-and-forget pattern.
 *
 * Responsibilities:
 * - Track per-session stats (votes, consensus, damage, revives, deaths)
 * - Calculate derived stats (consensus rate, average voting speed)
 * - Emit session_complete event at game over/victory
 * - Fire-and-forget persistence to storage
 */

import type { ScopedEventBus } from '../events';
import type { IStorage } from '../storage';
import type { SessionSummary, StatsSessionCompletePayload } from '../../shared/statsTypes';
import { createEmptySessionSummary } from '../../shared/statsTypes';
import { dbLogger } from '../logger.js';
import type {
  EstimationVoteCastPayload,
  EstimationFullConsensusReachedPayload,
  EstimationVotingStartedPayload,
  CombatBossDamagedPayload,
  CombatBossDefeatedPayload,
  CombatPlayerRevivedPayload,
  CombatPlayerPermanentlyDownedPayload,
  SessionPhaseChangedPayload,
  SessionLobbyDestroyedPayload,
} from '../events/eventTypes';

/**
 * Dependencies required by StatsTracker
 */
export interface StatsTrackerDeps {
  eventBus: ScopedEventBus;
  storage: IStorage | null; // Nullable for in-memory mode
  getUserId: (lobbyId: string, playerId: string) => number | undefined;
}

/**
 * Voting speed accumulator for calculating running averages
 */
interface VotingSpeedAccumulator {
  totalMs: number;
  count: number;
}

/**
 * StatsTracker manages lifetime statistics and session summaries
 */
export class StatsTracker {
  private readonly eventBus: ScopedEventBus;
  private readonly storage: IStorage | null;
  private readonly getUserId: (lobbyId: string, playerId: string) => number | undefined;

  // State: Map<lobbyId, Map<playerId, SessionSummary>>
  private sessionStats = new Map<string, Map<string, SessionSummary>>();

  // Voting speed tracking: Map<lobbyId, Map<playerId, VotingSpeedAccumulator>>
  private votingSpeedAccumulator = new Map<string, Map<string, VotingSpeedAccumulator>>();

  // Track voting start times per lobby for speed calculation
  private votingStartTimes = new Map<string, number>();

  // Track voters per lobby for consensus events
  private lobbyVoters = new Map<string, Set<string>>();

  constructor(deps: StatsTrackerDeps) {
    this.eventBus = deps.eventBus;
    this.storage = deps.storage ?? null;
    this.getUserId = deps.getUserId;

    // Subscribe to events
    this.setupEventSubscriptions();
  }

  /**
   * Setup event subscriptions for stats tracking
   */
  private setupEventSubscriptions(): void {
    // Estimation events
    this.eventBus.on('estimation:voting_started', this.handleVotingStarted.bind(this));
    this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
    this.eventBus.on('estimation:full_consensus_reached', this.handleConsensus.bind(this));

    // Combat events
    this.eventBus.on('combat:boss_damaged', this.handleBossDamage.bind(this));
    this.eventBus.on('combat:boss_defeated', this.handleBossDefeated.bind(this));
    this.eventBus.on('combat:player_revived', this.handleRevival.bind(this));
    this.eventBus.on('combat:player_permanently_downed', this.handleDeath.bind(this));

    // Session events
    this.eventBus.on('session:phase_changed', this.handlePhaseChange.bind(this));
    this.eventBus.on('session:lobby_destroyed', this.handleLobbyDestroyed.bind(this));
  }

  /**
   * Handle voting started event - record timestamp for voting speed calculation
   */
  private handleVotingStarted(payload: EstimationVotingStartedPayload): void {
    this.votingStartTimes.set(payload.lobbyId, Date.now());
  }

  /**
   * Handle vote cast event - increment totalVotes, track voting speed
   */
  private handleVoteCast(payload: EstimationVoteCastPayload): void {
    const { lobbyId, playerId } = payload;

    // Get or create session summary
    const summary = this.getOrCreateSessionSummary(lobbyId, playerId);

    // Increment totalVotes
    summary.totalVotes++;

    // Track voter for consensus events
    let voters = this.lobbyVoters.get(lobbyId);
    if (!voters) {
      voters = new Set();
      this.lobbyVoters.set(lobbyId, voters);
    }
    voters.add(playerId);

    // Track voting speed if we have a start time
    const votingStartedAt = this.votingStartTimes.get(lobbyId);
    if (votingStartedAt !== undefined) {
      const votingDuration = Date.now() - votingStartedAt;

      // Get or create speed accumulator
      let lobbyAccumulators = this.votingSpeedAccumulator.get(lobbyId);
      if (!lobbyAccumulators) {
        lobbyAccumulators = new Map();
        this.votingSpeedAccumulator.set(lobbyId, lobbyAccumulators);
      }

      let accumulator = lobbyAccumulators.get(playerId);
      if (!accumulator) {
        accumulator = { totalMs: 0, count: 0 };
        lobbyAccumulators.set(playerId, accumulator);
      }

      accumulator.totalMs += votingDuration;
      accumulator.count++;

      // Update average voting speed in session summary
      summary.averageVotingSpeedMs = Math.floor(accumulator.totalMs / accumulator.count);
    }

    // Fire-and-forget: persist totalVotes increment
    this.persistStat(lobbyId, playerId, 'totalVotes', 1).catch(() => {
      // Error already logged in persistStat
    });
  }

  /**
   * Handle consensus reached event - increment consensusCount for all voters
   */
  private handleConsensus(payload: EstimationFullConsensusReachedPayload): void {
    const { lobbyId } = payload;

    // Get all voters for this lobby
    const voters = this.lobbyVoters.get(lobbyId);
    if (!voters || voters.size === 0) {
      return;
    }

    // Increment consensusCount for each voter
    for (const playerId of voters) {
      const summary = this.getOrCreateSessionSummary(lobbyId, playerId);
      summary.consensusCount++;
    }
  }

  /**
   * Handle boss damage event - increment totalDamageDealt
   */
  private handleBossDamage(payload: CombatBossDamagedPayload): void {
    const { lobbyId, playerId, damage } = payload;

    const summary = this.getOrCreateSessionSummary(lobbyId, playerId);
    summary.totalDamageDealt += damage;

    // Fire-and-forget: persist damage
    this.persistStat(lobbyId, playerId, 'totalDamageDealt', damage).catch(() => {
      // Error already logged
    });
  }

  /**
   * Handle boss defeated event - increment bossesDefeated for all session players
   */
  private handleBossDefeated(payload: CombatBossDefeatedPayload): void {
    const { lobbyId } = payload;

    const lobbyStats = this.sessionStats.get(lobbyId);
    if (!lobbyStats) {
      return;
    }

    // Increment bossesDefeated for all players in this lobby session
    for (const [playerId, summary] of lobbyStats.entries()) {
      summary.bossesDefeated++;

      // Fire-and-forget: persist boss defeat
      this.persistStat(lobbyId, playerId, 'bossesDefeated', 1).catch(() => {
        // Error already logged
      });
    }
  }

  /**
   * Handle revival event - increment revives for the reviver
   */
  private handleRevival(payload: CombatPlayerRevivedPayload): void {
    const { lobbyId, reviverId } = payload;

    const summary = this.getOrCreateSessionSummary(lobbyId, reviverId);
    summary.revives++;

    // Fire-and-forget: persist revival
    this.persistStat(lobbyId, reviverId, 'revivesPerformed', 1).catch(() => {
      // Error already logged
    });
  }

  /**
   * Handle death event - increment deaths for the downed player
   */
  private handleDeath(payload: CombatPlayerPermanentlyDownedPayload): void {
    const { lobbyId, playerId } = payload;

    const summary = this.getOrCreateSessionSummary(lobbyId, playerId);
    summary.deaths++;

    // Fire-and-forget: persist death
    this.persistStat(lobbyId, playerId, 'totalDeaths', 1).catch(() => {
      // Error already logged
    });
  }

  /**
   * Handle phase change event - emit session_complete at game_over or victory
   */
  private handlePhaseChange(payload: SessionPhaseChangedPayload): void {
    const { lobbyId, newPhase } = payload;

    // Only emit session complete at game_over or victory
    if (newPhase !== 'game_over' && newPhase !== 'victory') {
      return;
    }

    const lobbyStats = this.sessionStats.get(lobbyId);
    if (!lobbyStats) {
      return;
    }

    // For each player, compute final consensusRate and averageVotingSpeedMs
    for (const [playerId, summary] of lobbyStats.entries()) {
      // Calculate consensus rate
      let consensusRate = 0;
      if (summary.totalVotes > 0) {
        consensusRate = (summary.consensusCount / summary.totalVotes) * 100;
      }

      // Fire-and-forget: persist computed stats
      if (this.storage) {
        const userId = this.getUserId(lobbyId, playerId);
        if (userId) {
          this.storage.updateUserStats(userId, {
            consensusRate,
            averageVotingSpeedMs: summary.averageVotingSpeedMs,
          }).catch((err) => {
            dbLogger.error({ err, playerId }, 'Failed to persist computed stats');
          });
        }
      }
    }

    // Emit session_complete event with all player summaries
    const summaries: Record<string, SessionSummary> = {};
    for (const [playerId, summary] of lobbyStats.entries()) {
      summaries[playerId] = summary;
    }

    const sessionCompletePayload: StatsSessionCompletePayload = {
      lobbyId,
      summaries,
    };

    this.eventBus.emit('stats:session_complete', sessionCompletePayload);
  }

  /**
   * Handle lobby destroyed event - cleanup session data
   */
  private handleLobbyDestroyed(payload: SessionLobbyDestroyedPayload): void {
    this.cleanupLobby(payload.lobbyId);
  }

  /**
   * Get session summary for a specific player in a lobby
   */
  getSessionSummary(lobbyId: string, playerId: string): SessionSummary | null {
    const lobbyStats = this.sessionStats.get(lobbyId);
    if (!lobbyStats) {
      return null;
    }
    return lobbyStats.get(playerId) ?? null;
  }

  /**
   * Get all session summaries for a lobby
   */
  getAllSessionSummaries(lobbyId: string): Record<string, SessionSummary> {
    const lobbyStats = this.sessionStats.get(lobbyId);
    if (!lobbyStats) {
      return {};
    }

    const summaries: Record<string, SessionSummary> = {};
    for (const [playerId, summary] of lobbyStats.entries()) {
      summaries[playerId] = summary;
    }
    return summaries;
  }

  /**
   * Clean up all session data for a lobby
   */
  cleanupLobby(lobbyId: string): void {
    this.sessionStats.delete(lobbyId);
    this.votingSpeedAccumulator.delete(lobbyId);
    this.votingStartTimes.delete(lobbyId);
    this.lobbyVoters.delete(lobbyId);
  }

  /**
   * Get or create session summary for a player
   */
  private getOrCreateSessionSummary(lobbyId: string, playerId: string): SessionSummary {
    let lobbyStats = this.sessionStats.get(lobbyId);
    if (!lobbyStats) {
      lobbyStats = new Map();
      this.sessionStats.set(lobbyId, lobbyStats);
    }

    let summary = lobbyStats.get(playerId);
    if (!summary) {
      summary = createEmptySessionSummary();
      lobbyStats.set(playerId, summary);
    }

    return summary;
  }

  /**
   * Persist stat to storage (fire-and-forget, best-effort)
   */
  private async persistStat(
    lobbyId: string,
    playerId: string,
    stat: string,
    increment: number
  ): Promise<void> {
    try {
      if (!this.storage) return;

      const userId = this.getUserId(lobbyId, playerId);
      if (!userId) return; // Guest player, no persistence

      await this.storage.incrementUserStat(userId, stat as any, increment);
    } catch (err) {
      // Log but don't fail — persistence is best-effort
      dbLogger.error({ err, playerId, stat }, 'Failed to persist stat');
    }
  }
}
