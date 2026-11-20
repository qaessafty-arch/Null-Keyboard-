import { useMemo } from 'react';
import { Button, StatusDot } from '@/components/common/Controls';
import { Icon } from '@/components/common/Icon';
import { navigate } from '@/app/Router';
import { useAppStore } from '@/stores/appStore';
import { getCapabilities } from '@/utils/systemInfo';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from '@/components/dashboard/status';

const STEPS = [
  'Open NEO TYPE on the Surface and choose Air Mode.',
  'Select Connect phone — the Surface shows a QR code and a 6-character code.',
  'On the Galaxy S25 Ultra, scan the QR code (or open the link and enter the code).',
  'Allow camera access when the phone asks.',
  'Pick the rear camera.',
  'The phone streams video to the Surface over WebRTC on your Wi-Fi — nothing goes to the cloud.',
];

/**
 * Phone connection screen. The WebRTC + signaling pipeline is Stage 3, so this
 * screen reports the real link state (idle) and checks this browser's
 * readiness. It never pretends to pair.
 */
export function ConnectPage() {
  const cameraLink = useAppStore((s) => s.cameraLink);
  const caps = useMemo(getCapabilities, []);

  const checks = [
    {
      label: 'Secure context (HTTPS or localhost)',
      ok: caps.secureContext,
      note: caps.secureContext
        ? 'Camera APIs are allowed on this origin.'
        : 'Open over HTTPS (see README → HTTPS for LAN) or the phone camera page will be blocked.',
    },
    { label: 'WebRTC (RTCPeerConnection)', ok: caps.webrtc, note: 'Needed to receive the phone stream.' },
    { label: 'WebSocket', ok: caps.webSocket, note: 'Needed for the local signaling server.' },
    {
      label: 'requestVideoFrameCallback',
      ok: caps.videoFrameCallback,
      note: 'Lets hand tracking run once per camera frame instead of per screen frame.',
    },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Air Mode · Step 1</p>
        <h1>Connect your phone camera</h1>
        <p className="muted page__lead">
          Your phone becomes the vision sensor. Prop it above the typing area (a stack of books works) so the rear
          camera sees both hands.
        </p>
      </header>

      <div className="page__grid">
        <section className="panel panel--status" aria-label="Connection status">
          <div className="pairing">
            <div className="pairing__qr" aria-hidden="true">
              <Icon name="lock" size={28} />
            </div>
            <div className="pairing__body">
              <div className="pairing__state">
                <StatusDot tone={CAMERA_LINK_TONE[cameraLink]} />
                <strong data-testid="connect-state">{CAMERA_LINK_LABEL[cameraLink]}</strong>
              </div>
              <p className="muted">
                Pairing isn't available in this build. The phone camera page, signaling server and WebRTC link are
                the next milestone (Stage 3). No pairing code is shown because none exists yet.
              </p>
              <Button variant="primary" icon="phone" disabled title="Available in Stage 3">
                Generate pairing code
              </Button>
            </div>
          </div>

          <h2 className="panel__title">This browser</h2>
          <ul className="checklist">
            {checks.map((c) => (
              <li key={c.label}>
                <StatusDot tone={c.ok ? 'ok' : 'err'} />
                <div>
                  <span>{c.label}</span>
                  <p className="field__hint">{c.note}</p>
                </div>
                <span className={`checklist__v ${c.ok ? 'is-ok' : 'is-bad'}`}>{c.ok ? 'Yes' : 'No'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-label="How pairing will work">
          <h2 className="panel__title">How pairing will work</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={i}>
                <span className="steps__n mono">{String(i + 1).padStart(2, '0')}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <h2 className="panel__title">Camera placement</h2>
          <ul className="tips">
            <li>Mount the phone 35–50 cm above the desk, looking down at the typing area.</li>
            <li>Both hands and all fingertips should stay in frame while typing.</li>
            <li>Avoid direct sunlight and glossy desks that reflect light.</li>
            <li>A plain, matte surface under your hands improves tracking.</li>
          </ul>
          <div className="page__actions">
            <Button icon="keyboard" onClick={() => navigate('/touch')}>
              Use Touch Mode meanwhile
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
