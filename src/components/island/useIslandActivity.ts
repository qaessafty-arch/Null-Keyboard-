import { useEffect, useRef, useState } from 'react';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useSettings } from '@/stores/settingsStore';
import { useCalibration } from '@/engine/calibration/profile';
import { THEME_NAMES } from '@/styles/themes';
import type { IconName } from '@/components/common/Icon';

export interface IslandActivity {
  id: number;
  icon: IconName | 'fingerprint';
  title: string;
  sub?: string;
  tone: 'ok' | 'warn' | 'idle' | 'laser';
}

const DURATION = 2600;

/**
 * Turns real state transitions into short "live activities" for the island.
 * Only genuine events trigger one — nothing is shown on a timer.
 */
export function useIslandActivity(): IslandActivity | null {
  const [activity, setActivity] = useState<IslandActivity | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const show = (a: Omit<IslandActivity, 'id'>) => {
      if (timer.current) clearTimeout(timer.current);
      setActivity({ ...a, id: ++seq.current });
      timer.current = setTimeout(() => setActivity(null), DURATION);
    };
    let handsAnnounced = false;

    const offLink = useLinkStore.subscribe((s, p) => {
      if (s.state === p.state) return;
      if (s.state === 'connected') {
        show({ icon: 'phone', title: 'Phone connected', sub: s.phone?.label ? shortLabel(s.phone.label) : 'Streaming over your network', tone: 'ok' });
      } else if (s.state === 'reconnecting') {
        show({ icon: 'wifi', title: 'Reconnecting…', sub: 'The link to your phone was interrupted', tone: 'warn' });
      } else if (p.state === 'connected' && (s.state === 'idle' || s.state === 'waiting' || s.state === 'disconnected')) {
        show({ icon: 'phone', title: 'Phone disconnected', sub: 'The camera is off', tone: 'idle' });
      }
    });

    const offTrack = useTrackingStore.subscribe((s, p) => {
      if (s.status !== 'running') {
        if (s.status === 'off') handsAnnounced = false;
        return;
      }
      if (s.lost && !p.lost) show({ icon: 'fingerprint', title: 'Tracking lost', sub: 'Bring your hands back into view', tone: 'warn' });
      if (!handsAnnounced && s.hands.length > 0) {
        handsAnnounced = true;
        show({ icon: 'fingerprint', title: `${s.hands.length === 2 ? 'Both hands' : 'Hand'} detected`, sub: 'Tracking is live', tone: 'ok' });
      }
    });

    const offTheme = useSettings.subscribe((s, p) => {
      if (s.general.theme !== p.general.theme) {
        show({ icon: 'laser', title: `Laser · ${THEME_NAMES[s.general.theme]}`, tone: 'laser' });
      }
    });

    const offCal = useCalibration.subscribe((s, p) => {
      if (s.profile && s.profile.createdAt !== p.profile?.createdAt && p.loaded) {
        show({ icon: 'target', title: 'Calibration saved', sub: s.profile.press ? 'Tap presses enabled' : 'Dwell presses enabled', tone: 'ok' });
      }
    });

    return () => {
      offLink();
      offTrack();
      offTheme();
      offCal();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return activity;
}

function shortLabel(label: string): string {
  const base = label.split(/[\\/]/).pop() ?? label;
  return base.length > 34 ? `${base.slice(0, 33)}…` : base;
}
