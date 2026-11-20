import { useEffect, useMemo, useState } from 'react';
import { Button, StatusDot } from '@/components/common/Controls';
import { navigate } from '@/app/Router';
import { useLinkStore } from '@/stores/linkStore';
import { hostLink } from '@/communication/camera-connection/HostLink';
import { getCapabilities } from '@/utils/systemInfo';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from '@/components/dashboard/status';
import { QrCode } from '@/components/camera/QrCode';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { LinkStatsGrid } from '@/components/camera/LinkStatsGrid';
import { LandmarkOverlay } from '@/components/camera/LandmarkOverlay';
import { TrackingSummary } from '@/components/camera/TrackingSummary';
import { useHandTracking } from '@/hooks/useHandTracking';

const STEPS = [
  'Put the phone on the same Wi-Fi as this Surface.',
  'Scan the QR code with the phone camera (or open the address and type the code).',
  'If the browser warns about the certificate, choose Advanced → Proceed (see README to remove this warning).',
  'Tap Start camera and allow camera access.',
  'Prop the phone above the desk, rear camera looking down at your hands.',
];

export function ConnectPage() {
  const link = useLinkStore();
  const caps = useMemo(getCapabilities, []);
  const [urlIndex, setUrlIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const url = link.urls[urlIndex] ?? link.urls[0] ?? null;
  const pairUrl = url && link.code ? `${url}/#/camera?code=${link.code}` : null;
  const insecure = !!url && url.startsWith('http:');

  useEffect(() => {
    if (urlIndex >= link.urls.length) setUrlIndex(0);
  }, [link.urls.length, urlIndex]);

  const live = link.state === 'connected' && !!link.stream;
  // Show real landmarks on the preview so camera placement can be checked here.
  useHandTracking(live && showPreview);

  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Air Mode · Step 1</p>
        <h1>Connect your phone camera</h1>
        <p className="muted page__lead">
          Your phone becomes the vision sensor. Video goes directly from the phone to this Surface over your Wi-Fi —
          never to the internet.
        </p>
      </header>

      <div className="page__grid">
        <section className="panel panel--status" aria-label="Connection status">
          <div className="linkstate">
            <StatusDot tone={CAMERA_LINK_TONE[link.state]} pulse={['waiting', 'connecting', 'reconnecting'].includes(link.state)} />
            <strong data-testid="connect-state">{CAMERA_LINK_LABEL[link.state]}</strong>
            {live && <span className="live-badge">● LIVE</span>}
          </div>
          {link.error && <p className="linkstate__error">{link.error}</p>}

          {link.state === 'idle' && (
            <div className="pairing__start">
              <p className="muted">Start pairing to get a QR code and a 6-character code for your phone.</p>
              <Button variant="primary" icon="phone" onClick={() => hostLink.start()} data-testid="start-pairing">
                Start pairing
              </Button>
            </div>
          )}

          {link.state !== 'idle' && !live && (
            <div className="pairing">
              <div className="pairing__qr-wrap">
                {pairUrl && !insecure ? (
                  <QrCode value={pairUrl} size={176} label={`Pairing link ${pairUrl}`} />
                ) : (
                  <div className="pairing__qr pairing__qr--off">{link.code ? 'No LAN address' : '…'}</div>
                )}
              </div>
              <div className="pairing__body">
                <span className="eyebrow">Pairing code</span>
                <span className="pairing__code mono" data-testid="pairing-code">
                  {link.code ? `${link.code.slice(0, 3)} ${link.code.slice(3)}` : '······'}
                </span>
                {pairUrl && (
                  <span className="pairing__url mono" data-testid="pairing-url">
                    {url}
                  </span>
                )}
                {link.urls.length > 1 && (
                  <select
                    className="select"
                    value={urlIndex}
                    onChange={(e) => setUrlIndex(Number(e.target.value))}
                    aria-label="Network address for the phone"
                  >
                    {link.urls.map((u, i) => (
                      <option key={u} value={i}>
                        {u}
                      </option>
                    ))}
                  </select>
                )}
                {link.phone && (
                  <span className="field__hint">
                    Phone: {link.phone.camera === 'streaming' ? 'camera on' : link.phone.camera.replace('-', ' ')}
                    {link.phone.detail ? ` — ${link.phone.detail}` : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {link.state !== 'idle' && link.code && !link.serverReachable && !live && (
            <div className="notice notice--warn">
              This page is served on <code>localhost</code> only, so the phone can't reach it. Close it and run{' '}
              <code>npm start</code> (HTTPS on your network), then open this page again.
            </div>
          )}
          {insecure && !live && (
            <div className="notice notice--warn">
              This server uses plain HTTP. Phones only allow the camera on HTTPS — run <code>npm start</code> or{' '}
              <code>npm run dev:lan</code> instead.
            </div>
          )}

          {live && (
            <>
              <div className="preview-head">
                <span className="eyebrow">Live preview</span>
                <Button variant="quiet" onClick={() => setShowPreview((v) => !v)}>
                  {showPreview ? 'Hide' : 'Show'}
                </Button>
              </div>
              {showPreview && (
                <CameraPreview stream={link.stream} className="camview--panel">
                  <LandmarkOverlay />
                </CameraPreview>
              )}
              {showPreview && <TrackingSummary />}
              <LinkStatsGrid />
            </>
          )}

          {link.state !== 'idle' && (
            <div className="page__actions">
              {live && (
                <Button variant="primary" icon="target" onClick={() => navigate('/calibrate')}>
                  Calibrate
                </Button>
              )}
              {!live && link.code && (
                <Button icon="undo" onClick={() => hostLink.newCode()}>
                  New code
                </Button>
              )}
              <Button variant="danger" onClick={() => hostLink.stop()} data-testid="disconnect">
                {live ? 'Disconnect camera' : 'Cancel pairing'}
              </Button>
            </div>
          )}
        </section>

        <section className="panel" aria-label="How to pair">
          <h2 className="panel__title">How to pair</h2>
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
            <li>About 35–50 cm above the desk, looking down at the typing area.</li>
            <li>Both hands and all fingertips in frame while typing.</li>
            <li>Even light; avoid direct sunlight and glossy desks.</li>
            <li>A plain, matte surface under your hands improves tracking.</li>
          </ul>
          <h2 className="panel__title">This browser</h2>
          <ul className="checklist checklist--compact">
            <li>
              <StatusDot tone={caps.webrtc ? 'ok' : 'err'} />
              <span>WebRTC</span>
              <span className={`checklist__v ${caps.webrtc ? 'is-ok' : 'is-bad'}`}>{caps.webrtc ? 'Yes' : 'No'}</span>
            </li>
            <li>
              <StatusDot tone={caps.videoFrameCallback ? 'ok' : 'warn'} />
              <span>Per-frame video callback</span>
              <span className={`checklist__v ${caps.videoFrameCallback ? 'is-ok' : 'is-bad'}`}>
                {caps.videoFrameCallback ? 'Yes' : 'No'}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
