import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  stream: MediaStream | null;
  mirrored?: boolean;
  /** Overlays (landmarks, calibration handles) positioned over the video. */
  children?: ReactNode;
  className?: string;
  onVideo?: (video: HTMLVideoElement | null) => void;
  label?: string;
}

/** Live video for a MediaStream. Overlays share the video's box and mirroring. */
export function CameraPreview({ stream, mirrored = false, children, className, onVideo, label = 'Phone camera preview' }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) void v.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    onVideo?.(ref.current);
    return () => onVideo?.(null);
  }, [onVideo]);

  return (
    <div className={['camview', mirrored ? 'camview--mirrored' : '', className].filter(Boolean).join(' ')}>
      <video ref={ref} className="camview__video" autoPlay muted playsInline aria-label={label} data-testid="camera-video" />
      <div className="camview__overlay">{children}</div>
      {!stream && <div className="camview__empty">No video</div>}
    </div>
  );
}
