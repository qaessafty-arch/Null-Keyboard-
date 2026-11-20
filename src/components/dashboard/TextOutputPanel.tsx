import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTextStore } from '@/features/text-output/textStore';
import { countCharacters, countWords, selEnd, selStart } from '@/features/text-output/TextBuffer';
import { downloadText } from '@/utils/download';
import { Button, IconButton } from '@/components/common/Controls';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { InputSourceIndicator } from './InputSourceIndicator';
import { notify } from '@/stores/noticeStore';
import { useCameraWindowOpen } from '@/components/camera/useCameraWindowOpen';

/**
 * Built-in editor. The textarea is a view of the TextBuffer model:
 *  - virtual key presses edit the model, and the model pushes value + caret here
 *  - physical keyboard / IME / context-menu edits sync back via onChange
 *  - inputMode="none" stops the Windows touch keyboard from popping up
 */
export function TextOutputPanel() {
  const doc = useTextStore((s) => s.doc);
  const canUndo = useTextStore((s) => s.past.length > 0);
  const canRedo = useTextStore((s) => s.future.length > 0);
  const { apply, syncFromView, setSelection, undo, redo, clear, copy } = useTextStore.getState();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const cameraDock = useCameraWindowOpen();
  const copiedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  // Push model selection into the view after every model change.
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    const start = selStart(doc);
    const end = selEnd(doc);
    const dir = doc.focus < doc.anchor ? 'backward' : 'forward';
    if (ta.selectionStart !== start || ta.selectionEnd !== end || (start !== end && ta.selectionDirection !== dir)) {
      ta.setSelectionRange(start, end, dir);
    }
  }, [doc]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  const stats = useMemo(
    () => ({
      chars: countCharacters(doc.text),
      words: countWords(doc.text),
      lines: doc.text === '' ? 0 : doc.text.split('\n').length,
    }),
    [doc.text],
  );

  const readSelection = (ta: HTMLTextAreaElement): [number, number] =>
    ta.selectionDirection === 'backward'
      ? [ta.selectionEnd, ta.selectionStart]
      : [ta.selectionStart, ta.selectionEnd];

  // Physical keyboard: route undo/redo to our history instead of the browser's.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  };

  return (
    <section className={`editor${cameraDock ? ' editor--docked' : ''}`} aria-label="Text output">
      <div className="editor__bar">
        <div className="editor__title">
          <span className="eyebrow">Output</span>
          <InputSourceIndicator />
        </div>
        <div className="editor__tools">
          <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
          <IconButton icon="redo" label="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo} />
          <IconButton
            icon="selectAll"
            label="Select all"
            onClick={() => {
              apply({ type: 'selectAll' });
              ref.current?.focus({ preventScroll: true });
            }}
          />
          <span className="editor__sep" />
          <Button
            icon={copied ? 'check' : 'copy'}
            className={copied ? 'btn--done' : undefined}
            aria-live="polite"
            onClick={() =>
              void copy().then((ok) => {
                if (!ok) return;
                setCopied(true);
                window.clearTimeout(copiedTimer.current);
                copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
              })
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            icon="download"
            onClick={() => {
              if (doc.text === '') {
                notify('Nothing to download yet', 'info');
                return;
              }
              downloadText(doc.text);
            }}
          >
            TXT
          </Button>
          <IconButton icon="trash" label="Clear text" onClick={() => setConfirmClear(true)} disabled={doc.text === ''} />
        </div>
      </div>

      <div className="editor__body">
        <textarea
          ref={ref}
          className="editor__text"
          value={doc.text}
          inputMode="none"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="Start typing on the laser keyboard…"
          aria-label="Typed text"
          data-testid="editor"
          onChange={(e) => {
            const [a, f] = readSelection(e.currentTarget);
            syncFromView(e.currentTarget.value, a, f);
          }}
          onSelect={(e) => {
            const [a, f] = readSelection(e.currentTarget);
            setSelection(a, f);
          }}
          onKeyDown={onKeyDown}
        />
        {cameraDock && <div className="editor__dock camera-dock" data-camera-dock aria-hidden="true" />}
      </div>

      <div className="editor__foot mono">
        <span data-testid="char-count">{stats.chars} chars</span>
        <span data-testid="word-count">{stats.words} words</span>
        <span>{stats.lines} lines</span>
        <span className="editor__foot-end">
          Ln {doc.text.slice(0, doc.focus).split('\n').length}, Col{' '}
          {doc.focus - (doc.text.lastIndexOf('\n', doc.focus - 1) + 1) + 1}
        </span>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all text?"
        message="This removes everything in the editor. You can still undo it with Ctrl+Z."
        confirmLabel="Clear"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clear();
          setConfirmClear(false);
          ref.current?.focus({ preventScroll: true });
        }}
      />
    </section>
  );
}
