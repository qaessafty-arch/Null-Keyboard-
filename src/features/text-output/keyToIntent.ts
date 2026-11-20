import type { KeyboardInputEvent } from '@/types/keyboard';
import type { MoveTarget } from './TextBuffer';

/**
 * What a key press means to the text editor. Separating "meaning" from
 * "applying" keeps editor behaviour independent of the input source.
 */
export type TextIntent =
  | { type: 'insert'; text: string }
  | { type: 'backspace'; word: boolean }
  | { type: 'delete'; word: boolean }
  | { type: 'move'; target: MoveTarget; extend: boolean; word: boolean }
  | { type: 'selectAll' }
  | { type: 'collapse' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'none' };

const NONE: TextIntent = { type: 'none' };

export function keyToIntent(event: KeyboardInputEvent): TextIntent {
  if (event.action !== 'KEY_PRESS') return NONE;
  const { command, value, modifiers } = event.metadata;
  const { shift, ctrl, alt } = modifiers;

  if (command) {
    switch (command) {
      case 'Backspace':
        return { type: 'backspace', word: ctrl };
      case 'Delete':
        return { type: 'delete', word: ctrl };
      case 'Enter':
        return ctrl || alt ? NONE : { type: 'insert', text: '\n' };
      case 'Tab':
        return ctrl || alt ? NONE : { type: 'insert', text: '\t' };
      case 'Escape':
        return { type: 'collapse' };
      case 'ArrowLeft':
        return { type: 'move', target: 'left', extend: shift, word: ctrl };
      case 'ArrowRight':
        return { type: 'move', target: 'right', extend: shift, word: ctrl };
      case 'ArrowUp':
        return { type: 'move', target: 'up', extend: shift, word: false };
      case 'ArrowDown':
        return { type: 'move', target: 'down', extend: shift, word: false };
      case 'Home':
        return { type: 'move', target: ctrl ? 'docStart' : 'lineStart', extend: shift, word: false };
      case 'End':
        return { type: 'move', target: ctrl ? 'docEnd' : 'lineEnd', extend: shift, word: false };
      case 'PageUp':
        return { type: 'move', target: 'docStart', extend: shift, word: false };
      case 'PageDown':
        return { type: 'move', target: 'docEnd', extend: shift, word: false };
      default:
        // F1–F12 have no meaning in the built-in editor; they are still
        // emitted as events for a future native companion.
        return NONE;
    }
  }

  if (value === undefined) return NONE;

  if (ctrl) {
    switch (event.key) {
      case 'KeyA':
        return { type: 'selectAll' };
      case 'KeyC':
        return { type: 'copy' };
      case 'KeyX':
        return { type: 'cut' };
      case 'KeyV':
        return { type: 'paste' };
      case 'KeyZ':
        return shift ? { type: 'redo' } : { type: 'undo' };
      case 'KeyY':
        return { type: 'redo' };
      default:
        return NONE;
    }
  }

  if (alt) return NONE;
  return { type: 'insert', text: value };
}
