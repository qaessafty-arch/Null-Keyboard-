/** Press ripples for the WebGL laser surface, in keyboard-normalized coordinates (0..1, y down). */
export interface Ripple {
  x: number;
  y: number;
  /** 0..1 */
  strength: number;
}

type Listener = (r: Ripple) => void;
const listeners = new Set<Listener>();

export function emitRipple(r: Ripple): void {
  for (const l of listeners) l(r);
}

export function onRipple(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Ripple at a key's on-screen position (used by non-pointer inputs such as Air Mode). */
export function rippleAtKey(keyId: string, strength = 1): void {
  const kb = document.querySelector<HTMLElement>('[data-testid="virtual-keyboard"]');
  const key = kb?.querySelector<HTMLElement>(`[data-key="${CSS.escape(keyId)}"]`);
  if (!kb || !key) return;
  const box = kb.getBoundingClientRect();
  const r = key.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return;
  emitRipple({
    x: (r.left + r.width / 2 - box.left) / box.width,
    y: (r.top + r.height / 2 - box.top) / box.height,
    strength,
  });
}
