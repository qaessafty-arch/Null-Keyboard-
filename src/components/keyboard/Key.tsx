import { memo, type CSSProperties } from 'react';
import type { KeyDefinition } from '@/types/keyboard';
import { useKeyState } from '@/stores/keyStateStore';

const isLetterKey = (def: KeyDefinition) =>
  def.kind === 'char' && def.char !== undefined && def.char.length === 1 && def.char.toLowerCase() !== def.char.toUpperCase();

/**
 * One key. Selects only the booleans it renders, so a press re-renders only
 * the affected key (plus legends when Shift/Caps/Fn flip).
 */
export const Key = memo(function Key({ def }: { def: KeyDefinition }) {
  const pressed = useKeyState((s) => s.pressed.has(def.id));
  const hovered = useKeyState((s) => s.hovered.has(def.id));
  const fn = useKeyState((s) => (def.fn ? s.modifiers.fn : false));
  const upper = useKeyState((s) => (isLetterKey(def) ? s.modifiers.shift !== s.modifiers.caps : false));
  const shifted = useKeyState((s) => (def.shiftLabel ? s.modifiers.shift : false));
  const modActive = useKeyState((s) =>
    def.modifier ? s.modifiers[def.modifier] : def.kind === 'toggle' ? s.modifiers.caps : false,
  );
  const latched = useKeyState((s) => (def.modifier ? s.latched.has(def.modifier) : false));

  let main = def.label;
  let sub: string | undefined;
  if (fn && def.fn) {
    main = def.fn.label;
    sub = undefined;
  } else if (isLetterKey(def)) {
    main = upper ? def.label.toUpperCase() : def.label.toLowerCase();
  } else if (def.shiftLabel) {
    main = shifted ? def.shiftLabel : def.label;
    sub = shifted ? def.label : def.shiftLabel;
  }

  const classes = ['key', `key--${def.kind}`];
  if (pressed) classes.push('is-pressed');
  if (hovered) classes.push('is-hovered');
  if (modActive) classes.push('is-active');
  if (latched) classes.push('is-latched');
  if (fn && def.fn) classes.push('is-fn');
  if (def.id === 'Space') classes.push('key--space');
  if (def.width >= 1.5) classes.push('key--wide');

  return (
    <div
      className={classes.join(' ')}
      style={{ '--w': def.width } as CSSProperties}
      data-key={def.id}
      role="button"
      aria-label={def.ariaLabel ?? def.label}
      aria-pressed={def.kind === 'modifier' || def.kind === 'toggle' ? modActive : pressed}
    >
      <span className="key__face">
        {sub !== undefined && <span className="key__sub">{sub}</span>}
        <span className="key__main">{main}</span>
        {def.kind === 'toggle' && <span className="key__led" />}
      </span>
    </div>
  );
});
