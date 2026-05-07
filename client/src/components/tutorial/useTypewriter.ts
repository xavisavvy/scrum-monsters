import { useEffect, useRef, useState, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface UseTypewriterResult {
  displayed: string;
  isComplete: boolean;
  revealAll: () => void;
}

/**
 * Reveals `text` one character at a time at `charsPerSecond` rate.
 * - Returns full text immediately when prefers-reduced-motion is set.
 * - revealAll() jumps to the full text and cancels the timer.
 * - Re-runs from scratch whenever `text` changes (string identity).
 * - Cleans up its interval on unmount and on dep change (Pitfall 2).
 */
export function useTypewriter(text: string, charsPerSecond = 30): UseTypewriterResult {
  const prefersReducedMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState<string>(prefersReducedMotion ? text : '');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const revealAll = useCallback(() => {
    cleanup();
    indexRef.current = text.length;
    setDisplayed(text);
  }, [text, cleanup]);

  useEffect(() => {
    cleanup();
    indexRef.current = 0;
    if (prefersReducedMotion) {
      setDisplayed(text);
      return;
    }
    setDisplayed('');
    const intervalMs = 1000 / charsPerSecond;
    timerRef.current = setInterval(() => {
      indexRef.current += 1;
      // Re-read closure-captured `text` to avoid stale-closure stomping (Pitfall 2)
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        cleanup();
      }
    }, intervalMs);
    return cleanup;
  }, [text, charsPerSecond, prefersReducedMotion, cleanup]);

  return { displayed, isComplete: displayed.length >= text.length, revealAll };
}
