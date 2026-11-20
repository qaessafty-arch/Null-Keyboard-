import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { calibrationLevel, useCalibration } from '@/engine/calibration/profile';
import { useAppStore } from '@/stores/appStore';
import { useSettings } from '@/stores/settingsStore';
import { useFrameStats, useTicker } from '@/hooks/useFrameStats';
import { inputLatency } from '@/engine/performance/metrics';
import { StatusDot } from '@/components/common/Controls';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from './status';

const fmt = (n: number | null, digits = 0, unit = '') => (n === null ? '—' : `${n.toFixed(digits)}${unit}`);

/** Bottom status strip. Every value is measured; unmeasured values show "—". */
export function StatusBar() {
  const mode = useAppStore((s) => s.mode);
  const cameraLink = useLinkStore((s) => s.state);
  const tracking = useTrackingStore((s) => s.status);
  const trackHands = useTrackingStore((s) => s.hands.length);
  const trackFps = useTrackingStore((s) => s.detectFps);
  const level = useCalibration((s) => calibrationLevel(s.profile));
  const sensitivity = useSettings((s) => s.air.sensitivity);
  const quality = useSettings((s) => s.performance.quality);
  const frames = useFrameStats();
  useTicker(500);
  const latency = inputLatency.mean();

  const fpsTone = frames.fps === null ? 'idle' : frames.fps >= 50 ? 'ok' : frames.fps >= 28 ? 'warn' : 'err';

  return (
    <footer className="statusbar mono" aria-label="System status">
      <span className="statusbar__item" title="MediaPipe hand tracking">
        <StatusDot
          tone={tracking === 'running' ? (trackHands ? 'ok' : 'warn') : tracking === 'error' ? 'err' : tracking === 'loading' ? 'warn' : 'idle'}
        />
        <span className="statusbar__k">Tracking</span>
        <span className="statusbar__v" data-testid="status-tracking">
          {tracking === 'running'
            ? `${trackHands} hand${trackHands === 1 ? '' : 's'} · ${trackFps ?? '—'}/s`
            : tracking === 'loading'
              ? 'loading'
              : tracking === 'error'
                ? 'error'
                : mode === 'air' && cameraLink !== 'connected'
                  ? 'no camera'
                  : 'off'}
        </span>
      </span>
      <span className="statusbar__item">
        <StatusDot tone={CAMERA_LINK_TONE[cameraLink]} />
        <span className="statusbar__k">Camera</span>
        <span className="statusbar__v">{CAMERA_LINK_LABEL[cameraLink]}</span>
      </span>
      <span className="statusbar__item" title="Render frame rate (requestAnimationFrame)">
        <StatusDot tone={fpsTone} />
        <span className="statusbar__k">FPS</span>
        <span className="statusbar__v" data-testid="status-fps">
          {fmt(frames.fps)}
        </span>
      </span>
      <span className="statusbar__item" title="Pointer event → next frame, mean of recent presses">
        <span className="statusbar__k">Latency</span>
        <span className="statusbar__v" data-testid="status-latency">
          {fmt(latency, 1, ' ms')}
        </span>
      </span>
      <span className="statusbar__item statusbar__item--wide">
        <span className="statusbar__k">Sensitivity</span>
        <span className="statusbar__v">{sensitivity}</span>
      </span>
      <span className="statusbar__item statusbar__item--wide">
        <span className="statusbar__k">Calibration</span>
        <span className="statusbar__v">{level === 'full' ? 'ready' : level === 'workspace' ? 'workspace only' : 'not calibrated'}</span>
      </span>
      <span className="statusbar__item statusbar__item--end">
        <span className="statusbar__k">Quality</span>
        <span className="statusbar__v">{quality.toUpperCase()}</span>
      </span>
    </footer>
  );
}
