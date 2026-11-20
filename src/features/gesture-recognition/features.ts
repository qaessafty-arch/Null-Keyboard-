import { FINGERS, LM, type FingerName, type Point3 } from '@/features/hand-tracking/types';
import type { Vec3 } from '@/engine/calibration/profile';

/**
 * Hand-relative fingertip feature: tip minus its knuckle (MCP), in units of
 * the hand's own size, including MediaPipe's relative depth (z).
 *
 * Moving or rotating the whole hand barely changes it; bending one finger
 * down to press changes it a lot — in a direction that depends on the camera
 * angle, which calibration learns. Coordinates are made isotropic with the
 * video aspect ratio (x and z are width-normalized, y height-normalized).
 */
export function fingerFeature(lms: Point3[], finger: FingerName, aspect: number): Vec3 {
  const f = FINGERS[finger];
  const tip = lms[f.tip]!;
  const mcp = lms[f.mcp]!;
  const wrist = lms[LM.WRIST]!;
  const mid = lms[LM.MIDDLE_MCP]!;
  const scale = Math.hypot((mid.x - wrist.x) * aspect, mid.y - wrist.y) || 1e-3;
  return [((tip.x - mcp.x) * aspect) / scale, (tip.y - mcp.y) / scale, ((tip.z - mcp.z) * aspect) / scale];
}

/** Hand size in the image (wrist → middle knuckle), isotropic normalized units. */
export function handScale(lms: Point3[], aspect: number): number {
  const wrist = lms[LM.WRIST]!;
  const mid = lms[LM.MIDDLE_MCP]!;
  return Math.hypot((mid.x - wrist.x) * aspect, mid.y - wrist.y);
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n > 1e-9 ? scale3(a, 1 / n) : [0, 0, 0];
};

export function mean3(vs: Vec3[]): Vec3 {
  const s: Vec3 = [0, 0, 0];
  for (const v of vs) {
    s[0] += v[0];
    s[1] += v[1];
    s[2] += v[2];
  }
  return vs.length ? scale3(s, 1 / vs.length) : s;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
