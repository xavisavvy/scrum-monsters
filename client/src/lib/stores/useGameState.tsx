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

interface GameState {
  currentLobby: Lobby | null;
  currentPlayer: Player | null;
  currentBoss: Boss | null;
  attackAnimations: AttackAnimation[];
  inviteLink: string | null;
  error: string | null;
  countdown: CountdownState | null;
  minions: Map<string, MinionClientState>;

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

    clearAll: () => set({
      currentLobby: null,
      currentPlayer: null,
      currentBoss: null,
      attackAnimations: [],
      inviteLink: null,
      error: null,
      countdown: null,
      minions: new Map()
    })
  }))
);
