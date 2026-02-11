/**
 * Domain Manager Barrel Export
 *
 * Central export point for all domain managers and their dependencies.
 * Provides shared infrastructure (eventBus) and domain manager instances.
 */

import { ScopedEventBus } from '../events';
import { LobbyEventSequencer, createClientEventEmitter, ClientEventEmitter } from '../events';
import { SessionManager } from './SessionManager';
import { EstimationManager } from './EstimationManager';
import { CombatManager } from './CombatManager';
import { ProgressionManager } from './ProgressionManager';
import { ClassMasteryManager } from './ClassMasteryManager';
import { AbilityManager } from './AbilityManager';
import { Server } from 'socket.io';
import { storage } from '../storage';

// Create shared event bus instance
const eventBus = new ScopedEventBus();

// Create sequencer for event ordering
const lobbyEventSequencer = new LobbyEventSequencer();

// Player-to-User ID mapping for XP persistence
const playerUserIdMap = new Map<string, number>();

// ClientEventEmitter will be initialized when io is available
let clientEventEmitter: ClientEventEmitter | null = null;

// Function to initialize ClientEventEmitter (called from websocket.ts after io is created)
export function initializeClientEventEmitter(io: Server): ClientEventEmitter {
  if (clientEventEmitter) {
    return clientEventEmitter;
  }

  clientEventEmitter = createClientEventEmitter({
    io,
    eventBus,
    sequencer: lobbyEventSequencer
  });

  return clientEventEmitter;
}

// Getter for clientEventEmitter (throws if not initialized)
export function getClientEventEmitter(): ClientEventEmitter {
  if (!clientEventEmitter) {
    throw new Error('ClientEventEmitter not initialized. Call initializeClientEventEmitter first.');
  }
  return clientEventEmitter;
}

// Create domain manager instances with shared eventBus
const sessionManager = new SessionManager({ eventBus });
const estimationManager = new EstimationManager({
  eventBus,
  // Provide team lookup callback
  getPlayerTeam: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.team ?? null;
  }
});
const classMasteryManager = new ClassMasteryManager({
  eventBus,
  getPlayerClass: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.avatar ?? null;
  },
  getVoters: (lobbyId: string) => {
    const estimation = estimationManager.getEstimation(lobbyId);
    if (!estimation) return [];
    const voters: string[] = [];
    for (const team of ['developers', 'qa'] as const) {
      const teamState = estimation.teams[team];
      if (teamState) {
        for (const [playerId] of teamState.votes) {
          voters.push(playerId);
        }
      }
    }
    return voters;
  },
  storage,
  getUserId: (lobbyId: string, playerId: string) => {
    return playerUserIdMap.get(playerId);
  },
});
const combatManager = new CombatManager({
  eventBus,
  // Provide team lookup callback
  getPlayerTeam: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.team ?? null;
  },
  // Provide class lookup callback
  getPlayerClass: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.avatar ?? null;
  },
  // Provide class mastery manager dependency
  classMasteryManager: {
    getMasteryMultiplier: (lobbyId: string, playerId: string, avatarClass) => {
      if (!avatarClass) return 1.0;
      return classMasteryManager.getMasteryMultiplier(lobbyId, playerId, avatarClass);
    },
    getUnlockedAbilities: (lobbyId: string, playerId: string, avatarClass) => {
      if (!avatarClass) return [];
      return classMasteryManager.getUnlockedAbilities(lobbyId, playerId, avatarClass);
    },
  },
  // Provide progression manager dependency for level-based difficulty scaling
  progressionManager: {
    getPlayerLevel: (lobbyId: string, playerId: string) => {
      return progressionManager.getPlayerLevel(lobbyId, playerId);
    },
  },
});
const progressionManager = new ProgressionManager({
  eventBus,
  getVoters: (lobbyId: string) => {
    const estimation = estimationManager.getEstimation(lobbyId);
    if (!estimation) return [];
    const voters: string[] = [];
    for (const team of ['developers', 'qa'] as const) {
      const teamState = estimation.teams[team];
      if (teamState) {
        for (const [playerId] of teamState.votes) {
          voters.push(playerId);
        }
      }
    }
    return voters;
  },
  storage,
  getUserId: (lobbyId: string, playerId: string) => {
    return playerUserIdMap.get(playerId);
  },
});

const abilityManager = new AbilityManager({
  eventBus,
  combatManager: {
    getCombatState: (lobbyId: string) => combatManager.getCombatState(lobbyId),
    canUseClassAbility: (lobbyId: string, playerId: string, abilityId: string) =>
      combatManager.canUseClassAbility(lobbyId, playerId, abilityId),
  },
  getPlayerClass: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.avatar ?? null;
  },
});

// Reset ability cooldowns when combat is initialized (new ticket)
eventBus.on('combat:battle_initialized', (payload) => {
  abilityManager.resetCooldowns(payload.lobbyId);
});

// Cleanup ability state when lobby is destroyed
eventBus.on('session:lobby_destroyed', (payload) => {
  abilityManager.cleanupLobby(payload.lobbyId);
});

// Apply damage effects from abilities to boss HP
eventBus.on('ability:effect_applied', (payload) => {
  if (payload.effectType === 'damage') {
    // Apply damage to boss via CombatManager
    combatManager.applyAbilityDamageToBoss(payload.lobbyId, payload.playerId, payload.value);
  }

  if (payload.effectType === 'heal') {
    // Apply healing through CombatManager for each target
    for (const targetId of payload.targetIds) {
      const combatState = combatManager.getCombatState(payload.lobbyId);
      if (!combatState) break;
      const targetState = combatState.players.get(targetId);
      if (targetState && targetState.combatState === 'fighting') {
        const oldHp = targetState.hp;
        targetState.hp = Math.min(targetState.maxHp, targetState.hp + payload.value);
        const actualHeal = targetState.hp - oldHp;
        if (actualHeal > 0) {
          eventBus.emit('combat:player_healed', {
            lobbyId: payload.lobbyId,
            playerId: targetId,
            healerId: payload.playerId,
            healAmount: actualHeal,
            newHealth: targetState.hp,
          });
        }
      }
    }
  }

  if (payload.effectType === 'taunt') {
    // Massive threat boost (use 'damage' type for threat calculation)
    const bossAI = combatManager.getBossAI(payload.lobbyId);
    const combatState = combatManager.getCombatState(payload.lobbyId);
    if (bossAI && combatState?.boss?.threatTable) {
      bossAI.recordThreat(combatState.boss.threatTable, payload.playerId, 'damage', 500);
    }
  }
});

// Export instances
export { eventBus, sessionManager, estimationManager, combatManager, progressionManager, classMasteryManager, abilityManager };

// Export player-user ID mapping helpers
export function registerPlayerUserId(playerId: string, userId: number): void {
  playerUserIdMap.set(playerId, userId);
}

export function getPlayerUserId(playerId: string): number | undefined {
  return playerUserIdMap.get(playerId);
}

// Export sequencer for testing if needed
export { lobbyEventSequencer };

// Re-export types
export type { SessionManager, SessionManagerDeps, CreateLobbyOptions } from './SessionManager';
export type { EstimationManager, EstimationManagerDeps } from './EstimationManager';
export type { CombatManager, CombatManagerDeps } from './CombatManager';
export type { ProgressionManager, ProgressionManagerDeps } from './ProgressionManager';
export type { ClassMasteryManager, ClassMasteryManagerDeps } from './ClassMasteryManager';
export type { AbilityManager, AbilityManagerDeps } from './AbilityManager';

// Re-export errors
export * from '../errors/SessionErrors';
export * from '../errors/EstimationErrors';
export * from '../errors/CombatErrors';

// Re-export boss-ai module
export { BossAI, getBossTypeFromSprite, getBossBehavior, BOSS_BEHAVIORS } from './boss-ai';
export type { BossType, BossPhaseNumber, AttackPattern, BossBehavior, BattleContext } from './boss-ai';
