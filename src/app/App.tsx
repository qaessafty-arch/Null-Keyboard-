import { useEffect, type ReactNode } from 'react';
import { useRoute } from './Router';
import { TopBar } from '@/components/dashboard/TopBar';
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
import { startDraftAutosave } from '@/features/text-output/draft';
import { useSettings } from '@/stores/settingsStore';
import { hostLink } from '@/communication/camera-connection/HostLink';
import { useCalibration } from '@/engine/calibration/profile';

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

  useEffect(() => connectKeyboardConsumers(), []);
  useEffect(() => startLongTaskObserver(), []);
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
      <>
        <PhoneCameraPage />
        <Toasts />
      </>
    );
  }

  return (
    <div className={`app${path === '/' ? ' app--home' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="app__main">
        {renderRoute(path)}
      </main>
      <StatusBar />
      <Toasts />
    </div>
  );
}
