import { create } from 'zustand';
import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';

/**
 * Active combo data displayed to player
 */
interface ActiveCombo {
  comboId: string;
  comboName: string;
  damage: number;
  damageMultiplier: number;
  visualEffect: string;
  isConsensusUltimate: boolean;
  votingDurationMs?: number; // Only for consensus ultimate
  timestamp: number; // When combo was received
}

/**
 * Combo state store
 */
interface ComboState {
  activeCombo: ActiveCombo | null;
  comboHistory: ActiveCombo[]; // Last 5 combos for potential combo counter
  showCombo: (combo: ActiveCombo) => void;
  dismissCombo: () => void;
  clearHistory: () => void;
}

/**
 * Zustand store for combo state tracking
 */
export const useComboState = create<ComboState>((set, get) => ({
  // Initial state
  activeCombo: null,
  comboHistory: [],

  // Actions
  showCombo: (combo: ActiveCombo) => {
    const { comboHistory } = get();
    const updatedHistory = [...comboHistory, combo].slice(-5); // Keep last 5

    set({
      activeCombo: combo,
      comboHistory: updatedHistory,
    });
  },

  dismissCombo: () => {
    set({ activeCombo: null });
  },

  clearHistory: () => {
    set({ comboHistory: [] });
  },
}));

/**
 * Server event sync hook - wire combo events to store
 */
export function useComboSync() {
  const socket = useWebSocket(state => state.socket);
  const { showCombo } = useComboState();

  useEffect(() => {
    if (!socket) return;

    const handleComboTriggered = (data: {
      comboId: string;
      comboName: string;
      damage: number;
      damageMultiplier: number;
      visualEffect: string;
    }) => {
      useComboState.getState().showCombo({
        comboId: data.comboId,
        comboName: data.comboName,
        damage: data.damage,
        damageMultiplier: data.damageMultiplier,
        visualEffect: data.visualEffect,
        isConsensusUltimate: false,
        timestamp: Date.now(),
      });
    };

    const handleConsensusUltimate = (data: {
      damage: number;
      damageMultiplier: number;
      votingDurationMs: number;
    }) => {
      useComboState.getState().showCombo({
        comboId: 'consensus_ultimate',
        comboName: 'Consensus Ultimate',
        damage: data.damage,
        damageMultiplier: data.damageMultiplier,
        visualEffect: 'consensus_blast',
        isConsensusUltimate: true,
        votingDurationMs: data.votingDurationMs,
        timestamp: Date.now(),
      });
    };

    socket.on('combo:triggered', handleComboTriggered);
    socket.on('combo:consensus_ultimate', handleConsensusUltimate);

    return () => {
      socket.off('combo:triggered', handleComboTriggered);
      socket.off('combo:consensus_ultimate', handleConsensusUltimate);
    };
  }, [socket, showCombo]);
}
