/**
 * Go to Line (Ctrl+G). Shown while state.overlay === 'goToLine'
 * (design/mockups/go-to-line.html).
 *
 * The input starts neutral; the number is validated only once the user has
 * typed. Enter with a valid line moves the cursor of the active editor to the
 * start of that line and scrolls it into the middle of the view.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { EditorView } from '@codemirror/view';
import { useApp, useAppStore } from '../state/AppStore';
import { registerHandler } from '../commands/registry';
import { getActiveView } from '../editor/keymaps';
import { Scrim } from '../ui/Dialog';
import { OverlayHint, OverlayInput, OverlayList } from '../ui/OverlayList';

/** Parses the typed text; returns the line or an error message (null = nothing typed). */
export function validateLine(raw: string, max: number): { line: number } | { error: string } | null {
  const v = raw.trim();
  if (v === '') return null;
  if (!/^\d+$/.test(v)) return { error: 'Enter a line number' };
  const n = Number(v);
  if (n < 1 || n > max) return { error: `Line must be between 1 and ${max}` };
  return { line: n };
}

/** Moves the cursor of `view` to the start of `line` (1-based) and scrolls it into view. */
export function goToLine(view: EditorView, line: number): void {
  const doc = view.state.doc;
  const target = doc.line(Math.min(Math.max(1, line), doc.lines));
  view.dispatch({
    selection: { anchor: target.from },
    effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
    scrollIntoView: false,
  });
  view.focus();
}

interface Target {
  current: number;
  max: number;
}

export function GoToLine() {
  const { state, dispatch } = useApp();
  const store = useAppStore();
  const open = state.overlay === 'goToLine';

  useEffect(
    () =>
      registerHandler('view.goToLine', () => {
        store.dispatch({ type: 'overlay/set', overlay: 'goToLine' });
      }),
    [store],
  );

  const [value, setValue] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const view = getActiveView();
    setTarget(
      view ? { current: view.state.doc.lineAt(view.state.selection.main.head).number, max: view.state.doc.lines } : null,
    );
    setValue('');
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => {
    dispatch({ type: 'overlay/set', overlay: null });
    getActiveView()?.focus();
  };

  const result = target ? validateLine(value, target.max) : null;
  const error = result && 'error' in result ? result.error : null;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const view = getActiveView();
    if (!view || !result || !('line' in result)) return;
    dispatch({ type: 'overlay/set', overlay: null });
    goToLine(view, result.line);
  };

  return (
    <>
      <Scrim onPress={close} />
      <OverlayList label="Go to Line" testId="go-to-line">
        <OverlayInput
          ref={inputRef}
          className="mono"
          label="Line number"
          placeholder="Line number"
          inputMode="numeric"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          data-testid="go-to-line-input"
        />
        {target ? (
          <OverlayHint>
            Current line: {target.current}. Type a line number between 1 and {target.max}, then press Enter.
          </OverlayHint>
        ) : (
          <OverlayHint>Open a file to go to a line.</OverlayHint>
        )}
        {error && (
          <OverlayHint invalid>
            <span role="alert" data-testid="go-to-line-error">
              {error}
            </span>
          </OverlayHint>
        )}
      </OverlayList>
    </>
  );
}
