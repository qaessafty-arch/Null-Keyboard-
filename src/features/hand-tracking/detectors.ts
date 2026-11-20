import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { LandmarkerConfig } from './landmarker';
import type { RawResult } from './types';
import type { WorkerIn, WorkerOut } from './tracker.worker';

/** A hand detector that takes one frame at a time. */
export interface Detector {
  readonly kind: 'worker' | 'main-thread';
  readonly delegate: 'GPU' | 'CPU';
  readonly modelSource: 'local' | 'remote';
  /** Resolves with the detection for this frame. The bitmap is consumed. */
  detect(bitmap: ImageBitmap, timestamp: number): Promise<RawResult>;
  setConfidence(minDetection: number, minPresence: number, minTracking: number): void;
  close(): void;
}

function absolute(path: string): string {
  return new URL(path, location.href).href;
}

export function landmarkerConfig(useModule: boolean, minConfidence: number, preferGpu = true): LandmarkerConfig {
  const base = import.meta.env.BASE_URL;
  return {
    wasmBase: absolute(`${base}mediapipe/wasm`),
    modelUrl: absolute(`${base}models/hand_landmarker.task`),
    useModule,
    delegate: preferGpu ? 'GPU' : 'CPU',
    numHands: 2,
    minDetection: minConfidence,
    minPresence: minConfidence,
    minTracking: 0.5,
  };
}

/** Detection in a module Web Worker (keeps inference off the UI thread). */
export async function createWorkerDetector(minConfidence: number, preferGpu = true): Promise<Detector> {
  const worker = new Worker(new URL('./tracker.worker.ts', import.meta.url), { type: 'module', name: 'neo-type-hands' });
  const pending = new Map<number, (r: RawResult) => void>();

  const ready = await new Promise<Extract<WorkerOut, { type: 'ready' }>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Hand tracker worker timed out while loading')), 60_000);
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message || 'Worker failed to start'));
    };
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'ready') {
        clearTimeout(timer);
        resolve(e.data);
      } else if (e.data.type === 'error' && e.data.fatal) {
        clearTimeout(timer);
        reject(new Error(e.data.message));
      }
    };
    worker.postMessage({ type: 'init', config: landmarkerConfig(true, minConfidence, preferGpu) } satisfies WorkerIn);
  }).catch((err) => {
    worker.terminate();
    throw err;
  });

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (m.type === 'result') {
      const cb = pending.get(m.timestamp);
      pending.delete(m.timestamp);
      cb?.({ hands: m.hands, detectMs: m.detectMs, timestamp: m.timestamp });
    } else if (m.type === 'error') {
      console.warn('[hand-tracker]', m.message);
    }
  };

  return {
    kind: 'worker',
    delegate: ready.delegate,
    modelSource: ready.modelSource,
    detect(bitmap, timestamp) {
      return new Promise<RawResult>((resolve) => {
        pending.set(timestamp, resolve);
        worker.postMessage({ type: 'frame', bitmap, timestamp } satisfies WorkerIn, [bitmap]);
      });
    },
    setConfidence(minDetection, minPresence, minTracking) {
      worker.postMessage({ type: 'options', minDetection, minPresence, minTracking } satisfies WorkerIn);
    },
    close() {
      worker.postMessage({ type: 'close' } satisfies WorkerIn);
      setTimeout(() => worker.terminate(), 500);
      for (const cb of pending.values()) cb({ hands: [], detectMs: 0, timestamp: 0 });
      pending.clear();
    },
  };
}

/** Fallback: detection on the main thread (browsers without module workers / OffscreenCanvas). */
export async function createMainThreadDetector(minConfidence: number, preferGpu = true): Promise<Detector> {
  const { createLandmarker, toRawHands } = await import('./landmarker');
  const handle = await createLandmarker(landmarkerConfig(false, minConfidence, preferGpu));
  const lm: HandLandmarker = handle.landmarker;
  let lastTs = 0;
  return {
    kind: 'main-thread',
    delegate: handle.delegate,
    modelSource: handle.modelSource,
    async detect(bitmap, timestamp) {
      const ts = Math.max(timestamp, lastTs + 1);
      lastTs = ts;
      try {
        const t0 = performance.now();
        const result = lm.detectForVideo(bitmap, ts);
        return { hands: toRawHands(result), detectMs: performance.now() - t0, timestamp };
      } finally {
        bitmap.close();
      }
    },
    setConfidence(minDetection, minPresence, minTracking) {
      void lm.setOptions({
        minHandDetectionConfidence: minDetection,
        minHandPresenceConfidence: minPresence,
        minTrackingConfidence: minTracking,
      });
    },
    close() {
      lm.close();
    },
  };
}
