/**
 * AbilityManager Domain
 *
 * Manages server-authoritative cooldown tracking and ability validation.
 * Validates mastery tier gating, combat state, and emits ability effect events.
 *
 * Responsibilities:
 * - Track cooldown state per player per ability
 * - Validate ability unlock status via CombatManager.canUseClassAbility
 * - Validate player combat state before ability use
 * - Apply ability effects via event emission
 * - Reset cooldowns on new ticket or lobby cleanup
 */

import { ScopedEventBus } from '../events';
import type { LobbyCombatState, PlayerCombat } from './CombatManager';
import { AvatarClass } from '../../shared/gameEvents';
import {
  AbilityDefinition,
  AbilityEffectType,
  getAbilityConfig,
} from '../../shared/abilityTypes';

/**
 * Dependencies required by AbilityManager
 */
export interface AbilityManagerDeps {
  eventBus: ScopedEventBus;
  combatManager: {
    getCombatState: (lobbyId: string) => LobbyCombatState | undefined;
    canUseClassAbility: (lobbyId: string, playerId: string, abilityId: string) => boolean;
  };
  getPlayerClass: (lobbyId: string, playerId: string) => AvatarClass | null;
}

/**
 * Cooldown state tracking
 */
interface CooldownState {
  abilityId: string;
  startedAt: number;
  durationMs: number;
  expiresAt: number;
}

/**
 * AbilityManager manages cooldowns and ability validation
 */
export class AbilityManager {
  // State: Map<lobbyId, Map<playerId, Map<abilityId, CooldownState>>>
  private cooldowns = new Map<string, Map<string, Map<string, CooldownState>>>();

  private readonly eventBus: ScopedEventBus;
  private readonly deps: AbilityManagerDeps;

  constructor(deps: AbilityManagerDeps) {
    this.deps = deps;
    this.eventBus = deps.eventBus;
  }

  /**
   * Player attempts to use an ability
   * Validates: combat state, mastery unlock, cooldown
   * Applies effect and starts cooldown on success
   *
   * @param lobbyId Lobby identifier
   * @param playerId Player identifier
   * @param abilityId Ability ID to use
   * @returns Result with success flag and optional error message
   */
  public useAbility(
    lobbyId: string,
    playerId: string,
    abilityId: string
  ): { success: boolean; error?: string } {
    // 1. Validate player has a class
    const playerClass = this.deps.getPlayerClass(lobbyId, playerId);
    if (!playerClass) {
      return { success: false, error: 'No class selected' };
    }

    // 2. Get ability definition
    const abilityDef = getAbilityConfig(playerClass, abilityId);
    if (!abilityDef) {
      return { success: false, error: 'Ability not found' };
    }

    // 3. Validate player is in combat
    const combatState = this.deps.combatManager.getCombatState(lobbyId);
    if (!combatState) {
      return { success: false, error: 'Combat not active' };
    }

    const playerState = combatState.players.get(playerId);
    if (!playerState || playerState.combatState !== 'fighting') {
      return { success: false, error: 'Player not in combat' };
    }

    // 4. Validate ability unlocked (mastery tier check)
    const canUse = this.deps.combatManager.canUseClassAbility(
      lobbyId,
      playerId,
      abilityId
    );
    if (!canUse) {
      return { success: false, error: 'Ability not unlocked' };
    }

    // 5. Validate cooldown not active
    if (this.isOnCooldown(lobbyId, playerId, abilityId)) {
      const remaining = this.getRemainingCooldown(lobbyId, playerId, abilityId);
      return { success: false, error: `On cooldown (${remaining}s remaining)` };
    }

    // 6. Apply ability effect
    this.applyAbilityEffect(lobbyId, playerId, playerClass, abilityDef);

    // 7. Start cooldown
    this.startCooldown(lobbyId, playerId, abilityId, abilityDef.cooldownMs);

    // 8. Emit events
    this.eventBus.emit('ability:used', {
      lobbyId,
      playerId,
      abilityId,
      abilityName: abilityDef.name,
      effectType: abilityDef.effectType,
      targetType: abilityDef.targetType,
    });

    this.eventBus.emit('ability:cooldown_started', {
      lobbyId,
      playerId,
      abilityId,
      durationMs: abilityDef.cooldownMs,
      expiresAt: Date.now() + abilityDef.cooldownMs,
    });

    return { success: true };
  }

  /**
   * Check if an ability is currently on cooldown
   */
  public isOnCooldown(lobbyId: string, playerId: string, abilityId: string): boolean {
    const playerCooldowns = this.cooldowns.get(lobbyId)?.get(playerId);
    if (!playerCooldowns) return false;

    const cooldown = playerCooldowns.get(abilityId);
    if (!cooldown) return false;

    return Date.now() < cooldown.expiresAt;
  }

  /**
   * Get remaining cooldown time in seconds
   */
  public getRemainingCooldown(lobbyId: string, playerId: string, abilityId: string): number {
    const playerCooldowns = this.cooldowns.get(lobbyId)?.get(playerId);
    const cooldown = playerCooldowns?.get(abilityId);
    if (!cooldown) return 0;

    const remaining = cooldown.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /**
   * Get all active cooldowns for a player
   */
  public getActiveCooldowns(lobbyId: string, playerId: string): CooldownState[] {
    const playerCooldowns = this.cooldowns.get(lobbyId)?.get(playerId);
    if (!playerCooldowns) return [];

    const now = Date.now();
    return Array.from(playerCooldowns.values()).filter(cd => cd.expiresAt > now);
  }

  /**
   * Reset all cooldowns for a lobby (for new ticket)
   */
  public resetCooldowns(lobbyId: string): void {
    const lobbyCooldowns = this.cooldowns.get(lobbyId);
    if (!lobbyCooldowns) return;

    // Clear all player cooldowns for this lobby
    lobbyCooldowns.forEach(playerCooldowns => {
      playerCooldowns.clear();
    });
  }

  /**
   * Cleanup all state for a lobby
   */
  public cleanupLobby(lobbyId: string): void {
    this.cooldowns.delete(lobbyId);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Start cooldown timer for an ability
   */
  private startCooldown(
    lobbyId: string,
    playerId: string,
    abilityId: string,
    durationMs: number
  ): void {
    if (!this.cooldowns.has(lobbyId)) {
      this.cooldowns.set(lobbyId, new Map());
    }
    const lobbyCooldowns = this.cooldowns.get(lobbyId)!;

    if (!lobbyCooldowns.has(playerId)) {
      lobbyCooldowns.set(playerId, new Map());
    }
    const playerCooldowns = lobbyCooldowns.get(playerId)!;

    playerCooldowns.set(abilityId, {
      abilityId,
      startedAt: Date.now(),
      durationMs,
      expiresAt: Date.now() + durationMs,
    });
  }

  /**
   * Apply ability effect based on effect type
   * Emits ability:effect_applied events for socket handler to consume
   */
  private applyAbilityEffect(
    lobbyId: string,
    playerId: string,
    playerClass: AvatarClass,
    abilityDef: AbilityDefinition
  ): void {
    const combatState = this.deps.combatManager.getCombatState(lobbyId);
    if (!combatState || !combatState.boss) return;

    // Determine target IDs based on effect and target type
    const targetIds = this.getTargetIds(lobbyId, playerId, abilityDef.effectType, abilityDef.targetType);

    // Emit effect_applied event for socket handler to translate into game state changes
    this.eventBus.emit('ability:effect_applied', {
      lobbyId,
      playerId,
      abilityId: abilityDef.id,
      effectType: abilityDef.effectType,
      targetIds,
      value: abilityDef.power,
    });
  }

  /**
   * Determine target IDs for an ability based on effect and target type
   */
  private getTargetIds(
    lobbyId: string,
    playerId: string,
    effectType: AbilityEffectType,
    targetType: 'self' | 'single' | 'party' | 'boss'
  ): string[] {
    const combatState = this.deps.combatManager.getCombatState(lobbyId);
    if (!combatState) return [];

    switch (targetType) {
      case 'boss':
        return ['boss'];

      case 'self':
        return [playerId];

      case 'party': {
        // All fighting players
        return Array.from(combatState.players.values())
          .filter((p: PlayerCombat) => p.combatState === 'fighting')
          .map((p: PlayerCombat) => p.playerId);
      }

      case 'single': {
        // For heal effects, target lowest HP player
        // For other effects, target self
        if (effectType === 'heal') {
          const fightingPlayers = Array.from(combatState.players.values())
            .filter((p: PlayerCombat) => p.combatState === 'fighting')
            .sort((a: PlayerCombat, b: PlayerCombat) => a.hp - b.hp);

          if (fightingPlayers.length > 0) {
            return [fightingPlayers[0].playerId];
          }
        }
        return [playerId];
      }

      default:
        return [];
    }
  }
}
