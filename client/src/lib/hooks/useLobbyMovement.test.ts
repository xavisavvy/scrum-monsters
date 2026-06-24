/**
 * useLobbyMovement.test.ts — MAINT-11 interval-once contract (retargeted in Plan 05)
 *
 * Phase 52-02: Created at the hook path to establish the RED/GREEN baseline.
 * Phase 52-05 (this file): Retargeted to invoke the extracted hook directly via
 *   renderHook (not Lobby). The one-interval-per-session contract is the same:
 *   the collapsed dep array [keys, gamePhase, emit, currentPlayerId] ensures the
 *   16ms movement interval is NOT recreated when buff refs or jumpHeight change.
 *
 * Strategy: renderHook with minimal props, spy on setInterval, verify once-per-session.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useLobbyMovement } from './useLobbyMovement';
import type { UseLobbyMovementProps } from './useLobbyMovement';

// ---------------------------------------------------------------------------
// Helpers to build stable prop objects for renderHook
// ---------------------------------------------------------------------------

function makeRef<T>(initial: T): React.MutableRefObject<T> {
  return { current: initial };
}

function makeBaseProps(): UseLobbyMovementProps {
  return {
    keys: new Set<string>(['ArrowRight']),
    gamePhase: 'lobby',
    emit: vi.fn(),
    currentPlayerId: 'test-player-1',
    characterSize: 64,
    moveSpeed: 3,
    movementAreaRef: makeRef<HTMLDivElement | null>(null),
    jumpHeightRef: makeRef(0),
    frozenPlayersRef: makeRef(new Set<string>()),
    petrifiedPlayersRef: makeRef(new Set<string>()),
    flyingPlayersRef: makeRef(new Set<string>()),
    speedBuffsRef: makeRef<Record<string, { type: 'haste' | 'slow'; stacks: number }>>({}),
    sizeBuffsRef: makeRef<Record<string, { type: 'enlarge' | 'reduce'; stacks: number }>>({}),
    deadPlayersRef: makeRef(new Set<string>()),
    setMyPosition: vi.fn(),
    setFlyHeight: vi.fn(),
    setAfterimages: vi.fn(),
    setScreenShake: vi.fn(),
    jumpState: { isJumping: false, jumpHeight: 0 },
    setJumpState: vi.fn(),
    speedBuffs: {},
    myPositionX: 200,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLobbyMovement — MAINT-11 interval-once contract (hook-targeted)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates exactly ONE setInterval per movement session regardless of jumpHeight changes', () => {
    /**
     * GREEN state (post MAINT-11 dep-array collapse):
     *   dep array: [keys, gamePhase, emit, currentPlayerId]
     *   jumpHeightRef.current updated via a separate single-dep sync effect in Lobby.
     *   Changing jumpHeight prop (or jumpHeightRef.current) does NOT recreate the interval.
     *
     * Verify: setInterval(fn, 16) called exactly once during a movement session,
     * even when jumpHeightRef.current is mutated (simulating the rAF jump arc).
     */
    vi.useFakeTimers();

    const props = makeBaseProps();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const baseCount = setIntervalSpy.mock.calls.length;

    // Render the hook with active movement keys — movement effect fires → interval created
    renderHook(() => useLobbyMovement(props));

    // After initial render: one 16ms interval created
    const after16msIntervals = () =>
      setIntervalSpy.mock.calls.filter(args => args[1] === 16).length;

    const afterMount = after16msIntervals();
    expect(afterMount - baseCount).toBe(1);

    // Mutate jumpHeightRef.current several times (simulates rAF ticks during a jump)
    // Pre-refactor: these mutations would cause dep re-fire + interval recreation
    act(() => {
      props.jumpHeightRef.current = 12;
      props.jumpHeightRef.current = 25;
      props.jumpHeightRef.current = 48;
      props.jumpHeightRef.current = 32;
      props.jumpHeightRef.current = 10;
      props.jumpHeightRef.current = 0;
      vi.advanceTimersByTime(100); // ~6 interval ticks + rAF simulation
    });

    // After jumpHeight changes: still exactly 1 interval (refs are stable props, not deps)
    const afterJumpChanges = after16msIntervals();
    expect(afterJumpChanges - baseCount).toBe(1);
  });

  it('interval is NOT recreated when buff refs change', () => {
    /**
     * frozenPlayersRef, speedBuffsRef, etc. are passed as stable MutableRefObjects.
     * Mutating .current does NOT trigger dep re-fire.
     * This confirms the "refs as props, not deps" pattern works correctly.
     */
    vi.useFakeTimers();

    const props = makeBaseProps();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const baseCount = setIntervalSpy.mock.calls.length;

    const { unmount } = renderHook(() => useLobbyMovement(props));

    const afterMount = setIntervalSpy.mock.calls
      .filter(args => args[1] === 16).length;
    expect(afterMount - baseCount).toBe(1);

    // Mutate multiple buff refs (simulates spell casts)
    act(() => {
      props.frozenPlayersRef.current = new Set(['test-player-1']);
      props.speedBuffsRef.current = { 'test-player-1': { type: 'haste', stacks: 1 } };
      props.sizeBuffsRef.current = { 'test-player-1': { type: 'enlarge', stacks: 2 } };
      props.deadPlayersRef.current = new Set<string>();
      vi.advanceTimersByTime(50);
    });

    // Interval count stable — refs mutations do not cause dep re-fire
    const afterBuffChanges = setIntervalSpy.mock.calls
      .filter(args => args[1] === 16).length;
    expect(afterBuffChanges).toBe(afterMount);
    expect(afterBuffChanges - baseCount).toBe(1);

    unmount();
  });

  it('does NOT create interval when gamePhase is not lobby', () => {
    /**
     * Early-return guard: gamePhase !== 'lobby' → no interval created.
     */
    vi.useFakeTimers();

    const props = makeBaseProps();
    props.gamePhase = 'battle'; // Not lobby

    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const baseCount = setIntervalSpy.mock.calls.length;

    renderHook(() => useLobbyMovement(props));

    act(() => {
      vi.advanceTimersByTime(50);
    });

    const movementIntervals = setIntervalSpy.mock.calls
      .filter(args => args[1] === 16).length;
    expect(movementIntervals - baseCount).toBe(0); // No interval when not in lobby
  });

  it('does NOT create interval when keys set is empty', () => {
    /**
     * Early-return guard: keys.size === 0 → no interval created.
     */
    vi.useFakeTimers();

    const props = makeBaseProps();
    props.keys = new Set<string>(); // Empty — no movement keys pressed

    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const baseCount = setIntervalSpy.mock.calls.length;

    renderHook(() => useLobbyMovement(props));

    act(() => {
      vi.advanceTimersByTime(50);
    });

    const movementIntervals = setIntervalSpy.mock.calls
      .filter(args => args[1] === 16).length;
    expect(movementIntervals - baseCount).toBe(0); // No interval when no keys pressed
  });

  it('clears interval on unmount', () => {
    /**
     * The movement useEffect cleanup calls clearInterval.
     * This confirms the effect teardown works correctly.
     */
    vi.useFakeTimers();

    const props = makeBaseProps();
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => useLobbyMovement(props));

    const beforeUnmount = clearIntervalSpy.mock.calls.length;
    unmount();
    const afterUnmount = clearIntervalSpy.mock.calls.length;

    expect(afterUnmount).toBeGreaterThan(beforeUnmount);
  });
});
