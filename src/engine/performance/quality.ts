import type { QualityMode } from '@/stores/settingsStore';

/** What each quality mode actually changes. Used by renderers and (Stage 4) the tracker. */
export interface QualityProfile {
  webgl: boolean;
  /** Max device pixel ratio for WebGL canvases. */
  maxDpr: number;
  /** Max press ripples drawn at once. */
  ripples: number;
  /** Hero scene detail. */
  heroDetail: 'full' | 'reduced' | 'off';
  /** CSS glow multiplier. */
  glow: number;
  /** Suggested camera height for tracking (Stage 4). */
  cameraHeight: number;
  /** Process every Nth camera frame (Stage 4). */
  frameStride: number;
}

export const QUALITY_PROFILES: Record<QualityMode, QualityProfile> = {
  high: { webgl: true, maxDpr: 2, ripples: 8, heroDetail: 'full', glow: 1, cameraHeight: 1080, frameStride: 1 },
  balanced: { webgl: true, maxDpr: 1.25, ripples: 6, heroDetail: 'reduced', glow: 0.8, cameraHeight: 720, frameStride: 1 },
  low: { webgl: false, maxDpr: 1, ripples: 0, heroDetail: 'off', glow: 0.5, cameraHeight: 480, frameStride: 2 },
};
