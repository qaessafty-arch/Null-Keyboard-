import { describe, expect, it } from 'vitest';
import { applyHomography, computeHomography, invertMat3, isUsableQuad, UNIT_SQUARE } from '@/engine/coordinates/homography';
import { KeyGeometry } from '@/engine/collision/keyGeometry';
import { QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';
import { OneEuroFilter } from '@/features/hand-tracking/OneEuroFilter';
import { HandSmoother } from '@/features/hand-tracking/HandSmoother';
import { fingerFeature } from '@/features/gesture-recognition/features';
import type { Point3, RawHand } from '@/features/hand-tracking/types';

describe('homography', () => {
  const quad = [
    { x: 0.2, y: 0.3 },
    { x: 0.85, y: 0.25 },
    { x: 0.95, y: 0.8 },
    { x: 0.1, y: 0.9 },
  ];

  it('maps the four corners exactly and round-trips through the inverse', () => {
    const H = computeHomography(quad, UNIT_SQUARE)!;
    quad.forEach((p, i) => {
      const q = applyHomography(H, p);
      expect(q.x).toBeCloseTo(UNIT_SQUARE[i]!.x, 9);
      expect(q.y).toBeCloseTo(UNIT_SQUARE[i]!.y, 9);
    });
    const inv = invertMat3(H)!;
    const p = { x: 0.5, y: 0.5 };
    const back = applyHomography(inv, applyHomography(H, p));
    expect(back.x).toBeCloseTo(0.5, 9);
    expect(back.y).toBeCloseTo(0.5, 9);
  });

  it('preserves straight lines (perspective, not affine)', () => {
    const H = computeHomography(quad, UNIT_SQUARE)!;
    // Midpoint of the top edge in the image is NOT u=0.5 under perspective,
    // but it must still lie on v=0.
    const mid = { x: (quad[0]!.x + quad[1]!.x) / 2, y: (quad[0]!.y + quad[1]!.y) / 2 };
    expect(applyHomography(H, mid).y).toBeCloseTo(0, 9);
  });

  it('rejects degenerate or self-intersecting quads', () => {
    expect(isUsableQuad(quad)).toBe(true);
    expect(isUsableQuad([quad[0]!, quad[2]!, quad[1]!, quad[3]!])).toBe(false); // bow-tie
    expect(isUsableQuad([{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.01, y: 0.01 }, { x: 0, y: 0.01 }])).toBe(false); // tiny
    expect(computeHomography([quad[0]!, quad[0]!, quad[0]!, quad[0]!], UNIT_SQUARE)).toBeNull();
  });
});

describe('KeyGeometry', () => {
  const g = new KeyGeometry(QWERTY_US);

  it('has one rect per key covering the plane', () => {
    expect(g.rects).toHaveLength(63);
    const area = g.rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBeCloseTo(1, 6);
  });

  it('hit-tests key centres to themselves', () => {
    for (const r of g.rects) expect(g.hitTest(r.cx, r.cy)?.id).toBe(r.id);
  });

  it('snaps slightly-outside points and rejects far-outside points', () => {
    expect(g.hitTest(-0.02, 0.1)?.id).toBe('Backquote');
    expect(g.hitTest(1.02, 0.95)?.id).toBe('ArrowRight');
    expect(g.hitTest(-0.3, 0.5)).toBeNull();
    expect(g.hitTest(0.5, 1.5)).toBeNull();
  });
});

describe('OneEuroFilter', () => {
  it('suppresses jitter when still and follows fast motion', () => {
    const f = new OneEuroFilter(1.5, 8);
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(0.5 + (i % 2 ? 0.004 : -0.004), i / 30);
    expect(Math.abs(out - 0.5)).toBeLessThan(0.0025);
    // Jump and move fast: the filter should catch up within a few frames.
    for (let i = 60; i < 66; i++) out = f.filter(0.8, i / 30);
    expect(out).toBeGreaterThan(0.75);
  });
});

function hand(wristX: number, label: 'Left' | 'Right' = 'Right'): RawHand {
  const arr = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    arr[i * 3] = wristX + i * 0.005;
    arr[i * 3 + 1] = 0.6 - i * 0.01;
  }
  return { landmarks: arr, label, score: 0.9 };
}

describe('HandSmoother', () => {
  it('keeps stable ids as hands move and reports lost hands after the hold time', () => {
    const s = new HandSmoother({ holdMs: 100 });
    const a = s.update([hand(0.2), hand(0.7, 'Left')], 0);
    const ids = a.hands.map((h) => h.id);
    const b = s.update([hand(0.72, 'Left'), hand(0.22)], 33); // order swapped, slight motion
    expect(b.hands.find((h) => Math.abs(h.raw[0]!.x - 0.22) < 1e-6)?.id).toBe(ids[0]);
    expect(b.hands.find((h) => Math.abs(h.raw[0]!.x - 0.72) < 1e-6)?.id).toBe(ids[1]);
    // One hand disappears: bridged briefly, then lost.
    expect(s.update([hand(0.22)], 66).lost).toEqual([]);
    expect(s.update([hand(0.22)], 200).lost).toEqual([ids[1]]);
  });

  it('labels hands as MediaPipe reports them for un-mirrored frames', () => {
    const s = new HandSmoother();
    expect(s.update([hand(0.3, 'Left')], 0).hands[0]!.label).toBe('Left');
  });
});

describe('fingerFeature', () => {
  it('is invariant to translating the whole hand', () => {
    const lms: Point3[] = Array.from({ length: 21 }, (_, i) => ({ x: 0.3 + (i % 5) * 0.02, y: 0.5 - i * 0.01, z: -i * 0.001 }));
    const moved = lms.map((p) => ({ x: p.x + 0.2, y: p.y + 0.1, z: p.z }));
    const a = fingerFeature(lms, 'index', 16 / 9);
    const b = fingerFeature(moved, 'index', 16 / 9);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
  });
});
