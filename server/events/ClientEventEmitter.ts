/**
 * ClientEventEmitter
 *
 * Bridges internal domain events to Socket.IO client emissions.
 * Adds sequence numbers and timestamps for ordered event delivery.
 *
 * Architecture:
 * - Subscribes to internal domain events from ScopedEventBus
 * - Emits corresponding Socket.IO events to clients
 * - Enriches payloads with seq and timestamp for ordering
 * - Buffers events for missed event recovery
 * - Handles cleanup when lobbies are destroyed
 *
 * Security:
 * - Vote values are MASKED (hasVoted only) until discussion phase
 * - Full vote reveals only on estimation:discussion_started
 */

import { Server } from 'socket.io';
import { ScopedEventBus } from './ScopedEventBus';
import { LobbyEventSequencer, BufferedEvent } from './LobbyEventSequencer';
import { DomainEventMap } from './eventTypes';
import { Lobby } from '../../shared/gameEvents';

export interface ClientEventEmitterDeps {
  io: Server;
  eventBus: ScopedEventBus;
  sequencer: LobbyEventSequencer;
}

/**
 * ClientEventEmitter
 *
 * Transforms internal domain events into Socket.IO client events with sequencing.
 *
 * Event flow:
 * 1. Domain manager emits internal event (e.g., estimation:vote_cast)
 * 2. ClientEventEmitter receives via subscribed listener
 * 3. Gets next sequence number for lobby
 * 4. Adds seq + timestamp to payload
 * 5. Buffers event for recovery
 * 6. Emits to Socket.IO room
 *
 * Vote masking:
 * - estimation:vote_cast emits { playerId, team, hasVoted: true } (NO value)
 * - estimation:discussion_started emits revealed votes for that team
 */
export class ClientEventEmitter {
  private io: Server;
  private eventBus: ScopedEventBus;
  private sequencer: LobbyEventSequencer;

  constructor(deps: ClientEventEmitterDeps) {
    this.io = deps.io;
    this.eventBus = deps.eventBus;
    this.sequencer = deps.sequencer;

    this.setupInternalEventListeners();
  }

  /**
   * Subscribe to all internal domain events and emit corresponding client events
   */
  private setupInternalEventListeners(): void {
    // =============================================================================
    // Session Events
    // =============================================================================

    this.eventBus.on('session:player_joined', (payload) => {
      this.emitToLobby(payload.lobbyId, 'session:player_joined', {
        playerId: payload.playerId,
        playerName: payload.playerName,
        team: payload.team,
        avatar: payload.avatar,
      });
    });

    this.eventBus.on('session:player_left', (payload) => {
      this.emitToLobby(payload.lobbyId, 'session:player_left', {
        playerId: payload.playerId,
      });
    });

    this.eventBus.on('session:host_changed', (payload) => {
      this.emitToLobby(payload.lobbyId, 'session:host_changed', {
        oldHostId: payload.oldHostId,
        newHostId: payload.newHostId,
      });
    });

    this.eventBus.on('session:phase_changed', (payload) => {
      this.emitToLobby(payload.lobbyId, 'session:phase_changed', {
        oldPhase: payload.oldPhase,
        newPhase: payload.newPhase,
      });
    });

    this.eventBus.on('session:team_changed', (payload) => {
      this.emitToLobby(payload.lobbyId, 'session:team_changed', {
        playerId: payload.playerId,
        oldTeam: payload.oldTeam,
        newTeam: payload.newTeam,
      });
    });

    this.eventBus.on('session:lobby_destroyed', (payload) => {
      // Cleanup sequencer - NO client emit
      this.sequencer.cleanup(payload.lobbyId);
    });

    // =============================================================================
    // Estimation Events
    // =============================================================================

    this.eventBus.on('estimation:vote_cast', (payload) => {
      // SECURITY: Mask vote value - only emit hasVoted flag
      this.emitToLobby(payload.lobbyId, 'estimation:vote_cast', {
        playerId: payload.playerId,
        team: payload.team,
        hasVoted: true,
      });
    });

    this.eventBus.on('estimation:team_consensus_reached', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:consensus_reached', {
        team: payload.team,
        consensusValue: payload.consensusValue,
      });
    });

    this.eventBus.on('estimation:timer_started', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:timer_started', {
        team: payload.team,
        endsAt: payload.startedAt + payload.durationMs,
        durationMs: payload.durationMs,
      });
    });

    this.eventBus.on('estimation:timer_paused', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:timer_paused', {
        team: payload.team,
        remainingMs: payload.remainingMs,
      });
    });

    this.eventBus.on('estimation:timer_resumed', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:timer_resumed', {
        team: payload.team,
        endsAt: Date.now() + payload.remainingMs,
      });
    });

    this.eventBus.on('estimation:timer_expired', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:timer_expired', {
        team: payload.team,
        votedCount: payload.votedCount,
        eligibleCount: payload.eligibleCount,
      });
    });

    this.eventBus.on('estimation:estimate_forced', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:estimate_forced', {
        team: payload.team,
        consensusValue: payload.consensusValue,
      });
    });

    this.eventBus.on('estimation:discussion_started', (payload) => {
      // Emit revealed votes for the team that entered discussion
      // TODO: In Plan 05-04, this will be populated from actual vote state
      this.emitToLobby(payload.lobbyId, 'estimation:discussion_started', {
        team: payload.team,
      });
    });

    this.eventBus.on('estimation:discussion_timer_started', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:discussion_timer_started', {
        durationMs: payload.durationMs,
        endsAt: payload.endsAt,
      });
    });

    this.eventBus.on('estimation:discussion_ended', (payload) => {
      this.emitToLobby(payload.lobbyId, 'estimation:discussion_ended', {
        reason: payload.reason,
        finalEstimate: payload.finalEstimate,
      });
    });

    // =============================================================================
    // Combat Events
    // =============================================================================

    this.eventBus.on('combat:boss_damaged', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:boss_damaged', {
        playerId: payload.playerId,
        damage: payload.damage,
        newHp: payload.bossHealth,
      });
    });

    this.eventBus.on('combat:boss_healed', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:boss_healed', {
        healAmount: payload.healAmount,
        newHp: payload.bossHealth,
      });
    });

    this.eventBus.on('combat:boss_enraged', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:boss_enraged', {
        message: payload.message,
      });
    });

    this.eventBus.on('combat:boss_phase_transition', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:boss_phase_transition', {
        newPhase: payload.newPhase,
        previousPhase: payload.previousPhase,
        message: payload.message,
        bossType: payload.bossType,
      });
    });

    this.eventBus.on('combat:boss_telegraph', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:boss_telegraph', {
        targetId: payload.targetId,
        attackType: payload.attackType,
        message: payload.message,
        delayMs: payload.delayMs,
        visualEffect: payload.visualEffect,
        bossType: payload.bossType,
      });
    });

    this.eventBus.on('combat:boss_defeated', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:boss_defeated', {});
    });

    this.eventBus.on('combat:player_damaged', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:player_damaged', {
        playerId: payload.playerId,
        damage: payload.damage,
        newHp: payload.playerHealth,
        source: 'boss', // Default source if not provided
      });
    });

    this.eventBus.on('combat:player_downed', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:player_downed', {
        playerId: payload.playerId,
        countdownSeconds: payload.countdownSeconds,
      });
    });

    this.eventBus.on('combat:player_revived', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:player_revived', {
        playerId: payload.playerId,
        reviverId: payload.reviverId,
        newHp: 50, // Standard revive HP amount
      });
    });

    this.eventBus.on('combat:revival_started', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:revival_started', {
        reviverId: payload.reviverId,
        targetId: payload.targetId,
        durationMs: payload.durationMs,
      });
    });

    this.eventBus.on('combat:revival_cancelled', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:revival_cancelled', {
        reviverId: payload.reviverId,
        targetId: payload.targetId,
        reason: payload.reason,
      });
    });

    this.eventBus.on('combat:player_entered_battle', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:player_entered_battle', {
        playerId: payload.playerId,
      });
    });

    this.eventBus.on('combat:modifier_updated', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:modifier_updated', {
        modifier: payload.modifier,
      });
    });

    this.eventBus.on('combat:countdown_started', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:countdown_started', {
        durationSeconds: payload.durationSeconds,
        startedAt: payload.startedAt,
      });
    });

    this.eventBus.on('combat:countdown_tick', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:countdown_tick', {
        remainingSeconds: payload.remainingSeconds,
        multiplier: payload.multiplier,
      });
    });

    this.eventBus.on('combat:countdown_complete', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:countdown_complete', {
        finalMultiplier: payload.finalMultiplier,
      });
    });

    this.eventBus.on('combat:team_attack', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:team_attack', {
        damage: payload.damage,
        multiplier: payload.multiplier,
        newBossHp: payload.newBossHp,
      });
    });

    // =============================================================================
    // Minion Events
    // =============================================================================

    this.eventBus.on('combat:minion_spawned', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:minion_spawned', {
        playerId: payload.playerId,
        avatar: payload.avatar,
        hp: payload.hp,
        maxHp: payload.maxHp,
      });
    });

    this.eventBus.on('combat:minion_attack', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:minion_attack', {
        minionPlayerId: payload.minionPlayerId,
        targetId: payload.targetId,
        damage: payload.damage,
        attackType: payload.attackType,
      });
    });

    this.eventBus.on('combat:minion_heal_boss', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:minion_heal_boss', {
        minionPlayerId: payload.minionPlayerId,
        healAmount: payload.healAmount,
        newBossHp: payload.newBossHp,
      });
    });

    this.eventBus.on('combat:minion_damaged', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:minion_damaged', {
        playerId: payload.playerId,
        damage: payload.damage,
        newHp: payload.newHp,
        attackerId: payload.attackerId,
      });
    });

    this.eventBus.on('combat:minion_killed', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combat:minion_killed', {
        playerId: payload.playerId,
        killerId: payload.killerId,
        respawnInSeconds: payload.respawnInSeconds,
      });
    });

    this.eventBus.on('combat:cleanup_complete', (payload) => {
      // Cleanup sequencer - NO client emit
      this.sequencer.cleanup(payload.lobbyId);
    });

    // =============================================================================
    // Progression Events
    // =============================================================================

    this.eventBus.on('progression:xp_awarded', (payload) => {
      this.emitToLobby(payload.lobbyId, 'progression:xp_awarded', {
        playerId: payload.playerId,
        amount: payload.amount,
        source: payload.source,
        newTotal: payload.newTotal,
      });
    });

    this.eventBus.on('progression:level_up', (payload) => {
      this.emitToLobby(payload.lobbyId, 'progression:level_up', {
        playerId: payload.playerId,
        oldLevel: payload.oldLevel,
        newLevel: payload.newLevel,
      });
    });

    // =============================================================================
    // Class Mastery Events
    // =============================================================================

    this.eventBus.on('class_mastery:xp_awarded', (payload) => {
      this.emitToLobby(payload.lobbyId, 'class_mastery:xp_awarded', {
        playerId: payload.playerId,
        avatarClass: payload.avatarClass,
        amount: payload.amount,
        source: payload.source,
        newTotal: payload.newTotal,
      });
    });

    this.eventBus.on('class_mastery:tier_up', (payload) => {
      this.emitToLobby(payload.lobbyId, 'class_mastery:tier_up', {
        playerId: payload.playerId,
        avatarClass: payload.avatarClass,
        oldTier: payload.oldTier,
        newTier: payload.newTier,
      });
    });

    // =============================================================================
    // Ability Events
    // =============================================================================

    this.eventBus.on('ability:used', (payload) => {
      this.emitToLobby(payload.lobbyId, 'ability:used', {
        playerId: payload.playerId,
        abilityId: payload.abilityId,
        abilityName: payload.abilityName,
        effectType: payload.effectType,
        targetType: payload.targetType,
      });
    });

    this.eventBus.on('ability:cooldown_started', (payload) => {
      this.emitToLobby(payload.lobbyId, 'ability:cooldown_started', {
        playerId: payload.playerId,
        abilityId: payload.abilityId,
        durationMs: payload.durationMs,
        expiresAt: payload.expiresAt,
      });
    });

    this.eventBus.on('ability:effect_applied', (payload) => {
      this.emitToLobby(payload.lobbyId, 'ability:effect_applied', {
        playerId: payload.playerId,
        abilityId: payload.abilityId,
        effectType: payload.effectType,
        targetIds: payload.targetIds,
        value: payload.value,
      });
    });

    // =============================================================================
    // Combo Events
    // =============================================================================

    this.eventBus.on('combo:triggered', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combo:triggered', {
        comboId: payload.comboId,
        comboName: payload.comboName,
        triggeringPlayerId: payload.triggeringPlayerId,
        participantPlayerIds: payload.participantPlayerIds,
        damage: payload.damage,
        damageMultiplier: payload.damageMultiplier,
        visualEffect: payload.visualEffect,
      });
    });

    this.eventBus.on('combo:consensus_ultimate', (payload) => {
      this.emitToLobby(payload.lobbyId, 'combo:consensus_ultimate', {
        damage: payload.damage,
        damageMultiplier: payload.damageMultiplier,
        votingDurationMs: payload.votingDurationMs,
      });
    });

    // =============================================================================
    // Item Events
    // =============================================================================

    this.eventBus.on('item:awarded', (payload) => {
      this.emitToLobby(payload.lobbyId, 'item:awarded', {
        playerId: payload.playerId,
        itemType: payload.itemType,
        newCount: payload.newCount,
      });
    });

    this.eventBus.on('item:used', (payload) => {
      this.emitToLobby(payload.lobbyId, 'item:used', {
        playerId: payload.playerId,
        itemType: payload.itemType,
        remainingCount: payload.remainingCount,
      });
    });

    this.eventBus.on('item:effect_applied', (payload) => {
      this.emitToLobby(payload.lobbyId, 'item:effect_applied', {
        playerId: payload.playerId,
        itemType: payload.itemType,
        effectType: payload.effectType,
        value: payload.value,
        durationMs: payload.durationMs,
        targetIds: payload.targetIds,
      });
    });

    // =============================================================================
    // Stats Events
    // =============================================================================

    this.eventBus.on('stats:session_complete', (payload) => {
      this.emitToLobby(payload.lobbyId, 'stats:session_summary', {
        summaries: payload.summaries,
      });
    });
  }

  /**
   * Emit event to lobby with sequence number and timestamp
   *
   * @param lobbyId - Lobby room identifier
   * @param event - Event name
   * @param data - Event payload
   */
  private emitToLobby(lobbyId: string, event: string, data: any): void {
    const seq = this.sequencer.nextSeq(lobbyId);
    const timestamp = Date.now();

    const payload = {
      ...data,
      seq,
      timestamp,
    };

    // Buffer for recovery
    this.sequencer.bufferEvent(lobbyId, seq, event, payload);

    // Emit to Socket.IO room
    this.io.to(lobbyId).emit(event, payload);
  }

  /**
   * Send full lobby state to client (late join or recovery)
   *
   * @param lobbyId - Lobby identifier
   * @param lobby - Full lobby state
   * @param socketId - Optional specific socket to target
   */
  public sendFullState(lobbyId: string, lobby: Lobby, socketId?: string): void {
    const seq = this.sequencer.getCurrentSeq(lobbyId) || 1;
    const timestamp = Date.now();

    const payload = {
      lobby,
      seq,
      timestamp,
    };

    if (socketId) {
      // Emit to specific socket
      this.io.to(socketId).emit('system:full_state', payload);
    } else {
      // Emit to entire lobby
      this.io.to(lobbyId).emit('system:full_state', payload);
    }
  }

  /**
   * Retrieve events missed by a client
   *
   * @param lobbyId - Lobby identifier
   * @param lastSeq - Last sequence number client received
   * @returns Array of missed events, or null if gap too large
   */
  public getMissedEvents(lobbyId: string, lastSeq: number): BufferedEvent[] | null {
    return this.sequencer.getMissedEvents(lobbyId, lastSeq);
  }

  /**
   * Clean up all data for a lobby
   *
   * @param lobbyId - Lobby identifier
   */
  public cleanup(lobbyId: string): void {
    this.sequencer.cleanup(lobbyId);
  }
}

/**
 * Factory function to create ClientEventEmitter
 *
 * @param deps - Dependencies
 * @returns New ClientEventEmitter instance
 */
export function createClientEventEmitter(deps: ClientEventEmitterDeps): ClientEventEmitter {
  return new ClientEventEmitter(deps);
}
