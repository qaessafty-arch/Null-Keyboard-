import { useEffect } from 'react';
import { handTracker } from '@/features/hand-tracking/HandTracker';
import { airInput } from '@/features/air-mode/AirInput';
import { useCalibration } from '@/engine/calibration/profile';
import { useLinkStore } from '@/stores/linkStore';

/**
 * While enabled: keep hand tracking running and feed it into the keyboard
 * engine as soon as a calibration profile and a live camera exist.
 */
export function useAirMode(enabled: boolean): void {
  const profile = useCalibration((s) => s.profile);
  const live = useLinkStore((s) => s.state === 'connected' && s.stream !== null);

  useEffect(() => {
    if (!enabled) return;
    return handTracker.acquire();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !profile || !live) return;
    airInput.start();
    return () => airInput.stop();
  }, [enabled, profile, live]);
}
