import { Icon } from '@/components/common/Icon';

/**
 * Side-view diagram of the recommended phone placement, with the numbers
 * that matter. Pure SVG, scales cleanly, colours from tokens.
 */
export function PlacementDiagram() {
  return (
    <figure className="placement">
      <svg viewBox="0 0 320 170" role="img" aria-label="Phone 35 to 50 centimetres above the desk, tilted about 25 degrees toward the hands">
        <defs>
          <linearGradient id="pl-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* desk */}
        <line x1="12" y1="148" x2="308" y2="148" stroke="var(--border-strong)" strokeWidth="1.5" />
        <rect x="60" y="141" width="150" height="7" rx="2" fill="rgb(255 255 255 / 0.05)" />
        {/* hands */}
        <path d="M78 141c4-10 16-14 30-13l26 3c6 1 6 7 0 8l-56 2Z" fill="var(--surface-3)" stroke="var(--text-3)" strokeWidth="1" />
        <path d="M140 141c4-10 16-14 30-13l26 3c6 1 6 7 0 8l-56 2Z" fill="var(--surface-3)" stroke="var(--text-3)" strokeWidth="1" />
        {/* stand + phone */}
        <line x1="262" y1="148" x2="262" y2="44" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" />
        <g transform="rotate(-25 248 40)">
          <rect x="226" y="34" width="46" height="10" rx="3" fill="var(--surface-2)" stroke="var(--text-2)" strokeWidth="1.2" />
          <circle cx="236" cy="44" r="1.8" fill="var(--brand)" />
        </g>
        {/* view cone */}
        <path d="M234 48 L60 140 L210 140 Z" fill="url(#pl-cone)" />
        <line x1="234" y1="48" x2="60" y2="140" stroke="var(--brand)" strokeOpacity="0.5" strokeDasharray="3 4" />
        <line x1="234" y1="48" x2="210" y2="140" stroke="var(--brand)" strokeOpacity="0.5" strokeDasharray="3 4" />
        {/* height dimension */}
        <line x1="292" y1="44" x2="292" y2="148" stroke="var(--text-3)" strokeWidth="1" />
        <path d="M288 48l4-4 4 4M288 144l4 4 4-4" fill="none" stroke="var(--text-3)" strokeWidth="1" />
        <text x="300" y="100" fill="var(--text-2)" fontSize="10" transform="rotate(90 300 100)" textAnchor="middle">
          35–50 cm
        </text>
        {/* angle */}
        <path d="M262 70 A26 26 0 0 0 244 62" fill="none" stroke="var(--text-2)" strokeWidth="1" />
        <text x="214" y="68" fill="var(--text-2)" fontSize="10">≈25°</text>
        {/* light */}
        <g transform="translate(24 22)" stroke="var(--text-2)" strokeWidth="1.2" fill="none" strokeLinecap="round">
          <circle cx="8" cy="8" r="5" />
          <path d="M8 -1v3M8 14v3M-1 8h3M14 8h3M1.6 1.6l2 2M12.4 12.4l2 2M1.6 14.4l2-2M12.4 3.6l2-2" />
        </g>
        <text x="48" y="34" fill="var(--text-2)" fontSize="10">Even, diffuse light</text>
      </svg>
      <figcaption className="placement__specs">
        <span>
          <Icon name="height" size={15} /> 35–50 cm above the desk
        </span>
        <span>
          <Icon name="angle" size={15} /> Tilted ≈25° toward you
        </span>
        <span>
          <Icon name="sun" size={15} /> Even light, no glare
        </span>
        <span>
          <Icon name="hand" size={15} /> Both hands in frame
        </span>
      </figcaption>
    </figure>
  );
}
