import { useRef } from 'react';
import { motion } from 'motion/react';
import { spring } from '@/design/motion';
import { Link, navigate, useRoute } from '@/app/Router';
import { switchInputMode } from '@/app/actions';
import { Logo } from '@/components/common/Logo';
import { Icon, type IconName } from '@/components/common/Icon';
import { DynamicIsland } from '@/components/island/DynamicIsland';
import { useAppStore } from '@/stores/appStore';
import { useTrackingStore } from '@/stores/trackingStore';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useSpecular } from '@/hooks/useSpecular';

export const NAV: Array<{ to: string; label: string; icon: IconName; matches?: string[] }> = [
  { to: '/workspace', label: 'Workspace', icon: 'keyboard', matches: ['/touch', '/air'] },
  { to: '/connect', label: 'Connect', icon: 'phone' },
  { to: '/calibrate', label: 'Calibrate', icon: 'target' },
  { to: '/performance', label: 'Performance', icon: 'activity' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/about', label: 'About', icon: 'info' },
];

/** Floating Liquid Glass navigation: brand, sections, Dynamic Island, mode, window controls. */
export function TopBar() {
  const { path } = useRoute();
  const ref = useRef<HTMLElement>(null);
  useSpecular(ref);
  const tracking = useTrackingStore((s) => s.status === 'running' && s.hands.length > 0);
  const isActive = (n: (typeof NAV)[number]) => path === n.to || (n.matches?.includes(path) ?? false);

  return (
    <header ref={ref} className="nav reflect">
      <a href="#/" className="nav__brand" aria-label="NULL-TECH home">
        <Logo state={tracking ? 'active' : 'idle'} />
      </a>

      <nav className="nav__links" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} matches={n.matches} className="nav__link">
            {isActive(n) && <motion.span className="nav__indicator" layoutId="nav-indicator" transition={spring.snappy} aria-hidden="true" />}
            <span className="nav__link-label">{n.label}</span>
          </Link>
        ))}
      </nav>

      <div className="nav__status">
        <DynamicIsland />
        <ModeIndicator />
        <FullscreenButton />
        <button type="button" className="nav__icon" aria-label="Settings" title="Settings" onClick={() => navigate('/settings')}>
          <Icon name="settings" />
        </button>
      </div>
    </header>
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
          {mode === m && <motion.span className="modepick__thumb" layoutId="modepick-thumb" transition={spring.snappy} aria-hidden="true" />}
          <Icon name={m === 'touch' ? 'hand' : 'camera'} size={15} />
          <span>{m === 'touch' ? 'Touch' : 'Air'}</span>
        </button>
      ))}
      <span className="visually-hidden">{mode === 'air' ? 'AIR' : 'TOUCH'}</span>
    </div>
  );
}

function FullscreenButton() {
  const fs = useFullscreen();
  if (!fs.supported) return null;
  return (
    <button
      type="button"
      className="nav__icon nav__icon--fs"
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
  const { path } = useRoute();
  return (
    <nav className="tabbar" aria-label="Sections">
      {NAV.map((n) => {
        const active = path === n.to || (n.matches?.includes(path) ?? false);
        return (
          <Link key={n.to} to={n.to} matches={n.matches} className="tabbar__item">
            {active && <motion.span className="tabbar__thumb" layoutId="tabbar-thumb" transition={spring.snappy} aria-hidden="true" />}
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
