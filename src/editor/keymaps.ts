import { Prec, type EditorState, type Extension, type StateCommand } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import {
  copyLineDown,
  moveLineDown,
  moveLineUp,
  redo,
  toggleComment as cmToggleComment,
  undo,
} from '@codemirror/commands';
import { selectNextOccurrence } from '@codemirror/search';
import { registerHandler } from '../commands/registry';

/**
 * Access to the editor view of the active tab, for commands that act on the
 * editor (toggle comment, move line, go to line, find …). The editor host
 * sets it whenever the active editor changes.
 */
let activeView: EditorView | null = null;

export function getActiveView(): EditorView | null {
  return activeView;
}

export function setActiveView(v: EditorView | null): void {
  activeView = v;
}

interface CommentTokens {
  line?: string;
  block?: { open: string; close: string };
}

const HTML_BLOCK = { open: '<!--', close: '-->' };

function hasCommentTokens(state: EditorState): boolean {
  for (const r of state.selection.ranges) {
    const data = state.languageDataAt<CommentTokens>('commentTokens', r.from);
    if (data.some((t) => t && (t.line || t.block))) return true;
  }
  return false;
}

/**
 * Fallback when the active language declares no comment tokens (Markdown
 * without data, plain HTML-like text): wraps every touched line in
 * `<!-- … -->`, or unwraps lines that are all already wrapped.
 */
export const toggleHtmlBlockLines: StateCommand = ({ state, dispatch }) => {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    let b = state.doc.lineAt(r.to).number;
    if (b > a && r.to === state.doc.line(b).from) b--;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  const targets = [...lines].sort((x, y) => x - y).map((n) => state.doc.line(n)).filter((l) => l.text.trim() !== '');
  if (targets.length === 0) return false;
  const { open, close } = HTML_BLOCK;
  const isWrapped = (t: string) => t.trimStart().startsWith(open) && t.trimEnd().endsWith(close);
  const unwrap = targets.every((l) => isWrapped(l.text));
  const changes = targets.flatMap((l): { from: number; to?: number; insert?: string }[] => {
    const indent = l.text.length - l.text.trimStart().length;
    const end = l.text.trimEnd().length;
    if (unwrap) {
      const openLen = l.text.startsWith(open + ' ', indent) ? open.length + 1 : open.length;
      const closeLen = l.text.slice(0, end).endsWith(' ' + close) ? close.length + 1 : close.length;
      return [
        { from: l.from + indent, to: l.from + indent + openLen },
        { from: l.from + end - closeLen, to: l.from + end },
      ];
    }
    return [
      { from: l.from + indent, insert: open + ' ' },
      { from: l.from + end, insert: ' ' + close },
    ];
  });
  dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'comment' }));
  return true;
};

/** Ctrl+/ — line comment with the language's own tokens, HTML block fallback. */
export const toggleLineComment: StateCommand = (target) => {
  if (hasCommentTokens(target.state)) return cmToggleComment(target);
  return toggleHtmlBlockLines(target);
};

/** Editing keymap: Ctrl+/, Alt+Up/Down, Shift+Alt+Down duplicate, Ctrl+Z/Y, Ctrl+D. */
export function editingKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Mod-/', run: toggleLineComment },
      { key: 'Alt-ArrowUp', run: moveLineUp },
      { key: 'Alt-ArrowDown', run: moveLineDown },
      { key: 'Shift-Alt-ArrowDown', run: copyLineDown },
      { key: 'Mod-z', run: undo, preventDefault: true },
      { key: 'Mod-y', run: redo, preventDefault: true },
      { key: 'Mod-Shift-z', run: redo, preventDefault: true },
      { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
    ]),
  );
}

function onActive(cmd: StateCommand | ((v: EditorView) => boolean)): () => void {
  return () => {
    const v = activeView;
    if (!v) return;
    (cmd as (t: EditorView) => boolean)(v);
    v.focus();
  };
}

/** Attaches the editor command ids to the active view. Returns a disposer. */
export function registerEditingCommands(): () => void {
  const offs = [
    registerHandler('editor.toggleComment', onActive(toggleLineComment)),
    registerHandler('editor.moveLineUp', onActive(moveLineUp)),
    registerHandler('editor.moveLineDown', onActive(moveLineDown)),
    registerHandler('editor.duplicateLine', onActive(copyLineDown)),
    registerHandler('editor.selectNext', onActive(selectNextOccurrence)),
  ];
  return () => offs.forEach((o) => o());
}

registerEditingCommands();
