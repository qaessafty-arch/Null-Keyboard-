import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { FingerprintMark } from '@/brand/FingerprintMark';
import { spring } from '@/design/motion';
import './spatial.css';

export type ViewState = 'idle' | 'loading' | 'connecting' | 'calibrating' | 'disconnected' | 'success';

interface Props {
  state: ViewState;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}

/**
 * Designed empty / transitional state. The fingerprint sits in a field of
 * rings whose motion encodes the state:
 *   loading      a single arc orbits
 *   connecting   rings radiate outward (signal)
 *   calibrating  a scan band sweeps the mark
 *   disconnected rings are still and dimmed, a break shows in the outer ring
 *   success      rings settle and turn brand green
 */
export function StateView({ state, title, body, action, compact = false }: Props) {
  const fp = state === 'success' ? 'success' : state === 'calibrating' || state === 'connecting' || state === 'loading' ? 'scanning' : 'idle';
  return (
    <motion.div
      className={`sview sview--${state}${compact ? ' sview--compact' : ''}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring.fluid}
      role="status"
      data-state={state}
    >
      <div className="sview__orb" aria-hidden="true">
        <span className="sview__ring sview__ring--1" />
        <span className="sview__ring sview__ring--2" />
        <span className="sview__ring sview__ring--3" />
        <svg className="sview__arc" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="56" />
        </svg>
        <FingerprintMark size={compact ? 40 : 56} state={fp} />
      </div>
      <div className="sview__text">
        <strong>{title}</strong>
        {body && <p>{body}</p>}
      </div>
      {action && <div className="sview__action">{action}</div>}
    </motion.div>
  );
}
