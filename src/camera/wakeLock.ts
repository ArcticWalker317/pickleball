// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
// Keeps the screen on for the whole game. iOS drops the lock whenever the page is hidden, so it is
// re-acquired each time the page becomes visible again.
import { useEffect, useState } from 'react';

export function useWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) return void sentinel.release();
        setHeld(true);
        sentinel.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false); // e.g. Low Power Mode — the game still works, the screen may just dim
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release();
    };
  }, [enabled]);

  return enabled && held;
}
