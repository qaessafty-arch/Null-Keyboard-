import { useRef } from 'react';
import type { Point2 } from '@/engine/coordinates/homography';
import { videoBox } from '@/engine/calibration/calibrationMath';

const NAMES = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];

/**
 * Four draggable corner handles over the camera preview (finger, pen or
 * mouse). Positions are in video-normalized coordinates.
 */
export function CornerEditor({
  corners,
  onChange,
  videoWidth,
  videoHeight,
  active = -1,
}: {
  corners: Point2[];
  onChange: (c: Point2[]) => void;
  videoWidth: number;
  videoHeight: number;
  active?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; id: number } | null>(null);

  const box = () => {
    const el = ref.current!;
    return { el, map: videoBox(el.clientWidth, el.clientHeight, videoWidth || 16, videoHeight || 9) };
  };

  const move = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const { el, map } = box();
    const r = el.getBoundingClientRect();
    const p = map.fromPx(e.clientX - r.left, e.clientY - r.top);
    const next = corners.slice();
    next[drag.current.i] = { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
    onChange(next);
  };

  const el = ref.current;
  const map = el ? videoBox(el.clientWidth, el.clientHeight, videoWidth || 16, videoHeight || 9) : null;

  return (
    <div ref={ref} className="corners" onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      {map &&
        corners.map((c, i) => {
          const p = map.toPx(c);
          return (
            <button
              key={i}
              type="button"
              className={`corner${active === i ? ' is-active' : ''}`}
              style={{ left: p.x, top: p.y }}
              aria-label={`${NAMES[i]} corner`}
              data-testid={`corner-${i}`}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { i, id: e.pointerId };
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.02 : 0.004;
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (!d) return;
                e.preventDefault();
                const next = corners.slice();
                next[i] = { x: Math.min(1, Math.max(0, c.x + d[0]!)), y: Math.min(1, Math.max(0, c.y + d[1]!)) };
                onChange(next);
              }}
            >
              <span>{i + 1}</span>
            </button>
          );
        })}
    </div>
  );
}
