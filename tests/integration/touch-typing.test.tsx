import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VirtualKeyboard } from '@/components/keyboard/VirtualKeyboard';
import { TextOutputPanel } from '@/components/dashboard/TextOutputPanel';
import { connectKeyboardConsumers, keyboardEngine } from '@/engine/input/keyboard';
import { useTextStore } from '@/features/text-output/textStore';
import { EMPTY_TEXT } from '@/features/text-output/TextBuffer';
import { useSettings, DEFAULT_SETTINGS } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';

let disconnect: () => void = () => {};
let nextPointer = 1;

beforeAll(() => {
  // jsdom has no WebGL; LOW quality keeps the CSS fallback and avoids loading Three.js.
  useSettings.setState({
    ...DEFAULT_SETTINGS,
    general: { ...DEFAULT_SETTINGS.general, sound: false },
    performance: { ...DEFAULT_SETTINGS.performance, quality: 'low' },
  });
});

beforeEach(() => {
  useTextStore.setState({ doc: EMPTY_TEXT, past: [], future: [], lastEdit: null });
  keyboardEngine.resetModifiers();
  disconnect = connectKeyboardConsumers();
  render(
    <>
      <TextOutputPanel />
      <VirtualKeyboard />
    </>,
  );
});

afterEach(() => {
  cleanup();
  disconnect();
});

const keyEl = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-key="${id}"]`);
  if (!el) throw new Error(`no key ${id}`);
  return el;
};

function down(id: string, pointerType = 'touch', pointerId = nextPointer++) {
  fireEvent.pointerDown(keyEl(id), { pointerId, pointerType, button: 0, isPrimary: true });
  return pointerId;
}
function up(pointerId: number, pointerType = 'touch') {
  fireEvent.pointerUp(window, { pointerId, pointerType, button: 0 });
}
function tap(id: string, pointerType = 'touch') {
  act(() => {
    up(down(id, pointerType), pointerType);
  });
}
const typeText = (keys: string[]) => keys.forEach((k) => tap(k));
const text = () => (screen.getByTestId('editor') as HTMLTextAreaElement).value;

describe('Touch Mode typing (integration)', () => {
  it('renders every key of the layout', () => {
    expect(document.querySelectorAll('[data-key]').length).toBe(63);
  });

  it('types letters, space and punctuation into the editor', () => {
    typeText(['KeyH', 'KeyI', 'Space', 'KeyT', 'KeyH', 'KeyE', 'KeyR', 'KeyE', 'Period']);
    expect(text()).toBe('hi there.');
    expect(screen.getByTestId('char-count')).toHaveTextContent('9 chars');
    expect(screen.getByTestId('word-count')).toHaveTextContent('2 words');
  });

  it('one-shot Shift capitalises one letter and shows the latch', () => {
    tap('ShiftLeft');
    expect(keyEl('ShiftLeft')).toHaveClass('is-latched');
    expect(keyEl('KeyA').textContent).toBe('A');
    typeText(['KeyN', 'KeyE', 'KeyO']);
    expect(text()).toBe('Neo');
    expect(keyEl('ShiftLeft')).not.toHaveClass('is-latched');
  });

  it('Caps Lock, Backspace, Enter', () => {
    tap('CapsLock');
    expect(keyEl('CapsLock')).toHaveClass('is-active');
    typeText(['KeyO', 'KeyK', 'KeyX']);
    tap('Backspace');
    tap('CapsLock');
    tap('Enter');
    tap('KeyA');
    expect(text()).toBe('OK\na');
  });

  it('two simultaneous pointers: held Shift + key (chord)', () => {
    act(() => {
      const shift = down('ShiftRight', 'touch');
      const k = down('KeyQ', 'touch');
      up(k);
      up(shift);
    });
    tap('KeyQ');
    expect(text()).toBe('Qq');
  });

  it('pressed state is shown while held and cleared on release', () => {
    let id = 0;
    act(() => {
      id = down('KeyZ');
    });
    expect(keyEl('KeyZ')).toHaveClass('is-pressed');
    act(() => up(id));
    expect(keyEl('KeyZ')).not.toHaveClass('is-pressed');
  });

  it('pen and mouse go through the same engine and are reported as the source', () => {
    tap('KeyP', 'pen');
    expect(useAppStore.getState().lastSource).toBe('PEN');
    tap('KeyM', 'mouse');
    expect(useAppStore.getState().lastSource).toBe('MOUSE');
    expect(text()).toBe('pm');
  });

  it('ignores the right mouse button', () => {
    act(() => {
      fireEvent.pointerDown(keyEl('KeyA'), { pointerId: 99, pointerType: 'mouse', button: 2 });
      up(99, 'mouse');
    });
    expect(text()).toBe('');
  });

  it('window blur releases held keys (no stuck keys)', () => {
    act(() => {
      down('KeyB');
    });
    expect(keyboardEngine.isHeld('KeyB')).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(keyboardEngine.isHeld('KeyB')).toBe(false);
    expect(keyEl('KeyB')).not.toHaveClass('is-pressed');
  });

  it('arrow keys move the caret and insertion happens there', () => {
    typeText(['KeyA', 'KeyC', 'ArrowLeft', 'KeyB']);
    expect(text()).toBe('abc');
    const ta = screen.getByTestId('editor') as HTMLTextAreaElement;
    expect(ta.selectionStart).toBe(2);
  });

  it('Ctrl+A then a letter replaces everything; Ctrl+Z undoes', () => {
    typeText(['KeyO', 'KeyL', 'KeyD']);
    act(() => {
      const c = down('ControlLeft');
      const a = down('KeyA');
      up(a);
      up(c);
    });
    tap('KeyN');
    expect(text()).toBe('n');
    act(() => {
      const c = down('ControlLeft');
      const z = down('KeyZ');
      up(z);
      up(c);
    });
    expect(text()).toBe('old');
  });

  it('Fn + Backspace deletes forward', () => {
    typeText(['KeyA', 'KeyB', 'ArrowLeft', 'ArrowLeft']);
    act(() => {
      const fn = down('Fn');
      const bs = down('Backspace');
      up(bs);
      up(fn);
    });
    expect(text()).toBe('b');
  });

  it('physical keyboard edits in the textarea sync back to the model', () => {
    const ta = screen.getByTestId('editor') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(ta, { target: { value: 'typed on a cover', selectionStart: 16, selectionEnd: 16 } });
    });
    tap('Period');
    expect(text()).toBe('typed on a cover.');
  });
});
