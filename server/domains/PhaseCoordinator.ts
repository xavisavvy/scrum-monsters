/**
 * PhaseCoordinator Domain
 *
 * Centralized phase state management for game flow.
 * Coordinates phase transitions through event-driven architecture.
 *
 * Responsibilities:
 * - Validate phase transitions against state machine rules
 * - Update lobby.gamePhase atomically
 * - Emit phase:changed events for domain coordination
 * - Listen to domain events that trigger transitions
 * - Handle emergency transitions (abandon quest)
 * - Prevent invalid state transitions
 *
 * Design Principles:
 * - Correctness over performance (always re-validate)
 * - Event-driven coordination (domains emit, coordinator reacts)
 * - Domain autonomy (validators live in domains)
 * - Incremental migration (coexists with gameState)
 */

import { ScopedEventBus } from '../events';
import type {
  EstimationAllVotesCastPayload,
  EstimationVotingTimeoutPayload,
  CombatAllPlayersDownedPayload,
  PhaseChangedPayload,
  PhaseTransitionRejectedPayload,
} from '../events/eventTypes';
import type { Lobby, GamePhase } from '../../shared/gameEvents';
import type { SessionManager } from './SessionManager';
import type { EstimationManager } from './EstimationManager';
import type { CombatManager } from './CombatManager';

/**
 * Dependencies required by PhaseCoordinator
 */
export interface PhaseCoordinatorDeps {
  eventBus: ScopedEventBus;
  sessionManager: SessionManager;
  estimationManager: EstimationManager;
  combatManager: CombatManager;
}

/**
 * Context for phase transitions (for observability)
 */
export interface TransitionContext {
  reason: string;
  initiator?: string; // playerId if user-triggered
  metadata?: Record<string, any>;
}

/**
 * PhaseCoordinator manages game phase state and transitions
 */
export class PhaseCoordinator {
  // Dependencies
  private readonly eventBus: ScopedEventBus;
  private readonly sessionManager: SessionManager;
  private readonly estimationManager: EstimationManager;
  private readonly combatManager: CombatManager;

  /**
   * State machine: allowed phase transitions
   * Maps current phase → array of valid next phases
   */
  private readonly NORMAL_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
    lobby: ['avatar_selection'],
    avatar_selection: ['battle'],
    battle: ['reveal', 'game_over'],
    scoring: ['reveal'], // Legacy phase, rarely used
    reveal: ['discussion'],
    discussion: ['victory', 'next_level'],
    victory: ['lobby'],
    next_level: ['battle'],
    game_over: ['lobby'],
  };

  constructor(deps: PhaseCoordinatorDeps) {
    this.eventBus = deps.eventBus;
    this.sessionManager = deps.sessionManager;
    this.estimationManager = deps.estimationManager;
    this.combatManager = deps.combatManager;

    // Setup event listeners for domain events
    this.setupEventListeners();
  }

  /**
   * Transition a lobby to a new phase
   * @param lobby Lobby to transition
   * @param targetPhase Phase to transition to
   * @param context Optional context for observability
   */
  transitionTo(lobby: Lobby, targetPhase: GamePhase, context?: TransitionContext): void {
    const currentPhase = lobby.gamePhase;

    // Validate transition is allowed
    if (!this.canTransition(currentPhase, targetPhase)) {
      this.emitRejection(lobby.id, currentPhase, targetPhase, 'Invalid state machine transition');
      console.warn(
        `[PhaseCoordinator] Rejected transition ${currentPhase} → ${targetPhase} for lobby ${lobby.id}: Invalid state machine transition`
      );
      return;
    }

    // Re-validate conditions for specific transitions
    if (!this.validateTransitionConditions(lobby.id, currentPhase, targetPhase)) {
      this.emitRejection(
        lobby.id,
        currentPhase,
        targetPhase,
        'Transition conditions not met (re-validation failed)'
      );
      console.warn(
        `[PhaseCoordinator] Rejected transition ${currentPhase} → ${targetPhase} for lobby ${lobby.id}: Conditions not met`
      );
      return;
    }

    // Execute transition
    const oldPhase = lobby.gamePhase;
    lobby.gamePhase = targetPhase;

    // Log transition
    console.log({
      event: 'phase_transition',
      lobbyId: lobby.id,
      from: oldPhase,
      to: targetPhase,
      reason: context?.reason ?? 'unknown',
      initiator: context?.initiator,
      timestamp: Date.now(),
    });

    // Emit phase changed event
    this.eventBus.emit('phase:changed', {
      lobbyId: lobby.id,
      oldPhase,
      newPhase: targetPhase,
      reason: context?.reason ?? 'phase_transition',
      initiator: context?.initiator,
    });
  }

  /**
   * Check if a transition is allowed by state machine rules
   * @param currentPhase Current phase
   * @param targetPhase Target phase
   * @returns True if transition is allowed
   */
  canTransition(currentPhase: GamePhase, targetPhase: GamePhase): boolean {
    // Emergency transition: any phase can go to lobby (abandon quest)
    if (targetPhase === 'lobby') {
      return true;
    }

    // Check normal state machine rules
    const allowedTransitions = this.NORMAL_TRANSITIONS[currentPhase] || [];
    return allowedTransitions.includes(targetPhase);
  }

  /**
   * Validate conditions for specific transitions
   * Re-validates domain state before allowing transition (prevents stale events)
   * @param lobbyId Lobby ID
   * @param currentPhase Current phase
   * @param targetPhase Target phase
   * @returns True if conditions are met
   */
  private validateTransitionConditions(
    lobbyId: string,
    currentPhase: GamePhase,
    targetPhase: GamePhase
  ): boolean {
    // battle → reveal: require all votes cast
    if (currentPhase === 'battle' && targetPhase === 'reveal') {
      return this.canTransitionToReveal(lobbyId);
    }

    // battle/reveal/discussion → game_over: require all players downed
    if (targetPhase === 'game_over') {
      return this.canTransitionToGameOver(lobbyId);
    }

    // discussion → victory/next_level: require consensus
    if (currentPhase === 'discussion' && (targetPhase === 'victory' || targetPhase === 'next_level')) {
      return this.canTransitionToVictory(lobbyId);
    }

    // Default: allow if state machine allows it
    return true;
  }

  /**
   * Check if can transition to reveal phase
   * Validates all eligible voters have submitted votes
   */
  private canTransitionToReveal(lobbyId: string): boolean {
    // Note: EstimationManager will have this method added in Task 1.3
    // For now, return true (will be implemented)
    return true;
  }

  /**
   * Check if can transition to game_over phase
   * Validates all players are downed
   */
  private canTransitionToGameOver(lobbyId: string): boolean {
    // Note: CombatManager will have this method added in Task 1.3
    // For now, return true (will be implemented)
    return true;
  }

  /**
   * Check if can transition to victory/next_level
   * Validates consensus has been reached
   */
  private canTransitionToVictory(lobbyId: string): boolean {
    // TODO: Add validation once consensus detection is implemented
    return true;
  }

  /**
   * Setup event listeners for domain events that trigger transitions
   */
  private setupEventListeners(): void {
    // Estimation: all votes cast → reveal
    this.eventBus.on('estimation:all_votes_cast', this.handleAllVotesCast.bind(this));

    // Estimation: voting timeout → reveal
    this.eventBus.on('estimation:voting_timeout', this.handleVotingTimeout.bind(this));

    // Combat: all players downed → game_over
    this.eventBus.on('combat:all_players_downed', this.handleAllPlayersDowned.bind(this));
  }

  /**
   * Handle all votes cast event
   */
  private handleAllVotesCast(payload: EstimationAllVotesCastPayload): void {
    const lobby = this.sessionManager.getLobby(payload.lobbyId);
    if (!lobby) {
      console.warn(`[PhaseCoordinator] Lobby ${payload.lobbyId} not found for all_votes_cast event`);
      return;
    }

    if (lobby.gamePhase !== 'battle') {
      console.warn(
        `[PhaseCoordinator] Ignoring all_votes_cast for lobby ${payload.lobbyId} in phase ${lobby.gamePhase}`
      );
      return;
    }

    this.transitionTo(lobby, 'reveal', {
      reason: 'all_votes_cast',
      metadata: { voteCount: payload.voteCount },
    });
  }

  /**
   * Handle voting timeout event
   */
  private handleVotingTimeout(payload: EstimationVotingTimeoutPayload): void {
    const lobby = this.sessionManager.getLobby(payload.lobbyId);
    if (!lobby) {
      console.warn(`[PhaseCoordinator] Lobby ${payload.lobbyId} not found for voting_timeout event`);
      return;
    }

    if (lobby.gamePhase !== 'battle') {
      console.warn(
        `[PhaseCoordinator] Ignoring voting_timeout for lobby ${payload.lobbyId} in phase ${lobby.gamePhase}`
      );
      return;
    }

    this.transitionTo(lobby, 'reveal', {
      reason: 'voting_timeout',
      metadata: {
        submittedCount: payload.submittedCount,
        totalCount: payload.totalCount,
      },
    });
  }

  /**
   * Handle all players downed event
   */
  private handleAllPlayersDowned(payload: CombatAllPlayersDownedPayload): void {
    const lobby = this.sessionManager.getLobby(payload.lobbyId);
    if (!lobby) {
      console.warn(`[PhaseCoordinator] Lobby ${payload.lobbyId} not found for all_players_downed event`);
      return;
    }

    // Can transition to game_over from battle, reveal, or discussion
    if (!['battle', 'reveal', 'discussion'].includes(lobby.gamePhase)) {
      console.warn(
        `[PhaseCoordinator] Ignoring all_players_downed for lobby ${payload.lobbyId} in phase ${lobby.gamePhase}`
      );
      return;
    }

    this.transitionTo(lobby, 'game_over', {
      reason: 'all_players_downed',
      metadata: { downedCount: payload.downedCount },
    });
  }

  /**
   * Emit transition rejected event
   */
  private emitRejection(
    lobbyId: string,
    fromPhase: GamePhase,
    toPhase: GamePhase,
    reason: string
  ): void {
    this.eventBus.emit('phase:transition_rejected', {
      lobbyId,
      fromPhase,
      toPhase,
      reason,
    });
  }
}
