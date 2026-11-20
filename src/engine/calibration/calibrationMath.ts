import type { Point2 } from '@/engine/coordinates/homography';
import type { FingerName, Point3, TrackedHand } from '@/features/hand-tracking/types';
import { FINGERS, FINGER_NAMES } from '@/features/hand-tracking/types';
import { dot, fingerFeature, mean3, median, norm, normalize, std, sub } from '@/features/gesture-recognition/features';
import type { CalibrationProfile, Vec3 } from './profile';

/** Letterbox mapping for `object-fit: contain`. */
export function videoBox(boxW: number, boxH: number, vw: number, vh: number) {
  const scale = Math.min(boxW / vw, boxH / vh);
  const ox = (boxW - vw * scale) / 2;
  const oy = (boxH - vh * scale) / 2;
  return {
    toPx: (p: Point2): Point2 => ({ x: ox + p.x * vw * scale, y: oy + p.y * vh * scale }),
    fromPx: (x: number, y: number): Point2 => ({ x: (x - ox) / (vw * scale), y: (y - oy) / (vh * scale) }),
  };
}

/** A sensible starting keyboard quad: around the fingertips if hands are visible, else centred. */
export function guessCorners(hands: TrackedHand[]): Point2[] {
  const tips = hands.flatMap((h) => FINGER_NAMES.map((f) => h.landmarks[FINGERS[f].tip]!));
  if (tips.length >= 5) {
    const xs = tips.map((p) => p.x);
    const ys = tips.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = Math.max(0.2, maxX - minX);
    const h = Math.max(0.15, maxY - minY);
    const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));
    const x0 = clamp(minX - w * 0.12);
    const x1 = clamp(maxX + w * 0.12);
    const y0 = clamp(minY - h * 0.35);
    const y1 = clamp(maxY + h * 0.35);
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  }
  return [
    { x: 0.15, y: 0.25 },
    { x: 0.85, y: 0.25 },
    { x: 0.85, y: 0.8 },
    { x: 0.15, y: 0.8 },
  ];
}

export type RestSample = Partial<Record<FingerName, Vec3[]>>;

export function addRestSample(acc: RestSample, hands: TrackedHand[], aspect: number): void {
  for (const h of hands) {
    for (const f of FINGER_NAMES) (acc[f] ??= []).push(fingerFeature(h.landmarks, f, aspect));
  }
}

export function summarizeRest(acc: RestSample) {
  const neutral: Partial<Record<FingerName, Vec3>> = {};
  const noise: Partial<Record<FingerName, number>> = {};
  for (const f of FINGER_NAMES) {
    const xs = acc[f];
    if (!xs || xs.length < 5) continue;
    neutral[f] = mean3(xs);
    noise[f] = std(xs.map((x) => norm(sub(x, neutral[f]!))));
  }
  return { neutral, noise };
}

export interface PressSample {
  finger: FingerName;
  /** Peak deviation from the neutral pose during the press. */
  peak: Vec3;
  /** Key under the fingertip when the press started. */
  key: string | null;
  /** Key the user was asked to press. */
  target: string;
}

/**
 * Learn the press direction and depth from prompted presses, and compare
 * them with resting jitter projected onto that direction.
 */
export function summarizePresses(samples: PressSample[], rest: RestSample, neutral: Partial<Record<FingerName, Vec3>>) {
  const dirs = samples.map((s) => normalize(s.peak));
  const direction = normalize(mean3(dirs));
  const magnitude = median(samples.map((s) => dot(s.peak, direction)));
  const restProj: number[] = [];
  for (const f of FINGER_NAMES) {
    const n = neutral[f];
    for (const x of rest[f] ?? []) if (n) restProj.push(dot(sub(x, n), direction));
  }
  const noise = Math.max(1e-3, std(restProj));
  const withKey = samples.filter((s) => s.key !== null);
  const accuracy = withKey.length ? withKey.filter((s) => s.key === s.target).length / withKey.length : null;
  const press: NonNullable<CalibrationProfile['press']> = {
    direction,
    magnitude,
    noise,
    samples: samples.length,
    separation: magnitude / noise,
    accuracy,
  };
  return press;
}

/**
 * Live press spotter used during press calibration: watches every finger's
 * deviation from neutral and reports one press when a finger deviates
 * clearly and comes back.
 */
export class PressSpotter {
  private peak: { finger: FingerName; hand: string; dev: Vec3; size: number; tip: Point3 } | null = null;
  private startTip: Point3 | null = null;

  constructor(
    private neutral: Partial<Record<FingerName, Vec3>>,
    private onThreshold: number,
  ) {}

  /** Returns a finished press, or null. */
  feed(hands: TrackedHand[], aspect: number): { finger: FingerName; peak: Vec3; startTip: Point3 } | null {
    let best: { finger: FingerName; hand: string; dev: Vec3; size: number; tip: Point3 } | null = null;
    for (const h of hands) {
      for (const f of FINGER_NAMES) {
        const n = this.neutral[f];
        if (!n) continue;
        const dev = sub(fingerFeature(h.landmarks, f, aspect), n);
        const size = norm(dev);
        if (!best || size > best.size) best = { finger: f, hand: h.id, dev, size, tip: h.landmarks[FINGERS[f].tip]! };
      }
    }
    if (!best) return null;
    if (!this.peak) {
      if (best.size > this.onThreshold) {
        this.peak = best;
        this.startTip = best.tip;
      }
      return null;
    }
    // Track the same finger's peak until it comes back below half the threshold.
    const same = hands.find((h) => h.id === this.peak!.hand);
    const n = this.neutral[this.peak.finger]!;
    const dev = same ? sub(fingerFeature(same.landmarks, this.peak.finger, aspect), n) : this.peak.dev;
    const size = norm(dev);
    if (size > this.peak.size) this.peak = { ...this.peak, dev, size };
    if (size < this.onThreshold * 0.5 || !same) {
      const done = { finger: this.peak.finger, peak: this.peak.dev, startTip: this.startTip! };
      this.peak = null;
      this.startTip = null;
      return done;
    }
    return null;
  }

  reset(): void {
    this.peak = null;
    this.startTip = null;
  }
}
