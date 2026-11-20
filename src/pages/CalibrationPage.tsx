import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, StatusDot, type DotTone } from '@/components/common/Controls';
import { Icon } from '@/components/common/Icon';
import { navigate } from '@/app/Router';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useTextStore } from '@/features/text-output/textStore';
import { useHandTracking } from '@/hooks/useHandTracking';
import { useAirMode } from '@/hooks/useAirMode';
import { handTracker } from '@/features/hand-tracking/HandTracker';
import { FINGERS, type TrackedHand } from '@/features/hand-tracking/types';
import { CameraPreview } from '@/components/camera/CameraPreview';
import { LandmarkOverlay, type OverlayExtras } from '@/components/camera/LandmarkOverlay';
import { TrackingSummary } from '@/components/camera/TrackingSummary';
import { CornerEditor } from '@/components/calibration/CornerEditor';
import { VirtualKeyboard } from '@/components/keyboard/VirtualKeyboard';
import {
  applyHomography,
  computeHomography,
  invertMat3,
  isUsableQuad,
  UNIT_SQUARE,
  type Mat3,
  type Point2,
} from '@/engine/coordinates/homography';
import { KeyGeometry } from '@/engine/collision/keyGeometry';
import { QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';
import {
  PressSpotter,
  addRestSample,
  guessCorners,
  summarizePresses,
  summarizeRest,
  type PressSample,
  type RestSample,
} from '@/engine/calibration/calibrationMath';
import { handScale } from '@/features/gesture-recognition/features';
import { calibrationLevel, useCalibration, type CalibrationProfile } from '@/engine/calibration/profile';
import { notify } from '@/stores/noticeStore';

const STEPS = ['Camera position', 'Keyboard area', 'Resting hands', 'Press calibration', 'Test'] as const;
const PROMPTS = ['KeyF', 'KeyJ', 'KeyD', 'KeyK', 'Space', 'KeyS', 'KeyL', 'KeyG', 'KeyH', 'Space'];
const MIN_PRESSES = 6;
const REST_MS = 3000;
const geometry = new KeyGeometry(QWERTY_US);
const keyName = (k: string) => (k === 'Space' ? 'Space' : k.replace(/^(Key|Digit)/, ''));

type Neutral = NonNullable<CalibrationProfile['neutral']>;
type Noise = NonNullable<CalibrationProfile['noise']>;

/** Average brightness of the preview, sampled from a tiny canvas once a second. */
function useBrightness(video: HTMLVideoElement | null): number | null {
  const [luma, setLuma] = useState<number | null>(null);
  useEffect(() => {
    if (!video) return;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 18;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const id = setInterval(() => {
      if (!ctx || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      setLuma(s / (d.length / 4));
    }, 1000);
    return () => clearInterval(id);
  }, [video]);
  return luma;
}

/** Latest tracked hands at ~5 Hz for React (the overlay draws at full rate itself). */
function useHandsSnapshot(): { hands: TrackedHand[]; vw: number; vh: number } {
  const [snap, setSnap] = useState<{ hands: TrackedHand[]; vw: number; vh: number }>({ hands: [], vw: 1280, vh: 720 });
  useEffect(() => {
    let last = 0;
    return handTracker.subscribe((f) => {
      const now = performance.now();
      if (now - last < 200) return;
      last = now;
      setSnap({ hands: f.hands, vw: f.videoWidth || 1280, vh: f.videoHeight || 720 });
    });
  }, []);
  return snap;
}

export function CalibrationPage() {
  const linkState = useLinkStore((s) => s.state);
  const stream = useLinkStore((s) => s.stream);
  const live = linkState === 'connected' && !!stream;
  const tracking = useTrackingStore((s) => s.status);
  const existing = useCalibration((s) => s.profile);
  const save = useCalibration((s) => s.save);
  const clear = useCalibration((s) => s.clear);

  const [step, setStep] = useState(0);
  const [corners, setCorners] = useState<Point2[] | null>(existing?.corners ?? null);
  const [rest, setRest] = useState<{ samples: RestSample; neutral: Neutral; noise: Noise } | null>(null);
  const [presses, setPresses] = useState<PressSample[]>([]);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  useHandTracking(live);
  useAirMode(live && step === 4); // live air typing in the test step
  const { hands, vw, vh } = useHandsSnapshot();
  const aspect = vw / vh;
  const luma = useBrightness(video);

  const H = useMemo(() => (corners && isUsableQuad(corners) ? computeHomography(corners, UNIT_SQUARE) : null), [corners]);
  const Hinv = useMemo(() => (H ? invertMat3(H) : null), [H]);

  // The keyboard area and every key, projected onto the live camera image.
  const extras: OverlayExtras = useMemo(
    () => ({
      draw: (ctx, toPx) => {
        if (!corners || step < 1) return;
        const css = getComputedStyle(document.documentElement);
        const accent = css.getPropertyValue('--accent').trim() || '#ff174f';
        const poly = (pts: Point2[]) => {
          ctx.beginPath();
          pts.forEach((p, i) => {
            const [x, y] = toPx(p.x, p.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
        };
        ctx.lineWidth = 2;
        ctx.strokeStyle = accent;
        ctx.fillStyle = 'rgba(255,23,79,0.08)';
        poly(corners);
        ctx.fill();
        ctx.stroke();
        if (!Hinv) return;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        for (const r of geometry.rects) {
          poly(
            [
              { x: r.x, y: r.y },
              { x: r.x + r.w, y: r.y },
              { x: r.x + r.w, y: r.y + r.h },
              { x: r.x, y: r.y + r.h },
            ].map((p) => applyHomography(Hinv, p)),
          );
          ctx.stroke();
        }
      },
    }),
    [corners, Hinv, step],
  );

  if (!live) {
    return (
      <div className="page">
        <header className="page__head">
          <p className="eyebrow">Air Mode · Step 2</p>
          <h1>Calibration</h1>
          <p className="muted page__lead">
            Calibration needs the live phone camera. Connect your phone first.
            {existing && ' A saved calibration exists on this device and will be used for air typing.'}
          </p>
        </header>
        <ol className="wizard" aria-label="Calibration steps">
          {STEPS.map((s, i) => (
            <li key={s} className="wizard__step is-locked">
              <span className="wizard__n mono">{i + 1}</span>
              <div>
                <h2>{s}</h2>
              </div>
              <Icon name="lock" className="wizard__lock" />
            </li>
          ))}
        </ol>
        <div className="page__actions">
          <Button variant="primary" icon="phone" onClick={() => navigate('/connect')}>
            Connect phone
          </Button>
          {existing && (
            <Button
              variant="danger"
              onClick={() => {
                void clear();
                notify('Calibration deleted', 'info');
              }}
            >
              Delete saved calibration
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page page--wide calib">
      <header className="page__head">
        <p className="eyebrow">Air Mode · Calibration</p>
        <h1 data-testid="calib-title">
          {step + 1}. {STEPS[step]}
        </h1>
      </header>

      <ol className="calib__steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
            <span className="mono">{i < step ? '✓' : i + 1}</span> {s}
          </li>
        ))}
      </ol>

      <div className="calib__body">
        <div className="calib__view">
          <CameraPreview stream={stream} className="camview--calib" onVideo={setVideo}>
            <LandmarkOverlay extras={extras} />
            {step === 1 && corners && <CornerEditor corners={corners} onChange={setCorners} videoWidth={vw} videoHeight={vh} />}
          </CameraPreview>
          <TrackingSummary />
        </div>

        <section className="panel calib__panel">
          {step === 0 && (
            <PositionStep
              hands={hands}
              aspect={aspect}
              luma={luma}
              trackingReady={tracking === 'running'}
              onNext={() => {
                if (!corners) setCorners(guessCorners(hands));
                setStep(1);
              }}
            />
          )}
          {step === 1 && corners && (
            <WorkspaceStep corners={corners} setCorners={setCorners} hands={hands} valid={!!H} onBack={() => setStep(0)} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <RestStep
              aspect={aspect}
              done={!!rest}
              onDone={(samples) => {
                const { neutral, noise } = summarizeRest(samples);
                if (!Object.keys(neutral).length) {
                  notify('No hands were visible — keep both hands in view and try again', 'warning');
                  return;
                }
                setRest({ samples, neutral, noise });
              }}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && rest && H && (
            <PressStep
              aspect={aspect}
              neutral={rest.neutral}
              noise={rest.noise}
              H={H}
              presses={presses}
              setPresses={setPresses}
              onBack={() => setStep(2)}
              onFinish={async (useMotion) => {
                const profile: CalibrationProfile = {
                  version: 1,
                  createdAt: Date.now(),
                  corners: corners!,
                  videoAspect: aspect,
                  neutral: rest.neutral,
                  noise: rest.noise,
                  press: useMotion && presses.length >= MIN_PRESSES ? summarizePresses(presses, rest.samples, rest.neutral) : null,
                };
                await save(profile);
                setStep(4);
              }}
            />
          )}
          {step === 4 && (
            <TestStep
              onRestart={() => {
                setPresses([]);
                setRest(null);
                setStep(0);
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ── Step 1: camera position ───────────────────────────────────────────────

function Check({ tone, children }: { tone: DotTone; children: ReactNode }) {
  return (
    <li>
      <StatusDot tone={tone} />
      <span>{children}</span>
    </li>
  );
}

function PositionStep({
  hands,
  aspect,
  luma,
  trackingReady,
  onNext,
}: {
  hands: TrackedHand[];
  aspect: number;
  luma: number | null;
  trackingReady: boolean;
  onNext: () => void;
}) {
  const sizes = hands.map((h) => handScale(h.landmarks, aspect));
  const avg = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null;
  const edge = hands.some((h) => h.landmarks.some((p) => p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98));
  return (
    <>
      <p className="muted">Place both hands in a comfortable typing position on the desk under the phone.</p>
      <ul className="calib__checks" data-testid="position-checks">
        <Check tone={!trackingReady ? 'warn' : hands.length >= 2 ? 'ok' : hands.length === 1 ? 'warn' : 'err'}>
          {!trackingReady ? 'Starting hand tracking…' : `${hands.length} of 2 hands visible`}
        </Check>
        <Check tone={avg === null ? 'idle' : avg < 0.07 || avg > 0.45 ? 'warn' : 'ok'}>
          {avg === null
            ? 'Hand size: —'
            : avg < 0.07
              ? 'Hands look small — move the phone closer'
              : avg > 0.45
                ? 'Hands look large — move the phone further away'
                : 'Hand size in frame looks good'}
        </Check>
        <Check tone={hands.length === 0 ? 'idle' : edge ? 'warn' : 'ok'}>
          {hands.length === 0 ? 'Framing: —' : edge ? 'Fingers touch the image edge — centre the camera' : 'Hands are fully inside the image'}
        </Check>
        <Check tone={luma === null ? 'idle' : luma < 45 || luma > 225 ? 'warn' : 'ok'}>
          {luma === null ? 'Lighting: measuring…' : luma < 45 ? 'Too dark — add light' : luma > 225 ? 'Overexposed — reduce glare' : 'Lighting OK'}
          {luma !== null && <span className="mono muted"> ({luma.toFixed(0)}/255)</span>}
        </Check>
      </ul>
      <p className="field__hint">
        Tip: tilt the phone so it looks down at your hands from slightly in front — fingertip presses are easier to see than from straight above.
      </p>
      <div className="page__actions">
        <Button variant="primary" onClick={onNext} disabled={!trackingReady} data-testid="calib-next">
          Next
        </Button>
      </div>
    </>
  );
}

// ── Step 2: keyboard area ─────────────────────────────────────────────────

function WorkspaceStep({
  corners,
  setCorners,
  hands,
  valid,
  onBack,
  onNext,
}: {
  corners: Point2[];
  setCorners: (c: Point2[]) => void;
  hands: TrackedHand[];
  valid: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const [capturing, setCapturing] = useState(-1);
  const still = useRef<{ x: number; y: number; since: number } | null>(null);
  const cornersRef = useRef(corners);
  cornersRef.current = corners;

  // Fingertip capture: hold an index fingertip still on each corner for 0.8 s.
  useEffect(() => {
    if (capturing < 0) return;
    return handTracker.subscribe((f) => {
      const h = f.hands[0];
      if (!h) {
        still.current = null;
        return;
      }
      const tip = h.landmarks[FINGERS.index.tip]!;
      const s = still.current;
      if (!s || Math.hypot(tip.x - s.x, tip.y - s.y) > 0.008) {
        still.current = { x: tip.x, y: tip.y, since: f.timestamp };
        return;
      }
      if (f.timestamp - s.since > 800) {
        const next = cornersRef.current.slice();
        next[capturing] = { x: s.x, y: s.y };
        setCorners(next);
        still.current = null;
        setCapturing((c) => (c >= 3 ? -1 : c + 1));
      }
    });
  }, [capturing, setCorners]);

  return (
    <>
      <p className="muted">
        Drag the four numbered corners onto the part of the desk where you want to type (finger, pen or mouse). The grid shows where each
        key will be.
      </p>
      {capturing >= 0 ? (
        <p className="calib__prompt">
          Point your index fingertip at the <strong>{['top-left', 'top-right', 'bottom-right', 'bottom-left'][capturing]}</strong> corner and
          hold still…{' '}
          <Button variant="quiet" onClick={() => setCapturing(-1)}>
            Cancel
          </Button>
        </p>
      ) : (
        <div className="page__actions">
          <Button icon="hand" onClick={() => setCapturing(0)} disabled={hands.length === 0}>
            Set corners with fingertip
          </Button>
          <Button variant="quiet" onClick={() => setCorners(guessCorners(hands))}>
            Fit to hands
          </Button>
        </div>
      )}
      {!valid && <p className="linkstate__error">The corners must form a convex, non-overlapping area.</p>}
      <div className="page__actions">
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext} disabled={!valid} data-testid="calib-next">
          Next
        </Button>
      </div>
    </>
  );
}

// ── Step 3: resting hands ─────────────────────────────────────────────────

function RestStep({
  aspect,
  done,
  onDone,
  onBack,
  onNext,
}: {
  aspect: number;
  done: boolean;
  onDone: (s: RestSample) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const offRef = useRef<(() => void) | null>(null);
  useEffect(() => () => offRef.current?.(), []);

  const start = useCallback(() => {
    const samples: RestSample = {};
    const t0 = performance.now();
    setProgress(0);
    offRef.current = handTracker.subscribe((f) => {
      addRestSample(samples, f.hands, aspectRef.current);
      const p = (performance.now() - t0) / REST_MS;
      setProgress(Math.min(1, p));
      if (p >= 1) {
        offRef.current?.();
        offRef.current = null;
        setProgress(null);
        onDone(samples);
      }
    });
  }, [onDone]);

  return (
    <>
      <p className="muted">
        Rest both hands in typing position and keep them still for 3 seconds. This records your neutral finger pose and natural jitter.
      </p>
      {progress !== null ? (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      ) : done ? (
        <p className="calib__ok" data-testid="rest-done">
          <Icon name="check" /> Resting pose recorded.
        </p>
      ) : null}
      <div className="page__actions">
        <Button onClick={onBack}>Back</Button>
        <Button onClick={start} disabled={progress !== null} data-testid="calib-rest">
          {done ? 'Record again' : 'Record resting pose'}
        </Button>
        <Button variant="primary" onClick={onNext} disabled={!done || progress !== null} data-testid="calib-next">
          Next
        </Button>
      </div>
    </>
  );
}

// ── Step 4: press calibration ─────────────────────────────────────────────

function PressStep({
  aspect,
  neutral,
  noise,
  H,
  presses,
  setPresses,
  onBack,
  onFinish,
}: {
  aspect: number;
  neutral: Neutral;
  noise: Noise;
  H: Mat3;
  presses: PressSample[];
  setPresses: (fn: (p: PressSample[]) => PressSample[]) => void;
  onBack: () => void;
  onFinish: (useMotion: boolean) => void | Promise<void>;
}) {
  const target = PROMPTS[presses.length % PROMPTS.length]!;
  const maxNoise = Math.max(0.01, ...Object.values(noise).map((n) => n ?? 0));
  const threshold = Math.max(0.08, maxNoise * 5);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const spotter = new PressSpotter(neutral, threshold);
    return handTracker.subscribe((f) => {
      const press = spotter.feed(f.hands, aspect);
      if (!press) return;
      const p = applyHomography(H, press.startTip);
      const key = geometry.hitTest(p.x, p.y)?.id ?? null;
      setPresses((list) => [...list, { finger: press.finger, peak: press.peak, key, target: targetRef.current }]);
    });
  }, [neutral, threshold, aspect, H, setPresses]);

  const enough = presses.length >= MIN_PRESSES;
  const summary = enough ? summarizePresses(presses, {}, neutral) : null;

  return (
    <>
      <p className="muted">
        Tap each key the way you would on a real keyboard: a clear downward tap, then lift. NEO TYPE learns how your fingertips move when
        pressing, as seen from this camera angle.
      </p>
      <div className="calib__target" data-testid="press-target">
        Press <kbd>{keyName(target)}</kbd>
        <span className="mono muted">
          {presses.length}/{MIN_PRESSES}
        </span>
      </div>
      <div className="calib__dots" aria-label={`${presses.length} presses recorded`}>
        {Array.from({ length: Math.max(MIN_PRESSES, presses.length) }, (_, i) => (
          <span key={i} className={i < presses.length ? (presses[i]!.key === presses[i]!.target ? 'is-hit' : 'is-miss') : ''} />
        ))}
      </div>
      {summary && (
        <p className="field__hint mono">
          press depth {summary.magnitude.toFixed(2)} · direction ({summary.direction.map((d) => d.toFixed(2)).join(', ')})
          {summary.accuracy !== null && ` · ${(summary.accuracy * 100).toFixed(0)}% on target`}
        </p>
      )}
      <p className="field__hint">
        Presses not being picked up from this camera angle? Use <strong>dwell</strong> instead: hold an index fingertip still on a key to
        type it.
      </p>
      <div className="page__actions">
        <Button onClick={onBack}>Back</Button>
        <Button onClick={() => setPresses(() => [])} disabled={!presses.length}>
          Reset presses
        </Button>
        <Button onClick={() => void onFinish(false)} data-testid="calib-dwell">
          Use dwell instead
        </Button>
        <Button variant="primary" onClick={() => void onFinish(true)} disabled={!enough} data-testid="calib-finish">
          Save calibration
        </Button>
      </div>
    </>
  );
}

// ── Step 5: test ──────────────────────────────────────────────────────────

function TestStep({ onRestart }: { onRestart: () => void }) {
  const profile = useCalibration((s) => s.profile);
  const text = useTextStore((s) => s.doc.text);
  const level = calibrationLevel(profile);
  const sep = profile?.press?.separation ?? null;
  return (
    <>
      <p className="calib__ok" data-testid="calib-saved">
        <Icon name="check" /> Calibration saved on this device ({level === 'full' ? 'motion presses' : 'dwell presses'}).
      </p>
      {sep !== null && (
        <p className={sep >= 4 ? 'field__hint' : 'linkstate__error'}>
          Press/jitter separation {sep.toFixed(1)}×
          {sep < 4 &&
            ' — presses are hard to tell apart from jitter. Tilt the phone for a more side-on view, raise the activation threshold, or use dwell.'}
        </p>
      )}
      <p className="muted">
        {level === 'full'
          ? 'Hover a fingertip over a key and tap down. Keys light up under your fingertips.'
          : 'Hold an index fingertip still on a key until the ring fills to type it.'}
      </p>
      <div className="calib__typed mono" data-testid="calib-typed">
        {text.slice(-60) || <span className="muted">Typed text appears here…</span>}
      </div>
      <div className="calib__kb">
        <VirtualKeyboard interactive={false} showAirTips />
      </div>
      <div className="page__actions">
        <Button onClick={onRestart}>Recalibrate</Button>
        <Button variant="primary" icon="arrowRight" onClick={() => navigate('/air')} data-testid="calib-done">
          Start air typing
        </Button>
      </div>
    </>
  );
}
