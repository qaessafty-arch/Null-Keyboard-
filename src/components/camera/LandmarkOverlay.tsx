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

export interface OverlayExtras {
  /** Extra drawing in video-normalized coordinates (calibration quad, etc.). */
  draw?: (ctx: CanvasRenderingContext2D, toPx: (x: number, y: number) => [number, number]) => void;
  /** Fingertips currently pressing, by `${handId}:${finger}`. */
  pressing?: ReadonlySet<string>;
}

/**
 * Draws real tracked landmarks over a camera preview (letterbox-aware). Draws
 * straight to canvas on each tracking frame — no React re-render per frame.
 */
export function LandmarkOverlay({ extras }: { extras?: OverlayExtras }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const extrasRef = useRef(extras);
  extrasRef.current = extras;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff174f';
    const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim() || '#ff3d81';

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
      // object-fit: contain mapping
      const vw = frame?.videoWidth || 16;
      const vh = frame?.videoHeight || 9;
      const scale = Math.min(w / vw, h / vh);
      const ox = (w - vw * scale) / 2;
      const oy = (h - vh * scale) / 2;
      const toPx = (x: number, y: number): [number, number] => [ox + x * vw * scale, oy + y * vh * scale];

      extrasRef.current?.draw?.(ctx, toPx);
      if (!frame) return;

      for (const hand of frame.hands) {
        const pts = hand.landmarks.map((p) => toPx(p.x, p.y));
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) {
          ctx.moveTo(pts[a]![0], pts[a]![1]);
          ctx.lineTo(pts[b]![0], pts[b]![1]);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (const [x, y] of pts) {
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const f of FINGER_NAMES) {
          const [x, y] = pts[FINGERS[f].tip]!;
          const active = extrasRef.current?.pressing?.has(`${hand.id}:${f}`);
          ctx.beginPath();
          ctx.arc(x, y, active ? 9 : 6, 0, Math.PI * 2);
          ctx.fillStyle = active ? accent2 : accent;
          ctx.shadowColor = active ? accent2 : accent;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        const [wx, wy] = pts[0]!;
        ctx.font = '600 12px "Cascadia Mono", Consolas, monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${hand.label.toUpperCase()} ${(hand.score * 100).toFixed(0)}%`, wx + 8, wy + 16);
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

  return <canvas ref={ref} className="landmarks" aria-hidden="true" data-testid="landmark-overlay" />;
}
