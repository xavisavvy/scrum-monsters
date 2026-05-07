import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

import { useReducedMotion } from 'framer-motion';
import { useTypewriter } from './useTypewriter';

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (useReducedMotion as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals one character per ~33ms tick at 30 cps', () => {
    const text = 'Hello World';
    const { result } = renderHook(() => useTypewriter(text, 30));

    expect(result.current.displayed).toBe('');
    expect(result.current.isComplete).toBe(false);

    // Advance one interval tick (1000/30 ≈ 33.33ms)
    act(() => {
      vi.advanceTimersByTime(Math.ceil(1000 / 30));
    });
    expect(result.current.displayed.length).toBe(1);
    expect(result.current.displayed).toBe('H');

    act(() => {
      vi.advanceTimersByTime(Math.ceil(1000 / 30));
    });
    expect(result.current.displayed.length).toBe(2);
    expect(result.current.displayed).toBe('He');
  });

  it('reaches isComplete=true and displayed===text after full duration', () => {
    const text = 'Short';
    const { result } = renderHook(() => useTypewriter(text, 30));
    const totalMs = Math.ceil((1000 / 30) * (text.length + 1));

    act(() => {
      vi.advanceTimersByTime(totalMs);
    });

    expect(result.current.displayed).toBe(text);
    expect(result.current.isComplete).toBe(true);
  });

  it('revealAll() jumps to full text mid-animation and cancels the timer', () => {
    const text = 'A longer string for testing';
    const { result } = renderHook(() => useTypewriter(text, 30));

    // Advance partially
    act(() => {
      vi.advanceTimersByTime(Math.ceil(1000 / 30) * 3);
    });
    expect(result.current.displayed.length).toBeGreaterThan(0);
    expect(result.current.displayed.length).toBeLessThan(text.length);

    act(() => {
      result.current.revealAll();
    });

    expect(result.current.displayed).toBe(text);
    expect(result.current.isComplete).toBe(true);

    // Advancing further should not change state (timer cancelled)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayed).toBe(text);
  });

  it('reduced-motion path renders full text immediately and skips timer', () => {
    (useReducedMotion as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const text = 'Reduced motion text';
    const { result } = renderHook(() => useTypewriter(text, 30));

    expect(result.current.displayed).toBe(text);
    expect(result.current.isComplete).toBe(true);

    // Advancing timers should not affect displayed state
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayed).toBe(text);
  });

  it('unmounting before completion does not throw / leak interval', () => {
    const text = 'Mid animation unmount test';
    const { result, unmount } = renderHook(() => useTypewriter(text, 30));

    act(() => {
      vi.advanceTimersByTime(Math.ceil(1000 / 30) * 2);
    });
    expect(result.current.displayed.length).toBeGreaterThan(0);

    expect(() => unmount()).not.toThrow();

    // Advancing timers post-unmount must not throw
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }).not.toThrow();
  });

  it('text prop change resets and retypes the new text', () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) => useTypewriter(text, 30),
      { initialProps: { text: 'First' } },
    );

    // Type out part of first text
    act(() => {
      vi.advanceTimersByTime(Math.ceil(1000 / 30) * 2);
    });
    expect(result.current.displayed.length).toBeGreaterThan(0);

    // Change text mid-animation
    rerender({ text: 'Brand new text' });

    // Displayed should reset to empty
    expect(result.current.displayed).toBe('');
    expect(result.current.isComplete).toBe(false);

    // Then advancing timer should grow the new text
    act(() => {
      vi.advanceTimersByTime(Math.ceil(1000 / 30));
    });
    expect(result.current.displayed).toBe('B');
  });
});
