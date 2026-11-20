import { RollingStat } from './RollingStat';

/**
 * Process-wide performance measurements. Every number shown in the UI comes
 * from here and is measured, never estimated or hardcoded. Metrics that have
 * no producer yet (e.g. hand detection before Stage 4) report `null` and the
 * UI shows "—".
 */

export interface FrameStats {
  /** Frames per second over the last window, or null before the first window. */
  fps: number | null;
  /** Mean frame interval (ms). */
  frameMs: number | null;
  /** Longest frame interval in the window (ms). */
  worstFrameMs: number | null;
}

type FrameListener = (s: FrameStats) => void;

const WINDOW_MS = 500;

class FrameMeter {
  private listeners = new Set<FrameListener>();
  private raf = 0;
  private windowStart = 0;
  private frames = 0;
  private last = 0;
  private worst = 0;
  private stats: FrameStats = { fps: null, frameMs: null, worstFrameMs: null };
  readonly intervals = new RollingStat(240);

  /** Starts the rAF loop while at least one subscriber exists. */
  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    listener(this.stats);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  get current(): FrameStats {
    return this.stats;
  }

  private start() {
    this.windowStart = this.last = performance.now();
    this.frames = 0;
    this.worst = 0;
    const tick = (now: number) => {
      const dt = now - this.last;
      this.last = now;
      // Ignore gaps from backgrounded tabs so they don't pollute the stats.
      if (dt < 1000) {
        this.frames++;
        this.worst = Math.max(this.worst, dt);
        this.intervals.record(dt);
      } else {
        this.windowStart = now;
        this.frames = 0;
      }
      const elapsed = now - this.windowStart;
      if (elapsed >= WINDOW_MS && this.frames > 0) {
        this.stats = {
          fps: (this.frames * 1000) / elapsed,
          frameMs: elapsed / this.frames,
          worstFrameMs: this.worst,
        };
        this.windowStart = now;
        this.frames = 0;
        this.worst = 0;
        for (const l of this.listeners) l(this.stats);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.stats = { fps: null, frameMs: null, worstFrameMs: null };
  }
}

export const frameMeter = new FrameMeter();

/** Time from a pointer event's timestamp to the start of the next animation frame. */
export const inputLatency = new RollingStat(120);

/** Air Mode: camera frame submitted → key event emitted (ms). */
export const airLatency = new RollingStat(120);

/** CPU time spent inside `renderer.render()` for the WebGL laser surface. */
export const webglRenderCost = new RollingStat(240);

/** Long tasks (>50 ms main-thread blocks), where the browser exposes them. */
export const longTasks = {
  supported: false,
  count: 0,
  lastDuration: 0,
  lastAt: 0,
};

let longTaskObserverStarted = false;

export function startLongTaskObserver(): void {
  if (longTaskObserverStarted) return;
  longTaskObserverStarted = true;
  try {
    if (!('PerformanceObserver' in window)) return;
    const supported = PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false;
    longTasks.supported = supported;
    if (!supported) return;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.count++;
        longTasks.lastDuration = entry.duration;
        longTasks.lastAt = entry.startTime;
      }
    });
    obs.observe({ type: 'longtask', buffered: false });
  } catch {
    longTasks.supported = false;
  }
}

/** Record latency from an input timestamp to the next frame. */
export function probeInputLatency(inputTimestamp: number): void {
  requestAnimationFrame((frameStart) => {
    inputLatency.record(frameStart - inputTimestamp);
  });
}
