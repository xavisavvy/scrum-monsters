import { create } from 'zustand';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useWebSocket } from './useWebSocket';
import { useGameState } from './useGameState';

/**
 * Individual cooldown tracking state
 */
interface CooldownState {
  abilityId: string;
  startedAt: number;  // Client timestamp when received
  expiresAt: number;  // Server-sent expiration timestamp
  durationMs: number; // Total cooldown duration
}

/**
 * Abilities store state
 */
interface AbilitiesState {
  cooldowns: Map<string, CooldownState>; // abilityId -> CooldownState
  pendingAbility: string | null; // Optimistic UI: disable while request in flight

  // Actions
  startCooldown: (abilityId: string, durationMs: number, expiresAt: number) => void;
  isOnCooldown: (abilityId: string) => boolean;
  getCooldownProgress: (abilityId: string) => number; // 0-100 (0 = just started, 100 = ready)
  getRemainingSeconds: (abilityId: string) => number;
  clearCooldowns: () => void;
  setPendingAbility: (abilityId: string | null) => void;
  activateAbility: (abilityId: string) => void; // Sets pending + emits socket event
}

/**
 * Zustand store for ability cooldown tracking
 */
export const useAbilities = create<AbilitiesState>((set, get) => ({
  // Initial state
  cooldowns: new Map(),
  pendingAbility: null,

  // Actions
  startCooldown: (abilityId: string, durationMs: number, expiresAt: number) => {
    const { cooldowns } = get();
    const newCooldowns = new Map(cooldowns);

    newCooldowns.set(abilityId, {
      abilityId,
      startedAt: Date.now(),
      expiresAt,
      durationMs,
    });

    set({ cooldowns: newCooldowns });
  },

  isOnCooldown: (abilityId: string) => {
    const { cooldowns } = get();
    const cooldown = cooldowns.get(abilityId);

    if (!cooldown) return false;

    // 100ms buffer - show ready slightly early to prevent client/server race
    return Date.now() < (cooldown.expiresAt - 100);
  },

  getCooldownProgress: (abilityId: string) => {
    const { cooldowns } = get();
    const cooldown = cooldowns.get(abilityId);

    if (!cooldown) return 100; // Not on cooldown = 100% ready

    const now = Date.now();
    const elapsed = now - cooldown.startedAt;
    const progress = (elapsed / cooldown.durationMs) * 100;

    return Math.min(100, Math.max(0, progress));
  },

  getRemainingSeconds: (abilityId: string) => {
    const { cooldowns } = get();
    const cooldown = cooldowns.get(abilityId);

    if (!cooldown) return 0;

    const remaining = cooldown.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
  },

  clearCooldowns: () => {
    set({ cooldowns: new Map() });
  },

  setPendingAbility: (abilityId: string | null) => {
    set({ pendingAbility: abilityId });
  },

  activateAbility: (abilityId: string) => {
    const socket = useWebSocket.getState().socket;

    if (!socket) {
      console.warn('Cannot activate ability: socket not connected');
      return;
    }

    // Optimistic disable
    set({ pendingAbility: abilityId });

    // Emit to server
    socket.emit('use_ability', { abilityId });
  },
}));

/**
 * Server event sync hook - wire ability events to store
 */
export function useAbilitySync() {
  const socket = useWebSocket(state => state.socket);
  const { startCooldown, clearCooldowns, setPendingAbility } = useAbilities();
  const { currentLobby } = useGameState();

  useEffect(() => {
    if (!socket) return;

    const handleCooldownStarted = (data: {
      playerId: string;
      abilityId: string;
      durationMs: number;
      expiresAt: number;
    }) => {
      // Track cooldown and clear optimistic disable
      startCooldown(data.abilityId, data.durationMs, data.expiresAt);
      setPendingAbility(null);
    };

    const handleAbilityUsed = (data: { playerId: string; abilityId: string; abilityName?: string }) => {
      // Clear pending state if it's our ability
      setPendingAbility(null);
      toast(`${data.abilityName || 'Ability'} Activated!`, {
        description: 'Ability is now in effect',
        duration: 2500,
        id: `ability-${data.abilityId}`,
      });
    };

    const handleGameError = () => {
      // Server rejected ability use - clear pending state
      setPendingAbility(null);
    };

    const handlePhaseChanged = (data: { newPhase: string }) => {
      // Clear cooldowns when leaving battle
      if (data.newPhase !== 'battle') {
        clearCooldowns();
      }
    };

    socket.on('ability:cooldown_started', handleCooldownStarted);
    socket.on('ability:used', handleAbilityUsed);
    socket.on('game_error', handleGameError);
    socket.on('session:phase_changed', handlePhaseChanged);

    return () => {
      socket.off('ability:cooldown_started', handleCooldownStarted);
      socket.off('ability:used', handleAbilityUsed);
      socket.off('game_error', handleGameError);
      socket.off('session:phase_changed', handlePhaseChanged);
    };
  }, [socket, startCooldown, clearCooldowns, setPendingAbility]);

  // Also clear cooldowns when lobby changes
  useEffect(() => {
    if (!currentLobby) {
      clearCooldowns();
    }
  }, [currentLobby, clearCooldowns]);
}
