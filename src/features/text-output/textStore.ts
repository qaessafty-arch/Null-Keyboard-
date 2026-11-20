import { create } from 'zustand';
import {
  EMPTY_TEXT,
  backspace,
  collapse,
  deleteForward,
  hasSelection,
  insert,
  move,
  normalize,
  selectAll,
  selectedText,
  type TextState,
} from './TextBuffer';
import type { TextIntent } from './keyToIntent';
import { readClipboard, writeClipboard } from '@/utils/clipboard';
import { notify } from '@/stores/noticeStore';

type EditKind = 'insert' | 'delete' | 'other';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1000;

interface TextStore {
  doc: TextState;
  past: TextState[];
  future: TextState[];
  lastEdit: { kind: EditKind; at: number; char?: string } | null;

  apply: (intent: TextIntent, at?: number) => void;
  /** Sync from the textarea (physical keyboard, IME, paste via context menu). */
  syncFromView: (text: string, anchor: number, focus: number) => void;
  setSelection: (anchor: number, focus: number) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  copy: () => Promise<boolean>;
}

export const useTextStore = create<TextStore>((set, get) => {
  /** Record `prev` in history unless this edit continues the previous one. */
  const commit = (prev: TextState, next: TextState, kind: EditKind, at: number, char?: string) => {
    if (prev.text === next.text) {
      set({ doc: next });
      return;
    }
    const { lastEdit, past } = get();
    const continues =
      lastEdit !== null &&
      kind !== 'other' &&
      lastEdit.kind === kind &&
      at - lastEdit.at < COALESCE_MS &&
      // break undo groups at word boundaries
      !(kind === 'insert' && lastEdit.char !== undefined && /\s/.test(lastEdit.char));
    set({
      doc: next,
      past: continues ? past : [...past, prev].slice(-HISTORY_LIMIT),
      future: [],
      lastEdit: { kind, at, ...(char !== undefined ? { char } : {}) },
    });
  };

  const breakGroup = () => set({ lastEdit: null });

  return {
    doc: EMPTY_TEXT,
    past: [],
    future: [],
    lastEdit: null,

    apply: (intent, at = performance.now()) => {
      const doc = get().doc;
      switch (intent.type) {
        case 'insert':
          commit(doc, insert(doc, intent.text), intent.text.length === 1 ? 'insert' : 'other', at, intent.text);
          return;
        case 'backspace':
          commit(doc, backspace(doc, intent.word), hasSelection(doc) || intent.word ? 'other' : 'delete', at);
          return;
        case 'delete':
          commit(doc, deleteForward(doc, intent.word), hasSelection(doc) || intent.word ? 'other' : 'delete', at);
          return;
        case 'move':
          breakGroup();
          set({ doc: move(doc, intent.target, intent.extend, intent.word) });
          return;
        case 'selectAll':
          breakGroup();
          set({ doc: selectAll(doc) });
          return;
        case 'collapse':
          set({ doc: collapse(doc) });
          return;
        case 'undo':
          get().undo();
          return;
        case 'redo':
          get().redo();
          return;
        case 'copy':
          void get().copy();
          return;
        case 'cut': {
          if (!hasSelection(doc)) return;
          const text = selectedText(doc);
          void writeClipboard(text).then((ok) => {
            if (!ok) {
              notify('Clipboard unavailable — cut cancelled', 'error');
              return;
            }
            const current = get().doc;
            commit(current, backspace(current), 'other', performance.now());
            notify('Cut to clipboard', 'success');
          });
          return;
        }
        case 'paste':
          void readClipboard().then((text) => {
            if (text === null) {
              notify('Browser blocked clipboard read — use Ctrl+V on a physical keyboard or right-click › Paste', 'warning', 4000);
              return;
            }
            const current = get().doc;
            commit(current, insert(current, text), 'other', performance.now());
          });
          return;
        case 'none':
          return;
      }
    },

    syncFromView: (text, anchor, focus) => {
      const doc = get().doc;
      const next = normalize({ text, anchor, focus });
      if (text === doc.text) {
        set({ doc: next });
        return;
      }
      commit(doc, next, 'other', performance.now());
    },

    setSelection: (anchor, focus) => {
      const doc = get().doc;
      if (doc.anchor === anchor && doc.focus === focus) return;
      breakGroup();
      set({ doc: normalize({ text: doc.text, anchor, focus }) });
    },

    undo: () => {
      const { past, doc, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastEdit: null });
    },

    redo: () => {
      const { past, doc, future } = get();
      const next = future[0];
      if (!next) return;
      set({ doc: next, past: [...past, doc], future: future.slice(1), lastEdit: null });
    },

    clear: () => {
      const doc = get().doc;
      if (doc.text === '') return;
      commit(doc, EMPTY_TEXT, 'other', performance.now());
    },

    copy: async () => {
      const doc = get().doc;
      const text = hasSelection(doc) ? selectedText(doc) : doc.text;
      if (text === '') {
        notify('Nothing to copy', 'info');
        return false;
      }
      const ok = await writeClipboard(text);
      notify(
        ok ? (hasSelection(doc) ? 'Selection copied' : 'All text copied') : 'Clipboard unavailable',
        ok ? 'success' : 'error',
      );
      return ok;
    },
  };
});
