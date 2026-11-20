import { useEffect, useState } from 'react';
import { frameMeter, type FrameStats } from '@/engine/performance/metrics';

/** Subscribes to the shared rAF frame meter (updates twice per second). */
export function useFrameStats(): FrameStats {
  const [stats, setStats] = useState<FrameStats>(frameMeter.current);
  useEffect(() => frameMeter.subscribe(setStats), []);
  return stats;
}

/** Re-render on an interval to show values from RollingStat buffers. */
export function useTicker(ms = 500): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
