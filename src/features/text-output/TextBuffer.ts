/**
 * Pure text-editing model. The textarea in the UI is only a view of this
 * state, so editing behaviour is identical for every input source and fully
 * unit-testable.
 *
 * Selection is stored as anchor/focus so Shift+Arrow extends in the right
 * direction. Offsets are UTF-16 indices (same as the DOM), but deletion and
 * caret movement step over surrogate pairs so emoji are never split.
 */

export interface TextState {
  text: string;
  anchor: number;
  focus: number;
}

export type MoveTarget = 'left' | 'right' | 'up' | 'down' | 'lineStart' | 'lineEnd' | 'docStart' | 'docEnd';

export const EMPTY_TEXT: TextState = { text: '', anchor: 0, focus: 0 };

export const selStart = (s: TextState) => Math.min(s.anchor, s.focus);
export const selEnd = (s: TextState) => Math.max(s.anchor, s.focus);
export const hasSelection = (s: TextState) => s.anchor !== s.focus;
export const selectedText = (s: TextState) => s.text.slice(selStart(s), selEnd(s));

const caret = (text: string, at: number): TextState => ({ text, anchor: at, focus: at });

function clampOffset(text: string, n: number): number {
  return Math.max(0, Math.min(text.length, n));
}

export function normalize(s: TextState): TextState {
  return { text: s.text, anchor: clampOffset(s.text, s.anchor), focus: clampOffset(s.text, s.focus) };
}

export function setSelection(s: TextState, anchor: number, focus: number = anchor): TextState {
  return normalize({ text: s.text, anchor, focus });
}

export function setText(text: string, at: number = text.length): TextState {
  return caret(text, clampOffset(text, at));
}

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(code: number) {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Offset of the previous code point boundary. */
export function prevBoundary(text: string, i: number): number {
  if (i <= 0) return 0;
  if (i >= 2 && isLowSurrogate(text.charCodeAt(i - 1)) && isHighSurrogate(text.charCodeAt(i - 2))) return i - 2;
  return i - 1;
}

/** Offset of the next code point boundary. */
export function nextBoundary(text: string, i: number): number {
  if (i >= text.length) return text.length;
  if (isHighSurrogate(text.charCodeAt(i)) && isLowSurrogate(text.charCodeAt(i + 1))) return i + 2;
  return i + 1;
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);

export function prevWordBoundary(text: string, i: number): number {
  let j = i;
  while (j > 0 && !isWordChar(text[j - 1])) j--;
  while (j > 0 && isWordChar(text[j - 1])) j--;
  return j;
}

export function nextWordBoundary(text: string, i: number): number {
  let j = i;
  while (j < text.length && !isWordChar(text[j])) j++;
  while (j < text.length && isWordChar(text[j])) j++;
  return j;
}

export function insert(s: TextState, str: string): TextState {
  const start = selStart(s);
  const text = s.text.slice(0, start) + str + s.text.slice(selEnd(s));
  return caret(text, start + str.length);
}

function deleteRange(s: TextState, from: number, to: number): TextState {
  return caret(s.text.slice(0, from) + s.text.slice(to), from);
}

export function backspace(s: TextState, word = false): TextState {
  if (hasSelection(s)) return deleteRange(s, selStart(s), selEnd(s));
  const at = s.focus;
  if (at === 0) return s;
  const from = word ? prevWordBoundary(s.text, at) : prevBoundary(s.text, at);
  return deleteRange(s, from, at);
}

export function deleteForward(s: TextState, word = false): TextState {
  if (hasSelection(s)) return deleteRange(s, selStart(s), selEnd(s));
  const at = s.focus;
  if (at >= s.text.length) return s;
  const to = word ? nextWordBoundary(s.text, at) : nextBoundary(s.text, at);
  return deleteRange(s, at, to);
}

function lineStartOf(text: string, i: number): number {
  return text.lastIndexOf('\n', i - 1) + 1;
}

function lineEndOf(text: string, i: number): number {
  const n = text.indexOf('\n', i);
  return n === -1 ? text.length : n;
}

function verticalTarget(text: string, i: number, dir: -1 | 1): number {
  const start = lineStartOf(text, i);
  const column = i - start;
  if (dir === -1) {
    if (start === 0) return 0;
    const prevStart = lineStartOf(text, start - 1);
    return Math.min(prevStart + column, start - 1);
  }
  const end = lineEndOf(text, i);
  if (end === text.length) return text.length;
  const nextStart = end + 1;
  return Math.min(nextStart + column, lineEndOf(text, nextStart));
}

export function move(s: TextState, target: MoveTarget, extend = false, word = false): TextState {
  const { text } = s;
  // Collapsing a selection with Left/Right jumps to its edge (standard behaviour).
  if (!extend && hasSelection(s) && (target === 'left' || target === 'right')) {
    return caret(text, target === 'left' ? selStart(s) : selEnd(s));
  }
  const from = s.focus;
  let to: number;
  switch (target) {
    case 'left':
      to = word ? prevWordBoundary(text, from) : prevBoundary(text, from);
      break;
    case 'right':
      to = word ? nextWordBoundary(text, from) : nextBoundary(text, from);
      break;
    case 'up':
      to = verticalTarget(text, from, -1);
      break;
    case 'down':
      to = verticalTarget(text, from, 1);
      break;
    case 'lineStart':
      to = lineStartOf(text, from);
      break;
    case 'lineEnd':
      to = lineEndOf(text, from);
      break;
    case 'docStart':
      to = 0;
      break;
    case 'docEnd':
      to = text.length;
      break;
  }
  return extend ? { text, anchor: s.anchor, focus: to } : caret(text, to);
}

export function selectAll(s: TextState): TextState {
  return { text: s.text, anchor: 0, focus: s.text.length };
}

export function collapse(s: TextState): TextState {
  return caret(s.text, s.focus);
}

export function countCharacters(text: string): number {
  // Count code points so an emoji counts as one character.
  let n = 0;
  for (const _ of text) n++;
  return n;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return matches ? matches.length : 0;
}
