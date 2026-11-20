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
