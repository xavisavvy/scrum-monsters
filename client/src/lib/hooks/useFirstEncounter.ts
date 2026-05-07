import { useEffect, useRef } from 'react';
import { useTutorial } from '@/lib/stores/useTutorial';

/**
 * Fires startTutorial(`hint:${hintId}`) the first time `condition` flips to true,
 * provided completedHints[hintId] is not already true. Persists completion BEFORE
 * starting (Pitfall 5) so HMR / remount cannot replay the hint.
 */
export function useFirstEncounter(hintId: string, condition: boolean): void {
  const completedHints = useTutorial((s) => s.completedHints);
  const startTutorial = useTutorial((s) => s.startTutorial);
  const dismissHint = useTutorial((s) => s.dismissHint);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (completedHints[hintId]) return;
    if (!condition) return;
    firedRef.current = true;
    // Mark dismissed BEFORE starting so HMR/remount cannot replay (Pitfall 5).
    dismissHint(hintId);
    startTutorial(`hint:${hintId}`);
  }, [hintId, condition, completedHints, startTutorial, dismissHint]);
}
