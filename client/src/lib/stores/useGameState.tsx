import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Lobby, Player, Boss, AttackAnimation } from '../gameTypes';

interface CountdownState {
  active: boolean;
  remainingSeconds: number;
  multiplier: number;
}

interface MinionClientState {
  playerId: string;
  hp: number;
  maxHp: number;
  isAlive: boolean;
}

interface DiscussionTimerState {
  active: boolean;
  endsAt: number;
  durationMs: number;
}

interface TelegraphState {
  message: string;
  delayMs: number;
  targetId?: string;
  attackType?: string;
  visualEffect: string;
  bossType?: string;
}

export interface PendingDamageEvent {
  id: string;
  playerId: string;
  amount: number;
  position: { x: number; y: number };
}

interface GameState {
  currentLobby: Lobby | null;
  currentPlayer: Player | null;
  currentBoss: Boss | null;
  attackAnimations: AttackAnimation[];
  inviteLink: string | null;
  error: string | null;
  countdown: CountdownState | null;
  minions: Map<string, MinionClientState>;
  discussionTimer: DiscussionTimerState | null;
  telegraph: TelegraphState | null;
  bossPhase: number;
  bossPhaseMessage: string | null;
  bossEnraged: boolean;
  bossEnrageMessage: string | null;
  pendingDamageEvents: PendingDamageEvent[];
  // Phase 42-02b Task 2: BattleScreen remount control. Ownership migrated out
  // of GamePage local state into the store so eventHandlers.ts (session:phase_changed
  // + session:ticket_advanced) can trigger the remount without prop drilling.
  battleRemountKey: number;
  isBattleUnmounting: boolean;

  // Actions
  setLobby: (lobby: Lobby) => void;
  setPlayer: (player: Player) => void;
  setBoss: (boss: Boss) => void;
  setInviteLink: (link: string) => void;
  setError: (error: string | null) => void;
  addAttackAnimation: (animation: AttackAnimation) => void;
  removeAttackAnimation: (id: string) => void;
  setCountdown: (countdown: CountdownState | null) => void;
  addMinion: (minion: MinionClientState) => void;
  removeMinion: (playerId: string) => void;
  setDiscussionTimer: (timer: DiscussionTimerState | null) => void;
  setTelegraph: (telegraph: TelegraphState) => void;
  clearTelegraph: () => void;
  setBossPhase: (phase: number, message: string, bossType: string) => void;
  setBossEnraged: (message: string) => void;
  addPendingDamage: (evt: PendingDamageEvent) => void;
  clearPendingDamage: (id: string) => void;
  // Phase 42-02b Task 2: triggers a one-tick BattleScreen unmount/remount
  // (matches the previous GamePage behavior: 100ms unmount window so React
  // disposes the old <BattleScreen> tree before the new key mounts).
  requestBattleRemount: () => void;
  clearAll: () => void;
}

export const useGameState = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    currentLobby: null,
    currentPlayer: null,
    currentBoss: null,
    attackAnimations: [],
    inviteLink: null,
    error: null,
    countdown: null,
    minions: new Map(),
    discussionTimer: null,
    telegraph: null,
    bossPhase: 1,
    bossPhaseMessage: null,
    bossEnraged: false,
    bossEnrageMessage: null,
    pendingDamageEvents: [],
    battleRemountKey: 0,
    isBattleUnmounting: false,

    setLobby: (lobby) => set({ currentLobby: lobby }),
    
    setPlayer: (player) => set({ currentPlayer: player }),
    
    setBoss: (boss) => set({ currentBoss: boss }),
    
    setInviteLink: (link) => set({ inviteLink: link }),
    
    setError: (error) => set({ error }),
    
    addAttackAnimation: (animation) => {
      const { attackAnimations } = get();
      set({ attackAnimations: [...attackAnimations, animation] });
      
      // Remove animation after 2 seconds
      setTimeout(() => {
        get().removeAttackAnimation(animation.id);
      }, 2000);
    },
    
    removeAttackAnimation: (id) => {
      const { attackAnimations } = get();
      set({ attackAnimations: attackAnimations.filter(a => a.id !== id) });
    },

    setCountdown: (countdown) => set({ countdown }),

    addMinion: (minion) => {
      const { minions } = get();
      const newMinions = new Map(minions);
      newMinions.set(minion.playerId, minion);
      set({ minions: newMinions });
    },

    removeMinion: (playerId) => {
      const { minions } = get();
      const newMinions = new Map(minions);
      newMinions.delete(playerId);
      set({ minions: newMinions });
    },

    setDiscussionTimer: (timer) => set({ discussionTimer: timer }),

    setTelegraph: (telegraph) => set({ telegraph }),

    clearTelegraph: () => set({ telegraph: null }),

    setBossPhase: (phase, message, bossType) => {
      set({
        bossPhase: phase,
        bossPhaseMessage: message
      });
      // Auto-clear phase message after 2 seconds
      setTimeout(() => {
        set({ bossPhaseMessage: null });
      }, 2000);
    },

    setBossEnraged: (message) => {
      set({
        bossEnraged: true,
        bossEnrageMessage: message
      });
      // Auto-clear enrage message after 3 seconds
      setTimeout(() => {
        set({ bossEnrageMessage: null });
      }, 3000);
    },

    addPendingDamage: (evt) =>
      set((s) => ({ pendingDamageEvents: [...s.pendingDamageEvents, evt] })),

    clearPendingDamage: (id) =>
      set((s) => ({ pendingDamageEvents: s.pendingDamageEvents.filter((e) => e.id !== id) })),

    requestBattleRemount: () => {
      set({ isBattleUnmounting: true });
      setTimeout(() => {
        set((s) => ({
          battleRemountKey: s.battleRemountKey + 1,
          isBattleUnmounting: false,
        }));
      }, 100);
    },

    clearAll: () => set({
      currentLobby: null,
      currentPlayer: null,
      currentBoss: null,
      attackAnimations: [],
      inviteLink: null,
      error: null,
      countdown: null,
      minions: new Map(),
      discussionTimer: null,
      telegraph: null,
      bossPhase: 1,
      bossPhaseMessage: null,
      bossEnraged: false,
      bossEnrageMessage: null,
      pendingDamageEvents: [],
      battleRemountKey: 0,
      isBattleUnmounting: false,
    })
  }))
);
