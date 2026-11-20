import { useEffect, useState } from 'react';
import { PhoneLink, type PhoneSnapshot, type Resolution } from '@/communication/camera-connection/PhoneLink';
import { isRoomCode, normalizeRoomCode } from '@/communication/signaling/protocol';
import { useRoute } from '@/app/Router';
import { Logo } from '@/components/common/Logo';
import { Button, Segmented, StatusDot, type DotTone } from '@/components/common/Controls';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { FingerprintMark } from '@/brand/FingerprintMark';
import '@/styles/phone.css';

const STATE_TEXT: Record<PhoneSnapshot['state'], [string, DotTone]> = {
  idle: ['Not connected', 'idle'],
  connecting: ['Connecting…', 'warn'],
  'waiting-camera': ['Connecting to the Surface…', 'warn'],
  'permission-required': ['Camera permission required', 'warn'],
  'camera-unavailable': ['Camera unavailable', 'err'],
  streaming: ['Streaming to the Surface', 'ok'],
  reconnecting: ['Reconnecting…', 'warn'],
  'host-gone': ['Session ended', 'idle'],
  error: ['Could not connect', 'err'],
};

/**
 * The page the phone opens (from the QR code). Phone-first layout without the
 * desktop shell. Camera is requested only when the user taps Start.
 */
export function PhoneCameraPage() {
  const { query } = useRoute();
  const [code, setCode] = useState(() => normalizeRoomCode(query.get('code') ?? ''));
  const [resolution, setResolution] = useState<Resolution>('720p');
  // One link per page visit; later resolution changes go through setResolution().
  const [link] = useState(() => new PhoneLink(resolution));
  const [snap, setSnap] = useState<PhoneSnapshot>(link.snapshot);

  useEffect(() => link.subscribe(setSnap), [link]);
  useEffect(() => () => link.stop(), [link]);

  const running = !['idle', 'error', 'host-gone', 'permission-required', 'camera-unavailable'].includes(snap.state);
  const [text, tone] = STATE_TEXT[snap.state];
  const valid = isRoomCode(code);

  return (
    <div className="phone">
      <header className="phone__head">
        <Logo />
        <span className="phone__role">Vision sensor</span>
      </header>

      {!window.isSecureContext && (
        <div className="notice notice--warn">
          This page isn't on HTTPS, so the browser will block the camera. Open the <strong>https://</strong> address
          shown on the Surface.
        </div>
      )}

      <section className="phone__card">
        <div className="phone__status" data-testid="phone-state" data-state={snap.state}>
          <FingerprintMark
            size={28}
            state={snap.state === 'streaming' ? 'active' : ['connecting', 'waiting-camera', 'reconnecting'].includes(snap.state) ? 'scanning' : 'idle'}
          />
          <div className="phone__status-text">
            <span className="phone__status-line">
              <StatusDot tone={tone} pulse={tone === 'warn'} />
              {text}
            </span>
            {snap.message && <p className="phone__msg">{snap.message}</p>}
          </div>
          {snap.state === 'streaming' && <span className="live-badge">LIVE</span>}
        </div>
        <CameraPreview stream={snap.stream} className="camview--phone" label="Your camera" />
      </section>

      {!running ? (
        <form
          className="phone__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void link.start(code);
          }}
        >
          <label className="eyebrow" htmlFor="code">
            Pairing code (shown on the Surface)
          </label>
          <input
            id="code"
            className="phone__code mono"
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={8}
            placeholder="ABC123"
            data-testid="phone-code"
          />
          <Segmented<Resolution>
            label="Resolution"
            value={resolution}
            onChange={(r) => {
              setResolution(r);
              void link.setResolution(r);
            }}
            options={[
              { value: '480p', label: '480p' },
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p' },
            ]}
          />
          <Button type="submit" variant="primary" icon="camera" disabled={!valid} data-testid="phone-start">
            Start camera
          </Button>
          <p className="field__hint">
            The camera turns on only after you tap Start. Video goes straight to your Surface over Wi-Fi and is never
            recorded.
          </p>
        </form>
      ) : (
        <div className="phone__controls">
          {snap.cameras.length > 1 && (
            <label className="phone__select">
              <span className="eyebrow">Camera</span>
              <select
                className="select"
                value={snap.deviceId ?? ''}
                onChange={(e) => void link.switchCamera(e.target.value)}
              >
                {snap.cameras.map((c, i) => (
                  <option key={c.deviceId || i} value={c.deviceId}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {snap.settings?.width && (
            <p className="field__hint mono">
              {snap.settings.width}×{snap.settings.height} @ {Math.round(snap.settings.frameRate ?? 0)} fps
            </p>
          )}
          <Button variant="danger" onClick={() => link.stop()} data-testid="phone-stop">
            Stop camera
          </Button>
        </div>
      )}

      <ul className="tips phone__tips">
        <li>Keep this page open and the screen on.</li>
        <li>Mount the phone 35–50 cm above the desk, looking down at your hands.</li>
        <li>Both hands should stay in the picture.</li>
      </ul>
    </div>
  );
}
