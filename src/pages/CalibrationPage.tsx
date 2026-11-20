import { Button } from '@/components/common/Controls';
import { Icon } from '@/components/common/Icon';
import { navigate } from '@/app/Router';
import { useAppStore } from '@/stores/appStore';

const STEPS = [
  {
    title: 'Camera positioning',
    body: 'Live preview with both hands outlined and guidance on camera angle and distance.',
  },
  {
    title: 'Workspace selection',
    body: 'Mark the four corners of your typing area. A homography maps the camera image onto the keyboard plane.',
  },
  {
    title: 'Hand calibration',
    body: 'Rest both hands in typing position to record neutral fingertip positions and natural jitter.',
  },
  {
    title: 'Press calibration',
    body: 'Tap a few virtual keys on purpose. NEO TYPE learns your press depth, speed and a debounce interval.',
  },
  {
    title: 'Test',
    body: 'Fingertips highlight the keys beneath them; type a test sentence and fine-tune sensitivity.',
  },
];

/** Calibration wizard outline. Locked until a real camera stream exists (Stage 3–5). */
export function CalibrationPage() {
  const cameraLink = useAppStore((s) => s.cameraLink);
  const locked = cameraLink !== 'connected';

  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Air Mode · Step 2</p>
        <h1>Calibration</h1>
        <p className="muted page__lead">
          Calibration needs a live camera feed. {locked ? 'Connect your phone first — ' : ''}the wizard walks through
          five steps and can be re-run at any time.
        </p>
      </header>

      <ol className="wizard" aria-label="Calibration steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={`wizard__step${locked ? ' is-locked' : ''}`}>
            <span className="wizard__n mono">{i + 1}</span>
            <div>
              <h2>{s.title}</h2>
              <p className="muted">{s.body}</p>
            </div>
            {locked && <Icon name="lock" className="wizard__lock" />}
          </li>
        ))}
      </ol>

      <div className="page__actions">
        <Button variant="primary" icon="target" disabled={locked} title={locked ? 'Requires a phone camera link' : undefined}>
          Start calibration
        </Button>
        <Button icon="phone" onClick={() => navigate('/connect')}>
          Connect phone
        </Button>
      </div>
      <p className="field__hint">Calibration ships with Air Mode in Stage 5.</p>
    </div>
  );
}
