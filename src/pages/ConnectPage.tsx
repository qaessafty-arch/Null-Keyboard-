import { useEffect, useState } from 'react';
import { Button, StatusDot } from '@/components/common/Controls';
import { Icon, type IconName } from '@/components/common/Icon';
import { navigate } from '@/app/Router';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { hostLink } from '@/communication/camera-connection/HostLink';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from '@/components/dashboard/status';
import { QrCode } from '@/components/camera/QrCode';
import { CameraStage, type StagePhase } from '@/components/camera/CameraStage';
import { LinkStatsGrid } from '@/components/camera/LinkStatsGrid';
import { TrackingSummary } from '@/components/camera/TrackingSummary';
import { PlacementDiagram } from '@/components/camera/PlacementDiagram';
import { FingerprintMark } from '@/brand/FingerprintMark';
import { useHandTracking } from '@/hooks/useHandTracking';
import '@/styles/connect.css';

interface Step {
  title: string;
  body: string;
  icon: IconName;
  done: boolean;
}

export function ConnectPage() {
  const link = useLinkStore();
  const hands = useTrackingStore((s) => s.hands.length);
  const [urlIndex, setUrlIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const url = link.urls[urlIndex] ?? link.urls[0] ?? null;
  const pairUrl = url && link.code ? `${url}/#/camera?code=${link.code}` : null;
  const insecure = !!url && url.startsWith('http:');
  const live = link.state === 'connected' && !!link.stream;

  // Real landmarks on the preview so placement can be checked right here.
  useHandTracking(live);

  useEffect(() => {
    if (urlIndex >= link.urls.length) setUrlIndex(0);
  }, [link.urls.length, urlIndex]);

  const phase: StagePhase = live
    ? 'live'
    : link.state === 'idle'
      ? 'idle'
      : link.state === 'reconnecting' || link.state === 'disconnected'
        ? 'interrupted'
        : link.state === 'waiting'
          ? 'waiting'
          : 'connecting';
  const caption = {
    idle: 'Your camera preview appears here once the phone is paired.',
    waiting: 'Waiting for your phone…',
    connecting:
      link.state === 'permission-required'
        ? 'Allow camera access on your phone.'
        : link.state === 'unavailable'
          ? 'The phone camera is unavailable.'
          : 'Establishing a secure local link…',
    interrupted: 'Connection interrupted — reconnecting…',
    live: '',
  }[phase];

  // Step completion from real link state.
  const phoneSeen = link.phone !== null || ['connecting', 'permission-required', 'connected', 'reconnecting'].includes(link.state);
  const secure = link.phone !== null && link.phone.camera !== 'unavailable';
  const steps: Step[] = [
    {
      title: 'Connect to the same Wi-Fi',
      body: link.serverReachable ? `This device is reachable at ${url?.replace(/^https?:\/\//, '')}.` : 'Phone and this device on one network.',
      icon: 'wifi',
      done: link.serverReachable || phoneSeen,
    },
    { title: 'Scan the pairing code', body: 'Use the phone’s camera app, or open the address and enter the code.', icon: 'qr', done: phoneSeen },
    {
      title: 'Verify the secure connection',
      body: 'If the browser warns about the certificate, choose Advanced → Proceed.',
      icon: 'shieldCheck',
      done: secure,
    },
    { title: 'Start the camera', body: 'Tap Start camera on the phone and allow access.', icon: 'video', done: live },
    { title: 'Position the phone', body: 'Above the desk, looking down at both hands.', icon: 'hand', done: live && hands >= 2 },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="page page--wide connect">
      <header className="connect__head">
        <div>
          <p className="eyebrow">Air Mode</p>
          <h1>Connect your phone</h1>
          <p className="page__lead">
            Turn your phone into a precision vision sensor. Stream directly to your workspace over your local network.
          </p>
        </div>
        <div className="connect__state">
          <StatusDot tone={CAMERA_LINK_TONE[link.state]} pulse={['waiting', 'connecting', 'reconnecting'].includes(link.state)} />
          <strong data-testid="connect-state">{CAMERA_LINK_LABEL[link.state]}</strong>
        </div>
      </header>

      <div className={`connect__grid${expanded ? ' connect__grid--expanded' : ''}`}>
        <section className="connect__stage" aria-label="Camera preview">
          <CameraStage
            stream={link.stream}
            phase={phase}
            caption={caption}
            meta={link.stats.width ? `${link.stats.width}×${link.stats.height} · ${link.stats.fps?.toFixed(0) ?? '—'} fps` : undefined}
            footer={<TrackingSummary />}
            expandable
            expanded={expanded}
            onExpandedChange={setExpanded}
          />
          {link.error && <p className="linkstate__error">{link.error}</p>}
          <LinkStatsGrid />
        </section>

        <aside className="connect__guide" aria-label="Pairing">
          {link.state === 'idle' ? (
            <div className="pair pair--start">
              <FingerprintMark size={44} />
              <div>
                <h2>Pair a phone</h2>
                <p className="muted">Get a QR code and a six-character code for your phone.</p>
              </div>
              <Button variant="primary" icon="link" onClick={() => hostLink.start()} data-testid="start-pairing">
                Start pairing
              </Button>
            </div>
          ) : live ? (
            <div className="pair pair--live">
              <FingerprintMark size={36} state="success" />
              <div className="pair__live-text">
                <h2>Phone connected</h2>
                <p className="muted">{link.phone?.label ? link.phone.label : 'Streaming over your local network.'}</p>
              </div>
              <div className="page__actions">
                <Button icon="target" onClick={() => navigate('/calibrate')}>
                  Calibrate
                </Button>
                <Button variant="danger" onClick={() => hostLink.stop()} data-testid="disconnect">
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="pair">
              <div className="pair__qr">
                {pairUrl && !insecure ? (
                  <QrCode value={pairUrl} size={168} label={`Pairing link ${pairUrl}`} />
                ) : (
                  <div className="pair__qr-off">
                    <FingerprintMark size={40} state="scanning" />
                    <span>{link.code ? 'No network address' : 'Preparing…'}</span>
                  </div>
                )}
              </div>
              <div className="pair__info">
                <span className="eyebrow">Pairing code</span>
                <span className="pair__code mono" data-testid="pairing-code">
                  {link.code ? `${link.code.slice(0, 3)} ${link.code.slice(3)}` : '··· ···'}
                </span>
                {pairUrl && (
                  <span className="pair__url mono" data-testid="pairing-url">
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
                <div className="page__actions">
                  {link.code && (
                    <Button variant="quiet" icon="undo" onClick={() => hostLink.newCode()}>
                      New code
                    </Button>
                  )}
                  <Button variant="quiet" onClick={() => hostLink.stop()} data-testid="disconnect">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {link.state !== 'idle' && link.code && !link.serverReachable && !live && (
            <div className="notice notice--warn">
              This page is served on <code>localhost</code> only, so the phone can’t reach it. Run <code>npm start</code> (HTTPS on your
              network) and open this page again.
            </div>
          )}
          {insecure && !live && (
            <div className="notice notice--warn">
              This server uses plain HTTP. Phones only allow the camera on HTTPS — run <code>npm start</code> instead.
            </div>
          )}

          <ol className="guide" aria-label="Connection steps">
            {steps.map((s, i) => (
              <li key={s.title} className={`guide__step${s.done ? ' is-done' : ''}${i === current ? ' is-current' : ''}`}>
                <span className="guide__n mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="guide__icon">
                  <Icon name={s.done ? 'check' : s.icon} size={16} />
                </span>
                <span className="guide__text">
                  <strong>{s.title}</strong>
                  <span>{s.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <PlacementDiagram />
        </aside>
      </div>
    </div>
  );
}
