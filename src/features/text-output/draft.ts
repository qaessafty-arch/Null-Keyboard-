import { useTextStore } from './textStore';
import { setText } from './TextBuffer';
import { idbGet, idbSet } from '@/utils/idb';

const KEY = 'editor-draft';

/**
 * Keeps the editor text in IndexedDB (this device only) so a reload, crash or
 * closed tab doesn't lose it. Restores once on start if the editor is empty.
 */
export function startDraftAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let restored = false;

  void idbGet<string>(KEY).then((text) => {
    restored = true;
    if (typeof text === 'string' && text && useTextStore.getState().doc.text === '') {
      useTextStore.setState({ doc: setText(text), past: [], future: [], lastEdit: null });
    }
  });

  const unsub = useTextStore.subscribe((s, prev) => {
    if (!restored || s.doc.text === prev.doc.text) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void idbSet(KEY, s.doc.text), 400);
  });

  const flush = () => {
    if (restored) void idbSet(KEY, useTextStore.getState().doc.text);
  };
  window.addEventListener('pagehide', flush);
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    window.removeEventListener('pagehide', flush);
  };
}
