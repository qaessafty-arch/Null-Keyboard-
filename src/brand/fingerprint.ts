/**
 * NULL-TECH fingerprint mark — geometry.
 *
 * Eight elliptical ridges around a slightly rising core, opening toward the
 * bottom like a real loop print. Each ridge is broken once at a
 * deterministic angle (organic, not random per render). A diagonal "null"
 * slash (∅) cuts through every ridge — the NULL-TECH signature. The core is
 * a single point in the brand colour.
 *
 * Pure function so the React component, favicon, PWA icons and the boot
 * splash all render the identical mark.
 */

export const FP_VIEWBOX = 48;
const CX = 24;
const CY = 27.5;

interface Ridge {
  d: string;
  /** 0 = innermost */
  index: number;
}

// Per-ridge: [radius, bottom opening°, break angle°, break size°].
// The opening widens outward like a loop print; 90° is straight down.
const RIDGES: Array<[number, number, number, number]> = [
  [2.4, 0, 0, 0],
  [5.2, 34, -40, 0],
  [8.0, 52, 30, 20],
  [10.8, 66, -120, 16],
  [13.6, 80, 200, 14],
  [16.4, 94, -20, 12],
  [19.2, 108, 150, 10],
];

function point(r: number, deg: number, i: number) {
  const a = (deg * Math.PI) / 180;
  // Ridges rise slightly toward the top (loop pattern) and are a touch taller than wide.
  const cy = CY - i * 0.35;
  return [CX + r * Math.cos(a), cy + r * 1.12 * Math.sin(a)] as const;
}

function arc(r: number, from: number, to: number, i: number): string {
  const steps = Math.max(8, Math.round(Math.abs(to - from) / 6));
  let d = '';
  for (let s = 0; s <= steps; s++) {
    const [x, y] = point(r, from + ((to - from) * s) / steps, i);
    d += `${s === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

export function fingerprintRidges(): Ridge[] {
  return RIDGES.flatMap(([r, opening, brk, gap], index) => {
    // Sweep clockwise from just past the bottom opening all the way round.
    const a0 = 90 + opening / 2;
    const a1 = 450 - opening / 2;
    const b = brk < a0 ? brk + 360 : brk;
    if (opening === 0) return [{ d: arc(r, 0, 359.9, index), index }];
    if (gap <= 0) return [{ d: arc(r, a0, a1, index), index }];
    const b0 = b - gap / 2;
    const b1 = b + gap / 2;
    const parts: Ridge[] = [];
    if (b0 > a0) parts.push({ d: arc(r, a0, Math.min(b0, a1), index), index });
    if (b1 < a1) parts.push({ d: arc(r, Math.max(b1, a0), a1, index), index });
    return parts;
  });
}

/** The ∅ slash: a band from bottom-left to top-right through the core. */
export const NULL_SLASH = { x1: 9, y1: 43, x2: 41, y2: 7, width: 3.2 };
export const CORE = { cx: CX, cy: CY, r: 1.5 };

/** Standalone SVG markup (favicon, icons, splash). */
export function fingerprintSvg({
  size = 48,
  ridge = '#F5F6FA',
  core = '#32E6A0',
  background,
  padding = 0,
}: { size?: number; ridge?: string; core?: string; background?: string; padding?: number } = {}): string {
  const vb = FP_VIEWBOX + padding * 2;
  const paths = fingerprintRidges()
    .map((p) => `<path d="${p.d}" opacity="${(0.55 + 0.45 * (1 - p.index / 7)).toFixed(2)}"/>`)
    .join('');
  const { x1, y1, x2, y2, width } = NULL_SLASH;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-padding} ${-padding} ${vb} ${vb}">${
    background ? `<rect x="${-padding}" y="${-padding}" width="${vb}" height="${vb}" rx="${vb * 0.22}" fill="${background}"/>` : ''
  }<defs><mask id="n"><rect x="0" y="0" width="48" height="48" fill="#fff"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${width}" stroke-linecap="round"/></mask></defs><g fill="none" stroke="${ridge}" stroke-width="1.7" stroke-linecap="round" mask="url(#n)">${paths}</g><circle cx="${CORE.cx}" cy="${CORE.cy}" r="${CORE.r}" fill="${core}"/></svg>`;
}
