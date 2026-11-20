import { useId, useMemo } from 'react';
import { CORE, FP_VIEWBOX, NULL_SLASH, fingerprintRidges } from './fingerprint';
import './fingerprint.css';

export type FingerprintState = 'idle' | 'scanning' | 'active' | 'success';

interface Props {
  size?: number;
  state?: FingerprintState;
  /** Accessible name. Omit for decorative use. */
  title?: string;
  className?: string;
}

/**
 * The NULL-TECH fingerprint mark.
 *  idle      static mark
 *  scanning  a scan band sweeps the ridges (loading, searching for hands)
 *  active    the core breathes (tracking live)
 *  success   ridges resolve to brand green (calibrated / paired)
 */
export function FingerprintMark({ size = 28, state = 'idle', title, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ridges = useMemo(fingerprintRidges, []);
  const { x1, y1, x2, y2, width } = NULL_SLASH;
  const maskId = `fp-null-${uid}`;
  const scanId = `fp-scan-${uid}`;
  const gradId = `fp-grad-${uid}`;

  const ridgePaths = ridges.map((p, i) => <path key={i} d={p.d} style={{ opacity: 0.55 + 0.45 * (1 - p.index / 7) }} />);

  return (
    <svg
      className={['fp', `fp--${state}`, className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={`0 0 ${FP_VIEWBOX} ${FP_VIEWBOX}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-state={state}
    >
      {title && <title>{title}</title>}
      <defs>
        <mask id={maskId}>
          <rect width="48" height="48" fill="#fff" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={width} strokeLinecap="round" />
        </mask>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={scanId}>
          <rect className="fp__band" x="0" y="-14" width="48" height="14" fill={`url(#${gradId})`} />
        </mask>
      </defs>
      <g className="fp__ridges" mask={`url(#${maskId})`}>
        {ridgePaths}
      </g>
      {state === 'scanning' && (
        <g mask={`url(#${scanId})`}>
          <g className="fp__ridges fp__ridges--lit" mask={`url(#${maskId})`}>
            {ridgePaths}
          </g>
        </g>
      )}
      <circle className="fp__core" cx={CORE.cx} cy={CORE.cy} r={CORE.r} />
    </svg>
  );
}
