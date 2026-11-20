import { describe, expect, it } from 'vitest';
import { QWERTY_US, indexLayout } from '@/features/keyboard-engine/layouts/qwerty';
import { RollingStat } from '@/engine/performance/RollingStat';

describe('QWERTY layout', () => {
  it('every row is exactly unitsWide wide', () => {
    for (const row of QWERTY_US.rows) {
      const width = row.reduce((s, k) => s + k.width, 0);
      expect(width).toBeCloseTo(QWERTY_US.unitsWide, 5);
    }
  });

  it('key ids are unique', () => {
    const ids = QWERTY_US.rows.flat().map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(indexLayout(QWERTY_US).size).toBe(ids.length);
  });

  it('contains all required keys', () => {
    const map = indexLayout(QWERTY_US);
    const required = [
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
      ...'0123456789'.split('').map((d) => `Digit${d}`),
      'Backspace',
      'Enter',
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'CapsLock',
      'Tab',
      'Escape',
      'ControlLeft',
      'AltLeft',
      'Fn',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Comma',
      'Period',
      'Slash',
      'Semicolon',
      'Quote',
    ];
    for (const id of required) expect(map.has(id), id).toBe(true);
  });
});

describe('RollingStat', () => {
  it('computes mean, percentile and last over a ring buffer', () => {
    const s = new RollingStat(4);
    expect(s.mean()).toBeNull();
    [10, 20, 30, 40, 50].forEach((v) => s.record(v));
    expect(s.count).toBe(4);
    expect(s.recorded).toBe(5);
    expect(s.last).toBe(50);
    expect(s.mean()).toBe(35);
    expect(s.values()).toEqual([20, 30, 40, 50]);
    expect(s.percentile(50)).toBe(30);
    expect(s.percentile(100)).toBe(50);
  });

  it('ignores invalid samples', () => {
    const s = new RollingStat(4);
    s.record(Number.NaN);
    s.record(-1);
    s.record(Infinity);
    expect(s.count).toBe(0);
  });
});
