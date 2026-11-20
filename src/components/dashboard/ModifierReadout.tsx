import { useKeyState } from '@/stores/keyStateStore';

const MODS = [
  { k: 'shift', label: 'Shift' },
  { k: 'caps', label: 'Caps' },
  { k: 'ctrl', label: 'Ctrl' },
  { k: 'alt', label: 'Alt' },
  { k: 'fn', label: 'Fn' },
] as const;

/** Live modifier state from the engine. */
export function ModifierReadout() {
  const mods = useKeyState((s) => s.modifiers);
  const latched = useKeyState((s) => s.latched);
  return (
    <div className="mods" aria-label="Modifier state" data-testid="modifier-readout">
      {MODS.map(({ k, label }) => {
        const on = mods[k];
        const isLatched = k !== 'caps' && latched.has(k);
        return (
          <span
            key={k}
            className={`mods__chip${on ? ' is-on' : ''}${isLatched ? ' is-latched' : ''}`}
            data-mod={k}
            aria-label={`${label} ${on ? (isLatched ? 'latched' : 'on') : 'off'}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
