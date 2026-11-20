import { create } from 'zustand';
import type { Point2 } from '@/engine/coordinates/homography';
import type { FingerName } from '@/features/hand-tracking/types';
import { idbDelete, idbGet, idbSet } from '@/utils/idb';

export type Vec3 = [number, number, number];

/**
 * What calibration learned. Stored in IndexedDB on this device only.
 *
 *  corners  – where the invisible keyboard is in the camera image (TL,TR,BR,BL;
 *             video-normalized). Required for any air typing.
 *  neutral  – each finger's resting pose (hand-relative feature).
 *  press    – the direction a fingertip moves (hand-relative, incl. depth) when
 *             you press, how far, and how that compares to resting jitter.
 *             Required for motion presses; without it Air Mode uses dwell.
 */
export interface CalibrationProfile {
  version: 1;
  createdAt: number;
  corners: Point2[];
  videoAspect: number;
  neutral: Partial<Record<FingerName, Vec3>> | null;
  /** Resting jitter (std of feature length) per finger. */
  noise: Partial<Record<FingerName, number>> | null;
  press: {
    direction: Vec3;
    /** Median press depth along `direction`. */
    magnitude: number;
    /** Projected resting noise along `direction`. */
    noise: number;
    samples: number;
    /** magnitude / noise — above ~4 presses are easy to tell from jitter. */
    separation: number;
    /** Fraction of calibration presses that landed on the requested key. */
    accuracy: number | null;
  } | null;
}

const KEY = 'calibration-profile';

interface CalibrationState {
  loaded: boolean;
  profile: CalibrationProfile | null;
  load: () => Promise<void>;
  save: (p: CalibrationProfile) => Promise<void>;
  clear: () => Promise<void>;
}

export const useCalibration = create<CalibrationState>((set) => ({
  loaded: false,
  profile: null,
  load: async () => {
    const p = await idbGet<CalibrationProfile>(KEY);
    set({ loaded: true, profile: p && p.version === 1 && Array.isArray(p.corners) && p.corners.length === 4 ? p : null });
  },
  save: async (p) => {
    set({ profile: p });
    await idbSet(KEY, p);
  },
  clear: async () => {
    set({ profile: null });
    await idbDelete(KEY);
  },
}));

/** 'none' → no air typing; 'workspace' → dwell presses; 'full' → motion presses. */
export function calibrationLevel(p: CalibrationProfile | null): 'none' | 'workspace' | 'full' {
  if (!p) return 'none';
  return p.press ? 'full' : 'workspace';
}
