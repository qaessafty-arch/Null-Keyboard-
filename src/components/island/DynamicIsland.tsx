import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { navigate, useRoute } from '@/app/Router';
import { FingerprintMark, type FingerprintState } from '@/brand/FingerprintMark';
import { Icon } from '@/components/common/Icon';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from '@/components/dashboard/status';
import { hostLink } from '@/communication/camera-connection/HostLink';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useSettings, type Appearance, type ThemeId } from '@/stores/settingsStore';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { spring } from '@/design/motion';
import { useIslandActivity, type IslandActivity } from './useIslandActivity';
import './island.css';

type Mode = 'compact' | 'activity' | 'expanded';

/**
 * Dynamic Island–inspired system status: one black capsule that morphs
 * between a compact summary, short live activities for real events, and an
 * expanded control panel. Every value comes from live stores.
 */
export function DynamicIsland() {
  const { path } = useRoute();
  const link = useLinkStore();
  const tracking = useTrackingStore();
  const theme = useSettings((s) => s.general.theme);
  const activity = useIslandActivity();
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const mode: Mode = expanded ? 'expanded' : activity ? 'activity' : 'compact';

  const live = link.state === 'connected' && !!link.stream;
  const fp: FingerprintState =
    tracking.status === 'running' && tracking.hands.length > 0
      ? 'active'
      : tracking.status === 'loading' || (tracking.status === 'running' && tracking.hands.length === 0) || ['connecting', 'reconnecting'].includes(link.state)
        ? 'scanning'
        : 'idle';

  // Close on outside click / Escape.
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  // Context-aware compact label.
  const label =
    path === '/connect' && link.state === 'waiting' && link.code
      ? `Pair ${link.code.slice(0, 3)} ${link.code.slice(3)}`
      : link.state === 'connecting' || link.state === 'reconnecting' || link.state === 'permission-required'
        ? CAMERA_LINK_LABEL[link.state]
        : live
          ? tracking.status === 'running'
            ? tracking.lost
              ? 'Tracking lost'
              : `Live · ${tracking.hands.length} hand${tracking.hands.length === 1 ? '' : 's'}`
            : 'Camera live'
          : link.state === 'waiting'
            ? 'Waiting for phone'
            : 'Ready';

  return (
    <div className="island-slot" ref={root}>
      {/* Persistent, screen-reader-friendly status (also used by tests). */}
      <span className="visually-hidden" data-testid="camera-link-pill" aria-live="polite">
        {CAMERA_LINK_LABEL[link.state]}
      </span>
      <motion.div
        layout
        className={`island island--${mode}`}
        style={{ borderRadius: mode === 'expanded' ? 26 : 999 }}
        transition={spring.fluid}
        data-testid="dynamic-island"
        data-mode={mode}
      >
        {mode === 'expanded' ? (
          <Expanded onClose={() => setExpanded(false)} />
        ) : (
          <button
            type="button"
            className="island__face"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-label={`System status: ${CAMERA_LINK_LABEL[link.state]}. Open controls`}
          >
            {mode === 'activity' && activity ? (
              <ActivityFace activity={activity} />
            ) : (
              <span className="island__content island__compact" key="compact">
                <FingerprintMark size={18} state={fp} />
                <span className="island__label">{label}</span>
              </span>
            )}
            <Trailing linkTone={CAMERA_LINK_TONE[link.state]} live={live} theme={theme} />
          </button>
        )}
      </motion.div>
    </div>
  );
}

function Trailing({ linkTone, live, theme }: { linkTone: string; live: boolean; theme: ThemeId }) {
  return (
    <span className="island__trail" aria-hidden="true">
      <span className={`island__dot island__dot--${linkTone}`} title="Phone" />
      <span className={`island__cam${live ? ' is-live' : ''}`} title={live ? 'Camera live' : 'Camera off'}>
        <Icon name="video" size={14} />
        {live && <span className="island__rec" data-testid="camera-live" />}
      </span>
      <span className={`island__laser island__laser--${theme}`} title="Laser" />
    </span>
  );
}

function ActivityFace({ activity }: { activity: IslandActivity }) {
  return (
    <span className={`island__content island__activity island__activity--${activity.tone}`} key={activity.id}>
      <span className="island__activity-icon">
        {activity.icon === 'fingerprint' ? (
          <FingerprintMark size={20} state={activity.tone === 'warn' ? 'scanning' : 'success'} />
        ) : (
          <Icon name={activity.icon} size={17} />
        )}
      </span>
      <span className="island__activity-text">
        <strong>{activity.title}</strong>
        {activity.sub && <span>{activity.sub}</span>}
      </span>
    </span>
  );
}

function Expanded({ onClose }: { onClose: () => void }) {
  const link = useLinkStore();
  const tracking = useTrackingStore();
  const theme = useSettings((s) => s.general.theme);
  const appearance = useSettings((s) => s.general.appearance);
  const webgl = useSettings((s) => QUALITY_PROFILES[s.performance.quality].webgl);
  const update = useSettings((s) => s.update);
  const live = link.state === 'connected' && !!link.stream;
  const st = link.stats;

  return (
    <div className="island__content island__panel" role="dialog" aria-label="System controls">
      <div className="island__panel-head">
        <FingerprintMark size={22} state={tracking.status === 'running' && tracking.hands.length ? 'active' : 'idle'} />
        <strong>NULL-TECH</strong>
        <button type="button" className="island__x" onClick={onClose} aria-label="Close controls">
          <Icon name="close" size={14} />
        </button>
      </div>

      <IslandRow icon="phone" title="Phone" value={CAMERA_LINK_LABEL[link.state]} tone={CAMERA_LINK_TONE[link.state]}>
        {link.state === 'idle' ? (
          <button type="button" className="island__btn island__btn--primary" onClick={() => (navigate('/connect'), onClose())}>
            Connect
          </button>
        ) : (
          <button type="button" className="island__btn" onClick={() => hostLink.stop()}>
            {live ? 'Disconnect' : 'Cancel'}
          </button>
        )}
      </IslandRow>
      <IslandRow
        icon="video"
        title="Camera"
        value={live && st.width ? `${st.width}×${st.height} · ${st.fps?.toFixed(0) ?? '—'} fps` : 'Off'}
        tone={live ? (st.quality === 'good' ? 'ok' : st.quality === 'fair' ? 'warn' : st.quality === 'poor' ? 'err' : 'idle') : 'idle'}
      />
      <IslandRow
        icon="hand"
        title="Tracking"
        value={
          tracking.status === 'running'
            ? `${tracking.hands.length} hand${tracking.hands.length === 1 ? '' : 's'} · ${tracking.detectFps ?? '—'}/s · ${tracking.delegate}`
            : tracking.status === 'loading'
              ? 'Loading model…'
              : 'Off'
        }
        tone={tracking.status === 'running' ? (tracking.hands.length ? 'ok' : 'warn') : tracking.status === 'error' ? 'err' : 'idle'}
      />
      <IslandRow icon="laser" title="Laser" value={webgl ? 'Projection on' : 'Projection off'} tone="laser">
        <span className="island__seg" role="radiogroup" aria-label="Laser theme">
          {(['laser', 'holo'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? 'is-on' : ''} onClick={() => update('general', { theme: t })}>
              {t === 'laser' ? 'Laser' : 'Signal'}
            </button>
          ))}
        </span>
      </IslandRow>
      <IslandRow icon="theme" title="Appearance" value="">
        <span className="island__seg" role="radiogroup" aria-label="Appearance">
          {(['system', 'light', 'dark'] as Appearance[]).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={appearance === a}
              className={appearance === a ? 'is-on' : ''}
              onClick={() => update('general', { appearance: a })}
            >
              {a === 'system' ? 'Auto' : a === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </span>
      </IslandRow>

      <button type="button" className="island__more" onClick={() => (navigate('/performance'), onClose())}>
        Performance details <Icon name="chevronRight" size={14} />
      </button>
    </div>
  );
}

function IslandRow({
  icon,
  title,
  value,
  tone = 'idle',
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  value: string;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="island__row">
      <span className={`island__row-icon island__row-icon--${tone}`}>
        <Icon name={icon} size={15} />
      </span>
      <span className="island__row-text">
        <span>{title}</span>
        {value && <strong>{value}</strong>}
      </span>
      {children}
    </div>
  );
}
