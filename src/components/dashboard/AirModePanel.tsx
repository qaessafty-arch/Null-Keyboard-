import { Button, StatusDot } from '@/components/common/Controls';
import { navigate } from '@/app/Router';
import { useAppStore } from '@/stores/appStore';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from './status';

/**
 * Air Mode status. Shows the real state of each pipeline stage. Nothing here
 * is simulated: until the camera link (Stage 3), hand tracking (Stage 4) and
 * calibration (Stage 5) exist, they are reported as not available.
 */
export function AirModePanel() {
  const cameraLink = useAppStore((s) => s.cameraLink);
  const calibrated = useAppStore((s) => s.calibrated);

  const rows = [
    {
      label: 'Phone camera',
      value: CAMERA_LINK_LABEL[cameraLink],
      tone: CAMERA_LINK_TONE[cameraLink],
      note: 'WebRTC pairing ships in Stage 3',
    },
    { label: 'Hand tracking', value: 'Not running', tone: 'idle' as const, note: 'MediaPipe Hand Landmarker — Stage 4' },
    {
      label: 'Calibration',
      value: calibrated ? 'Ready' : 'Not calibrated',
      tone: calibrated ? ('ok' as const) : ('idle' as const),
      note: 'Workspace + press calibration — Stage 5',
    },
  ];

  return (
    <aside className="airpanel" aria-label="Air Mode status" data-testid="air-panel">
      <div className="airpanel__head">
        <span className="eyebrow">Air Mode pipeline</span>
        <span className="airpanel__badge">In development</span>
      </div>
      <ul className="airpanel__list">
        {rows.map((r) => (
          <li key={r.label}>
            <StatusDot tone={r.tone} />
            <div>
              <div className="airpanel__row">
                <span>{r.label}</span>
                <strong>{r.value}</strong>
              </div>
              <p className="airpanel__note">{r.note}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="airpanel__hint muted">
        Air typing isn't available in this build. The keyboard below still takes touch, pen and mouse input, so you
        can keep typing.
      </p>
      <div className="airpanel__actions">
        <Button variant="primary" icon="phone" onClick={() => navigate('/connect')}>
          Connect phone
        </Button>
        <Button icon="target" onClick={() => navigate('/calibrate')}>
          Calibration
        </Button>
      </div>
    </aside>
  );
}
