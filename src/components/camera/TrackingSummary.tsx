import { useTrackingStore } from '@/stores/trackingStore';
import { StatusDot } from '@/components/common/Controls';

const f = (n: number | null, d = 0, unit = '') => (n === null ? '—' : `${n.toFixed(d)}${unit}`);

/** Live hand-tracking status (measured). */
export function TrackingSummary() {
  const t = useTrackingStore();
  const tone = t.status === 'running' ? (t.hands.length ? 'ok' : 'warn') : t.status === 'error' ? 'err' : t.status === 'loading' ? 'warn' : 'idle';
  const text =
    t.status === 'loading'
      ? 'Loading hand model…'
      : t.status === 'error'
        ? (t.error ?? 'Tracking error')
        : t.status === 'off'
          ? 'Tracking off'
          : t.hands.length === 0
            ? t.lost
              ? 'Tracking lost — bring your hands back into view'
              : 'No hands in view'
            : `${t.hands.length} hand${t.hands.length > 1 ? 's' : ''}: ${t.hands.map((h) => `${h.label} ${(h.score * 100).toFixed(0)}%`).join(' · ')}`;
  return (
    <div className="tracksum" data-testid="tracking-summary" data-status={t.status} data-hands={t.hands.length}>
      <div className="tracksum__line">
        <StatusDot tone={tone} pulse={t.status === 'loading'} />
        <span>{text}</span>
      </div>
      {t.status === 'running' && (
        <div className="tracksum__meta mono">
          <span>{f(t.detectFps)} det/s</span>
          <span>{f(t.detectMs, 1, ' ms')} inference</span>
          <span>{f(t.pipelineMs, 1, ' ms')} frame→result</span>
          <span>
            {t.backend === 'worker' ? 'worker' : 'main thread'} · {t.delegate}
            {t.modelSource === 'remote' ? ' · model from CDN' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
