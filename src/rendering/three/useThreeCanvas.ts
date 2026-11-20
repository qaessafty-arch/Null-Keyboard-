import { useEffect, useRef, useState, type RefObject } from 'react';
import { WebGLRenderer } from 'three';

export interface SceneHandle {
  /** Draw one frame. `time` in seconds since start. */
  render: (time: number, dt: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export interface SetupContext {
  renderer: WebGLRenderer;
  width: number;
  height: number;
}

export interface ThreeCanvasOptions {
  enabled: boolean;
  maxDpr: number;
  /** Render continuously (true) or only when `invalidate()` is called. */
  continuous?: boolean;
}

export type ThreeStatus = 'off' | 'running' | 'unsupported';

/**
 * Owns one WebGL renderer inside `container`. Pauses when the tab is hidden or
 * the canvas is off-screen, and disposes the renderer, its GL context and the
 * scene's resources on unmount or when disabled.
 */
export function useThreeCanvas(
  container: RefObject<HTMLElement | null>,
  setup: (ctx: SetupContext) => SceneHandle,
  { enabled, maxDpr, continuous = true }: ThreeCanvasOptions,
): ThreeStatus {
  const [status, setStatus] = useState<ThreeStatus>('off');
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    const host = container.current;
    if (!enabled || !host) {
      setStatus('off');
      return;
    }

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    } catch {
      setStatus('unsupported');
      return;
    }

    const canvas = renderer.domElement;
    canvas.className = 'gl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    renderer.setClearColor(0x000000, 0);

    const size = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
    let { w, h } = size();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(w, h, false);

    let scene: SceneHandle;
    try {
      scene = setupRef.current({ renderer, width: w, height: h });
    } catch (err) {
      console.error('[neo-type] WebGL scene setup failed', err);
      renderer.dispose();
      canvas.remove();
      setStatus('unsupported');
      return;
    }
    setStatus('running');

    let raf = 0;
    let visible = true;
    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      scene.render((now - start) / 1000, dt);
      if (continuous) schedule();
    };
    const schedule = () => {
      if (!raf && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => {
      ({ w, h } = size());
      renderer.setSize(w, h, false);
      scene.resize(w, h);
      schedule();
    });
    ro.observe(host);

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) schedule();
    });
    io.observe(host);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        last = performance.now();
        schedule();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onRestored = () => schedule();
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    schedule();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [container, enabled, maxDpr, continuous]);

  return status;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
