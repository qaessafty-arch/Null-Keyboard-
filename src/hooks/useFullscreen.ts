import { useCallback, useEffect, useState, type RefObject } from 'react';
import { notify } from '@/stores/noticeStore';

export function useFullscreen() {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      notify('Fullscreen was blocked by the browser', 'warning');
    }
  }, []);

  return { active, supported, toggle };
}

/** Fullscreen for a specific element (e.g. the camera preview). */
export function useFullscreenElement(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  useEffect(() => {
    const onChange = () => setActive(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await ref.current?.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      notify('Fullscreen was blocked by the browser', 'warning');
    }
  }, [ref]);
  return { active, supported, toggle };
}
