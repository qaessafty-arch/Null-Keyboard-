import { lazy, Suspense } from 'react';
import { HeroFallback } from '@/rendering/three/HeroFallback';
import { navigate } from '@/app/Router';
import { Icon } from '@/components/common/Icon';
import { useAppStore } from '@/stores/appStore';
import { useSettings } from '@/stores/settingsStore';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { useCalibration } from '@/engine/calibration/profile';
import { FingerprintMark } from '@/brand/FingerprintMark';

const HeroScene = lazy(() => import('@/rendering/three/HeroScene').then((m) => ({ default: m.HeroScene })));

function StaticHero() {
  return (
    <div className="hero-scene" data-gl="off" aria-hidden="true">
      <HeroFallback />
    </div>
  );
}

export function HomePage() {
  const setMode = useAppStore((s) => s.setMode);
  const heroDetail = useSettings((s) => QUALITY_PROFILES[s.performance.quality].heroDetail);
  const airReady = useCalibration((s) => s.profile !== null);
  const go = (mode: 'touch' | 'air') => {
    setMode(mode);
    navigate(`/${mode}`);
  };

  return (
    <div className="home">
      {heroDetail === 'off' ? (
        <StaticHero />
      ) : (
        <Suspense fallback={<StaticHero />}>
          <HeroScene />
        </Suspense>
      )}
      <div className="home__content">
        <p className="eyebrow home__eyebrow">
          <FingerprintMark size={16} /> NULL-TECH · Beyond the interface
        </p>
        <h1 className="home__title">
          Type on <span className="home__title-accent">light</span>.
        </h1>
        <p className="home__lead">
          A laser keyboard with two ways in: touch the screen, or type in the air above your desk while your phone’s camera
          reads your hands. One precise engine underneath.
        </p>

        <div className="home__modes">
          <button type="button" className="mode-card" onClick={() => go('touch')} data-testid="start-touch">
            <span className="mode-card__icon">
              <Icon name="hand" size={22} />
            </span>
            <span className="mode-card__body">
              <span className="mode-card__title">Touch Mode</span>
              <span className="mode-card__desc">Finger, Surface Pen, mouse or trackpad on the screen.</span>
            </span>
            <span className="mode-card__state mode-card__state--ok">Ready</span>
            <Icon name="arrowRight" className="mode-card__arrow" />
          </button>

          <button type="button" className="mode-card" onClick={() => go('air')} data-testid="start-air">
            <span className="mode-card__icon">
              <Icon name="camera" size={22} />
            </span>
            <span className="mode-card__body">
              <span className="mode-card__title">Air Mode</span>
              <span className="mode-card__desc">A phone camera tracks your fingers over an invisible keyboard.</span>
            </span>
            <span className={`mode-card__state${airReady ? ' mode-card__state--ok' : ''}`}>{airReady ? 'Calibrated' : 'Needs phone'}</span>
            <Icon name="arrowRight" className="mode-card__arrow" />
          </button>
        </div>

        <ul className="home__facts">
          <li>On-device vision</li>
          <li>Local network only</li>
          <li>No accounts, no cloud</li>
        </ul>
      </div>
    </div>
  );
}
