import { useLayoutEffect, useRef, useState } from 'react';
import { Link, navigate, useRoute } from '@/app/Router';
import { switchInputMode } from '@/app/actions';
import { Logo } from '@/components/common/Logo';
import { Icon, type IconName } from '@/components/common/Icon';
import { FingerprintMark } from '@/brand/FingerprintMark';
import { useAppStore } from '@/stores/appStore';
import { useLinkStore } from '@/stores/linkStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useSettings } from '@/stores/settingsStore';
import { useFullscreen } from '@/hooks/useFullscreen';
import { THEME_NAMES } from '@/styles/themes';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from './status';

export const NAV: Array<{ to: string; label: string; icon: IconName; matches?: string[] }> = [
  { to: '/workspace', label: 'Workspace', icon: 'keyboard', matches: ['/touch', '/air'] },
  { to: '/connect', label: 'Connect', icon: 'phone' },
  { to: '/calibrate', label: 'Calibrate', icon: 'target' },
  { to: '/performance', label: 'Performance', icon: 'activity' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/about', label: 'About', icon: 'info' },
];

/** Floating, macOS-inspired navigation with a sliding active indicator. */
export function TopBar() {
  const { path } = useRoute();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setIndicator(active ? { x: active.offsetLeft, w: active.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [path]);

  return (
    <header className="nav">
      <a href="#/" className="nav__brand" aria-label="NULL-TECH home">
        <Logo />
      </a>

      <nav ref={navRef} className="nav__links" aria-label="Main">
        {indicator && (
          <span className="nav__indicator" style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w }} aria-hidden="true" />
        )}
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} matches={n.matches} className="nav__link">
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="nav__status">
        <TrackingIndicator />
        <PhoneIndicator />
        <CameraIndicator />
        <span className="nav__sep" aria-hidden="true" />
        <ModeIndicator />
        <LaserIndicator />
        <FullscreenButton />
        <button type="button" className="nav__icon" aria-label="Settings" title="Settings" onClick={() => navigate('/settings')}>
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}

function PhoneIndicator() {
  const state = useLinkStore((s) => s.state);
  const tone = CAMERA_LINK_TONE[state];
  return (
    <button
      type="button"
      className={`ind ind--${tone}`}
      onClick={() => navigate('/connect')}
      title={`Phone: ${CAMERA_LINK_LABEL[state]}`}
      data-testid="camera-link-pill"
    >
      <Icon name="phone" size={16} />
      <span className={`ind__dot${['waiting', 'connecting', 'reconnecting'].includes(state) ? ' ind__dot--pulse' : ''}`} />
      <span className="ind__label">{CAMERA_LINK_LABEL[state]}</span>
    </button>
  );
}

function CameraIndicator() {
  const live = useLinkStore((s) => s.state === 'connected' && s.stream !== null);
  return (
    <span className={`ind ind--icon${live ? ' ind--live' : ''}`} title={live ? 'Phone camera is streaming to this device' : 'Camera off'}>
      <Icon name="video" size={16} />
      {live && <span className="ind__rec" data-testid="camera-live" aria-label="Camera live" />}
    </span>
  );
}

function TrackingIndicator() {
  const status = useTrackingStore((s) => s.status);
  const hands = useTrackingStore((s) => s.hands.length);
  if (status === 'off') return null;
  const state = status === 'loading' || (status === 'running' && hands === 0) ? 'scanning' : status === 'running' ? 'active' : 'idle';
  const label =
    status === 'loading' ? 'Loading tracker' : status === 'error' ? 'Tracking error' : hands ? `${hands} hand${hands > 1 ? 's' : ''}` : 'Searching';
  return (
    <span className={`ind ind--track${status === 'error' ? ' ind--err' : ''}`} title={`Hand tracking: ${label}`}>
      <FingerprintMark size={16} state={state} />
      <span className="ind__label ind__label--always">{label}</span>
    </span>
  );
}

function ModeIndicator() {
  const mode = useAppStore((s) => s.mode);
  return (
    <div className="modepick" role="group" aria-label="Interaction mode" data-testid="active-mode" data-mode={mode}>
      {(['touch', 'air'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          aria-label={m === 'touch' ? 'Touch input' : 'Air input'}
          className={mode === m ? 'is-on' : undefined}
          onClick={() => switchInputMode(m)}
          title={m === 'touch' ? 'Touch Mode' : 'Air Mode'}
        >
          <Icon name={m === 'touch' ? 'hand' : 'camera'} size={15} />
          <span>{m === 'touch' ? 'Touch' : 'Air'}</span>
        </button>
      ))}
      <span className="visually-hidden">{mode === 'air' ? 'AIR' : 'TOUCH'}</span>
    </div>
  );
}

function LaserIndicator() {
  const theme = useSettings((s) => s.general.theme);
  const webgl = useSettings((s) => QUALITY_PROFILES[s.performance.quality].webgl);
  const update = useSettings((s) => s.update);
  const next = theme === 'laser' ? 'holo' : 'laser';
  return (
    <button
      type="button"
      className={`ind ind--laser ind--theme-${theme}`}
      onClick={() => update('general', { theme: next })}
      aria-label={`Laser: ${THEME_NAMES[theme]}${webgl ? '' : ' (projection off)'}. Switch to ${THEME_NAMES[next]}`}
      title={`Laser ${THEME_NAMES[theme]} · projection ${webgl ? 'on' : 'off (Low quality)'} — click to switch`}
    >
      <Icon name="laser" size={16} />
      <span className="ind__swatch" />
    </button>
  );
}

function FullscreenButton() {
  const fs = useFullscreen();
  if (!fs.supported) return null;
  return (
    <button
      type="button"
      className="nav__icon"
      aria-label={fs.active ? 'Exit fullscreen' : 'Fullscreen'}
      title={fs.active ? 'Exit fullscreen' : 'Fullscreen'}
      onClick={() => void fs.toggle()}
    >
      <Icon name={fs.active ? 'exitFullscreen' : 'fullscreen'} />
    </button>
  );
}

/** Bottom tab bar for phone-sized screens. */
export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Sections">
      {NAV.map((n) => (
        <Link key={n.to} to={n.to} matches={n.matches} className="tabbar__item">
          <Icon name={n.icon} size={20} />
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}
