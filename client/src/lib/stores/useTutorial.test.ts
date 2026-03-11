import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTutorial } from './useTutorial';

describe('useTutorial store', () => {
  beforeEach(() => {
    localStorage.clear();
    useTutorial.setState({
      completedTutorials: {},
      completedHints: {},
      version: 1,
      activeTutorial: null,
      activeStep: 0,
      isSpotlightVisible: false,
      isHydrated: false,
    });
  });

  it('has correct initial state', () => {
    const { result } = renderHook(() => useTutorial());
    expect(result.current.completedTutorials).toEqual({});
    expect(result.current.completedHints).toEqual({});
    expect(result.current.activeTutorial).toBeNull();
    expect(result.current.activeStep).toBe(0);
  });

  it('startTutorial sets activeTutorial, step 0, spotlight visible', () => {
    const { result } = renderHook(() => useTutorial());
    act(() => {
      result.current.startTutorial('battle-intro');
    });
    expect(result.current.activeTutorial).toBe('battle-intro');
    expect(result.current.activeStep).toBe(0);
    expect(result.current.isSpotlightVisible).toBe(true);
  });

  it('advanceStep increments activeStep', () => {
    const { result } = renderHook(() => useTutorial());
    act(() => {
      result.current.startTutorial('battle-intro');
    });
    act(() => {
      result.current.advanceStep();
    });
    expect(result.current.activeStep).toBe(1);
    act(() => {
      result.current.advanceStep();
    });
    expect(result.current.activeStep).toBe(2);
  });

  it('completeTutorial marks as complete and clears active state', () => {
    const { result } = renderHook(() => useTutorial());
    act(() => {
      result.current.startTutorial('battle-intro');
    });
    act(() => {
      result.current.completeTutorial('battle-intro');
    });
    expect(result.current.completedTutorials['battle-intro']).toBe(true);
    expect(result.current.activeTutorial).toBeNull();
    expect(result.current.activeStep).toBe(0);
    expect(result.current.isSpotlightVisible).toBe(false);
  });

  it('dismissHint marks hint as complete', () => {
    const { result } = renderHook(() => useTutorial());
    act(() => {
      result.current.dismissHint('boss-health-hint');
    });
    expect(result.current.completedHints['boss-health-hint']).toBe(true);
  });

  it('resetTutorial removes specific tutorial from completed', () => {
    const { result } = renderHook(() => useTutorial());
    act(() => {
      result.current.completeTutorial('battle-intro');
      result.current.completeTutorial('voting-guide');
    });
    expect(result.current.completedTutorials['battle-intro']).toBe(true);
    expect(result.current.completedTutorials['voting-guide']).toBe(true);
    act(() => {
      result.current.resetTutorial('battle-intro');
    });
    expect(result.current.completedTutorials['battle-intro']).toBeUndefined();
    expect(result.current.completedTutorials['voting-guide']).toBe(true);
  });

  it('resetAllTutorials clears all completions', () => {
    const { result } = renderHook(() => useTutorial());
    act(() => {
      result.current.completeTutorial('battle-intro');
      result.current.dismissHint('boss-health-hint');
    });
    act(() => {
      result.current.resetAllTutorials();
    });
    expect(result.current.completedTutorials).toEqual({});
    expect(result.current.completedHints).toEqual({});
  });

  it('partialize only persists completedTutorials, completedHints, version', () => {
    const { result } = renderHook(() => useTutorial());
    act(() => {
      result.current.startTutorial('battle-intro');
      result.current.completeTutorial('battle-intro');
    });

    const stored = JSON.parse(localStorage.getItem('scrumquest-tutorial') || '{}');
    const persistedState = stored.state;

    expect(persistedState.completedTutorials).toEqual({ 'battle-intro': true });
    expect(persistedState.completedHints).toEqual({});
    expect(persistedState.version).toBe(1);

    // Runtime state should NOT be persisted
    expect(persistedState.activeTutorial).toBeUndefined();
    expect(persistedState.activeStep).toBeUndefined();
    expect(persistedState.isSpotlightVisible).toBeUndefined();
    expect(persistedState.isHydrated).toBeUndefined();
  });
});
