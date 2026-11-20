import { airLatency, frameMeter, inputLatency } from './metrics';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';

/**
 * Once-per-second history of real measurements for the Performance charts.
 * Each series stores `null` when its source isn't active (e.g. no camera),
 * so charts show gaps instead of invented values.
 */
export type SeriesKey =
  | 'fps'
  | 'frameWorst'
  | 'inputLatency'
  | 'detectFps'
  | 'detectMs'
  | 'pipelineMs'
  | 'rttMs'
  | 'linkFps'
  | 'lossPct'
  | 'mbps'
  | 'airLatency';

const CAPACITY = 120;
const series: Record<SeriesKey, Array<number | null>> = {
  fps: [],
  frameWorst: [],
  inputLatency: [],
  detectFps: [],
  detectMs: [],
  pipelineMs: [],
  rttMs: [],
  linkFps: [],
  lossPct: [],
  mbps: [],
  airLatency: [],
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let unsubFrames: (() => void) | null = null;

function push(key: SeriesKey, v: number | null | undefined) {
  const arr = series[key];
  arr.push(v === undefined || v === null || !Number.isFinite(v) ? null : v);
  if (arr.length > CAPACITY) arr.shift();
}

function sample() {
  const f = frameMeter.current;
  const t = useTrackingStore.getState();
  const l = useLinkStore.getState();
  const tracking = t.status === 'running';
  const linked = l.state === 'connected';
  push('fps', f.fps);
  push('frameWorst', f.worstFrameMs);
  push('inputLatency', inputLatency.count ? inputLatency.mean() : null);
  push('detectFps', tracking ? t.detectFps : null);
  push('detectMs', tracking ? t.detectMs : null);
  push('pipelineMs', tracking ? t.pipelineMs : null);
  push('rttMs', linked ? l.stats.rttMs : null);
  push('linkFps', linked ? l.stats.fps : null);
  push('lossPct', linked ? l.stats.lossPct : null);
  push('mbps', linked && l.stats.kbps !== null ? l.stats.kbps / 1000 : null);
  push('airLatency', airLatency.count ? airLatency.mean() : null);
  for (const fn of listeners) fn();
}

/** Start sampling (idempotent). Keeps the frame meter alive while sampling. */
export function startHistory(): () => void {
  if (!timer) {
    unsubFrames = frameMeter.subscribe(() => {});
    timer = setInterval(sample, 1000);
  }
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    unsubFrames?.();
    unsubFrames = null;
  };
}

export function getSeries(key: SeriesKey): ReadonlyArray<number | null> {
  return series[key];
}

export function onHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type Grade = 'excellent' | 'good' | 'warn' | 'crit' | 'none';

/** Thresholds per metric. `higher` = bigger is better. */
export const GRADING: Partial<Record<SeriesKey, { higher: boolean; t: [number, number, number] }>> = {
  fps: { higher: true, t: [55, 40, 25] },
  inputLatency: { higher: false, t: [16, 34, 60] },
  detectFps: { higher: true, t: [25, 15, 8] },
  detectMs: { higher: false, t: [20, 40, 80] },
  pipelineMs: { higher: false, t: [33, 60, 120] },
  rttMs: { higher: false, t: [30, 80, 200] },
  linkFps: { higher: true, t: [28, 20, 12] },
  lossPct: { higher: false, t: [0.5, 2, 8] },
  airLatency: { higher: false, t: [60, 120, 250] },
};

export function grade(key: SeriesKey, v: number | null | undefined): Grade {
  const g = GRADING[key];
  if (v === null || v === undefined || !g) return 'none';
  const [a, b, c] = g.t;
  if (g.higher) return v >= a ? 'excellent' : v >= b ? 'good' : v >= c ? 'warn' : 'crit';
  return v <= a ? 'excellent' : v <= b ? 'good' : v <= c ? 'warn' : 'crit';
}

export const GRADE_LABEL: Record<Grade, string> = {
  excellent: 'Excellent',
  good: 'Good',
  warn: 'Warning',
  crit: 'Critical',
  none: 'No data',
};
