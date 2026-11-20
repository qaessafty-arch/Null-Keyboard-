import { useLinkStore } from '@/stores/linkStore';
import { useEffect, useRef } from 'react';
import { useFrameStats, useTicker } from '@/hooks/useFrameStats';
import { airLatency, frameMeter, inputLatency, longTasks, webglRenderCost } from '@/engine/performance/metrics';
import { useTrackingStore } from '@/stores/trackingStore';
import { Toggle } from '@/components/common/Controls';
import { Segmented } from '@/components/common/Controls';
import { useSettings, type QualityMode } from '@/stores/settingsStore';
import { getHeapMb } from '@/utils/systemInfo';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { CAMERA_LINK_LABEL } from '@/components/dashboard/status';

const f = (n: number | null | undefined, d = 1, unit = '') => (n === null || n === undefined ? '—' : `${n.toFixed(d)}${unit}`);

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'err' }) {
  return (
    <div className={`metric${tone ? ` metric--${tone}` : ''}`}>
      <span className="eyebrow">{label}</span>
      <span className="metric__v mono">{value}</span>
      {sub && <span className="metric__sub">{sub}</span>}
    </div>
  );
}

/** Frame-time sparkline drawn from the meter's real interval buffer. */
function FrameGraph() {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useTicker(250);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const style = getComputedStyle(c);
    const accent = style.getPropertyValue('--accent').trim() || '#ff174f';
    const grid = 'rgba(135,146,168,0.18)';
    const maxMs = 50;
    // 16.7 ms and 33.3 ms guides
    ctx.strokeStyle = grid;
    ctx.setLineDash([3, 4]);
    for (const ms of [16.7, 33.3]) {
      const y = h - (ms / maxMs) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const stat = frameMeter.intervals;
    const samples = stat.values();
    if (samples.length < 2) return;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((v, k) => {
      const x = (k / (stat.capacity - 1)) * w;
      const y = h - (Math.min(v, maxMs) / maxMs) * h;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [tick]);
  return (
    <div className="framegraph">
      <canvas ref={ref} aria-label="Frame time graph, last 240 frames" role="img" />
      <div className="framegraph__legend mono">
        <span>frame time (ms) · last 240 frames</span>
        <span>guides: 16.7 / 33.3 ms</span>
      </div>
    </div>
  );
}

export function PerformancePage() {
  const frames = useFrameStats();
  useTicker(500);
  const quality = useSettings((s) => s.performance.quality);
  const update = useSettings((s) => s.update);
  const cameraLink = useLinkStore((s) => s.state);
  const link = useLinkStore((s) => s.stats);
  const tracking = useTrackingStore();
  const autoQuality = useSettings((s) => s.performance.autoQuality);
  const heap = getHeapMb();
  const profile = QUALITY_PROFILES[quality];

  const fpsTone = frames.fps === null ? undefined : frames.fps >= 50 ? 'ok' : frames.fps >= 28 ? 'warn' : 'err';

  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Diagnostics</p>
        <h1>Performance monitor</h1>
        <p className="muted page__lead">
          Every number here is measured live in this browser. Values that have no source yet show “—”.
        </p>
      </header>

      <section className="panel">
        <h2 className="panel__title">Rendering</h2>
        <div className="metrics">
          <Metric label="Render FPS" value={f(frames.fps, 0)} sub="requestAnimationFrame" tone={fpsTone} />
          <Metric label="Frame time" value={f(frames.frameMs, 1, ' ms')} sub={`worst ${f(frames.worstFrameMs, 1, ' ms')}`} />
          <Metric
            label="WebGL render"
            value={f(webglRenderCost.mean(), 2, ' ms')}
            sub={profile.webgl ? 'CPU time in renderer.render()' : 'WebGL off in LOW quality'}
          />
          <Metric
            label="Long tasks"
            value={longTasks.supported ? String(longTasks.count) : '—'}
            sub={
              longTasks.supported
                ? longTasks.count
                  ? `last ${longTasks.lastDuration.toFixed(0)} ms main-thread block`
                  : 'no main-thread blocks > 50 ms'
                : 'not exposed by this browser'
            }
            tone={longTasks.supported && longTasks.count > 0 ? 'warn' : undefined}
          />
        </div>
        <FrameGraph />
      </section>

      <section className="panel">
        <h2 className="panel__title">Input</h2>
        <div className="metrics">
          <Metric
            label="Input latency (mean)"
            value={f(inputLatency.mean(), 1, ' ms')}
            sub="pointer event → next frame"
          />
          <Metric label="Input latency (p95)" value={f(inputLatency.percentile(95), 1, ' ms')} />
          <Metric label="Last press" value={f(inputLatency.last, 1, ' ms')} />
          <Metric label="Samples" value={String(inputLatency.count)} sub="recent key presses" />
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Vision & camera</h2>
        <div className="metrics">
          <Metric
            label="Hand detection"
            value={tracking.status === 'running' ? f(tracking.detectFps, 0, '/s') : '—'}
            sub={
              tracking.status === 'running'
                ? `${tracking.backend === 'worker' ? 'Web Worker' : 'main thread'} · ${tracking.delegate}`
                : tracking.status === 'loading'
                  ? 'loading model…'
                  : 'not running (Air Mode / calibration only)'
            }
          />
          <Metric label="Inference" value={tracking.status === 'running' ? f(tracking.detectMs, 1, ' ms') : '—'} sub="MediaPipe per frame" />
          <Metric
            label="Frame → result"
            value={tracking.status === 'running' ? f(tracking.pipelineMs, 1, ' ms') : '—'}
            sub="capture + transfer + inference"
          />
          <Metric label="Air press latency" value={f(airLatency.mean(), 0, ' ms')} sub={`frame → key event · ${airLatency.count} presses`} />
          <Metric
            label="Camera"
            value={link.width && link.height ? `${link.width}×${link.height}` : '—'}
            sub={link.fps !== null ? `${link.fps.toFixed(0)} fps received` : 'no stream'}
          />
          <Metric
            label="Connection"
            value={link.quality === 'unknown' ? '—' : link.quality}
            sub={link.rttMs !== null ? `RTT ${link.rttMs.toFixed(0)} ms · loss ${f(link.lossPct, 1, ' %')}` : CAMERA_LINK_LABEL[cameraLink]}
            tone={link.quality === 'good' ? 'ok' : link.quality === 'fair' ? 'warn' : link.quality === 'poor' ? 'err' : undefined}
          />
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Quality</h2>
        <Segmented<QualityMode>
          label="Quality mode"
          value={quality}
          onChange={(q) => update('performance', { quality: q })}
          options={[
            { value: 'high', label: 'High' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'low', label: 'Low' },
          ]}
        />
        <p className="field__hint">
          {quality === 'high' && 'Full WebGL effects at up to 2× pixel ratio, 1080p tracking target.'}
          {quality === 'balanced' && 'Recommended for Surface Pro 7: WebGL at 1.25× pixel ratio, 720p tracking target.'}
          {quality === 'low' && 'WebGL off (CSS fallback), reduced glow, 480p tracking and every-other-frame detection.'}
        </p>
        <Toggle
          label="Adapt automatically"
          hint="Steps quality down one level if rendering stays below 40 FPS for 6 seconds."
          checked={autoQuality}
          onChange={(v) => update('performance', { autoQuality: v })}
        />
        {heap && (
          <p className="field__hint mono">
            JS heap: {heap.used.toFixed(0)} MB used of {heap.limit.toFixed(0)} MB limit
          </p>
        )}
      </section>
    </div>
  );
}
