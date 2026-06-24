import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTargets, buildAction, applySpellEffects } from './applySpellEffects';

type AnyFn = (...args: any[]) => any;

// Minimal Player shape for testing
const makePlayers = () => [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Charlie' },
];

// ─── resolveTargets ──────────────────────────────────────────────────────────

describe('resolveTargets — name matching', () => {
  it('returns matched player id when message names a player', () => {
    const players = makePlayers();
    const result = resolveTargets('die', 'die Alice', 'p2', players as any);
    expect(result).toEqual(['p1']);
  });

  it('is case-insensitive', () => {
    const players = makePlayers();
    const result = resolveTargets('die', 'die ALICE', 'p2', players as any);
    expect(result).toEqual(['p1']);
  });

  it('returns [casterPlayerId] fallback when no name matches', () => {
    const players = makePlayers();
    const result = resolveTargets('die', 'die nobody', 'p2', players as any);
    expect(result).toEqual(['p2']);
  });

  it('returns [casterPlayerId] fallback when no target specified (self-cast)', () => {
    const players = makePlayers();
    const result = resolveTargets('die', 'die', 'p2', players as any);
    expect(result).toEqual(['p2']);
  });

  it('resolves multiple targets when message names multiple players', () => {
    const players = makePlayers();
    const result = resolveTargets('die', 'die alice and bob', 'p3', players as any);
    expect(result).toEqual(['p1', 'p2']);
  });
});

// ─── buildAction ─────────────────────────────────────────────────────────────

describe('buildAction — maps effect types to correct action variant', () => {
  const players = makePlayers();

  it('die → DIE', () => {
    const action = buildAction('die', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('DIE');
    if (action.type === 'DIE') expect(action.targets).toEqual(['p1']);
  });

  it('revive → REVIVE', () => {
    const action = buildAction('revive', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('REVIVE');
  });

  it('haste → HASTE', () => {
    const action = buildAction('haste', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('HASTE');
  });

  it('slow → SLOW', () => {
    const action = buildAction('slow', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('SLOW');
  });

  it('enlarge → ENLARGE', () => {
    const action = buildAction('enlarge', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('ENLARGE');
  });

  it('reduce → REDUCE', () => {
    const action = buildAction('reduce', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('REDUCE');
  });

  it('fly → FLY', () => {
    const action = buildAction('fly', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('FLY');
  });

  it('hold → HOLD', () => {
    const action = buildAction('hold', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('HOLD');
  });

  it('petrify → PETRIFY', () => {
    const action = buildAction('petrify', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('PETRIFY');
  });

  it('invisibility → INVISIBILITY', () => {
    const action = buildAction('invisibility', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('INVISIBILITY');
  });

  it('earthbind → EARTHBIND', () => {
    const action = buildAction('earthbind', [], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('EARTHBIND');
  });

  it('massacre → MASSACRE with victims (excludes caster)', () => {
    const action = buildAction('massacre', [], 'p1', false, new Set(), players as any);
    expect(action.type).toBe('MASSACRE');
    if (action.type === 'MASSACRE') {
      expect(action.caster).toBe('p1');
      expect(action.victims).not.toContain('p1');
      expect(action.victims).toContain('p2');
      expect(action.victims).toContain('p3');
    }
  });

  it('massrevive → MASSREVIVE', () => {
    const action = buildAction('massrevive', [], 'p1', false, new Set(), players as any);
    expect(action.type).toBe('MASSREVIVE');
  });

  it('chaos → CHAOS', () => {
    const action = buildAction('chaos', [], 'p1', false, new Set(), players as any);
    expect(action.type).toBe('CHAOS');
  });

  it('dispel → DISPEL (targeted)', () => {
    const action = buildAction('dispel', ['p1'], 'p2', false, new Set(), players as any);
    expect(action.type).toBe('DISPEL');
    if (action.type === 'DISPEL') expect(action.targets).toEqual(['p1']);
  });

  it('visual-only effects (fire) → MASSREVIVE noop (BREAK_INVISIBILITY dispatched by applySpellEffects, not buildAction)', () => {
    // buildAction maps visual effects to a no-op (MASSREVIVE).
    // The BREAK_INVISIBILITY trailing dispatch is handled in applySpellEffects directly.
    const invisiblePlayers = new Set(['p1']);
    const action = buildAction('fire', [], 'p1', false, invisiblePlayers, players as any);
    expect(action.type).toBe('MASSREVIVE');
  });
});

// ─── applySpellEffects — isLocalCast divergence ──────────────────────────────

describe('applySpellEffects — isLocalCast setFlyHeight divergence', () => {
  let dispatch: AnyFn;
  let setFlyHeight: AnyFn;
  let setMagicEffects: AnyFn;
  let setEmotes: AnyFn;

  beforeEach(() => {
    dispatch = vi.fn();
    setFlyHeight = vi.fn();
    setMagicEffects = vi.fn();
    setEmotes = vi.fn();
  });

  // Cast helpers to satisfy strict function signatures while keeping vi.fn() mocks
  const cast = <T>(fn: AnyFn): T => fn as unknown as T;

  it('isLocalCast=true + earthbind + caster is flying → calls setFlyHeight(0)', () => {
    const players = makePlayers();
    const flyingPlayers = new Set(['p1']);
    applySpellEffects(
      ['earthbind'],
      'earthbind',
      'p1', // caster is also a flyer
      players as any,
      flyingPlayers,
      new Set(),
      true, // isLocalCast
      cast(dispatch),
      cast(setFlyHeight),
      cast(setMagicEffects),
      cast(setEmotes),
    );
    expect(setFlyHeight).toHaveBeenCalledWith(0);
  });

  it('isLocalCast=false + earthbind → setFlyHeight NOT called (remote path)', () => {
    const players = makePlayers();
    const flyingPlayers = new Set(['p1']);
    applySpellEffects(
      ['earthbind'],
      'earthbind',
      'p1',
      players as any,
      flyingPlayers,
      new Set(),
      false, // isLocalCast = remote
      cast(dispatch),
      cast(setFlyHeight),
      cast(setMagicEffects),
      cast(setEmotes),
    );
    expect(setFlyHeight).not.toHaveBeenCalled();
  });

  it('isLocalCast=true + dispel targeting self + caster is flying → setFlyHeight(0)', () => {
    const players = makePlayers();
    const flyingPlayers = new Set(['p1']);
    applySpellEffects(
      ['dispel'],
      'dispel', // no target name → falls back to caster p1
      'p1',
      players as any,
      flyingPlayers,
      new Set(),
      true,
      cast(dispatch),
      cast(setFlyHeight),
      cast(setMagicEffects),
      cast(setEmotes),
    );
    expect(setFlyHeight).toHaveBeenCalledWith(0);
  });

  it('isLocalCast=false + dispel → setFlyHeight NOT called', () => {
    const players = makePlayers();
    const flyingPlayers = new Set(['p1']);
    applySpellEffects(
      ['dispel'],
      'dispel',
      'p1',
      players as any,
      flyingPlayers,
      new Set(),
      false,
      cast(dispatch),
      cast(setFlyHeight),
      cast(setMagicEffects),
      cast(setEmotes),
    );
    expect(setFlyHeight).not.toHaveBeenCalled();
  });

  it('dispatches actions for each detected effect', () => {
    const players = makePlayers();
    applySpellEffects(
      ['die', 'haste'],
      'die haste alice',
      'p2',
      players as any,
      new Set(),
      new Set(),
      false,
      cast(dispatch),
      cast(setFlyHeight),
      cast(setMagicEffects),
      cast(setEmotes),
    );
    // dispatch called at least twice (once per effect)
    const dispatchMock = dispatch as ReturnType<typeof vi.fn>;
    expect(dispatchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
