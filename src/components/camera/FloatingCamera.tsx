import { FloatingWindow } from '@/components/spatial/FloatingWindow';
import { CameraPreview } from './CameraPreview';
import { LandmarkOverlay } from './LandmarkOverlay';
import { useLinkStore } from '@/stores/linkStore';
import { useSettings } from '@/stores/settingsStore';

/**
 * The phone camera as a spatial window (Air Mode). It rests in a dock slot
 * the layout reserves for it (editor on desktop/tablet, Air panel on phones),
 * and can be dragged out to float in any corner.
 */
export function FloatingCamera() {
  const stream = useLinkStore((s) => s.stream);
  const stats = useLinkStore((s) => s.stats);
  const mirrored = useSettings((s) => s.air.mirrored);
  const update = useSettings((s) => s.update);
  return (
    <FloatingWindow
      title="Camera"
      icon={<span className="fwin__live" aria-hidden="true" />}
      meta={stats.width ? `${stats.width}×${stats.height} · ${stats.fps?.toFixed(0) ?? '—'} fps` : undefined}
      storageKey="null-tech:camera-window"
      defaultCorner="tr"
      dock="[data-camera-dock]"
      onClose={() => update('air', { showPreview: false })}
      testId="floating-camera"
    >
      <CameraPreview stream={stream} mirrored={mirrored}>
        <LandmarkOverlay />
      </CameraPreview>
    </FloatingWindow>
  );
}
