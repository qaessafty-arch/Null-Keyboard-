import { describe, expect, it } from 'vitest';
import { keyToIntent } from '@/features/text-output/keyToIntent';
import type { KeyCommand, KeyboardInputEvent, ModifierSnapshot } from '@/types/keyboard';

const NO_MODS: ModifierSnapshot = { shift: false, ctrl: false, alt: false, fn: false, caps: false };

function press(key: string, meta: { value?: string; command?: KeyCommand } & Partial<ModifierSnapshot> = {}): KeyboardInputEvent {
  const { value, command, ...mods } = meta;
  return {
    key,
    source: 'TOUCH',
    action: 'KEY_PRESS',
    timestamp: 0,
    confidence: 1,
    metadata: {
      ...(value !== undefined ? { value } : {}),
      ...(command !== undefined ? { command } : {}),
      modifiers: { ...NO_MODS, ...mods },
      repeat: false,
    },
  };
}

describe('keyToIntent', () => {
  it('characters insert', () => {
    expect(keyToIntent(press('KeyA', { value: 'a' }))).toEqual({ type: 'insert', text: 'a' });
  });

  it('ignores KEY_DOWN / KEY_UP', () => {
    expect(keyToIntent({ ...press('KeyA', { value: 'a' }), action: 'KEY_DOWN' })).toEqual({ type: 'none' });
  });

  it('Enter / Tab insert, Backspace / Delete delete', () => {
    expect(keyToIntent(press('Enter', { command: 'Enter' }))).toEqual({ type: 'insert', text: '\n' });
    expect(keyToIntent(press('Tab', { command: 'Tab' }))).toEqual({ type: 'insert', text: '\t' });
    expect(keyToIntent(press('Backspace', { command: 'Backspace' }))).toEqual({ type: 'backspace', word: false });
    expect(keyToIntent(press('Backspace', { command: 'Backspace', ctrl: true }))).toEqual({ type: 'backspace', word: true });
    expect(keyToIntent(press('Backspace', { command: 'Delete' }))).toEqual({ type: 'delete', word: false });
  });

  it('arrows move, Shift extends, Ctrl jumps words', () => {
    expect(keyToIntent(press('ArrowLeft', { command: 'ArrowLeft', shift: true, ctrl: true }))).toEqual({
      type: 'move',
      target: 'left',
      extend: true,
      word: true,
    });
    expect(keyToIntent(press('ArrowUp', { command: 'Home', ctrl: true }))).toMatchObject({ target: 'docStart' });
    expect(keyToIntent(press('ArrowUp', { command: 'End' }))).toMatchObject({ target: 'lineEnd' });
  });

  it('Ctrl shortcuts', () => {
    expect(keyToIntent(press('KeyA', { value: 'a', ctrl: true }))).toEqual({ type: 'selectAll' });
    expect(keyToIntent(press('KeyC', { value: 'c', ctrl: true }))).toEqual({ type: 'copy' });
    expect(keyToIntent(press('KeyX', { value: 'x', ctrl: true }))).toEqual({ type: 'cut' });
    expect(keyToIntent(press('KeyV', { value: 'v', ctrl: true }))).toEqual({ type: 'paste' });
    expect(keyToIntent(press('KeyZ', { value: 'z', ctrl: true }))).toEqual({ type: 'undo' });
    expect(keyToIntent(press('KeyZ', { value: 'Z', ctrl: true, shift: true }))).toEqual({ type: 'redo' });
    expect(keyToIntent(press('KeyY', { value: 'y', ctrl: true }))).toEqual({ type: 'redo' });
    expect(keyToIntent(press('KeyQ', { value: 'q', ctrl: true }))).toEqual({ type: 'none' });
  });

  it('Alt chords and F-keys do not type', () => {
    expect(keyToIntent(press('KeyA', { value: 'a', alt: true }))).toEqual({ type: 'none' });
    expect(keyToIntent(press('Digit1', { command: 'F1' }))).toEqual({ type: 'none' });
  });

  it('Escape collapses the selection', () => {
    expect(keyToIntent(press('Escape', { command: 'Escape' }))).toEqual({ type: 'collapse' });
  });
});
