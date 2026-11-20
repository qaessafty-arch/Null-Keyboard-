import { useMemo } from 'react';
import { encode } from 'uqr';

/** QR code rendered locally as SVG (no network service). */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { path, n } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, n: qr.size };
  }, [value]);

  return (
    <svg
      className="qr"
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      data-testid="pairing-qr"
      data-value={value}
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#080a12" />
    </svg>
  );
}
