import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTutorial } from '@/lib/stores/useTutorial';
import { useFirstEncounter } from './useFirstEncounter';

describe('useFirstEncounter', () => {
  beforeEach(() => {
    localStorage.clear();
    useTutorial.setState({
      completedTutorials: {},
      completedHints: {},
      version: 1,
      activeTutorial: null,
      activeStep: 0,
      isSpotlightVisible: false,
      isHydrated: true,
    });
  });

  it('fires hint and dismisses it on first true condition', () => {
    const { rerender } = renderHook(
      ({ cond }: { cond: boolean }) => useFirstEncounter('test-foo', cond),
      { initialProps: { cond: false } },
    );

    // Initially not fired
    expect(useTutorial.getState().activeTutorial).toBeNull();
    expect(useTutorial.getState().completedHints['test-foo']).toBeUndefined();

    // Flip to true
    rerender({ cond: true });

    expect(useTutorial.getState().activeTutorial).toBe('hint:test-foo');
    expect(useTutorial.getState().completedHints['test-foo']).toBe(true);
  });

  it('does not fire when completedHints already has the id', () => {
    useTutorial.setState({
      completedTutorials: {},
      completedHints: { 'test-foo': true },
      version: 1,
      activeTutorial: null,
      activeStep: 0,
      isSpotlightVisible: false,
      isHydrated: true,
    });

    renderHook(() => useFirstEncounter('test-foo', true));

    expect(useTutorial.getState().activeTutorial).toBeNull();
  });

  it('does not double-fire across re-renders', () => {
    const { rerender } = renderHook(
      ({ cond }: { cond: boolean }) => useFirstEncounter('test-bar', cond),
      { initialProps: { cond: true } },
    );

    expect(useTutorial.getState().activeTutorial).toBe('hint:test-bar');

    // Manually clear activeTutorial as if user dismissed it
    useTutorial.setState({ activeTutorial: null, activeStep: 0 });

    // Re-render multiple times — should NOT re-fire (completedHints latch + ref-latch)
    rerender({ cond: true });
    rerender({ cond: true });

    expect(useTutorial.getState().activeTutorial).toBeNull();
  });
});
