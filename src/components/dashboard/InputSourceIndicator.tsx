import { useAppStore } from '@/stores/appStore';
import { Icon, type IconName } from '@/components/common/Icon';
import type { InputSource } from '@/types/keyboard';

const META: Record<InputSource, { label: string; icon: IconName }> = {
  TOUCH: { label: 'Touch', icon: 'hand' },
  PEN: { label: 'Pen', icon: 'target' },
  MOUSE: { label: 'Mouse', icon: 'keyboard' },
  AIR: { label: 'Air', icon: 'camera' },
};

/** Shows which input produced the most recent key press. */
export function InputSourceIndicator() {
  const source = useAppStore((s) => s.lastSource);
  const at = useAppStore((s) => s.lastSourceAt);
  if (!source) {
    return (
      <span className="source source--none" data-testid="input-source">
        No input yet
      </span>
    );
  }
  const m = META[source];
  return (
    <span className="source" data-testid="input-source" data-source={source} key={at}>
      <Icon name={m.icon} size={14} />
      {m.label}
    </span>
  );
}
