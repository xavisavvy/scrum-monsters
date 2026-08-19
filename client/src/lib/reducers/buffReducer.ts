/**
 * buffReducer — MAINT-12 pure reducer for lobby magic-effect state.
 *
 * NO React imports: this module is a pure function, testable without rendering.
 * 10 of the 13 magic-effect useState slots live here; flyHeight, invisibleFlicker,
 * and screenShake stay as separate useState (continuous / timer-driven).
 */

// ─── State shape ────────────────────────────────────────────────────────────

export type BuffState = {
  deadPlayers: Set<string>;
  flyingPlayers: Set<string>;
  frozenPlayers: Set<string>;
  petrifiedPlayers: Set<string>;
  tavernDarkMode: boolean;
  chaosMode: boolean;
  invisiblePlayers: Set<string>;
  dragonAttack: { active: boolean; targetX: number; targetPlayerId: string | null };
  speedBuffs: Record<string, { type: 'haste' | 'slow'; stacks: number }>;
  sizeBuffs: Record<string, { type: 'enlarge' | 'reduce'; stacks: number }>;
};

// ─── Action union (23 variants) ─────────────────────────────────────────────

export type BuffAction =
  | { type: 'DIE'; targets: string[] }
  | { type: 'REVIVE'; targets: string[] }
  | { type: 'HASTE'; targets: string[] }
  | { type: 'SLOW'; targets: string[] }
  | { type: 'ENLARGE'; targets: string[] }
  | { type: 'REDUCE'; targets: string[] }
  | { type: 'FLY'; targets: string[] }
  | { type: 'HOLD'; targets: string[] }
  | { type: 'UNHOLD'; targets: string[] }
  | { type: 'PETRIFY'; targets: string[] }
  | { type: 'INVISIBILITY'; targets: string[] }
  | { type: 'EARTHBIND'; targets: string[] }
  | { type: 'MASSACRE'; caster: string; victims: string[] }
  | { type: 'MASSREVIVE' }
  | { type: 'DRAGON'; victim: string; victimPos: number }
  | { type: 'DRAGON_END' }
  | { type: 'CHAOS' }
  | { type: 'CHAOS_END' }
  | { type: 'TAVERN_DARK_END' }
  | { type: 'DISPEL'; targets: string[] }
  | { type: 'DISPEL_ALL' }
  | { type: 'BREAK_INVISIBILITY'; playerId: string }
  | { type: 'PHASE_RESET' };

// ─── Initial state ───────────────────────────────────────────────────────────

export const initialBuffState: BuffState = {
  deadPlayers: new Set(),
  flyingPlayers: new Set(),
  frozenPlayers: new Set(),
  petrifiedPlayers: new Set(),
  tavernDarkMode: false,
  chaosMode: false,
  invisiblePlayers: new Set(),
  dragonAttack: { active: false, targetX: 0, targetPlayerId: null },
  speedBuffs: {},
  sizeBuffs: {},
};

// ─── Pure reducer ────────────────────────────────────────────────────────────

export function buffReducer(state: BuffState, action: BuffAction): BuffState {
  switch (action.type) {

    // --- Player life/death ---

    case 'DIE': {
      const next = new Set(state.deadPlayers);
      action.targets.forEach(id => next.add(id));
      return { ...state, deadPlayers: next };
    }

    case 'REVIVE': {
      const next = new Set(state.deadPlayers);
      action.targets.forEach(id => next.delete(id));
      return { ...state, deadPlayers: next };
    }

    // --- Speed buffs ---

    case 'HASTE': {
      const nextBuff = { ...state.speedBuffs };
      action.targets.forEach(id => {
        const current = nextBuff[id];
        if (current?.type === 'haste') {
          nextBuff[id] = { type: 'haste', stacks: Math.min(current.stacks + 1, 3) };
        } else {
          nextBuff[id] = { type: 'haste', stacks: 1 };
        }
      });
      return { ...state, speedBuffs: nextBuff };
    }

    case 'SLOW': {
      const nextBuff = { ...state.speedBuffs };
      action.targets.forEach(id => {
        nextBuff[id] = { type: 'slow', stacks: 1 };
      });
      return { ...state, speedBuffs: nextBuff };
    }

    // --- Size buffs ---

    case 'ENLARGE': {
      const nextBuff = { ...state.sizeBuffs };
      action.targets.forEach(id => {
        const current = nextBuff[id];
        if (current?.type === 'enlarge') {
          nextBuff[id] = { type: 'enlarge', stacks: Math.min(current.stacks + 1, 3) };
        } else {
          nextBuff[id] = { type: 'enlarge', stacks: 1 };
        }
      });
      return { ...state, sizeBuffs: nextBuff };
    }

    case 'REDUCE': {
      const nextBuff = { ...state.sizeBuffs };
      action.targets.forEach(id => {
        const current = nextBuff[id];
        if (current?.type === 'reduce') {
          nextBuff[id] = { type: 'reduce', stacks: Math.min(current.stacks + 1, 3) };
        } else {
          nextBuff[id] = { type: 'reduce', stacks: 1 };
        }
      });
      return { ...state, sizeBuffs: nextBuff };
    }

    // --- Flying ---

    case 'FLY': {
      const next = new Set(state.flyingPlayers);
      action.targets.forEach(id => next.add(id));
      return { ...state, flyingPlayers: next };
    }

    // --- Frozen (HOLD = freeze for 5s; auto-unfreeze is a setTimeout side-effect outside the reducer) ---

    case 'HOLD': {
      const next = new Set(state.frozenPlayers);
      action.targets.forEach(id => next.add(id));
      return { ...state, frozenPlayers: next };
    }

    case 'UNHOLD': {
      const next = new Set(state.frozenPlayers);
      action.targets.forEach(id => next.delete(id));
      return { ...state, frozenPlayers: next };
    }

    // --- Petrified ---

    case 'PETRIFY': {
      const next = new Set(state.petrifiedPlayers);
      action.targets.forEach(id => next.add(id));
      return { ...state, petrifiedPlayers: next };
    }

    // --- Invisible ---

    case 'INVISIBILITY': {
      const next = new Set(state.invisiblePlayers);
      action.targets.forEach(id => next.add(id));
      return { ...state, invisiblePlayers: next };
    }

    case 'BREAK_INVISIBILITY': {
      const next = new Set(state.invisiblePlayers);
      next.delete(action.playerId);
      return { ...state, invisiblePlayers: next };
    }

    // --- Earthbind: all flyers crash and die ---

    case 'EARTHBIND': {
      const flyersToKill = Array.from(state.flyingPlayers);
      if (flyersToKill.length === 0) return state;
      const nextDead = new Set(state.deadPlayers);
      flyersToKill.forEach(id => nextDead.add(id));
      return {
        ...state,
        flyingPlayers: new Set(),
        deadPlayers: nextDead,
      };
    }

    // --- Massacre: kill all victims, darken tavern ---

    case 'MASSACRE': {
      const nextDead = new Set(state.deadPlayers);
      action.victims.forEach(id => nextDead.add(id));
      const nextFlying = new Set(state.flyingPlayers);
      action.victims.forEach(id => nextFlying.delete(id));
      return {
        ...state,
        deadPlayers: nextDead,
        flyingPlayers: nextFlying,
        tavernDarkMode: true,
      };
    }

    // --- Mass revive: clear dead + frozen ---

    case 'MASSREVIVE':
      return {
        ...state,
        deadPlayers: new Set(),
        frozenPlayers: new Set(),
      };

    // --- Dragon attack ---

    case 'DRAGON':
      return {
        ...state,
        dragonAttack: { active: true, targetX: action.victimPos, targetPlayerId: action.victim },
      };

    case 'DRAGON_END':
      return {
        ...state,
        dragonAttack: { active: false, targetX: 0, targetPlayerId: null },
      };

    // --- Chaos mode ---

    case 'CHAOS':
      return { ...state, chaosMode: true };

    case 'CHAOS_END':
      return { ...state, chaosMode: false };

    // --- Tavern dark ---

    case 'TAVERN_DARK_END':
      return { ...state, tavernDarkMode: false };

    // --- Targeted dispel: remove all buffs from specific players ---

    case 'DISPEL': {
      const nextDead = new Set(state.deadPlayers);
      const nextFlying = new Set(state.flyingPlayers);
      const nextFrozen = new Set(state.frozenPlayers);
      const nextInvisible = new Set(state.invisiblePlayers);
      const nextPetrified = new Set(state.petrifiedPlayers);
      const nextSpeed = { ...state.speedBuffs };
      const nextSize = { ...state.sizeBuffs };

      action.targets.forEach(id => {
        nextDead.delete(id);
        nextFlying.delete(id);
        nextFrozen.delete(id);
        nextInvisible.delete(id);
        nextPetrified.delete(id);
        delete nextSpeed[id];
        delete nextSize[id];
      });

      return {
        ...state,
        deadPlayers: nextDead,
        flyingPlayers: nextFlying,
        frozenPlayers: nextFrozen,
        invisiblePlayers: nextInvisible,
        petrifiedPlayers: nextPetrified,
        speedBuffs: nextSpeed,
        sizeBuffs: nextSize,
      };
    }

    // --- DISPEL_ALL / PHASE_RESET: complete wipe (one action, one re-render) ---

    case 'DISPEL_ALL':
    case 'PHASE_RESET':
      // Return fresh initialBuffState shape with brand-new Set/Record instances
      // so React structural equality bails correctly on the next render.
      return {
        deadPlayers: new Set(),
        flyingPlayers: new Set(),
        frozenPlayers: new Set(),
        petrifiedPlayers: new Set(),
        tavernDarkMode: false,
        chaosMode: false,
        invisiblePlayers: new Set(),
        dragonAttack: { active: false, targetX: 0, targetPlayerId: null },
        speedBuffs: {},
        sizeBuffs: {},
      };

    default:
      return state;
  }
}
