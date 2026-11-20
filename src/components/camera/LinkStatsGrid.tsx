import { useLinkStore } from '@/stores/linkStore';

const f = (n: number | null, d = 0, unit = '') => (n === null ? '—' : `${n.toFixed(d)}${unit}`);

/** Live WebRTC receiver stats (from RTCPeerConnection.getStats()). */
export function LinkStatsGrid() {
  const s = useLinkStore((st) => st.stats);
  const phone = useLinkStore((st) => st.phone);
  return (
    <dl className="linkstats mono" data-testid="link-stats">
      <div>
        <dt>Quality</dt>
        <dd className={`q q--${s.quality}`}>{s.quality}</dd>
      </div>
      <div>
        <dt>Video</dt>
        <dd>{s.width && s.height ? `${s.width}×${s.height}` : '—'}</dd>
      </div>
      <div>
        <dt>FPS</dt>
        <dd data-testid="link-fps">{f(s.fps)}</dd>
      </div>
      <div>
        <dt>RTT</dt>
        <dd>{f(s.rttMs, 0, ' ms')}</dd>
      </div>
      <div>
        <dt>Loss</dt>
        <dd>{f(s.lossPct, 1, ' %')}</dd>
      </div>
      <div>
        <dt>Bitrate</dt>
        <dd>{f(s.kbps === null ? null : s.kbps / 1000, 1, ' Mb/s')}</dd>
      </div>
      {phone?.label && (
        <div className="linkstats__wide">
          <dt>Camera</dt>
          <dd>{phone.label}</dd>
        </div>
      )}
    </dl>
  );
}
