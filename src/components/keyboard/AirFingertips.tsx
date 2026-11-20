import { useEffect, useRef } from 'react';
import { airTips, type AirTip } from '@/features/air-mode/airStore';

/**
 * Fingertip indicators drawn over the on-screen keyboard while air typing.
 * Positions come from the real tracker via the calibrated homography; drawn
 * straight to canvas (no React re-render per frame).
 */
export function AirFingertips() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#ff174f';
    const accent2 = css.getPropertyValue('--accent-2').trim() || '#ff3d81';

    const draw = (tips: AirTip[]) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const t of tips) {
        const x = Math.min(w, Math.max(0, t.u * w));
        const y = Math.min(h, Math.max(0, t.v * h));
        const r = t.pressing ? 11 : 7;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = t.pressing ? accent2 : 'rgba(255,255,255,0.85)';
        ctx.shadowColor = t.pressing ? accent2 : accent;
        ctx.shadowBlur = t.pressing ? 18 : 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = accent;
        ctx.stroke();
        if (t.dwell > 0 && !t.pressing) {
          ctx.beginPath();
          ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + t.dwell * Math.PI * 2);
          ctx.strokeStyle = accent2;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    };
    const off = airTips.subscribe(draw);
    return () => {
      off();
      draw([]);
    };
  }, []);

  return <canvas ref={ref} className="air-tips" aria-hidden="true" data-testid="air-tips" />;
}
