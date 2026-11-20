import { create } from 'zustand';
import type { KeyId, ModifierName, ModifierSnapshot } from '@/types/keyboard';

/**
 * Mirror of the engine's visual state. Components select a single key
 * (`s.pressed.has(id)`) so a press re-renders only the key that changed.
 */
interface KeyState {
  pressed: ReadonlySet<KeyId>;
  modifiers: ModifierSnapshot;
  latched: ReadonlySet<ModifierName>;
  /** Keys hovered by an air-mode fingertip (Stage 5). */
  hovered: ReadonlySet<KeyId>;
}

export const useKeyState = create<KeyState>(() => ({
  pressed: new Set(),
  modifiers: { shift: false, ctrl: false, alt: false, fn: false, caps: false },
  latched: new Set(),
  hovered: new Set(),
}));
