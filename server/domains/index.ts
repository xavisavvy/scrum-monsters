/**
 * Domain Manager Barrel Export
 *
 * Central export point for all domain managers and their dependencies.
 * Provides shared infrastructure (eventBus) and domain manager instances.
 */

import { ScopedEventBus } from '../events';
import { LobbyEventSequencer, createClientEventEmitter, ClientEventEmitter } from '../events';
import { BuffType } from '../../shared/abilityTypes';
import { SessionManager } from './SessionManager';
import { EstimationManager } from './EstimationManager';
import { CombatManager } from './CombatManager';
import { ProgressionManager } from './ProgressionManager';
import { ClassMasteryManager } from './ClassMasteryManager';
import { AbilityManager } from './AbilityManager';
import { ComboManager } from './ComboManager';
import { ItemManager } from './ItemManager';
import { StatsTracker } from './StatsTracker';
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
  getActivePlayers: (lobbyId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    return lobby.players.map(p => p.id);
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

const comboManager = new ComboManager({
  eventBus,
  combatManager: {
    applyComboMultiplier: (lobbyId: string, comboId: string, damage: number) =>
      combatManager.applyComboMultiplier(lobbyId, comboId, damage),
  },
  getPlayerClass: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.avatar ?? null;
  },
  getVotingStartTime: (lobbyId: string) => {
    const estimation = estimationManager.getEstimation(lobbyId);
    if (!estimation) return null;
    // Get earliest team timer start as voting start time
    const devStart = estimation.teams.developers?.timerStartedAt;
    const qaStart = estimation.teams.qa?.timerStartedAt;
    if (devStart && qaStart) return Math.min(devStart, qaStart);
    return devStart ?? qaStart ?? null;
  },
});

const itemManager = new ItemManager({
  eventBus,
  combatManager: {
    getCombatState: (lobbyId: string) => combatManager.getCombatState(lobbyId),
  },
  getPlayerClass: (lobbyId: string, playerId: string) => {
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.avatar ?? null;
  },
});

const statsTracker = new StatsTracker({
  eventBus,
  storage,
  getUserId: (lobbyId: string, playerId: string) => {
    return playerUserIdMap.get(playerId);
  },
});

// =============================================================================
// Active Buff Tracking (damage_boost, shield, + stored-only: crit_boost, dodge, cooldown_reduction)
// and Active Debuff Tracking (attack_slow — stored; no consumer yet, see deferred-ideas)
// =============================================================================

interface ActiveBuff {
  playerId: string;
  lobbyId: string;
  buffType: BuffType | 'shield'; // widened: crit_boost/dodge/cooldown_reduction stored but no consumer yet
  value: number; // damage_boost: multiplier value, shield: remaining absorption HP
  expiresAt: number; // Date.now() + durationMs
  timeoutHandle: NodeJS.Timeout;
}

// Module-level state
const activeBuffs = new Map<string, ActiveBuff[]>(); // key: `${lobbyId}:${playerId}`

function getBuffKey(lobbyId: string, playerId: string) {
  return `${lobbyId}:${playerId}`;
}

function addBuff(lobbyId: string, playerId: string, buff: Omit<ActiveBuff, 'timeoutHandle'>) {
  const key = getBuffKey(lobbyId, playerId);
  const buffs = activeBuffs.get(key) ?? [];
  // Remove existing buff of same type (refresh, don't stack)
  const filtered = buffs.filter(b => b.buffType !== buff.buffType);
  const handle = setTimeout(() => removeBuff(lobbyId, playerId, buff.buffType), buff.expiresAt - Date.now());
  filtered.push({ ...buff, timeoutHandle: handle });
  activeBuffs.set(key, filtered);
}

function removeBuff(lobbyId: string, playerId: string, buffType: string) {
  const key = getBuffKey(lobbyId, playerId);
  const buffs = activeBuffs.get(key);
  if (!buffs) return;
  const remaining = buffs.filter(b => {
    if (b.buffType === buffType) {
      clearTimeout(b.timeoutHandle);
      return false;
    }
    return true;
  });
  if (remaining.length === 0) activeBuffs.delete(key);
  else activeBuffs.set(key, remaining);
}

function getDamageMultiplier(lobbyId: string, playerId: string): number {
  const key = getBuffKey(lobbyId, playerId);
  const buffs = activeBuffs.get(key);
  if (!buffs) return 1.0;
  const boost = buffs.find(b => b.buffType === 'damage_boost' && b.expiresAt > Date.now());
  return boost ? boost.value : 1.0;
}

function getShieldAbsorption(lobbyId: string, playerId: string): number {
  const key = getBuffKey(lobbyId, playerId);
  const buffs = activeBuffs.get(key);
  if (!buffs) return 0;
  const shield = buffs.find(b => b.buffType === 'shield' && b.expiresAt > Date.now());
  return shield ? shield.value : 0;
}

function reduceShield(lobbyId: string, playerId: string, damage: number): number {
  const key = getBuffKey(lobbyId, playerId);
  const buffs = activeBuffs.get(key);
  if (!buffs) return damage;
  const shield = buffs.find(b => b.buffType === 'shield' && b.expiresAt > Date.now());
  if (!shield) return damage;
  const absorbed = Math.min(shield.value, damage);
  shield.value -= absorbed;
  if (shield.value <= 0) removeBuff(lobbyId, playerId, 'shield');
  return damage - absorbed; // remaining damage after absorption
}

function cleanupBuffs(lobbyId: string) {
  for (const [key, buffs] of activeBuffs) {
    if (key.startsWith(lobbyId + ':')) {
      for (const b of buffs) clearTimeout(b.timeoutHandle);
      activeBuffs.delete(key);
    }
  }
}

// =============================================================================
// Active Debuff Tracking (boss-targeted; separate from player buffs to avoid
// polluting the narrowly-typed ActiveBuff.buffType with debuff categories)
// =============================================================================

interface ActiveDebuff {
  lobbyId: string;
  playerId: string; // caster
  debuffType: string;
  value: number;
  expiresAt: number;
  timeoutHandle: NodeJS.Timeout;
}

// key: `${lobbyId}` — boss debuffs are lobby-scoped (one boss per lobby)
const activeDebuffs = new Map<string, ActiveDebuff[]>();

function addDebuff(
  lobbyId: string,
  playerId: string,
  debuffType: string,
  value: number,
  durationMs: number,
) {
  const existing = activeDebuffs.get(lobbyId) ?? [];
  // Remove existing debuff of same type (refresh, don't stack)
  const filtered = existing.filter(d => d.debuffType !== debuffType);
  const expiresAt = Date.now() + durationMs;
  const handle = setTimeout(() => {
    const debuffs = activeDebuffs.get(lobbyId);
    if (!debuffs) return;
    const remaining = debuffs.filter(d => d.debuffType !== debuffType);
    if (remaining.length === 0) activeDebuffs.delete(lobbyId);
    else activeDebuffs.set(lobbyId, remaining);
  }, durationMs);
  filtered.push({ lobbyId, playerId, debuffType, value, expiresAt, timeoutHandle: handle });
  activeDebuffs.set(lobbyId, filtered);
}

function cleanupDebuffs(lobbyId: string) {
  const debuffs = activeDebuffs.get(lobbyId);
  if (debuffs) {
    for (const d of debuffs) clearTimeout(d.timeoutHandle);
    activeDebuffs.delete(lobbyId);
  }
}

// =============================================================================
// Shared heal helper
// =============================================================================

/**
 * Shared heal loop — applies HP-clamped healing to each target and emits
 * combat:player_healed for targets with actualHeal > 0.
 * Called by both item:effect_applied and ability:effect_applied heal branches
 * so the logic is never duplicated.
 */
function applyHealEffect(
  lobbyId: string,
  targetIds: string[],
  value: number,
  healerId: string,
) {
  for (const targetId of targetIds) {
    const combatState = combatManager.getCombatState(lobbyId);
    if (!combatState) break;
    const targetState = combatState.players.get(targetId);
    if (targetState && targetState.combatState === 'fighting') {
      const oldHp = targetState.hp;
      targetState.hp = Math.min(targetState.maxHp, targetState.hp + value);
      const actualHeal = targetState.hp - oldHp;
      if (actualHeal > 0) {
        eventBus.emit('combat:player_healed', {
          lobbyId,
          playerId: targetId,
          healerId,
          healAmount: actualHeal,
          newHealth: targetState.hp,
        });
      }
    }
  }
}

// Reset ability cooldowns when combat is initialized (new ticket)
eventBus.on('combat:battle_initialized', (payload) => {
  abilityManager.resetCooldowns(payload.lobbyId);
});

// Cleanup ability state when lobby is destroyed
eventBus.on('session:lobby_destroyed', (payload) => {
  abilityManager.cleanupLobby(payload.lobbyId);
});

// Reset combo state when combat is initialized (new ticket)
eventBus.on('combat:battle_initialized', (payload) => {
  comboManager.resetCombos(payload.lobbyId);
});

// Cleanup combo state when lobby is destroyed
eventBus.on('session:lobby_destroyed', (payload) => {
  comboManager.cleanupLobby(payload.lobbyId);
});

// Cleanup item state when lobby is destroyed
eventBus.on('session:lobby_destroyed', (payload) => {
  itemManager.cleanupLobby(payload.lobbyId);
  cleanupBuffs(payload.lobbyId);
  cleanupDebuffs(payload.lobbyId);
  statsTracker.cleanupLobby(payload.lobbyId);
});

// Award items on ticket completion (discussion_ended = ticket done)
eventBus.on('estimation:discussion_ended', (payload) => {
  const lobby = sessionManager.getLobby(payload.lobbyId);
  if (!lobby) return;
  // Award 1 random item to each player in the lobby
  for (const player of lobby.players) {
    if (player.team === 'spectators') continue; // Spectators don't get items
    itemManager.awardItem(payload.lobbyId, player.id);
  }
});

// Apply item effects (mirrors ability:effect_applied pattern)
eventBus.on('item:effect_applied', (payload) => {
  if (payload.effectType === 'heal') {
    // Heal the player who used the item — delegate to shared helper
    applyHealEffect(payload.lobbyId, payload.targetIds, payload.value, payload.playerId);
  } else if (payload.effectType === 'buff') {
    // damage_boost: timed damage multiplier — items currently only grant damage_boost (correct for current item set)
    addBuff(payload.lobbyId, payload.playerId, {
      playerId: payload.playerId,
      lobbyId: payload.lobbyId,
      buffType: 'damage_boost',
      value: payload.value, // 1.5x multiplier
      expiresAt: Date.now() + (payload.durationMs ?? 10000),
    });
  } else if (payload.effectType === 'shield') {
    // shield: timed damage absorption buffer
    addBuff(payload.lobbyId, payload.playerId, {
      playerId: payload.playerId,
      lobbyId: payload.lobbyId,
      buffType: 'shield',
      value: payload.value, // 50 HP absorption
      expiresAt: Date.now() + (payload.durationMs ?? 15000),
    });
  }
});

// Hook damage_boost into boss damage (apply bonus damage on hit)
eventBus.on('combat:boss_damaged', (payload) => {
  // Skip combo damage (prefixed with 'combo:')
  if (payload.playerId.startsWith('combo:')) return;
  const multiplier = getDamageMultiplier(payload.lobbyId, payload.playerId);
  if (multiplier > 1.0) {
    const bonusDamage = Math.floor(payload.damage * (multiplier - 1.0));
    if (bonusDamage > 0) {
      combatManager.applyAbilityDamageToBoss(payload.lobbyId, payload.playerId, bonusDamage);
    }
  }
});

// Wrap CombatManager.applyDamageToPlayer to apply shield absorption
const originalApplyDamage = combatManager.applyDamageToPlayer.bind(combatManager);
combatManager.applyDamageToPlayer = (lobbyId: string, playerId: string, damage: number) => {
  const remainingDamage = reduceShield(lobbyId, playerId, damage);
  if (remainingDamage <= 0) {
    // Shield fully absorbed the damage - emit event but with 0 damage
    eventBus.emit('combat:shield_absorbed', {
      lobbyId,
      playerId,
      absorbed: damage,
      shieldRemaining: getShieldAbsorption(lobbyId, playerId),
    });
    return;
  }
  if (remainingDamage < damage) {
    // Partial absorption
    eventBus.emit('combat:shield_absorbed', {
      lobbyId,
      playerId,
      absorbed: damage - remainingDamage,
      shieldRemaining: getShieldAbsorption(lobbyId, playerId),
    });
  }
  originalApplyDamage(lobbyId, playerId, remainingDamage);
};

// Apply damage effects from abilities to boss HP
eventBus.on('ability:effect_applied', (payload) => {
  if (payload.effectType === 'damage') {
    // Apply damage to boss via CombatManager
    combatManager.applyAbilityDamageToBoss(payload.lobbyId, payload.playerId, payload.value);
  }

  if (payload.effectType === 'heal') {
    // Apply healing through shared helper (same logic as item:effect_applied heal branch)
    applyHealEffect(payload.lobbyId, payload.targetIds, payload.value, payload.playerId);
  }

  if (payload.effectType === 'buff') {
    // Apply a timed buff. Reads buffType from payload (NOT hardcoded — abilities can grant
    // different buff kinds unlike items which always grant damage_boost).
    //
    // damage_boost → consumer exists (getDamageMultiplier → combat:boss_damaged hook)
    // crit_boost   → TODO: consumer in future phase (stored only)
    // dodge        → TODO: consumer in future phase (stored only)
    // cooldown_reduction → TODO: consumer in future phase (stored only)
    addBuff(payload.lobbyId, payload.playerId, {
      playerId: payload.playerId,
      lobbyId: payload.lobbyId,
      buffType: payload.buffType ?? 'damage_boost',
      value: payload.value,
      expiresAt: Date.now() + (payload.durationMs ?? 10000),
    });
  }

  if (payload.effectType === 'shield') {
    // Apply a timed shield (mirroring item:effect_applied shield branch).
    // consumer exists: reduceShield → combatManager.applyDamageToPlayer monkey-patch
    addBuff(payload.lobbyId, payload.playerId, {
      playerId: payload.playerId,
      lobbyId: payload.lobbyId,
      buffType: 'shield',
      value: payload.value,
      expiresAt: Date.now() + (payload.durationMs ?? 15000),
    });
  }

  if (payload.effectType === 'debuff') {
    // Store boss-targeted debuff in a dedicated map (not activeBuffs) to avoid
    // polluting the player-buff map with boss-scoped state.
    // attack_slow → TODO: consumer in future phase (stored only)
    addDebuff(
      payload.lobbyId,
      payload.playerId,
      payload.debuffType ?? 'attack_slow',
      payload.value,
      payload.durationMs ?? 10000,
    );
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
export { eventBus, sessionManager, estimationManager, combatManager, progressionManager, classMasteryManager, abilityManager, comboManager, itemManager, statsTracker };

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
export type { ComboManager, ComboManagerDeps } from './ComboManager';
export type { ItemManager, ItemManagerDeps } from './ItemManager';
export type { StatsTracker, StatsTrackerDeps } from './StatsTracker';

// Re-export errors
export * from '../errors/SessionErrors';
export * from '../errors/EstimationErrors';
export * from '../errors/CombatErrors';

// Re-export boss-ai module
export { BossAI, getBossTypeFromSprite, getBossBehavior, BOSS_BEHAVIORS } from './boss-ai';
export type { BossType, BossPhaseNumber, AttackPattern, BossBehavior, BattleContext } from './boss-ai';
