import { useId } from 'react';

interface Props {
  values: ReadonlyArray<number | null>;
  /** Fixed max for the y axis; defaults to the data max (with headroom). */
  max?: number;
  min?: number;
  /** Horizontal guide lines (e.g. 16.7 ms). */
  guides?: number[];
  color?: string;
  height?: number;
  /** Number of slots on the x axis (fixed window, so the chart scrolls). */
  slots?: number;
  label: string;
}

/**
 * Minimal line chart drawn from real samples. Nulls become gaps — nothing is
 * interpolated or invented.
 */
export function Sparkline({ values, max, min = 0, guides = [], color = 'var(--brand)', height = 64, slots = 60, label }: Props) {
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const W = 300;
  const H = height;
  const data = values.slice(-slots);
  const nums = data.filter((v): v is number => v !== null);
  const hi = max ?? (nums.length ? Math.max(...nums, ...guides) * 1.15 || 1 : 1);
  const lo = min;
  const x = (i: number) => ((i + (slots - data.length)) / (slots - 1)) * W;
  const y = (v: number) => H - 2 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (H - 6);

  // Split into contiguous runs so nulls render as gaps.
  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  data.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push([x(i), y(v)]);
  });
  if (run.length) runs.push(run);

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} height={H}>
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {guides.map((g) => (
        <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} className="spark__guide" vectorEffect="non-scaling-stroke" />
      ))}
      {runs.map((r, i) =>
        r.length > 1 ? (
          <g key={i}>
            <path
              d={`M${r[0]![0]} ${H} ${r.map(([px, py]) => `L${px} ${py}`).join(' ')} L${r[r.length - 1]![0]} ${H} Z`}
              fill={`url(#sg-${gid})`}
            />
            <path
              d={r.map(([px, py], k) => `${k ? 'L' : 'M'}${px} ${py}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null,
      )}
    </svg>
  );
}
