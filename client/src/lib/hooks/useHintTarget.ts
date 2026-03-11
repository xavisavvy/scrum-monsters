import { useState, useRef, useCallback, useEffect } from 'react';

export interface HintRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

/**
 * Hook to locate DOM elements by data-hint-target attribute
 * and return their bounding rects for tutorial overlay positioning.
 */
export function useHintTarget() {
  const [targetRect, setTargetRect] = useState<HintRect | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastTargetIdRef = useRef<string | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locateTarget = useCallback(
    (targetId: string): HintRect | null => {
      lastTargetIdRef.current = targetId;
      const el = document.querySelector(
        `[data-hint-target="${targetId}"]`,
      );
      if (!el) {
        setTargetRect(null);
        return null;
      }
      const domRect = el.getBoundingClientRect();
      const rect: HintRect = {
        top: domRect.top,
        left: domRect.left,
        width: domRect.width,
        height: domRect.height,
        bottom: domRect.bottom,
        right: domRect.right,
      };
      setTargetRect(rect);
      return rect;
    },
    [],
  );

  const trackTarget = useCallback(
    (targetId: string): (() => void) => {
      const tick = () => {
        locateTarget(targetId);
        rafIdRef.current = requestAnimationFrame(tick);
      };
      rafIdRef.current = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      };
    },
    [locateTarget],
  );

  // Resize and scroll listeners to re-locate on layout shifts
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = setTimeout(() => {
        if (lastTargetIdRef.current) {
          locateTarget(lastTargetIdRef.current);
        }
        resizeTimerRef.current = null;
      }, 100);
    };

    const handleScroll = () => {
      if (lastTargetIdRef.current) {
        locateTarget(lastTargetIdRef.current);
      }
    };

    if (targetRect !== null) {
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, [targetRect, locateTarget]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return { targetRect, locateTarget, trackTarget };
}
