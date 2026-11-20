import { useEffect, useState } from 'react';
import { useSettings } from '@/stores/settingsStore';

const query = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null);

/** Resolves Settings › Appearance (system / light / dark) and applies it to <html>. */
export function useResolvedAppearance(): 'light' | 'dark' {
  const pref = useSettings((s) => s.general.appearance);
  const [systemLight, setSystemLight] = useState(() => query()?.matches ?? false);

  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const on = () => setSystemLight(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved = pref === 'system' ? (systemLight ? 'light' : 'dark') : pref;

  useEffect(() => {
    document.documentElement.dataset.appearance = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#EFF0F4' : '#090B10');
  }, [resolved]);

  return resolved;
}
