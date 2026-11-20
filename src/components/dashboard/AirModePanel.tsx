import { Button, Slider, StatusDot, type DotTone } from '@/components/common/Controls';
import { navigate } from '@/app/Router';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useSettings } from '@/stores/settingsStore';
import { useAirStore } from '@/features/air-mode/airStore';
import { calibrationLevel, useCalibration } from '@/engine/calibration/profile';
import { hostLink } from '@/communication/camera-connection/HostLink';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { LandmarkOverlay } from '@/components/camera/LandmarkOverlay';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from './status';

/** Air Mode pipeline status. Every row reflects a real, live state. */
export function AirModePanel() {
  const link = useLinkStore((s) => s.state);
  const stream = useLinkStore((s) => s.stream);
  const tracking = useTrackingStore();
  const profile = useCalibration((s) => s.profile);
  const loaded = useCalibration((s) => s.loaded);
  const air = useAirStore();
  const sensitivity = useSettings((s) => s.air.sensitivity);
  const showPreview = useSettings((s) => s.air.showPreview);
  const mirrored = useSettings((s) => s.air.mirrored);
  const update = useSettings((s) => s.update);
  const level = calibrationLevel(profile);
  const live = link === 'connected' && !!stream;

  const trackTone: DotTone =
    tracking.status === 'running' ? (tracking.hands.length ? 'ok' : 'warn') : tracking.status === 'error' ? 'err' : tracking.status === 'loading' ? 'warn' : 'idle';
  const trackText =
    tracking.status === 'running'
      ? tracking.hands.length
        ? tracking.hands.map((h) => `${h.label} ${(h.score * 100).toFixed(0)}%`).join(' · ')
        : 'No hands in view'
      : tracking.status === 'loading'
        ? 'Loading hand model…'
        : tracking.status === 'error'
          ? 'Error'
          : live
            ? 'Starting…'
            : 'Waiting for camera';

  const rows: Array<{ label: string; value: string; tone: DotTone; note?: string }> = [
    { label: 'Phone camera', value: CAMERA_LINK_LABEL[link], tone: CAMERA_LINK_TONE[link] },
    {
      label: 'Hand tracking',
      value: trackText,
      tone: trackTone,
      ...(tracking.status === 'running'
        ? { note: `${tracking.detectFps ?? '—'} det/s · ${tracking.detectMs?.toFixed(0) ?? '—'} ms · ${tracking.delegate}` }
        : tracking.error
          ? { note: tracking.error }
          : {}),
    },
    {
      label: 'Calibration',
      value: !loaded ? '…' : level === 'full' ? 'Ready' : level === 'workspace' ? 'Workspace only' : 'Not calibrated',
      tone: level === 'full' ? 'ok' : level === 'workspace' ? 'warn' : 'idle',
      note:
        level === 'full'
          ? `Motion presses · separation ${profile!.press!.separation.toFixed(1)}×`
          : level === 'workspace'
            ? 'Dwell presses (hold a fingertip still on a key)'
            : 'Needed before air typing',
    },
  ];

  const recentGesture = air.gesture && performance.now() - air.gesture.at < 4000 ? air.gesture.text : null;

  return (
    <aside className="airpanel" aria-label="Air Mode status" data-testid="air-panel">
      <div className="airpanel__head">
        <span className="eyebrow">Air Mode</span>
        {air.active ? (
          <span className="airpanel__badge airpanel__badge--on" data-testid="air-active">
            Typing · {air.method}
          </span>
        ) : (
          <span className="airpanel__badge">Not typing</span>
        )}
      </div>

      {live && showPreview && (
        <CameraPreview stream={stream} mirrored={mirrored} className="camview--air">
          <LandmarkOverlay />
        </CameraPreview>
      )}

      {tracking.lost && <p className="airpanel__warn">Tracking lost — bring your hands back into view.</p>}

      <ul className="airpanel__list">
        {rows.map((r) => (
          <li key={r.label}>
            <StatusDot tone={r.tone} />
            <div>
              <div className="airpanel__row">
                <span>{r.label}</span>
                <strong>{r.value}</strong>
              </div>
              {r.note && <p className="airpanel__note">{r.note}</p>}
            </div>
          </li>
        ))}
      </ul>

      {air.active && (
        <div className="airpanel__gesture mono" data-testid="air-gesture">
          {recentGesture ?? 'Hover a key, then press'} <span className="muted">· {air.presses} presses</span>
        </div>
      )}

      {air.active && (
        <Slider label="Sensitivity" value={sensitivity} min={0} max={100} onChange={(v) => update('air', { sensitivity: v })} />
      )}

      <div className="airpanel__actions">
        {!live ? (
          <Button variant="primary" icon="phone" onClick={() => navigate('/connect')}>
            Connect phone
          </Button>
        ) : (
          <Button variant="danger" onClick={() => hostLink.stop()}>
            Disconnect
          </Button>
        )}
        <Button icon="target" onClick={() => navigate('/calibrate')} disabled={!live && level === 'none'}>
          {level === 'none' ? 'Calibrate' : 'Recalibrate'}
        </Button>
        {live && (
          <Button variant="quiet" onClick={() => update('air', { showPreview: !showPreview })}>
            {showPreview ? 'Hide video' : 'Show video'}
          </Button>
        )}
      </div>
    </aside>
  );
}
