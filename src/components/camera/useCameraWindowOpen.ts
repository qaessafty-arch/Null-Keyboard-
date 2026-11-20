import { useAppStore } from '@/stores/appStore';
import { useLinkStore } from '@/stores/linkStore';
import { useSettings } from '@/stores/settingsStore';

/** True while the floating camera window is open, i.e. its dock slots should be reserved. */
export function useCameraWindowOpen(): boolean {
  const air = useAppStore((s) => s.mode === 'air');
  const live = useLinkStore((s) => s.state === 'connected' && s.stream !== null);
  const show = useSettings((s) => s.air.showPreview);
  return air && live && show;
}
