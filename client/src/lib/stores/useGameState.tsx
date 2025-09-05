import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Lobby, Player, Boss, AttackAnimation } from '../gameTypes';

interface GameState {
  currentLobby: Lobby | null;
  currentPlayer: Player | null;
  currentBoss: Boss | null;
  attackAnimations: AttackAnimation[];
  inviteLink: string | null;
  error: string | null;
  
  // Actions
  setLobby: (lobby: Lobby) => void;
  setPlayer: (player: Player) => void;
  setBoss: (boss: Boss) => void;
  setInviteLink: (link: string) => void;
  setError: (error: string | null) => void;
  addAttackAnimation: (animation: AttackAnimation) => void;
  removeAttackAnimation: (id: string) => void;
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
    
    clearAll: () => set({
      currentLobby: null,
      currentPlayer: null,
      currentBoss: null,
      attackAnimations: [],
      inviteLink: null,
      error: null
    })
  }))
);
