import type { KeyId } from '@/types/keyboard';
import type { FingerName } from '@/features/hand-tracking/types';
import type { Vec3 } from '@/engine/calibration/profile';
import { dot, sub } from './features';

/**
 * Turns per-frame fingertip data into press / release decisions.
 *
 * MOTION (calibrated): a press is a fingertip moving along the calibrated
 * press direction (hand-relative, including depth) by more than `thrOn`.
 * Release when it comes back below `thrOff` (hysteresis). Guards against
 * accidental presses:
 *   - hover vs press: proximity alone never presses — motion is required
 *   - dominance: only the finger that moved most on that hand may press
 *     (neighbouring fingers move in sympathy)
 *   - confidence gate, debounce after release, per-finger cooldown
 *   - key chosen from where the tip hovered just *before* the press motion
 *   - a slowly adapting baseline absorbs posture drift while hovering
 *
 * DWELL (fallback when presses aren't observable from the camera angle, or
 * before press calibration): hold an index fingertip still over a key for
 * `dwellMs` to tap it; move off the key (or away) to re-arm.
 */

export type PressMethod = 'motion' | 'dwell';

export interface PressConfig {
  method: PressMethod;
  direction: Vec3;
  thrOn: number;
  thrOff: number;
  debounceMs: number;
  cooldownMs: number;
  minConfidence: number;
  /** Key used for the press = hover key this long before onset. */
  lookbackMs: number;
  /** Required ratio between the strongest and second-strongest finger signal. */
  dominance: number;
  /** Baseline adaptation time constant (s). */
  baselineTau: number;
  dwellMs: number;
  /** Max fingertip travel on the keyboard plane during a dwell (normalized). */
  dwellRadius: number;
  dwellFingers: FingerName[];
  /** Duration of a dwell "tap" (ms). */
  dwellTapMs: number;
}

export const DEFAULT_PRESS_CONFIG: PressConfig = {
  method: 'motion',
  direction: [0, 0, 1],
  thrOn: 0.12,
  thrOff: 0.06,
  debounceMs: 120,
  cooldownMs: 90,
  minConfidence: 0.6,
  lookbackMs: 80,
  dominance: 1.35,
  baselineTau: 1.5,
  dwellMs: 650,
  dwellRadius: 0.012,
  dwellFingers: ['index'],
  dwellTapMs: 90,
};

export interface FingerInput {
  handId: string;
  finger: FingerName;
  /** Key under the fingertip on the keyboard plane (null = off keyboard). */
  key: KeyId | null;
  u: number;
  v: number;
  feature: Vec3;
  confidence: number;
}

export interface PressEvent {
  holderId: string;
  key: KeyId;
  confidence: number;
  handId: string;
  finger: FingerName;
}

export interface DetectorOutput {
  downs: PressEvent[];
  ups: Array<{ holderId: string; reason: 'release' | 'tracking-lost' }>;
  /** Hovered key per holder this frame. */
  hovers: Map<string, KeyId>;
  /** Press signal per holder (for diagnostics/UI). */
  signals: Map<string, number>;
  /** Dwell progress 0..1 per holder. */
  dwell: Map<string, number>;
}

interface FingerState {
  pressed: KeyId | null;
  baseline: Vec3 | null;
  history: Array<{ t: number; key: KeyId | null }>;
  lastReleaseAt: number;
  lastPressAt: number;
  tapUntil: number;
  dwellKey: KeyId | null;
  dwellSince: number;
  dwellU: number;
  dwellV: number;
  dwellArmed: boolean;
}

export const holderId = (handId: string, finger: FingerName) => `air:${handId}:${finger}`;

export class PressDetector {
  private cfg: PressConfig;
  private states = new Map<string, FingerState>();
  private neutral: Partial<Record<FingerName, Vec3>>;

  constructor(cfg: Partial<PressConfig> = {}, neutral: Partial<Record<FingerName, Vec3>> = {}) {
    this.cfg = { ...DEFAULT_PRESS_CONFIG, ...cfg };
    this.neutral = neutral;
  }

  get config(): PressConfig {
    return this.cfg;
  }

  configure(cfg: Partial<PressConfig>, neutral?: Partial<Record<FingerName, Vec3>>): void {
    this.cfg = { ...this.cfg, ...cfg };
    if (neutral) this.neutral = neutral;
  }

  /** @param now ms */
  update(now: number, inputs: FingerInput[], lostHands: string[] = []): DetectorOutput {
    const out: DetectorOutput = { downs: [], ups: [], hovers: new Map(), signals: new Map(), dwell: new Map() };

    for (const hand of lostHands) {
      for (const [id, st] of [...this.states]) {
        if (!id.startsWith(`air:${hand}:`)) continue;
        if (st.pressed) out.ups.push({ holderId: id, reason: 'tracking-lost' });
        this.states.delete(id);
      }
    }

    // Signals first, so dominance can compare fingers of the same hand.
    const signal = new Map<string, number>();
    for (const inp of inputs) {
      const id = holderId(inp.handId, inp.finger);
      const st = this.state(id, inp);
      signal.set(id, dot(sub(inp.feature, st.baseline!), this.cfg.direction));
    }

    for (const inp of inputs) {
      const id = holderId(inp.handId, inp.finger);
      const st = this.states.get(id)!;
      const s = signal.get(id)!;
      out.signals.set(id, s);
      st.history.push({ t: now, key: inp.key });
      while (st.history.length > 2 && now - st.history[0]!.t > 400) st.history.shift();
      if (inp.key) out.hovers.set(id, inp.key);

      if (this.cfg.method === 'dwell') this.stepDwell(now, id, st, inp, out);
      else this.stepMotion(now, id, st, inp, s, signal, out);
    }
    return out;
  }

  /** Release everything (mode switch, recalibration). */
  reset(): string[] {
    const held = [...this.states].filter(([, s]) => s.pressed).map(([id]) => id);
    this.states.clear();
    return held;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private state(id: string, inp: FingerInput): FingerState {
    let st = this.states.get(id);
    if (!st) {
      st = {
        pressed: null,
        baseline: this.neutral[inp.finger] ?? inp.feature,
        history: [],
        lastReleaseAt: -Infinity,
        lastPressAt: -Infinity,
        tapUntil: 0,
        dwellKey: null,
        dwellSince: 0,
        dwellU: inp.u,
        dwellV: inp.v,
        dwellArmed: true,
      };
      this.states.set(id, st);
    }
    return st;
  }

  private stepMotion(
    now: number,
    id: string,
    st: FingerState,
    inp: FingerInput,
    s: number,
    signal: Map<string, number>,
    out: DetectorOutput,
  ): void {
    const c = this.cfg;
    if (st.pressed) {
      if (s < c.thrOff) {
        out.ups.push({ holderId: id, reason: 'release' });
        st.pressed = null;
        st.lastReleaseAt = now;
      }
      return;
    }

    // Adapt the resting baseline slowly while clearly not pressing.
    if (Math.abs(s) < c.thrOff && st.baseline) {
      const prevT = st.history.length > 1 ? st.history[st.history.length - 2]!.t : now;
      const a = 1 - Math.exp(-Math.max(0, now - prevT) / 1000 / c.baselineTau);
      st.baseline = [
        st.baseline[0] + a * (inp.feature[0] - st.baseline[0]),
        st.baseline[1] + a * (inp.feature[1] - st.baseline[1]),
        st.baseline[2] + a * (inp.feature[2] - st.baseline[2]),
      ];
    }

    if (s <= c.thrOn) return;
    if (inp.confidence < c.minConfidence) return;
    if (now - st.lastReleaseAt < c.debounceMs || now - st.lastPressAt < c.cooldownMs) return;

    // Dominance among this hand's fingers.
    let second = -Infinity;
    for (const [other, os] of signal) {
      if (other === id || !other.startsWith(`air:${inp.handId}:`)) continue;
      if (os > s) return; // another finger moved more — it is the presser
      second = Math.max(second, os);
    }
    if (second > c.thrOff && s < second * c.dominance) return;

    const key = this.keyBefore(st, now - c.lookbackMs) ?? inp.key;
    if (!key) return;
    st.pressed = key;
    st.lastPressAt = now;
    out.downs.push({ holderId: id, key, confidence: inp.confidence, handId: inp.handId, finger: inp.finger });
  }

  private stepDwell(now: number, id: string, st: FingerState, inp: FingerInput, out: DetectorOutput): void {
    const c = this.cfg;
    if (st.pressed) {
      if (now >= st.tapUntil) {
        out.ups.push({ holderId: id, reason: 'release' });
        st.pressed = null;
        st.lastReleaseAt = now;
      }
      return;
    }
    if (!c.dwellFingers.includes(inp.finger)) return;

    const moved = Math.hypot(inp.u - st.dwellU, inp.v - st.dwellV);
    if (inp.key !== st.dwellKey || moved > c.dwellRadius) {
      // Leaving the key (or moving clearly) re-arms and restarts the timer.
      if (inp.key !== st.dwellKey || moved > c.dwellRadius * 2) st.dwellArmed = true;
      st.dwellKey = inp.key;
      st.dwellSince = now;
      st.dwellU = inp.u;
      st.dwellV = inp.v;
      return;
    }
    if (!inp.key || !st.dwellArmed || inp.confidence < c.minConfidence) return;
    const progress = (now - st.dwellSince) / c.dwellMs;
    out.dwell.set(id, Math.min(1, progress));
    if (progress >= 1 && now - st.lastReleaseAt >= c.debounceMs) {
      st.pressed = inp.key;
      st.tapUntil = now + c.dwellTapMs;
      st.lastPressAt = now;
      st.dwellArmed = false;
      out.downs.push({ holderId: id, key: inp.key, confidence: inp.confidence, handId: inp.handId, finger: inp.finger });
    }
  }

  private keyBefore(st: FingerState, t: number): KeyId | null {
    for (let i = st.history.length - 1; i >= 0; i--) {
      const h = st.history[i]!;
      if (h.t <= t) return h.key;
    }
    return st.history[0]?.key ?? null;
  }
}
