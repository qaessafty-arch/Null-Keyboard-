import { useEffect, type RefObject } from 'react';
import type { KeyboardEngine } from '@/features/keyboard-engine/KeyboardEngine';
import type { InputSource } from '@/types/keyboard';
import { probeInputLatency } from '@/engine/performance/metrics';
import { emitRipple } from '@/rendering/effects/rippleBus';

export function sourceFromPointerType(pointerType: string): InputSource {
  switch (pointerType) {
    case 'pen':
      return 'PEN';
    case 'touch':
      return 'TOUCH';
    default:
      return 'MOUSE'; // mouse and precision trackpads report "mouse"
  }
}

export const holderIdFor = (pointerId: number) => `ptr:${pointerId}`;

/**
 * Touch Mode input: one Pointer Events path for finger, Surface Pen, mouse and
 * trackpad. Each pointer holds at most one key; release happens on that
 * pointer's `pointerup` / `pointercancel` wherever it occurs.
 */
export function usePointerKeyboard(
  container: RefObject<HTMLElement | null>,
  engine: KeyboardEngine,
  enabled = true,
): void {
  useEffect(() => {
    const el = container.current;
    if (!el || !enabled) return;

    const onDown = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest<HTMLElement>('[data-key]');
      if (!target || !el.contains(target)) return;
      // Only the primary button for mouse; pen barrel/eraser buttons are ignored.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'pen' && e.button > 0) return;

      // Keep focus (and the caret) in the editor; suppress compat mouse events.
      e.preventDefault();

      const id = target.dataset.key;
      if (!id) return;
      const accepted = engine.keyDown(id, {
        source: sourceFromPointerType(e.pointerType),
        holderId: holderIdFor(e.pointerId),
        timestamp: e.timeStamp,
        confidence: 1,
      });
      if (!accepted) return;

      probeInputLatency(e.timeStamp);

      const box = el.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        emitRipple({
          x: (r.left + r.width / 2 - box.left) / box.width,
          y: (r.top + r.height / 2 - box.top) / box.height,
          strength: 1,
        });
      }
    };

    const onUp = (e: PointerEvent) => engine.releaseHolder(holderIdFor(e.pointerId), 'release');
    const onCancel = (e: PointerEvent) => engine.releaseHolder(holderIdFor(e.pointerId), 'cancel');
    // Long-press on touch/pen opens a context menu on Windows; never on keys.
    const onContextMenu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('contextmenu', onContextMenu);
      engine.releaseAll('reset');
    };
  }, [container, engine, enabled]);
}
