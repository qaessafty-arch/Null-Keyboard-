import { create } from 'zustand';

export type TrackingStatus = 'off' | 'loading' | 'running' | 'error';

/**
 * Low-frequency summary of the hand tracker for the UI (updated ≤ 5×/s).
 * Per-frame landmarks go to canvas overlays directly, not through React.
 */
interface TrackingState {
  status: TrackingStatus;
  error: string | null;
  backend: 'worker' | 'main-thread' | null;
  delegate: 'GPU' | 'CPU' | null;
  modelSource: 'local' | 'remote' | null;
  hands: Array<{ id: string; label: 'Left' | 'Right'; score: number }>;
  /** Detection results per second (measured). */
  detectFps: number | null;
  /** Mean inference time (ms). */
  detectMs: number | null;
  /** Frame capture → result available (ms). */
  pipelineMs: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  /** True when a hand was tracked recently but none is visible now. */
  lost: boolean;
}

export const useTrackingStore = create<TrackingState>(() => ({
  status: 'off',
  error: null,
  backend: null,
  delegate: null,
  modelSource: null,
  hands: [],
  detectFps: null,
  detectMs: null,
  pipelineMs: null,
  videoWidth: null,
  videoHeight: null,
  lost: false,
}));
