import { useEffect } from 'react';
import { handTracker } from '@/features/hand-tracking/HandTracker';

/** Keep hand tracking running while the calling component is mounted (and `enabled`). */
export function useHandTracking(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return handTracker.acquire();
  }, [enabled]);
}
