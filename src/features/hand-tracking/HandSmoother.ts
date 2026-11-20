import { OneEuroFilter } from './OneEuroFilter';
import { LM, type Point3, type RawHand, type TrackedHand } from './types';

interface Slot {
  id: string;
  label: 'Left' | 'Right';
  score: number;
  filters: OneEuroFilter[];
  last: Point3[];
  lastSeen: number;
}

export interface SmootherOptions {
  /** Drop a hand not seen for this long (ms). Short gaps are bridged. */
  holdMs: number;
  /** Max wrist travel between frames to count as the same hand (normalized). */
  matchRadius: number;
  /**
   * Swap Left/Right. MediaPipe labels the subject's hands correctly for
   * un-mirrored frames (what getUserMedia delivers, front or rear camera), so
   * this stays false unless frames are mirrored before detection.
   */
  invertHandedness: boolean;
  minCutoff: number;
  beta: number;
}

const DEFAULTS: SmootherOptions = { holdMs: 180, matchRadius: 0.25, invertHandedness: false, minCutoff: 1.5, beta: 8 };

/**
 * Gives detections stable identities across frames (nearest-wrist matching —
 * more reliable than MediaPipe's per-frame handedness label, which can flip)
 * and smooths every landmark with a One Euro filter.
 */
export class HandSmoother {
  private slots: Slot[] = [];
  private nextId = 1;
  private opts: SmootherOptions;

  constructor(opts: Partial<SmootherOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  setOptions(opts: Partial<SmootherOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  /** @param now ms */
  update(raw: RawHand[], now: number): { hands: TrackedHand[]; lost: string[] } {
    const t = now / 1000;
    const dets = raw.map((h) => ({ h, pts: toPoints(h.landmarks) }));
    const used = new Set<number>();
    const seen = new Set<Slot>();
    const hands: TrackedHand[] = [];

    // Greedy nearest-wrist matching (at most two hands, so greedy is optimal enough).
    const pairs: Array<{ s: Slot; d: number; dist: number }> = [];
    this.slots.forEach((s) =>
      dets.forEach((det, d) => {
        const dist = Math.hypot(det.pts[LM.WRIST]!.x - s.last[LM.WRIST]!.x, det.pts[LM.WRIST]!.y - s.last[LM.WRIST]!.y);
        if (dist < this.opts.matchRadius) pairs.push({ s, d, dist });
      }),
    );
    pairs.sort((a, b) => a.dist - b.dist);
    const assignment = new Map<number, Slot>();
    for (const p of pairs) {
      if (used.has(p.d) || seen.has(p.s)) continue;
      used.add(p.d);
      seen.add(p.s);
      assignment.set(p.d, p.s);
    }

    dets.forEach((det, d) => {
      let slot = assignment.get(d);
      if (!slot) {
        slot = {
          id: `h${this.nextId++}`,
          label: 'Right',
          score: 0,
          filters: Array.from({ length: 63 }, () => new OneEuroFilter(this.opts.minCutoff, this.opts.beta)),
          last: det.pts,
          lastSeen: now,
        };
        this.slots.push(slot);
        seen.add(slot);
      }
      const label = this.opts.invertHandedness ? (det.h.label === 'Left' ? 'Right' : 'Left') : det.h.label;
      slot.label = label;
      slot.score = det.h.score;
      slot.lastSeen = now;
      const smoothed = det.pts.map((p, i) => ({
        x: slot.filters[i * 3]!.filter(p.x, t),
        y: slot.filters[i * 3 + 1]!.filter(p.y, t),
        z: slot.filters[i * 3 + 2]!.filter(p.z, t),
      }));
      slot.last = smoothed;
      hands.push({ id: slot.id, label, score: det.h.score, landmarks: smoothed, raw: det.pts });
    });

    // Bridge short gaps; drop hands gone longer than holdMs.
    const lost: string[] = [];
    this.slots = this.slots.filter((s) => {
      if (seen.has(s)) return true;
      if (now - s.lastSeen <= this.opts.holdMs) return true;
      lost.push(s.id);
      return false;
    });
    return { hands, lost };
  }

  /** Drop everything (e.g. stream changed). Returns the ids that were tracked. */
  reset(): string[] {
    const ids = this.slots.map((s) => s.id);
    this.slots = [];
    return ids;
  }
}

function toPoints(arr: Float32Array): Point3[] {
  const pts: Point3[] = new Array(21);
  for (let i = 0; i < 21; i++) pts[i] = { x: arr[i * 3]!, y: arr[i * 3 + 1]!, z: arr[i * 3 + 2]! };
  return pts;
}
