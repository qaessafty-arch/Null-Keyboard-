import { useRef, useState, type ReactNode } from 'react';
import { CameraPreview } from './CameraPreview';
import { LandmarkOverlay, type OverlayExtras } from './LandmarkOverlay';
import { FingerprintMark } from '@/brand/FingerprintMark';
import { Icon } from '@/components/common/Icon';
import { useFullscreenElement } from '@/hooks/useFullscreen';

export type StagePhase = 'idle' | 'waiting' | 'connecting' | 'live' | 'interrupted';

interface Props {
  stream: MediaStream | null;
  phase: StagePhase;
  /** Short caption for the non-live states. */
  caption?: string;
  /** Top-left meta while live, e.g. "1280×720 · 30 fps". */
  meta?: string;
  extras?: OverlayExtras;
  /** Footer slot (tracking summary). */
  footer?: ReactNode;
  /** Extra overlays inside the video box (calibration handles). */
  children?: ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
  onVideo?: (v: HTMLVideoElement | null) => void;
  mirrored?: boolean;
}

/**
 * Premium camera stage: live preview with landmark overlay, capture-style
 * controls (landmarks, expand, fullscreen) and quiet states for idle /
 * waiting / connecting that use the fingerprint mark.
 */
export function CameraStage({
  stream,
  phase,
  caption,
  meta,
  extras,
  footer,
  children,
  expandable = false,
  expanded = false,
  onExpandedChange,
  onVideo,
  mirrored = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [landmarks, setLandmarks] = useState(true);
  const fs = useFullscreenElement(host);
  const live = phase === 'live' && !!stream;

  return (
    <div ref={host} className={`stage stage--${phase}${fs.active ? ' stage--fullscreen' : ''}`} data-phase={phase}>
      <CameraPreview stream={live ? stream : null} mirrored={mirrored} className="stage__video" onVideo={onVideo}>
        <LandmarkOverlay extras={extras} visible={landmarks} />
        {children}
      </CameraPreview>

      {!live && (
        <div className="stage__state" aria-live="polite">
          <FingerprintMark size={64} state={phase === 'idle' ? 'idle' : 'scanning'} />
          {caption && <p>{caption}</p>}
        </div>
      )}

      {live && (
        <>
          <div className="stage__top">
            <span className="live-badge">LIVE</span>
            {meta && <span className="stage__meta mono">{meta}</span>}
          </div>
          <div className="stage__controls" role="toolbar" aria-label="Preview controls">
            <button
              type="button"
              className={`stage__btn${landmarks ? ' is-on' : ''}`}
              onClick={() => setLandmarks((v) => !v)}
              aria-pressed={landmarks}
              title={landmarks ? 'Hide landmarks' : 'Show landmarks'}
            >
              <Icon name={landmarks ? 'eye' : 'eyeOff'} size={16} />
            </button>
            {expandable && (
              <button
                type="button"
                className="stage__btn"
                onClick={() => onExpandedChange?.(!expanded)}
                aria-pressed={expanded}
                title={expanded ? 'Collapse preview' : 'Expand preview'}
              >
                <Icon name={expanded ? 'collapse' : 'expand'} size={16} />
              </button>
            )}
            {fs.supported && (
              <button type="button" className="stage__btn" onClick={() => void fs.toggle()} title={fs.active ? 'Exit fullscreen' : 'Fullscreen'}>
                <Icon name={fs.active ? 'exitFullscreen' : 'fullscreen'} size={16} />
              </button>
            )}
          </div>
        </>
      )}

      {live && footer && <div className="stage__footer">{footer}</div>}
    </div>
  );
}
