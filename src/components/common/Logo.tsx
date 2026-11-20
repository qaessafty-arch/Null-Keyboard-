export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg className="logo__mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <defs>
          <linearGradient id="logo-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M16 4 L4 26 H28 Z" fill="url(#logo-beam)" opacity="0.35" />
        <rect x="6" y="18" width="20" height="9" rx="2" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        <path d="M9 22.5h2m2.5 0h5m2.5 0h2" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16" cy="4.5" r="2" fill="#fff" />
        <circle cx="16" cy="4.5" r="4" fill="var(--accent)" opacity="0.35" />
      </svg>
      {!compact && (
        <span className="logo__word">
          NEO<span className="logo__word-2">TYPE</span>
        </span>
      )}
    </span>
  );
}
