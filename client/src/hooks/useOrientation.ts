import { useState, useEffect } from 'react';

/**
 * Returns true when device is in portrait orientation.
 * Uses matchMedia for reactive updates — no polling.
 */
export function useOrientation(): boolean {
  const [isPortrait, setIsPortrait] = useState(
    () => typeof window !== 'undefined'
      ? window.matchMedia('(orientation: portrait)').matches
      : false
  );

  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    const onChange = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isPortrait;
}
