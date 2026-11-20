import { useEffect, useMemo, useState } from 'react';
import { useFrameStats, useTicker } from '@/hooks/useFrameStats';
import { longTasks, webglRenderCost } from '@/engine/performance/metrics';
import { GRADE_LABEL, getSeries, grade, onHistory, type Grade, type SeriesKey } from '@/engine/performance/history';
import { Segmented, Toggle } from '@/components/common/Controls';
import { Icon, type IconName } from '@/components/common/Icon';
import { Sparkline } from '@/components/common/Sparkline';
import { useSettings, type QualityMode } from '@/stores/settingsStore';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { getGpuInfo, getHeapMb } from '@/utils/systemInfo';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { CAMERA_LINK_LABEL } from '@/components/dashboard/status';
import '@/styles/performance.css';

const f = (n: number | null | undefined, d = 1, unit = '') => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(d)}${unit}`);
const latest = (k: SeriesKey) => {
  const s = getSeries(k);
  return s.length ? s[s.length - 1] ?? null : null;
};

/** Re-render whenever the 1 Hz history sampler adds a point. */
function useHistoryTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => onHistory(() => setN((x) => x + 1)), []);
  return n;
}

const GRADE_COLOR: Record<Grade, string> = {
  excellent: 'var(--s-excellent)',
  good: 'var(--s-good)',
  warn: 'var(--s-warn)',
  crit: 'var(--s-crit)',
  none: 'var(--s-idle)',
};

function GradePill({ g }: { g: Grade }) {
  return <span className={`gpill gpill--${g}`}>{GRADE_LABEL[g]}</span>;
}

function ChartCard({
  icon,
  title,
  value,
  unit,
  series,
  gradeKey,
  guides,
  max,
  sub,
  idle,
}: {
  icon: IconName;
  title: string;
  value: number | null;
  unit: string;
  series: SeriesKey;
  gradeKey?: SeriesKey;
  guides?: number[];
  max?: number;
  sub: string;
  idle?: string;
}) {
  const g = grade(gradeKey ?? series, value);
  return (
    <section className="pcard">
      <header className="pcard__head">
        <span className="pcard__title">
          <Icon name={icon} size={16} /> {title}
        </span>
        <GradePill g={g} />
      </header>
      <div className="pcard__value">
        <span className="pcard__num">{value === null ? '—' : value.toFixed(value >= 100 ? 0 : value >= 10 ? 0 : 1)}</span>
        {value !== null && <span className="pcard__unit">{unit}</span>}
      </div>
      <div className="pcard__chart">
        {getSeries(series).some((v) => v !== null) ? (
          <Sparkline values={getSeries(series)} guides={guides} max={max} color={GRADE_COLOR[g === 'none' ? 'excellent' : g]} label={`${title} history`} />
        ) : (
          <div className="pcard__empty">{idle ?? 'Collecting…'}</div>
        )}
      </div>
      <p className="pcard__sub">{sub}</p>
    </section>
  );
}

export function PerformancePage() {
  const frames = useFrameStats();
  useHistoryTick();
  useTicker(1000);
  const quality = useSettings((s) => s.performance.quality);
  const autoQuality = useSettings((s) => s.performance.autoQuality);
  const update = useSettings((s) => s.update);
  const link = useLinkStore();
  const tracking = useTrackingStore();
  const gpu = useMemo(getGpuInfo, []);
  const heap = getHeapMb();
  const profile = QUALITY_PROFILES[quality];
  const trackingOn = tracking.status === 'running';
  const linked = link.state === 'connected';

  const rows: Array<{ k: string; key?: SeriesKey; v: string; raw: number | null; note: string }> = [
    { k: 'Render rate', key: 'fps', v: f(frames.fps, 0, ' fps'), raw: frames.fps, note: 'requestAnimationFrame' },
    { k: 'Worst frame', v: f(frames.worstFrameMs, 1, ' ms'), raw: null, note: 'longest frame in the last 0.5 s' },
    { k: 'Input latency', key: 'inputLatency', v: f(latest('inputLatency'), 1, ' ms'), raw: latest('inputLatency'), note: 'pointer event → next frame' },
    { k: 'Hand detection', key: 'detectFps', v: trackingOn ? f(tracking.detectFps, 0, ' /s') : '—', raw: trackingOn ? tracking.detectFps : null, note: trackingOn ? `${tracking.backend === 'worker' ? 'Web Worker' : 'main thread'} · ${tracking.delegate}` : 'Air Mode / calibration only' },
    { k: 'Inference', key: 'detectMs', v: trackingOn ? f(tracking.detectMs, 1, ' ms') : '—', raw: trackingOn ? tracking.detectMs : null, note: 'MediaPipe per frame' },
    { k: 'Frame processing', key: 'pipelineMs', v: trackingOn ? f(tracking.pipelineMs, 1, ' ms') : '—', raw: trackingOn ? tracking.pipelineMs : null, note: 'capture → transfer → result' },
    { k: 'Air press latency', key: 'airLatency', v: f(latest('airLatency'), 0, ' ms'), raw: latest('airLatency'), note: 'camera frame → key event' },
    { k: 'Network latency', key: 'rttMs', v: linked ? f(link.stats.rttMs, 0, ' ms') : '—', raw: linked ? link.stats.rttMs : null, note: linked ? 'WebRTC round trip' : CAMERA_LINK_LABEL[link.state] },
    { k: 'Video', key: 'linkFps', v: linked && link.stats.width ? `${link.stats.width}×${link.stats.height} · ${f(link.stats.fps, 0)} fps` : '—', raw: linked ? link.stats.fps : null, note: 'received from the phone' },
    { k: 'Packet loss', key: 'lossPct', v: linked ? f(link.stats.lossPct, 1, ' %') : '—', raw: linked ? link.stats.lossPct : null, note: 'connection stability' },
    { k: 'Bitrate', v: linked && link.stats.kbps !== null ? `${(link.stats.kbps / 1000).toFixed(1)} Mb/s` : '—', raw: null, note: 'video stream' },
  ];

  const active = rows.filter((r) => r.key && r.raw !== null).map((r) => grade(r.key!, r.raw));
  const order: Grade[] = ['crit', 'warn', 'good', 'excellent'];
  const overall: Grade = active.length ? (order.find((g) => active.includes(g)) ?? 'excellent') : 'none';

  return (
    <div className="page page--wide perf">
      <header className="perf__head">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h1>Performance</h1>
          <p className="page__lead">Live measurements from this device. Values without a source show “—” — nothing here is estimated.</p>
        </div>
        <div className={`perf__overall perf__overall--${overall}`}>
          <span className="perf__overall-dot" />
          <span>
            <strong>{overall === 'none' ? 'Measuring' : GRADE_LABEL[overall]}</strong>
            <small>overall</small>
          </span>
        </div>
      </header>

      <div className="perf__cards">
        <ChartCard
          icon="activity"
          title="Rendering"
          value={frames.fps}
          unit="fps"
          series="fps"
          guides={[60, 30]}
          max={75}
          sub={`frame ${f(frames.frameMs, 1, ' ms')} · worst ${f(frames.worstFrameMs, 1, ' ms')}`}
        />
        <ChartCard
          icon="cpu"
          title="Inference"
          value={trackingOn ? tracking.detectMs : null}
          unit="ms"
          series="detectMs"
          guides={[33]}
          sub={trackingOn ? `${f(tracking.detectFps, 0)} detections/s · ${tracking.delegate}` : 'Hand tracking is not running'}
          idle="Starts with Air Mode or calibration"
        />
        <ChartCard
          icon="wifi"
          title="Network"
          value={linked ? link.stats.rttMs : null}
          unit="ms"
          series="rttMs"
          sub={linked ? `loss ${f(link.stats.lossPct, 1, ' %')} · ${link.stats.quality}` : CAMERA_LINK_LABEL[link.state]}
          idle="Connect a phone to measure"
        />
      </div>

      <section className="panel perf__table" aria-label="All measurements">
        <h2 className="panel__title">All measurements</h2>
        <div className="mtable" role="table">
          {rows.map((r) => {
            const g = r.key ? grade(r.key, r.raw) : 'none';
            return (
              <div key={r.k} className="mtable__row" role="row">
                <span className="mtable__k" role="cell">
                  {r.k}
                  <small>{r.note}</small>
                </span>
                <span className="mtable__chart" role="cell" aria-hidden="true">
                  {r.key && getSeries(r.key).some((v) => v !== null) && (
                    <Sparkline values={getSeries(r.key)} height={24} color={GRADE_COLOR[g === 'none' ? 'excellent' : g]} label="" />
                  )}
                </span>
                <span className="mtable__v mono" role="cell">
                  {r.v}
                </span>
                <span role="cell">{r.key ? <GradePill g={g} /> : null}</span>
              </div>
            );
          })}
        </div>
        <p className="perf__legend">
          <GradePill g="excellent" /> <GradePill g="good" /> <GradePill g="warn" /> <GradePill g="crit" />
          <span className="muted">thresholds tuned for typing: 60 fps rendering, &lt;33 ms per tracking frame, &lt;80 ms network round trip.</span>
        </p>
      </section>

      <div className="perf__split">
        <section className="panel" aria-label="System">
          <h2 className="panel__title">System</h2>
          <dl className="kv">
            <div>
              <dt>CPU</dt>
              <dd>{navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : '—'}</dd>
            </div>
            <div>
              <dt>GPU</dt>
              <dd>{gpu.renderer ?? '—'}</dd>
            </div>
            <div>
              <dt>Graphics API</dt>
              <dd>{gpu.api}</dd>
            </div>
            <div>
              <dt>Tracking</dt>
              <dd>{tracking.backend ? `${tracking.backend === 'worker' ? 'Web Worker' : 'Main thread'} · ${tracking.delegate}` : 'not loaded'}</dd>
            </div>
            <div>
              <dt>WebGL cost</dt>
              <dd>{profile.webgl ? f(webglRenderCost.mean(), 2, ' ms / frame') : 'off (Low quality)'}</dd>
            </div>
            <div>
              <dt>Long tasks</dt>
              <dd>
                {longTasks.supported
                  ? longTasks.count
                    ? `${longTasks.count} · last ${longTasks.lastDuration.toFixed(0)} ms`
                    : 'none over 50 ms'
                  : 'not exposed by this browser'}
              </dd>
            </div>
            {heap && (
              <div>
                <dt>JS heap</dt>
                <dd>
                  {heap.used.toFixed(0)} MB of {heap.limit.toFixed(0)} MB
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="panel" aria-label="Quality">
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
          <p className="field__hint perf__qhint">
            {quality === 'high' && 'Full WebGL projection at up to 2× pixel ratio; 1080p tracking target.'}
            {quality === 'balanced' && 'Recommended for Surface Pro 7: WebGL at 1.25× pixel ratio; 720p tracking target.'}
            {quality === 'low' && 'WebGL off (CSS fallback), reduced glow, 480p tracking, every other frame analysed.'}
          </p>
          <Toggle
            label="Adapt automatically"
            hint="Steps quality down one level if rendering stays below 40 fps for 6 seconds."
            checked={autoQuality}
            onChange={(v) => update('performance', { autoQuality: v })}
          />
        </section>
      </div>
    </div>
  );
}
