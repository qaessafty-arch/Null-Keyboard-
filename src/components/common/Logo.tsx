import { FingerprintMark, type FingerprintState } from '@/brand/FingerprintMark';

/** NULL-TECH lockup: fingerprint mark + wordmark. */
export function Logo({ compact = false, state = 'idle' }: { compact?: boolean; state?: FingerprintState }) {
  return (
    <span className="logo">
      <FingerprintMark size={26} state={state} className="logo__mark" />
      {!compact && (
        <span className="logo__word">
          NULL<span className="logo__dash">-</span>TECH
        </span>
      )}
    </span>
  );
}
