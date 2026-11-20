import { useMemo } from 'react';
import { getCapabilities, getDeviceInfo, getGpuInfo } from '@/utils/systemInfo';
import { Logo } from '@/components/common/Logo';

const yes = (b: boolean) => (b ? 'Yes' : 'No');

export function AboutPage() {
  const device = useMemo(getDeviceInfo, []);
  const caps = useMemo(getCapabilities, []);
  const gpu = useMemo(getGpuInfo, []);

  const rows: Array<[string, string]> = [
    ['Platform', device.platform ?? '—'],
    ['CPU threads', device.cores !== null ? String(device.cores) : '—'],
    ['Device memory', device.memoryGb !== null ? `≥ ${device.memoryGb} GB (browser-reported, capped)` : '—'],
    ['Screen', `${device.screen} @ ${device.dpr}× (${device.orientation ?? 'unknown orientation'})`],
    ['Viewport', device.viewport],
    ['Graphics', `${gpu.api}${gpu.renderer ? ` · ${gpu.renderer}` : ''}`],
    ['Touch points', String(caps.touchPoints)],
    ['Pointer', [caps.coarsePointer && 'touch/pen', caps.finePointer && 'mouse/trackpad'].filter(Boolean).join(' + ') || '—'],
    ['Hover-capable input', yes(caps.hover)],
    ['Secure context', yes(caps.secureContext)],
    ['Camera API', yes(caps.getUserMedia)],
    ['WebRTC', yes(caps.webrtc)],
    ['WebAssembly', yes(caps.wasm)],
    ['OffscreenCanvas', yes(caps.offscreenCanvas)],
    ['Service worker', yes(caps.serviceWorker)],
    ['IndexedDB', yes(caps.indexedDB)],
    ['Online', yes(device.online)],
  ];

  return (
    <div className="page page--narrow">
      <header className="page__head about__head">
        <Logo />
        <p className="about__tagline">Precision is beautiful. Complexity should disappear.</p>
        <p className="muted page__lead">
          Version {__APP_VERSION__}. Touch Mode and Air Mode (phone camera over WebRTC, MediaPipe hand tracking, calibration)
          share one keyboard engine.
        </p>
      </header>

      <section className="panel">
        <h2 className="panel__title">System information</h2>
        <dl className="sysinfo">
          {rows.map(([k, v]) => (
            <div key={k} className="sysinfo__row">
              <dt>{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
        <details className="sysinfo__ua">
          <summary>User agent</summary>
          <code className="mono">{device.userAgent}</code>
        </details>
      </section>

      <section className="panel">
        <h2 className="panel__title">What NULL-TECH can and can't do</h2>
        <ul className="tips">
          <li>Types into its own built-in editor. Copy the text or download it as TXT to use it elsewhere.</li>
          <li>
            It cannot type into other Windows apps: browsers don't allow web pages to inject system keystrokes. The
            engine is built so a future native companion app can add this.
          </li>
          <li>Touch Mode works with finger, Surface Pen, mouse and trackpad through one Pointer Events path.</li>
          <li>
            Air Mode uses one phone camera. A single camera can't measure true depth, so presses are recognized from calibrated
            fingertip motion (or by dwelling on a key).
          </li>
          <li>Air typing is slower and less precise than a physical keyboard; it is best for short text.</li>
        </ul>
      </section>
    </div>
  );
}
