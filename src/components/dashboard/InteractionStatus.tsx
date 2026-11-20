import { FingerprintMark } from '@/brand/FingerprintMark';
import { Icon } from '@/components/common/Icon';
import { useAppStore } from '@/stores/appStore';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useAirStore } from '@/features/air-mode/airStore';
import { calibrationLevel, useCalibration } from '@/engine/calibration/profile';

/** One quiet capsule that says what the workspace is doing right now. */
export function InteractionStatus() {
  const mode = useAppStore((s) => s.mode);
  const live = useLinkStore((s) => s.state === 'connected' && s.stream !== null);
  const tracking = useTrackingStore((s) => s.status);
  const hands = useTrackingStore((s) => s.hands.length);
  const air = useAirStore();
  const level = useCalibration((s) => calibrationLevel(s.profile));

  if (mode === 'touch') {
    return (
      <span className="istatus" data-testid="interaction-status">
        <Icon name="hand" size={15} />
        <span>
          Touch input <em>· finger, pen, mouse</em>
        </span>
      </span>
    );
  }
  const text = !live
    ? 'Air Mode · connect a phone'
    : level === 'none'
      ? 'Air Mode · calibrate to start typing'
      : tracking !== 'running'
        ? 'Starting hand tracking…'
        : air.active
          ? `Air typing · ${air.method === 'motion' ? 'tap' : 'dwell'} · ${hands} hand${hands === 1 ? '' : 's'}`
          : 'Air Mode';
  const fp = air.active && hands > 0 ? 'active' : live ? 'scanning' : 'idle';
  return (
    <span className={`istatus${air.active ? ' istatus--on' : ''}`} data-testid="interaction-status">
      <FingerprintMark size={16} state={fp} />
      <span>{text}</span>
    </span>
  );
}
