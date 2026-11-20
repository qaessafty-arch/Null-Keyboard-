import { describe, expect, it } from 'vitest';
import { PressDetector, holderId, type FingerInput } from '@/features/gesture-recognition/PressDetector';
import type { FingerName } from '@/features/hand-tracking/types';
import type { Vec3 } from '@/engine/calibration/profile';

const DIR: Vec3 = [0, 0, 1];

/** One frame of five fingers on hand "h1". `depth` = press signal per finger. */
function frame(depth: Partial<Record<FingerName, number>>, key = 'KeyJ', conf = 0.9, u = 0.5, v = 0.5): FingerInput[] {
  return (['thumb', 'index', 'middle', 'ring', 'pinky'] as FingerName[]).map((finger) => ({
    handId: 'h1',
    finger,
    key: finger === 'thumb' ? 'Space' : key,
    u,
    v,
    feature: [0, 0, depth[finger] ?? 0],
    confidence: conf,
  }));
}

function run(det: PressDetector, frames: FingerInput[][], start = 0, dt = 33) {
  const downs: string[] = [];
  const ups: string[] = [];
  frames.forEach((f, i) => {
    const out = det.update(start + i * dt, f);
    out.downs.forEach((d) => downs.push(`${d.finger}:${d.key}`));
    out.ups.forEach((u) => ups.push(u.holderId));
  });
  return { downs, ups };
}

const motion = () => new PressDetector({ method: 'motion', direction: DIR, thrOn: 0.1, thrOff: 0.05, debounceMs: 100, cooldownMs: 80 });

describe('PressDetector — motion', () => {
  it('hovering (no motion) never presses', () => {
    const { downs } = run(motion(), Array.from({ length: 60 }, () => frame({})));
    expect(downs).toEqual([]);
  });

  it('a press and release produce exactly one down and one up', () => {
    const det = motion();
    const seq = [
      ...Array.from({ length: 10 }, () => frame({})),
      frame({ index: 0.06 }),
      frame({ index: 0.14 }),
      frame({ index: 0.2 }),
      frame({ index: 0.18 }),
      frame({ index: 0.04 }),
      ...Array.from({ length: 5 }, () => frame({})),
    ];
    const { downs, ups } = run(det, seq);
    expect(downs).toEqual(['index:KeyJ']);
    expect(ups).toEqual([holderId('h1', 'index')]);
  });

  it('noise below the threshold does not press (and hysteresis prevents chatter)', () => {
    // ±0.04 jitter (0.08 peak-to-peak) stays under thrOn = 0.1; calibration keeps thrOn ≥ 4× noise.
    const noisy = Array.from({ length: 80 }, (_, i) => frame({ index: (i % 2 ? 1 : -1) * 0.04 }));
    expect(run(motion(), noisy).downs).toEqual([]);
    // Hovering around thrOn after a press must not re-trigger until it drops below thrOff.
    const det = motion();
    const seq = [frame({}), frame({ index: 0.2 }), frame({ index: 0.09 }), frame({ index: 0.12 }), frame({ index: 0.08 }), frame({ index: 0.13 })];
    expect(run(det, seq).downs).toHaveLength(1);
  });

  it('only the dominant finger presses when neighbours move in sympathy', () => {
    const seq = [frame({}), frame({ middle: 0.2, index: 0.09, ring: 0.11 }), frame({ middle: 0.25, index: 0.1, ring: 0.12 }), frame({})];
    expect(run(motion(), seq).downs).toEqual(['middle:KeyJ']);
  });

  it('two fingers moving equally (ambiguous) do not press', () => {
    const seq = [frame({}), frame({ middle: 0.2, index: 0.19 }), frame({})];
    expect(run(motion(), seq).downs).toEqual([]);
  });

  it('low-confidence hands do not press', () => {
    const seq = [frame({}, 'KeyJ', 0.3), frame({ index: 0.3 }, 'KeyJ', 0.3), frame({}, 'KeyJ', 0.3)];
    expect(run(motion(), seq).downs).toEqual([]);
  });

  it('debounce blocks a bounce right after release', () => {
    const seq = [frame({}), frame({ index: 0.2 }), frame({}), frame({ index: 0.2 }), frame({}), frame({}), frame({}), frame({}), frame({ index: 0.2 }), frame({})];
    // frames at 33 ms: second press at 99 ms comes 33 ms after release (< 100 ms) → blocked.
    expect(run(motion(), seq).downs).toEqual(['index:KeyJ', 'index:KeyJ']);
  });

  it('uses the key hovered just before the press motion', () => {
    const det = motion();
    const seq = [
      ...Array.from({ length: 6 }, () => frame({}, 'KeyH')),
      frame({ index: 0.2 }, 'KeyN'), // tip drifts onto N as the finger bends
      frame({}),
    ];
    expect(run(det, seq).downs).toEqual(['index:KeyH']);
  });

  it('thumb presses Space', () => {
    expect(run(motion(), [frame({}), frame({ thumb: 0.2 }), frame({})]).downs).toEqual(['thumb:Space']);
  });

  it('releases held keys when the hand is lost', () => {
    const det = motion();
    det.update(0, frame({}));
    det.update(33, frame({ index: 0.3 }));
    const out = det.update(66, [], ['h1']);
    expect(out.ups).toEqual([{ holderId: holderId('h1', 'index'), reason: 'tracking-lost' }]);
  });

  it('a slowly drifting posture is absorbed by the baseline', () => {
    const det = motion();
    // Drift of 0.2 over 3 s (well above thrOn in total, but slow).
    const seq = Array.from({ length: 90 }, (_, i) => frame({ index: (i / 90) * 0.2, middle: (i / 90) * 0.2 }));
    expect(run(det, seq).downs).toEqual([]);
  });
});

describe('PressDetector — dwell', () => {
  const dwell = () => new PressDetector({ method: 'dwell', dwellMs: 300, dwellRadius: 0.01, dwellTapMs: 60, debounceMs: 0 });

  it('holding an index fingertip still taps the key once, then needs re-arming', () => {
    const det = dwell();
    const seq = Array.from({ length: 40 }, () => frame({}, 'KeyA'));
    const { downs, ups } = run(det, seq);
    expect(downs).toEqual(['index:KeyA']);
    expect(ups).toHaveLength(1);
  });

  it('moving to another key re-arms', () => {
    const det = dwell();
    const seq = [
      ...Array.from({ length: 15 }, () => frame({}, 'KeyA', 0.9, 0.1, 0.5)),
      ...Array.from({ length: 15 }, () => frame({}, 'KeyS', 0.9, 0.2, 0.5)),
    ];
    expect(run(det, seq).downs).toEqual(['index:KeyA', 'index:KeyS']);
  });

  it('a moving finger never dwells', () => {
    const det = dwell();
    const seq = Array.from({ length: 40 }, (_, i) => frame({}, 'KeyA', 0.9, 0.1 + (i % 2) * 0.05, 0.5));
    expect(run(det, seq).downs).toEqual([]);
  });

  it('only configured fingers dwell (resting fingers do not type)', () => {
    const det = dwell();
    const out = det.update(0, frame({}));
    expect(out.downs).toEqual([]);
    const later = det.update(1000, frame({}));
    expect(later.downs.map((d) => d.finger)).toEqual(['index']);
  });
});
