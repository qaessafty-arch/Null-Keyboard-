import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';

const f = (n: number | null, d = 0, unit = '') => (n === null ? '—' : `${n.toFixed(d)}${unit}`);

export type Grade = 'excellent' | 'good' | 'warn' | 'crit' | 'none';

/** Tracking quality from real detections: hands visible and their confidence. */
export function trackingGrade(status: string, hands: Array<{ score: number }>): { grade: Grade; text: string } {
  if (status !== 'running') return { grade: 'none', text: status === 'loading' ? 'Loading' : '—' };
  if (!hands.length) return { grade: 'warn', text: 'No hands' };
  const avg = hands.reduce((s, h) => s + h.score, 0) / hands.length;
  if (avg >= 0.9) return { grade: 'excellent', text: 'Excellent' };
  if (avg >= 0.75) return { grade: 'good', text: 'Good' };
  return { grade: 'warn', text: 'Low' };
}

const gradeOf = {
  fps: (v: number | null): Grade => (v === null ? 'none' : v >= 28 ? 'excellent' : v >= 20 ? 'good' : v >= 12 ? 'warn' : 'crit'),
  rtt: (v: number | null): Grade => (v === null ? 'none' : v < 30 ? 'excellent' : v < 80 ? 'good' : v < 200 ? 'warn' : 'crit'),
  loss: (v: number | null): Grade => (v === null ? 'none' : v < 0.5 ? 'excellent' : v < 2 ? 'good' : v < 8 ? 'warn' : 'crit'),
  height: (v: number | null): Grade => (v === null ? 'none' : v >= 700 ? 'excellent' : v >= 460 ? 'good' : 'warn'),
};

/**
 * Compact, single-surface strip of real link + tracking measurements
 * (RTCPeerConnection.getStats and the hand tracker). Not a wall of widgets.
 */
export function LinkStatsGrid() {
  const s = useLinkStore((st) => st.stats);
  const phone = useLinkStore((st) => st.phone);
  const tStatus = useTrackingStore((st) => st.status);
  const hands = useTrackingStore((st) => st.hands);
  const tracking = trackingGrade(tStatus, hands);

  const items: Array<{ k: string; v: string; g: Grade; id?: string }> = [
    { k: 'Tracking', v: tracking.text, g: tracking.grade },
    { k: 'Resolution', v: s.width && s.height ? `${s.width}×${s.height}` : '—', g: gradeOf.height(s.height) },
    { k: 'Frame rate', v: f(s.fps, 0, ' fps'), g: gradeOf.fps(s.fps), id: 'link-fps' },
    { k: 'Latency', v: f(s.rttMs, 0, ' ms'), g: gradeOf.rtt(s.rttMs) },
    { k: 'Packet loss', v: f(s.lossPct, 1, ' %'), g: gradeOf.loss(s.lossPct) },
    { k: 'Bitrate', v: s.kbps === null ? '—' : `${(s.kbps / 1000).toFixed(1)} Mb/s`, g: s.kbps === null ? 'none' : 'good' },
  ];

  return (
    <div className="linkstrip" data-testid="link-stats">
      <dl className="linkstrip__grid">
        {items.map((it) => (
          <div key={it.k} className={`linkstrip__item g--${it.g}`}>
            <dt>{it.k}</dt>
            <dd className="mono" data-testid={it.id}>
              {it.id ? it.v.replace(' fps', '') : it.v}
            </dd>
          </div>
        ))}
      </dl>
      {phone?.label && (
        <p className="linkstrip__foot">
          Camera <span className="mono">{phone.label}</span>
        </p>
      )}
    </div>
  );
}
