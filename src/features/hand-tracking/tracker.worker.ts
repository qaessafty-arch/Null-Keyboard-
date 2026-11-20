/// <reference lib="webworker" />
import { createLandmarker, toRawHands, type LandmarkerConfig } from './landmarker';
import type { HandLandmarker } from '@mediapipe/tasks-vision';

/**
 * Hand detection off the main thread. Receives ImageBitmaps (transferred,
 * zero-copy), runs MediaPipe, returns flat landmark arrays (transferred back).
 */

export type WorkerIn =
  | { type: 'init'; config: LandmarkerConfig }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number }
  | { type: 'options'; minDetection: number; minPresence: number; minTracking: number }
  | { type: 'close' };

export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU'; modelSource: 'local' | 'remote' }
  | { type: 'result'; timestamp: number; detectMs: number; hands: Array<{ landmarks: Float32Array; label: 'Left' | 'Right'; score: number }> }
  | { type: 'error'; message: string; fatal: boolean };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// MediaPipe's wasm prints glog-style INFO/W lines through console.error
// ("INFO: Created TensorFlow Lite XNNPACK delegate…", "W1120 …"). They are
// informational; keep real errors as errors.
const rawError = console.error.bind(console);
const rawWarn = console.warn.bind(console);
const isGlogInfo = (a: unknown) => typeof a === 'string' && (/^INFO:/.test(a) || /^[IW]\d{4} /.test(a));
console.error = (...args: unknown[]) => (isGlogInfo(args[0]) ? console.debug(...args) : rawError(...args));
console.warn = (...args: unknown[]) => (isGlogInfo(args[0]) ? console.debug(...args) : rawWarn(...args));
let landmarker: HandLandmarker | null = null;
let lastTs = 0;

ctx.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      try {
        const handle = await createLandmarker(msg.config);
        landmarker = handle.landmarker;
        post({ type: 'ready', delegate: handle.delegate, modelSource: handle.modelSource });
      } catch (err) {
        post({ type: 'error', message: (err as Error).message ?? String(err), fatal: true });
      }
      return;
    case 'frame': {
      const { bitmap } = msg;
      if (!landmarker) {
        bitmap.close();
        return;
      }
      // MediaPipe requires strictly increasing timestamps.
      const ts = Math.max(msg.timestamp, lastTs + 1);
      lastTs = ts;
      try {
        const t0 = performance.now();
        const result = landmarker.detectForVideo(bitmap, ts);
        const detectMs = performance.now() - t0;
        const hands = toRawHands(result);
        post({ type: 'result', timestamp: msg.timestamp, detectMs, hands }, hands.map((h) => h.landmarks.buffer as ArrayBuffer));
      } catch (err) {
        post({ type: 'error', message: (err as Error).message ?? String(err), fatal: false });
        post({ type: 'result', timestamp: msg.timestamp, detectMs: 0, hands: [] });
      } finally {
        bitmap.close();
      }
      return;
    }
    case 'options':
      await landmarker?.setOptions({
        minHandDetectionConfidence: msg.minDetection,
        minHandPresenceConfidence: msg.minPresence,
        minTrackingConfidence: msg.minTracking,
      });
      return;
    case 'close':
      landmarker?.close();
      landmarker = null;
      ctx.close();
      return;
  }
};

function post(msg: WorkerOut, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}
