import { handTracker } from '@/features/hand-tracking/HandTracker';
import { FINGERS, FINGER_NAMES, type TrackingFrame } from '@/features/hand-tracking/types';
import { PressDetector, holderId, type FingerInput, type PressConfig } from '@/features/gesture-recognition/PressDetector';
import { fingerFeature } from '@/features/gesture-recognition/features';
import { applyHomography, computeHomography, UNIT_SQUARE, type Mat3 } from '@/engine/coordinates/homography';
import { KeyGeometry } from '@/engine/collision/keyGeometry';
import { useCalibration, type CalibrationProfile } from '@/engine/calibration/profile';
import { keyboardEngine } from '@/engine/input/keyboard';
import { airLatency } from '@/engine/performance/metrics';
import { QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';
import { useSettings, type Settings } from '@/stores/settingsStore';
import { useKeyState } from '@/stores/keyStateStore';
import { rippleAtKey } from '@/rendering/effects/rippleBus';
import { airTips, useAirStore, type AirTip } from './airStore';

/** Turn calibration + settings into detector parameters. */
export function pressConfigFrom(profile: CalibrationProfile, s: Settings): Partial<PressConfig> {
  const sens = 1.5 - s.air.sensitivity / 100; // 0 → 1.5×, 50 → 1×, 100 → 0.5×
  const method =
    s.air.pressMethod === 'auto' ? (profile.press ? 'motion' : 'dwell') : s.air.pressMethod === 'motion' && profile.press ? 'motion' : 'dwell';
  const cfg: Partial<PressConfig> = {
    method,
    debounceMs: s.air.debounceMs,
    minConfidence: s.air.minConfidence,
    dwellMs: s.air.dwellMs * sens,
  };
  if (profile.press) {
    const thrOn = Math.max(profile.press.magnitude * s.air.activationThreshold * sens, profile.press.noise * 3);
    cfg.direction = profile.press.direction;
    cfg.thrOn = thrOn;
    cfg.thrOff = thrOn * 0.5;
  }
  return cfg;
}

/**
 * Air Mode input: fingertips → homography → key under each tip → press
 * detector → the shared KeyboardEngine (source 'AIR'). Exactly the same
 * engine, modifiers, editor and visuals as Touch Mode.
 */
class AirInput {
  private detector = new PressDetector();
  private geometry = new KeyGeometry(QWERTY_US);
  private H: Mat3 | null = null;
  private profile: CalibrationProfile | null = null;
  private offFrame: (() => void) | null = null;
  private offStores: Array<() => void> = [];
  private pressing = new Set<string>();
  private lastHovered = '';

  get active(): boolean {
    return this.offFrame !== null;
  }

  start(): boolean {
    if (this.offFrame) return true;
    if (!this.configure()) return false;
    this.offFrame = handTracker.subscribe((f) => this.onFrame(f));
    this.offStores.push(
      useSettings.subscribe((s, p) => {
        if (s.air !== p.air) this.configure();
      }),
      useCalibration.subscribe((s, p) => {
        if (s.profile !== p.profile) {
          if (!this.configure()) this.stop();
        }
      }),
    );
    useAirStore.setState({ active: true, method: this.detector.config.method });
    return true;
  }

  stop(): void {
    this.offFrame?.();
    this.offFrame = null;
    this.offStores.forEach((o) => o());
    this.offStores = [];
    for (const id of this.detector.reset()) keyboardEngine.releaseHolder(id, 'reset');
    keyboardEngine.releaseAll('reset', 'AIR');
    this.pressing.clear();
    this.lastHovered = '';
    useKeyState.setState({ hovered: new Set() });
    airTips.emit([]);
    useAirStore.setState({ active: false });
  }

  private configure(): boolean {
    const profile = useCalibration.getState().profile;
    if (!profile) return false;
    const H = computeHomography(profile.corners, UNIT_SQUARE);
    if (!H) return false;
    this.profile = profile;
    this.H = H;
    this.detector.configure(pressConfigFrom(profile, useSettings.getState()), profile.neutral ?? {});
    useAirStore.setState({ method: this.detector.config.method });
    return true;
  }

  private onFrame(frame: TrackingFrame): void {
    const H = this.H;
    if (!H || !this.profile) return;
    const aspect = frame.videoWidth && frame.videoHeight ? frame.videoWidth / frame.videoHeight : this.profile.videoAspect;
    const inputs: FingerInput[] = [];
    const tips: AirTip[] = [];

    for (const hand of frame.hands) {
      for (const finger of FINGER_NAMES) {
        const tip = hand.landmarks[FINGERS[finger].tip]!;
        const p = applyHomography(H, tip);
        const key = this.geometry.hitTest(p.x, p.y);
        inputs.push({
          handId: hand.id,
          finger,
          key: key?.id ?? null,
          u: p.x,
          v: p.y,
          feature: fingerFeature(hand.landmarks, finger, aspect),
          confidence: hand.score,
        });
      }
    }

    const out = this.detector.update(frame.timestamp, inputs, frame.lost);
    const now = performance.now();

    for (const up of out.ups) {
      keyboardEngine.releaseHolder(up.holderId, up.reason);
      this.pressing.delete(up.holderId);
    }
    for (const d of out.downs) {
      const ok = keyboardEngine.keyDown(d.key, {
        source: 'AIR',
        holderId: d.holderId,
        confidence: d.confidence,
        timestamp: frame.timestamp,
      });
      if (ok) {
        this.pressing.add(d.holderId);
        airLatency.record(now - frame.timestamp);
        rippleAtKey(d.key, 0.9);
        const st = useAirStore.getState();
        useAirStore.setState({
          presses: st.presses + 1,
          gesture: { text: `Press ${d.key.replace(/^(Key|Digit)/, '')} · ${d.finger} (${labelOf(frame, d.handId)})`, at: now },
        });
      }
    }
    if (frame.lost.length) {
      useAirStore.setState({ gesture: { text: 'Hand lost — keys released', at: now } });
    }

    // Hover highlight (only touch the store when the set changes).
    const hovered = [...new Set(out.hovers.values())].sort();
    const sig = hovered.join(',');
    if (sig !== this.lastHovered) {
      this.lastHovered = sig;
      useKeyState.setState({ hovered: new Set(hovered) });
    }

    for (const inp of inputs) {
      if (inp.key === null && (inp.u < -0.1 || inp.u > 1.1 || inp.v < -0.2 || inp.v > 1.2)) continue;
      const id = holderId(inp.handId, inp.finger);
      tips.push({
        id,
        label: labelOf(frame, inp.handId),
        finger: inp.finger,
        u: inp.u,
        v: inp.v,
        pressing: this.pressing.has(id),
        dwell: out.dwell.get(id) ?? 0,
      });
    }
    airTips.emit(tips);
  }
}

function labelOf(frame: TrackingFrame, handId: string): 'Left' | 'Right' {
  return frame.hands.find((h) => h.id === handId)?.label ?? 'Right';
}

export const airInput = new AirInput();
