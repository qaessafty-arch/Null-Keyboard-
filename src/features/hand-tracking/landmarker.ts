import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { RawHand } from './types';

/**
 * Creates a MediaPipe Hand Landmarker. Shared by the Web Worker and the
 * main-thread fallback.
 *
 * Model: served locally from /models (see scripts/setup-assets.mjs). If it is
 * missing, falls back to Google's public model bucket (a plain file download —
 * no API key, nothing about the user is sent).
 */

export const REMOTE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

export interface LandmarkerConfig {
  /** Absolute URL of the folder containing vision_wasm_*.{js,wasm}. */
  wasmBase: string;
  /** Absolute URL of the local model. */
  modelUrl: string;
  /** Use the ES-module wasm build (required inside module workers). */
  useModule: boolean;
  delegate: 'GPU' | 'CPU';
  numHands: number;
  minDetection: number;
  minPresence: number;
  minTracking: number;
}

export interface LandmarkerHandle {
  landmarker: HandLandmarker;
  delegate: 'GPU' | 'CPU';
  modelSource: 'local' | 'remote';
}

async function loadModel(localUrl: string): Promise<{ bytes: Uint8Array; source: 'local' | 'remote' }> {
  try {
    const res = await fetch(localUrl);
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && !type.includes('text/html')) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > 1_000_000) return { bytes, source: 'local' };
    }
  } catch {
    /* fall through */
  }
  const res = await fetch(REMOTE_MODEL_URL);
  if (!res.ok) throw new Error(`Hand model unavailable (local missing, remote HTTP ${res.status})`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), source: 'remote' };
}

export async function createLandmarker(cfg: LandmarkerConfig): Promise<LandmarkerHandle> {
  const fileset = await FilesetResolver.forVisionTasks(cfg.wasmBase, cfg.useModule);
  const { bytes, source } = await loadModel(cfg.modelUrl);
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: bytes, delegate },
      runningMode: 'VIDEO',
      numHands: cfg.numHands,
      minHandDetectionConfidence: cfg.minDetection,
      minHandPresenceConfidence: cfg.minPresence,
      minTrackingConfidence: cfg.minTracking,
    });
  if (cfg.delegate === 'GPU') {
    try {
      return { landmarker: await make('GPU'), delegate: 'GPU', modelSource: source };
    } catch {
      // No usable WebGL2 here — CPU (XNNPACK/wasm) still works.
    }
  }
  return { landmarker: await make('CPU'), delegate: 'CPU', modelSource: source };
}

/** Flatten a MediaPipe result into transferable typed arrays. */
export function toRawHands(result: HandLandmarkerResult): RawHand[] {
  const hands: RawHand[] = [];
  const handedness = result.handedness ?? result.handednesses ?? [];
  result.landmarks.forEach((lms, i) => {
    const arr = new Float32Array(63);
    lms.forEach((p, j) => {
      arr[j * 3] = p.x;
      arr[j * 3 + 1] = p.y;
      arr[j * 3 + 2] = p.z;
    });
    const cat = handedness[i]?.[0];
    hands.push({
      landmarks: arr,
      label: cat?.categoryName === 'Left' ? 'Left' : 'Right',
      score: cat?.score ?? 0,
    });
  });
  return hands;
}
