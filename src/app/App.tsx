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
import { connectKeyboardConsumers } from '@/engine/input/keyboard';
import { startLongTaskObserver } from '@/engine/performance/metrics';
import { useSettings } from '@/stores/settingsStore';

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.quality = quality;
  }, [theme, quality]);

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
