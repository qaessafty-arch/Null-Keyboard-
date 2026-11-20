import type { KeyDefinition, KeyboardLayout } from '@/types/keyboard';

const letter = (ch: string): KeyDefinition => ({
  id: `Key${ch.toUpperCase()}`,
  kind: 'char',
  label: ch.toUpperCase(),
  char: ch,
  shiftChar: ch.toUpperCase(),
  width: 1,
  repeatable: true,
});

const symbol = (
  id: string,
  char: string,
  shiftChar: string,
  fn?: KeyDefinition['fn'],
  ariaLabel?: string,
): KeyDefinition => ({
  id,
  kind: 'char',
  label: char,
  shiftLabel: shiftChar,
  char,
  shiftChar,
  width: 1,
  repeatable: true,
  ...(fn ? { fn } : {}),
  ...(ariaLabel ? { ariaLabel } : {}),
});

const fnKey = (n: number) => ({ label: `F${n}`, command: `F${n}` as const });

/**
 * US QWERTY, 15 units wide. Row widths:
 *  1: 13×1 + 2      = 15
 *  2: 1.5 + 12 + 1.5 = 15
 *  3: 1.75 + 11 + 2.25 = 15
 *  4: 2.25 + 10 + 2.75 = 15
 *  5: 1 + 1.25 + 1 + 1.25 + 5.25 + 1.25 + 4×1 = 15
 */
export const QWERTY_US: KeyboardLayout = {
  id: 'qwerty-us',
  name: 'QWERTY (US)',
  unitsWide: 15,
  rows: [
    [
      symbol('Backquote', '`', '~', undefined, 'Backquote'),
      symbol('Digit1', '1', '!', fnKey(1)),
      symbol('Digit2', '2', '@', fnKey(2)),
      symbol('Digit3', '3', '#', fnKey(3)),
      symbol('Digit4', '4', '$', fnKey(4)),
      symbol('Digit5', '5', '%', fnKey(5)),
      symbol('Digit6', '6', '^', fnKey(6)),
      symbol('Digit7', '7', '&', fnKey(7)),
      symbol('Digit8', '8', '*', fnKey(8)),
      symbol('Digit9', '9', '(', fnKey(9)),
      symbol('Digit0', '0', ')', fnKey(10)),
      symbol('Minus', '-', '_', fnKey(11), 'Minus'),
      symbol('Equal', '=', '+', fnKey(12), 'Equals'),
      {
        id: 'Backspace',
        kind: 'action',
        label: 'Backspace',
        command: 'Backspace',
        width: 2,
        repeatable: true,
        fn: { label: 'Delete', command: 'Delete' },
      },
    ],
    [
      { id: 'Tab', kind: 'action', label: 'Tab', command: 'Tab', width: 1.5 },
      ...'qwertyuiop'.split('').map(letter),
      symbol('BracketLeft', '[', '{', undefined, 'Left bracket'),
      symbol('BracketRight', ']', '}', undefined, 'Right bracket'),
      { ...symbol('Backslash', '\\', '|', undefined, 'Backslash'), width: 1.5 },
    ],
    [
      { id: 'CapsLock', kind: 'toggle', label: 'Caps', width: 1.75, ariaLabel: 'Caps Lock' },
      ...'asdfghjkl'.split('').map(letter),
      symbol('Semicolon', ';', ':', undefined, 'Semicolon'),
      symbol('Quote', "'", '"', undefined, 'Quote'),
      { id: 'Enter', kind: 'action', label: 'Enter', command: 'Enter', width: 2.25 },
    ],
    [
      { id: 'ShiftLeft', kind: 'modifier', modifier: 'shift', label: 'Shift', width: 2.25 },
      ...'zxcvbnm'.split('').map(letter),
      symbol('Comma', ',', '<', undefined, 'Comma'),
      symbol('Period', '.', '>', undefined, 'Period'),
      symbol('Slash', '/', '?', undefined, 'Slash'),
      { id: 'ShiftRight', kind: 'modifier', modifier: 'shift', label: 'Shift', width: 2.75 },
    ],
    [
      { id: 'Escape', kind: 'action', label: 'Esc', command: 'Escape', width: 1, ariaLabel: 'Escape' },
      { id: 'ControlLeft', kind: 'modifier', modifier: 'ctrl', label: 'Ctrl', width: 1.25, ariaLabel: 'Control' },
      { id: 'Fn', kind: 'modifier', modifier: 'fn', label: 'Fn', width: 1, ariaLabel: 'Function layer' },
      { id: 'AltLeft', kind: 'modifier', modifier: 'alt', label: 'Alt', width: 1.25 },
      {
        id: 'Space',
        kind: 'char',
        label: '',
        char: ' ',
        shiftChar: ' ',
        width: 5.25,
        repeatable: true,
        ariaLabel: 'Space',
      },
      { id: 'AltRight', kind: 'modifier', modifier: 'alt', label: 'Alt', width: 1.25, ariaLabel: 'Alt (right)' },
      {
        id: 'ArrowLeft',
        kind: 'action',
        label: '←',
        command: 'ArrowLeft',
        width: 1,
        repeatable: true,
        ariaLabel: 'Arrow left',
        fn: { label: 'Home', command: 'Home' },
      },
      {
        id: 'ArrowUp',
        kind: 'action',
        label: '↑',
        command: 'ArrowUp',
        width: 1,
        repeatable: true,
        ariaLabel: 'Arrow up',
        fn: { label: 'PgUp', command: 'PageUp' },
      },
      {
        id: 'ArrowDown',
        kind: 'action',
        label: '↓',
        command: 'ArrowDown',
        width: 1,
        repeatable: true,
        ariaLabel: 'Arrow down',
        fn: { label: 'PgDn', command: 'PageDown' },
      },
      {
        id: 'ArrowRight',
        kind: 'action',
        label: '→',
        command: 'ArrowRight',
        width: 1,
        repeatable: true,
        ariaLabel: 'Arrow right',
        fn: { label: 'End', command: 'End' },
      },
    ],
  ],
};

export const LAYOUTS: Record<string, KeyboardLayout> = {
  [QWERTY_US.id]: QWERTY_US,
};

export function indexLayout(layout: KeyboardLayout): Map<string, KeyDefinition> {
  const map = new Map<string, KeyDefinition>();
  for (const row of layout.rows) for (const key of row) map.set(key.id, key);
  return map;
}
