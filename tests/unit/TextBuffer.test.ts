import { describe, expect, it } from 'vitest';
import {
  backspace,
  collapse,
  countCharacters,
  countWords,
  deleteForward,
  insert,
  move,
  selectAll,
  selectedText,
  setSelection,
  setText,
  type TextState,
} from '@/features/text-output/TextBuffer';

const doc = (text: string, anchor = text.length, focus = anchor): TextState => ({ text, anchor, focus });

describe('TextBuffer', () => {
  it('inserts at the caret', () => {
    expect(insert(doc('helo', 3), 'l')).toEqual(doc('hello', 4));
  });

  it('insert replaces the selection', () => {
    expect(insert(doc('hello world', 6, 11), 'there')).toEqual(doc('hello there', 11));
  });

  it('backspace deletes one char, or the selection, and stops at 0', () => {
    expect(backspace(doc('abc'))).toEqual(doc('ab'));
    expect(backspace(doc('abcdef', 1, 4))).toEqual(doc('aef', 1));
    expect(backspace(doc('abc', 0))).toEqual(doc('abc', 0));
  });

  it('backspace never splits an emoji (surrogate pair)', () => {
    expect(backspace(doc('hi😀'))).toEqual(doc('hi'));
  });

  it('Ctrl+Backspace deletes the previous word', () => {
    expect(backspace(doc('hello big world'), true)).toEqual(doc('hello big '));
    expect(backspace(doc('hello big '), true)).toEqual(doc('hello '));
  });

  it('delete forward', () => {
    expect(deleteForward(doc('abc', 1))).toEqual(doc('ac', 1));
    expect(deleteForward(doc('abc'))).toEqual(doc('abc'));
    expect(deleteForward(doc('one two', 0), true)).toEqual(doc(' two', 0));
  });

  it('left/right move and collapse selections to their edges', () => {
    expect(move(doc('abc', 2), 'left')).toEqual(doc('abc', 1));
    expect(move(doc('abc', 2), 'right')).toEqual(doc('abc', 3));
    expect(move(doc('abc', 3), 'right')).toEqual(doc('abc', 3));
    expect(move(doc('abcdef', 1, 4), 'left')).toEqual(doc('abcdef', 1));
    expect(move(doc('abcdef', 1, 4), 'right')).toEqual(doc('abcdef', 4));
  });

  it('shift+arrow extends from the anchor in both directions', () => {
    let s = doc('abcdef', 3);
    s = move(s, 'right', true);
    s = move(s, 'right', true);
    expect(selectedText(s)).toBe('de');
    s = doc('abcdef', 3);
    s = move(s, 'left', true);
    expect(s).toEqual({ text: 'abcdef', anchor: 3, focus: 2 });
    expect(selectedText(s)).toBe('c');
  });

  it('word jumps', () => {
    expect(move(doc('foo bar baz', 0), 'right', false, true).focus).toBe(3);
    expect(move(doc('foo bar baz'), 'left', false, true).focus).toBe(8);
  });

  it('up/down keep the column and clamp to shorter lines', () => {
    const text = 'abcdef\nab\nabcdef';
    expect(move(doc(text, 5), 'down').focus).toBe(9); // end of "ab"
    expect(move(doc(text, 8), 'down').focus).toBe(11); // column 1 on line 3
    expect(move(doc(text, 15), 'up').focus).toBe(9);
    expect(move(doc(text, 2), 'up').focus).toBe(0);
    expect(move(doc(text, 12), 'down').focus).toBe(text.length);
  });

  it('line and document start/end', () => {
    const text = 'one\ntwo three\nfour';
    expect(move(doc(text, 8), 'lineStart').focus).toBe(4);
    expect(move(doc(text, 8), 'lineEnd').focus).toBe(13);
    expect(move(doc(text, 8), 'docStart').focus).toBe(0);
    expect(move(doc(text, 8), 'docEnd').focus).toBe(text.length);
  });

  it('select all and collapse', () => {
    const s = selectAll(doc('hello', 2));
    expect(selectedText(s)).toBe('hello');
    expect(collapse(s)).toEqual(doc('hello', 5));
  });

  it('setSelection and setText clamp offsets', () => {
    expect(setSelection(doc('abc'), -5, 99)).toEqual({ text: 'abc', anchor: 0, focus: 3 });
    expect(setText('abc', 10)).toEqual(doc('abc', 3));
  });

  it('counts characters by code point and words sensibly', () => {
    expect(countCharacters('a😀b')).toBe(3);
    expect(countWords('')).toBe(0);
    expect(countWords("  Hello, world! It's 2026 — neo-type  ")).toBe(5);
    expect(countWords('line one\nline two')).toBe(4);
  });
});
