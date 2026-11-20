/** Hand-tracking data shared across the vision pipeline. */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** MediaPipe hand landmark indices. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

/** tip / dip / pip / mcp landmark indices per finger. */
export const FINGERS: Record<FingerName, { tip: number; dip: number; pip: number; mcp: number }> = {
  thumb: { tip: LM.THUMB_TIP, dip: LM.THUMB_IP, pip: LM.THUMB_MCP, mcp: LM.THUMB_CMC },
  index: { tip: LM.INDEX_TIP, dip: LM.INDEX_DIP, pip: LM.INDEX_PIP, mcp: LM.INDEX_MCP },
  middle: { tip: LM.MIDDLE_TIP, dip: LM.MIDDLE_DIP, pip: LM.MIDDLE_PIP, mcp: LM.MIDDLE_MCP },
  ring: { tip: LM.RING_TIP, dip: LM.RING_DIP, pip: LM.RING_PIP, mcp: LM.RING_MCP },
  pinky: { tip: LM.PINKY_TIP, dip: LM.PINKY_DIP, pip: LM.PINKY_PIP, mcp: LM.PINKY_MCP },
};

export const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** One raw detection as it leaves the detector. Landmarks: 21×(x,y,z) normalized image coords. */
export interface RawHand {
  landmarks: Float32Array;
  label: 'Left' | 'Right';
  score: number;
}

export interface RawResult {
  hands: RawHand[];
  /** Inference time inside the detector (ms). */
  detectMs: number;
  /** Timestamp passed to the detector (ms, performance.now timebase). */
  timestamp: number;
}

/** A tracked, smoothed hand with a stable id across frames. */
export interface TrackedHand {
  /** Stable while the hand stays tracked (e.g. "h3"). */
  id: string;
  /** The person's hand (corrected for camera mirroring). */
  label: 'Left' | 'Right';
  score: number;
  /** Smoothed landmarks, normalized image coordinates. */
  landmarks: Point3[];
  /** Unsmoothed landmarks of this frame. */
  raw: Point3[];
}

export interface TrackingFrame {
  timestamp: number;
  hands: TrackedHand[];
  /** Hand ids that were lost since the previous frame. */
  lost: string[];
  videoWidth: number;
  videoHeight: number;
}
