import { useLinkStore } from '@/stores/linkStore';
import { Link, navigate } from '@/app/Router';
import { Logo } from '@/components/common/Logo';
import { IconButton, StatusDot } from '@/components/common/Controls';
import { useAppStore } from '@/stores/appStore';
import { useSettings } from '@/stores/settingsStore';
import { useFullscreen } from '@/hooks/useFullscreen';
import { THEME_NAMES } from '@/styles/themes';
import { CAMERA_LINK_LABEL, CAMERA_LINK_TONE } from './status';

const NAV: Array<{ to: string; label: string; matches?: string[] }> = [
  { to: '/workspace', label: 'Workspace', matches: ['/touch', '/air'] },
  { to: '/connect', label: 'Connect' },
  { to: '/calibrate', label: 'Calibrate' },
  { to: '/performance', label: 'Performance' },
  { to: '/settings', label: 'Settings' },
  { to: '/about', label: 'About' },
];

export function TopBar() {
  const mode = useAppStore((s) => s.mode);
  const cameraLink = useLinkStore((s) => s.state);
  const live = useLinkStore((s) => s.state === 'connected' && s.stream !== null);
  const theme = useSettings((s) => s.general.theme);
  const update = useSettings((s) => s.update);
  const fullscreen = useFullscreen();
  const nextTheme = theme === 'laser' ? 'holo' : 'laser';

  return (
    <header className="topbar">
      <a href="#/" className="topbar__brand" aria-label="NEO TYPE home">
        <Logo />
      </a>

      <nav className="topbar__nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} matches={n.matches} className="topbar__link">
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="topbar__status">
        <button
          type="button"
          className="pill"
          onClick={() => navigate('/connect')}
          title="Phone camera link"
          data-testid="camera-link-pill"
        >
          <StatusDot tone={CAMERA_LINK_TONE[cameraLink]} pulse={cameraLink === 'connecting'} />
          <span className="pill__label">{CAMERA_LINK_LABEL[cameraLink]}</span>
          {live && (
            <span className="live-badge" data-testid="camera-live" title="The phone camera is streaming to this Surface">
              ● CAM
            </span>
          )}
        </button>
        <span className="pill pill--mode" data-testid="active-mode">
          <span className="eyebrow">Mode</span>
          <strong>{mode === 'air' ? 'AIR' : 'TOUCH'}</strong>
        </span>
        <button
          type="button"
          className="pill pill--theme"
          onClick={() => update('general', { theme: nextTheme })}
          aria-label={`Theme: ${THEME_NAMES[theme]}. Switch to ${THEME_NAMES[nextTheme]}`}
          title={`Switch to ${THEME_NAMES[nextTheme]} theme`}
        >
          <span className={`swatch swatch--${theme}`} aria-hidden="true" />
          <span className="pill__label">{THEME_NAMES[theme]}</span>
        </button>
        {fullscreen.supported && (
          <IconButton
            icon={fullscreen.active ? 'exitFullscreen' : 'fullscreen'}
            label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={() => void fullscreen.toggle()}
          />
        )}
        <IconButton icon="settings" label="Settings" onClick={() => navigate('/settings')} />
      </div>
    </header>
  );
}
