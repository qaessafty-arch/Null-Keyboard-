import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardEngine } from '@/features/keyboard-engine/KeyboardEngine';
import { QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';
import type { InputSource, KeyboardInputEvent } from '@/types/keyboard';

function setup(opts: ConstructorParameters<typeof KeyboardEngine>[0] extends infer O ? Partial<O> : never = {}) {
  let t = 0;
  const engine = new KeyboardEngine({ layout: QWERTY_US, now: () => t, ...opts });
  const events: KeyboardInputEvent[] = [];
  engine.subscribe((e) => events.push(e));
  const presses = () => events.filter((e) => e.action === 'KEY_PRESS');
  const values = () => presses().map((e) => e.metadata.value ?? `<${e.metadata.command}>`);
  let ptr = 0;
  /** Press and release a key with a fresh holder. */
  const tap = (key: string, source: InputSource = 'TOUCH') => {
    const holderId = `h${ptr++}`;
    engine.keyDown(key, { source, holderId });
    engine.keyUp(key, { holderId });
  };
  return { engine, events, presses, values, tap, advance: (ms: number) => (t += ms) };
}

describe('KeyboardEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('types every letter in lower case', () => {
    const { tap, values } = setup();
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') tap(`Key${ch.toUpperCase()}`);
    expect(values().join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('types every digit and punctuation key', () => {
    const { tap, values } = setup();
    const ids = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
    ids.forEach((id) => tap(id));
    ['Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'].forEach(
      (id) => tap(id),
    );
    expect(values().join('')).toBe("1234567890`-=[]\\;',./");
  });

  it('emits KEY_DOWN, KEY_PRESS, KEY_UP in order with source and confidence', () => {
    const { engine, events } = setup();
    engine.keyDown('KeyQ', { source: 'PEN', holderId: 'p1', confidence: 0.8 });
    engine.keyUp('KeyQ', { holderId: 'p1' });
    expect(events.map((e) => e.action)).toEqual(['KEY_DOWN', 'KEY_PRESS', 'KEY_UP']);
    expect(events.every((e) => e.source === 'PEN' && e.confidence === 0.8)).toBe(true);
  });

  it('Space, Enter, Tab, Backspace, Escape produce the right outputs', () => {
    const { tap, values } = setup();
    ['Space', 'Enter', 'Tab', 'Backspace', 'Escape'].forEach((k) => tap(k));
    expect(values()).toEqual([' ', '<Enter>', '<Tab>', '<Backspace>', '<Escape>']);
  });

  describe('Shift', () => {
    it('held Shift chords: upper-case letters and shifted symbols', () => {
      const { engine, tap, values } = setup();
      engine.keyDown('ShiftLeft', { source: 'TOUCH', holderId: 's' });
      tap('KeyA');
      tap('Digit1');
      tap('Slash');
      engine.keyUp('ShiftLeft', { holderId: 's' });
      tap('KeyA');
      expect(values().join('')).toBe('A!?a');
    });

    it('a chorded Shift does not latch after release', () => {
      const { engine, tap } = setup();
      engine.keyDown('ShiftRight', { source: 'TOUCH', holderId: 's' });
      tap('KeyB');
      engine.keyUp('ShiftRight', { holderId: 's' });
      expect(engine.getModifiers().shift).toBe(false);
    });

    it('tap Shift latches for exactly one key (one-shot)', () => {
      const { engine, tap, values } = setup();
      tap('ShiftLeft');
      expect(engine.getModifiers().shift).toBe(true);
      expect(engine.getState().latched.has('shift')).toBe(true);
      tap('KeyH');
      tap('KeyI');
      expect(values().join('')).toBe('Hi');
      expect(engine.getModifiers().shift).toBe(false);
    });

    it('tapping a latched Shift again cancels the latch', () => {
      const { engine, tap, values } = setup();
      tap('ShiftLeft');
      tap('ShiftLeft');
      expect(engine.getModifiers().shift).toBe(false);
      tap('KeyX');
      expect(values()).toEqual(['x']);
    });

    it('a cancelled (not released) modifier does not latch', () => {
      const { engine } = setup();
      engine.keyDown('ShiftLeft', { source: 'TOUCH', holderId: 's' });
      engine.releaseHolder('s', 'cancel');
      expect(engine.getModifiers().shift).toBe(false);
    });
  });

  describe('Caps Lock', () => {
    it('toggles upper case for letters only', () => {
      const { engine, tap, values } = setup();
      tap('CapsLock');
      expect(engine.getModifiers().caps).toBe(true);
      tap('KeyA');
      tap('Digit1');
      tap('CapsLock');
      tap('KeyA');
      expect(values().join('')).toBe('A1a');
    });

    it('Shift inverts case while Caps Lock is on', () => {
      const { engine, tap, values } = setup();
      tap('CapsLock');
      engine.keyDown('ShiftLeft', { source: 'TOUCH', holderId: 's' });
      tap('KeyA');
      engine.keyUp('ShiftLeft', { holderId: 's' });
      tap('KeyA');
      expect(values().join('')).toBe('aA');
    });
  });

  describe('Fn layer', () => {
    it('maps digits to F-keys, arrows to Home/End/PgUp/PgDn, Backspace to Delete', () => {
      const { engine, tap, presses } = setup();
      engine.keyDown('Fn', { source: 'TOUCH', holderId: 'fn' });
      ['Digit1', 'Equal', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace'].forEach((k) => tap(k));
      engine.keyUp('Fn', { holderId: 'fn' });
      expect(presses().map((e) => e.metadata.command)).toEqual(['F1', 'F12', 'Home', 'End', 'PageUp', 'PageDown', 'Delete']);
    });
  });

  it('Ctrl is reported in the modifier snapshot of the press', () => {
    const { engine, tap, presses } = setup();
    engine.keyDown('ControlLeft', { source: 'MOUSE', holderId: 'c' });
    tap('KeyC', 'MOUSE');
    engine.keyUp('ControlLeft', { holderId: 'c' });
    const p = presses()[0]!;
    expect(p.key).toBe('KeyC');
    expect(p.metadata.modifiers.ctrl).toBe(true);
  });

  describe('duplicate suppression', () => {
    it('a held key cannot be pressed again by another holder', () => {
      const { engine, presses } = setup();
      expect(engine.keyDown('KeyA', { source: 'TOUCH', holderId: 'f1' })).toBe(true);
      expect(engine.keyDown('KeyA', { source: 'TOUCH', holderId: 'f2' })).toBe(false);
      expect(presses()).toHaveLength(1);
    });

    it('releasing with the wrong holder is ignored', () => {
      const { engine } = setup();
      engine.keyDown('KeyA', { source: 'TOUCH', holderId: 'f1' });
      expect(engine.keyUp('KeyA', { holderId: 'f2' })).toBe(false);
      expect(engine.isHeld('KeyA')).toBe(true);
    });

    it('releasing a key that is not held does nothing', () => {
      const { engine, events } = setup();
      expect(engine.keyUp('KeyA')).toBe(false);
      expect(events).toHaveLength(0);
    });

    it('unknown key ids are rejected', () => {
      const { engine } = setup();
      expect(engine.keyDown('NoSuchKey', { source: 'TOUCH', holderId: 'x' })).toBe(false);
    });

    it('a holder moving to a new key releases the old one', () => {
      const { engine, events } = setup();
      engine.keyDown('KeyA', { source: 'AIR', holderId: 'L-index' });
      engine.keyDown('KeyS', { source: 'AIR', holderId: 'L-index' });
      expect(engine.isHeld('KeyA')).toBe(false);
      expect(engine.isHeld('KeyS')).toBe(true);
      const up = events.find((e) => e.action === 'KEY_UP');
      expect(up?.key).toBe('KeyA');
      expect(up?.metadata.reason).toBe('cancel');
    });
  });

  describe('multi-pointer', () => {
    it('two pointers can hold different keys at once', () => {
      const { engine, values } = setup();
      engine.keyDown('KeyA', { source: 'TOUCH', holderId: 'f1' });
      engine.keyDown('KeyB', { source: 'TOUCH', holderId: 'f2' });
      expect(engine.getState().pressed.size).toBe(2);
      engine.releaseHolder('f1');
      engine.releaseHolder('f2');
      expect(values()).toEqual(['a', 'b']);
      expect(engine.getState().pressed.size).toBe(0);
    });
  });

  describe('auto-repeat', () => {
    it('repeats repeatable keys after the delay at the interval', () => {
      const { engine, presses } = setup({ repeat: { delayMs: 400, intervalMs: 50 } });
      engine.keyDown('Backspace', { source: 'TOUCH', holderId: 'f' });
      vi.advanceTimersByTime(399);
      expect(presses()).toHaveLength(1);
      vi.advanceTimersByTime(1 + 50 * 4);
      expect(presses()).toHaveLength(5);
      expect(presses().slice(1).every((e) => e.metadata.repeat)).toBe(true);
      engine.keyUp('Backspace', { holderId: 'f' });
      vi.advanceTimersByTime(1000);
      expect(presses()).toHaveLength(5);
    });

    it('does not repeat for sources not listed (Air by default)', () => {
      const { engine, presses } = setup();
      engine.keyDown('KeyA', { source: 'AIR', holderId: 'tip' });
      vi.advanceTimersByTime(2000);
      expect(presses()).toHaveLength(1);
    });

    it('does not repeat modifiers or Caps Lock', () => {
      const { engine, events } = setup();
      engine.keyDown('ShiftLeft', { source: 'TOUCH', holderId: 's' });
      engine.keyDown('CapsLock', { source: 'TOUCH', holderId: 'c' });
      vi.advanceTimersByTime(3000);
      expect(events.filter((e) => e.action === 'KEY_PRESS')).toHaveLength(0);
      expect(engine.getModifiers().caps).toBe(true);
    });

    it('can be disabled entirely', () => {
      const { engine, presses } = setup();
      engine.setRepeat({ sources: [] });
      engine.keyDown('KeyA', { source: 'TOUCH', holderId: 'f' });
      vi.advanceTimersByTime(3000);
      expect(presses()).toHaveLength(1);
    });
  });

  describe('stuck keys', () => {
    it('releaseAll releases everything with the given reason', () => {
      const { engine, events } = setup();
      engine.keyDown('KeyA', { source: 'TOUCH', holderId: 'f1' });
      engine.keyDown('ShiftLeft', { source: 'TOUCH', holderId: 'f2' });
      engine.releaseAll('blur');
      const ups = events.filter((e) => e.action === 'KEY_UP');
      expect(ups).toHaveLength(2);
      expect(ups.every((e) => e.metadata.reason === 'blur')).toBe(true);
      expect(engine.getState().pressed.size).toBe(0);
      // A blur-released Shift must not become latched.
      expect(engine.getModifiers().shift).toBe(false);
    });

    it('releaseAll can target one source (e.g. tracking lost)', () => {
      const { engine } = setup();
      engine.keyDown('KeyA', { source: 'AIR', holderId: 'tip' });
      engine.keyDown('KeyB', { source: 'TOUCH', holderId: 'f' });
      engine.releaseAll('tracking-lost', 'AIR');
      expect(engine.isHeld('KeyA')).toBe(false);
      expect(engine.isHeld('KeyB')).toBe(true);
    });

    it('the watchdog force-releases a key held too long', () => {
      const { engine } = setup({ maxHoldMs: 5000 });
      engine.keyDown('KeyA', { source: 'AIR', holderId: 'tip' });
      vi.advanceTimersByTime(5000);
      expect(engine.isHeld('KeyA')).toBe(false);
    });
  });

  it('notifies state listeners on press and release', () => {
    const { engine } = setup();
    const sizes: number[] = [];
    engine.subscribeState((s) => sizes.push(s.pressed.size));
    engine.keyDown('KeyA', { source: 'TOUCH', holderId: 'f' });
    engine.keyUp('KeyA', { holderId: 'f' });
    expect(sizes).toEqual([0, 1, 0]);
  });

  it('every key in the layout produces a KEY_DOWN and KEY_UP', () => {
    const { engine, events } = setup();
    const ids = QWERTY_US.rows.flat().map((k) => k.id);
    ids.forEach((id, i) => {
      engine.keyDown(id, { source: 'TOUCH', holderId: `h${i}` });
      engine.keyUp(id, { holderId: `h${i}` });
    });
    for (const id of ids) {
      expect(events.some((e) => e.key === id && e.action === 'KEY_DOWN')).toBe(true);
      expect(events.some((e) => e.key === id && e.action === 'KEY_UP')).toBe(true);
    }
  });
});
