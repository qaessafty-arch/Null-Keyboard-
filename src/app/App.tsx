import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { pageVariants } from '@/design/motion';
import { useRoute } from './Router';
import { TabBar, TopBar } from '@/components/dashboard/TopBar';
import { StatusBar } from '@/components/dashboard/StatusBar';
import { Toasts } from '@/components/common/Toasts';
import { HomePage } from '@/pages/HomePage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { ConnectPage } from '@/pages/ConnectPage';
import { CalibrationPage } from '@/pages/CalibrationPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PerformancePage } from '@/pages/PerformancePage';
import { AboutPage } from '@/pages/AboutPage';
import { PhoneCameraPage } from '@/pages/PhoneCameraPage';
import { connectKeyboardConsumers } from '@/engine/input/keyboard';
import { startLongTaskObserver } from '@/engine/performance/metrics';
import { startAutoQuality } from '@/engine/performance/autoQuality';
import { startHistory } from '@/engine/performance/history';
import { startDraftAutosave } from '@/features/text-output/draft';
import { useSettings } from '@/stores/settingsStore';
import { useResolvedAppearance } from '@/hooks/useAppearance';
import { useAirStore } from '@/features/air-mode/airStore';
import { hostLink } from '@/communication/camera-connection/HostLink';
import { useCalibration } from '@/engine/calibration/profile';

/** Workspace routes share one key so switching Touch ⇄ Air never remounts the keyboard. */
function routeKey(path: string): string {
  return path === '/touch' || path === '/air' || path === '/workspace' ? 'workspace' : path;
}

function renderRoute(path: string): ReactNode {
  switch (path) {
    case '/':
      return <HomePage />;
    case '/workspace':
      return <WorkspacePage />;
    case '/touch':
      return <WorkspacePage forceMode="touch" />;
    case '/air':
      return <WorkspacePage forceMode="air" />;
    case '/connect':
      return <ConnectPage />;
    case '/calibrate':
      return <CalibrationPage />;
    case '/settings':
      return <SettingsPage />;
    case '/performance':
      return <PerformancePage />;
    case '/about':
      return <AboutPage />;
    default:
      return (
        <div className="page">
          <h1>Not found</h1>
          <p className="muted">
            No screen at <code>{path}</code>. <a href="#/">Go home</a>
          </p>
        </div>
      );
  }
}

export function App() {
  const { path } = useRoute();
  const theme = useSettings((s) => s.general.theme);
  const quality = useSettings((s) => s.performance.quality);
  useResolvedAppearance();
  // Context-aware chrome: while air typing is live, navigation recedes.
  const typing = useAirStore((s) => s.active);

  useEffect(() => connectKeyboardConsumers(), []);
  useEffect(() => startLongTaskObserver(), []);
  useEffect(() => (path === '/camera' ? undefined : startHistory()), [path === '/camera']); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => (path === '/camera' ? undefined : startAutoQuality()), [path === '/camera']); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (path !== '/camera') {
      hostLink.resumeIfSaved();
      void useCalibration.getState().load();
      return startDraftAutosave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.quality = quality;
  }, [theme, quality]);

  // The phone opens a bare camera page — no desktop shell.
  if (path === '/camera') {
    return (
      <MotionConfig reducedMotion="user">
        <PhoneCameraPage />
        <Toasts />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className={`app${path === '/' ? ' app--home' : ''}`} data-focus={typing ? 'typing' : undefined}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="app__main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={routeKey(path)}
            className="route"
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            {renderRoute(path)}
          </motion.div>
        </AnimatePresence>
      </main>
      <StatusBar />
      <TabBar />
      <Toasts />
    </div>
    </MotionConfig>
  );
}
