import { useEffect, useRef } from 'react';
import { handTracker } from '@/features/hand-tracking/HandTracker';
import { FINGERS, FINGER_NAMES, type TrackingFrame } from '@/features/hand-tracking/types';

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const PALM = [0, 1, 5, 9, 13, 17];

/** Per-hand identity colours (calm, distinguishable, not the laser red). */
export const HAND_COLORS = { Left: '#32E6A0', Right: '#8FA8FF' } as const;

export interface OverlayExtras {
  /** Extra drawing in video-normalized coordinates (calibration quad, guides…). */
  draw?: (ctx: CanvasRenderingContext2D, toPx: (x: number, y: number) => [number, number]) => void;
  /** Fingertips currently pressing, by `${handId}:${finger}`. */
  pressing?: ReadonlySet<string>;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Computer-vision overlay for the real tracked landmarks (letterbox-aware,
 * never distorts the video). Drawn straight to canvas on every tracking
 * frame — no React re-render per frame.
 */
export function LandmarkOverlay({ extras, visible = true }: { extras?: OverlayExtras; visible?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const extrasRef = useRef(extras);
  extrasRef.current = extras;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const laser = getComputedStyle(document.documentElement).getPropertyValue('--laser').trim() || '#ff365d';
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'system-ui';

    const draw = (frame: TrackingFrame | null) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const vw = frame?.videoWidth || 16;
      const vh = frame?.videoHeight || 9;
      const scale = Math.min(w / vw, h / vh);
      const ox = (w - vw * scale) / 2;
      const oy = (h - vh * scale) / 2;
      const toPx = (x: number, y: number): [number, number] => [ox + x * vw * scale, oy + y * vh * scale];

      extrasRef.current?.draw?.(ctx, toPx);
      if (!frame || !visibleRef.current) return;

      const unit = Math.max(1, Math.min(1.5, (vh * scale) / 540));
      for (const hand of frame.hands) {
        const color = HAND_COLORS[hand.label];
        const pts = hand.landmarks.map((p) => toPx(p.x, p.y));

        // Palm fill: a faint tint so the hand reads as one object.
        ctx.beginPath();
        PALM.forEach((i, k) => (k === 0 ? ctx.moveTo(pts[i]![0], pts[i]![1]) : ctx.lineTo(pts[i]![0], pts[i]![1])));
        ctx.closePath();
        ctx.fillStyle = `${color}14`;
        ctx.fill();

        // Bones: dark under-stroke for contrast on any background, then a crisp line.
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [stroke, width] of [
          ['rgba(0,0,0,0.45)', 4 * unit],
          ['rgba(255,255,255,0.9)', 1.6 * unit],
        ] as const) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = width;
          ctx.beginPath();
          for (const [a, b] of CONNECTIONS) {
            ctx.moveTo(pts[a]![0], pts[a]![1]);
            ctx.lineTo(pts[b]![0], pts[b]![1]);
          }
          ctx.stroke();
        }

        // Joints, slightly larger when closer to the camera (MediaPipe z < 0).
        hand.landmarks.forEach((p, i) => {
          const [x, y] = pts[i]!;
          const r = Math.max(1.6, (2.6 - p.z * 12) * unit);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.stroke();
        });

        // Fingertips: identity-coloured rings; pressing tips fill with laser.
        for (const f of FINGER_NAMES) {
          const [x, y] = pts[FINGERS[f].tip]!;
          const pressing = extrasRef.current?.pressing?.has(`${hand.id}:${f}`);
          ctx.beginPath();
          ctx.arc(x, y, (pressing ? 8 : 6.5) * unit, 0, Math.PI * 2);
          ctx.lineWidth = 2 * unit;
          ctx.strokeStyle = pressing ? laser : color;
          ctx.fillStyle = pressing ? laser : 'rgba(9,11,16,0.55)';
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 2 * unit, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }

        // Identity chip near the wrist: "● Right 96%".
        const [wx, wy] = pts[0]!;
        const label = `${hand.label} ${(hand.score * 100).toFixed(0)}%`;
        ctx.font = `600 ${Math.round(12 * unit)}px ${font}`;
        const tw = ctx.measureText(label).width;
        const cw = tw + 26 * unit;
        const ch = 22 * unit;
        const cx = Math.min(w - cw - 6, Math.max(6, wx - cw / 2));
        const cy = Math.min(h - ch - 6, wy + 12 * unit);
        roundRect(ctx, cx, cy, cw, ch, ch / 2);
        ctx.fillStyle = 'rgba(9,11,16,0.78)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 11 * unit, cy + ch / 2, 3.5 * unit, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = '#F5F6FA';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx + 19 * unit, cy + ch / 2 + 0.5);
      }
    };

    draw(handTracker.latest);
    const off = handTracker.subscribe(draw);
    const ro = new ResizeObserver(() => draw(handTracker.latest));
    ro.observe(canvas);
    return () => {
      off();
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    // Redraw immediately when visibility toggles (not just on the next frame).
    const canvas = ref.current;
    if (canvas && !visible) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, [visible]);

  return <canvas ref={ref} className="landmarks" aria-hidden="true" data-testid="landmark-overlay" />;
}
