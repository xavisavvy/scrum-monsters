import { describe, it, expect } from 'vitest';
import { buffReducer, initialBuffState, BuffState } from './buffReducer';

// --- DISPEL_ALL ---
describe('buffReducer — DISPEL_ALL', () => {
  it('clears all 10 buff slots in one dispatch', () => {
    const populated: BuffState = {
      ...initialBuffState,
      deadPlayers: new Set(['p1', 'p2']),
      flyingPlayers: new Set(['p3']),
      frozenPlayers: new Set(['p4']),
      petrifiedPlayers: new Set(['p5']),
      tavernDarkMode: true,
      chaosMode: true,
      invisiblePlayers: new Set(['p6']),
      dragonAttack: { active: true, targetX: 100, targetPlayerId: 'p7' },
      speedBuffs: { p3: { type: 'haste', stacks: 2 } },
      sizeBuffs: { p8: { type: 'enlarge', stacks: 1 } },
    };
    const next = buffReducer(populated, { type: 'DISPEL_ALL' });
    expect(next.deadPlayers.size).toBe(0);
    expect(next.flyingPlayers.size).toBe(0);
    expect(next.frozenPlayers.size).toBe(0);
    expect(next.petrifiedPlayers.size).toBe(0);
    expect(next.tavernDarkMode).toBe(false);
    expect(next.chaosMode).toBe(false);
    expect(next.invisiblePlayers.size).toBe(0);
    expect(next.dragonAttack.active).toBe(false);
    expect(Object.keys(next.speedBuffs).length).toBe(0);
    expect(Object.keys(next.sizeBuffs).length).toBe(0);
  });
});

// --- PHASE_RESET (same as DISPEL_ALL) ---
describe('buffReducer — PHASE_RESET', () => {
  it('clears all buff state', () => {
    const populated: BuffState = {
      ...initialBuffState,
      deadPlayers: new Set(['p1']),
      chaosMode: true,
      speedBuffs: { p1: { type: 'slow', stacks: 1 } },
    };
    const next = buffReducer(populated, { type: 'PHASE_RESET' });
    expect(next.deadPlayers.size).toBe(0);
    expect(next.chaosMode).toBe(false);
    expect(Object.keys(next.speedBuffs).length).toBe(0);
  });
});

// --- Multi-effect composition: DIE then REVIVE ---
describe('buffReducer — multi-effect composition', () => {
  it('die then revive on same player leaves player alive', () => {
    const afterDie = buffReducer(initialBuffState, { type: 'DIE', targets: ['p1'] });
    expect(afterDie.deadPlayers.has('p1')).toBe(true);

    const afterRevive = buffReducer(afterDie, { type: 'REVIVE', targets: ['p1'] });
    expect(afterRevive.deadPlayers.has('p1')).toBe(false);
  });

  it('revive does not affect players who were not dead', () => {
    const next = buffReducer(initialBuffState, { type: 'REVIVE', targets: ['p1'] });
    expect(next.deadPlayers.has('p1')).toBe(false);
  });
});

// --- ENLARGE stacking cap ---
describe('buffReducer — ENLARGE stacking', () => {
  it('three ENLARGEs cap at stacks 3', () => {
    let state = initialBuffState;
    state = buffReducer(state, { type: 'ENLARGE', targets: ['p1'] });
    state = buffReducer(state, { type: 'ENLARGE', targets: ['p1'] });
    state = buffReducer(state, { type: 'ENLARGE', targets: ['p1'] });
    state = buffReducer(state, { type: 'ENLARGE', targets: ['p1'] }); // 4th — should still be 3
    expect(state.sizeBuffs['p1']).toEqual({ type: 'enlarge', stacks: 3 });
  });

  it('REDUCE stacks up to 3', () => {
    let state = initialBuffState;
    state = buffReducer(state, { type: 'REDUCE', targets: ['p1'] });
    state = buffReducer(state, { type: 'REDUCE', targets: ['p1'] });
    state = buffReducer(state, { type: 'REDUCE', targets: ['p1'] });
    state = buffReducer(state, { type: 'REDUCE', targets: ['p1'] }); // 4th
    expect(state.sizeBuffs['p1']).toEqual({ type: 'reduce', stacks: 3 });
  });
});

// --- HASTE stacking ---
describe('buffReducer — HASTE stacking', () => {
  it('HASTE stacks cap at 3', () => {
    let state = initialBuffState;
    state = buffReducer(state, { type: 'HASTE', targets: ['p1'] });
    state = buffReducer(state, { type: 'HASTE', targets: ['p1'] });
    state = buffReducer(state, { type: 'HASTE', targets: ['p1'] });
    state = buffReducer(state, { type: 'HASTE', targets: ['p1'] }); // 4th
    expect(state.speedBuffs['p1']).toEqual({ type: 'haste', stacks: 3 });
  });
});

// --- HOLD / UNHOLD ---
describe('buffReducer — HOLD / UNHOLD', () => {
  it('HOLD adds player to frozenPlayers', () => {
    const next = buffReducer(initialBuffState, { type: 'HOLD', targets: ['p1'] });
    expect(next.frozenPlayers.has('p1')).toBe(true);
  });

  it('UNHOLD removes player from frozenPlayers', () => {
    const frozen = buffReducer(initialBuffState, { type: 'HOLD', targets: ['p1'] });
    const thawed = buffReducer(frozen, { type: 'UNHOLD', targets: ['p1'] });
    expect(thawed.frozenPlayers.has('p1')).toBe(false);
  });
});

// --- EARTHBIND ---
describe('buffReducer — EARTHBIND', () => {
  it('empties flyingPlayers and adds them to deadPlayers', () => {
    const withFlyers: BuffState = {
      ...initialBuffState,
      flyingPlayers: new Set(['p1', 'p2']),
    };
    const next = buffReducer(withFlyers, { type: 'EARTHBIND', targets: [] });
    expect(next.flyingPlayers.size).toBe(0);
    expect(next.deadPlayers.has('p1')).toBe(true);
    expect(next.deadPlayers.has('p2')).toBe(true);
  });
});

// --- FLY ---
describe('buffReducer — FLY', () => {
  it('adds player to flyingPlayers', () => {
    const next = buffReducer(initialBuffState, { type: 'FLY', targets: ['p1'] });
    expect(next.flyingPlayers.has('p1')).toBe(true);
  });
});

// --- PETRIFY ---
describe('buffReducer — PETRIFY', () => {
  it('adds player to petrifiedPlayers', () => {
    const next = buffReducer(initialBuffState, { type: 'PETRIFY', targets: ['p1'] });
    expect(next.petrifiedPlayers.has('p1')).toBe(true);
  });
});

// --- INVISIBILITY ---
describe('buffReducer — INVISIBILITY', () => {
  it('adds player to invisiblePlayers', () => {
    const next = buffReducer(initialBuffState, { type: 'INVISIBILITY', targets: ['p1'] });
    expect(next.invisiblePlayers.has('p1')).toBe(true);
  });
});

// --- BREAK_INVISIBILITY ---
describe('buffReducer — BREAK_INVISIBILITY', () => {
  it('removes player from invisiblePlayers', () => {
    const invisible = buffReducer(initialBuffState, { type: 'INVISIBILITY', targets: ['p1'] });
    const visible = buffReducer(invisible, { type: 'BREAK_INVISIBILITY', playerId: 'p1' });
    expect(visible.invisiblePlayers.has('p1')).toBe(false);
  });
});

// --- MASSACRE ---
describe('buffReducer — MASSACRE', () => {
  it('adds victims to deadPlayers, removes from flyingPlayers, sets tavernDarkMode', () => {
    const withFlying: BuffState = {
      ...initialBuffState,
      flyingPlayers: new Set(['p2']),
    };
    const next = buffReducer(withFlying, { type: 'MASSACRE', caster: 'p1', victims: ['p2', 'p3'] });
    expect(next.deadPlayers.has('p2')).toBe(true);
    expect(next.deadPlayers.has('p3')).toBe(true);
    expect(next.flyingPlayers.has('p2')).toBe(false);
    expect(next.tavernDarkMode).toBe(true);
  });
});

// --- MASSREVIVE ---
describe('buffReducer — MASSREVIVE', () => {
  it('clears deadPlayers and frozenPlayers', () => {
    const state: BuffState = {
      ...initialBuffState,
      deadPlayers: new Set(['p1', 'p2']),
      frozenPlayers: new Set(['p3']),
    };
    const next = buffReducer(state, { type: 'MASSREVIVE' });
    expect(next.deadPlayers.size).toBe(0);
    expect(next.frozenPlayers.size).toBe(0);
  });
});

// --- DRAGON / DRAGON_END ---
describe('buffReducer — DRAGON / DRAGON_END', () => {
  it('DRAGON sets active dragonAttack', () => {
    const next = buffReducer(initialBuffState, { type: 'DRAGON', victim: 'p1', victimPos: 200 });
    expect(next.dragonAttack.active).toBe(true);
    expect(next.dragonAttack.targetPlayerId).toBe('p1');
    expect(next.dragonAttack.targetX).toBe(200);
  });

  it('DRAGON_END clears dragonAttack', () => {
    const state = buffReducer(initialBuffState, { type: 'DRAGON', victim: 'p1', victimPos: 200 });
    const next = buffReducer(state, { type: 'DRAGON_END' });
    expect(next.dragonAttack.active).toBe(false);
    expect(next.dragonAttack.targetPlayerId).toBeNull();
  });
});

// --- CHAOS / CHAOS_END ---
describe('buffReducer — CHAOS / CHAOS_END', () => {
  it('CHAOS sets chaosMode', () => {
    const next = buffReducer(initialBuffState, { type: 'CHAOS' });
    expect(next.chaosMode).toBe(true);
  });

  it('CHAOS_END clears chaosMode', () => {
    const state = buffReducer(initialBuffState, { type: 'CHAOS' });
    const next = buffReducer(state, { type: 'CHAOS_END' });
    expect(next.chaosMode).toBe(false);
  });
});

// --- TAVERN_DARK_END ---
describe('buffReducer — TAVERN_DARK_END', () => {
  it('clears tavernDarkMode', () => {
    const state: BuffState = { ...initialBuffState, tavernDarkMode: true };
    const next = buffReducer(state, { type: 'TAVERN_DARK_END' });
    expect(next.tavernDarkMode).toBe(false);
  });
});

// --- DISPEL (targeted) ---
describe('buffReducer — DISPEL (targeted)', () => {
  it('removes all buffs for specific target', () => {
    const state: BuffState = {
      ...initialBuffState,
      flyingPlayers: new Set(['p1']),
      frozenPlayers: new Set(['p1']),
      deadPlayers: new Set(['p1']),
      invisiblePlayers: new Set(['p1']),
      petrifiedPlayers: new Set(['p1']),
      speedBuffs: { p1: { type: 'haste', stacks: 2 } },
      sizeBuffs: { p1: { type: 'enlarge', stacks: 1 } },
    };
    const next = buffReducer(state, { type: 'DISPEL', targets: ['p1'] });
    expect(next.flyingPlayers.has('p1')).toBe(false);
    expect(next.frozenPlayers.has('p1')).toBe(false);
    expect(next.deadPlayers.has('p1')).toBe(false);
    expect(next.invisiblePlayers.has('p1')).toBe(false);
    expect(next.petrifiedPlayers.has('p1')).toBe(false);
    expect(next.speedBuffs['p1']).toBeUndefined();
    expect(next.sizeBuffs['p1']).toBeUndefined();
  });

  it('does not affect other players when dispelling one', () => {
    const state: BuffState = {
      ...initialBuffState,
      flyingPlayers: new Set(['p1', 'p2']),
    };
    const next = buffReducer(state, { type: 'DISPEL', targets: ['p1'] });
    expect(next.flyingPlayers.has('p1')).toBe(false);
    expect(next.flyingPlayers.has('p2')).toBe(true);
  });
});

// --- SLOW ---
describe('buffReducer — SLOW', () => {
  it('sets speedBuff to slow stacks:1', () => {
    const next = buffReducer(initialBuffState, { type: 'SLOW', targets: ['p1'] });
    expect(next.speedBuffs['p1']).toEqual({ type: 'slow', stacks: 1 });
  });
});

// --- Immutability: reducer does not mutate input state ---
describe('buffReducer — immutability', () => {
  it('returns a new Set for deadPlayers, not the same reference', () => {
    const before = initialBuffState;
    const after = buffReducer(before, { type: 'DIE', targets: ['p1'] });
    expect(after.deadPlayers).not.toBe(before.deadPlayers);
    expect(before.deadPlayers.has('p1')).toBe(false); // original unchanged
  });
});
