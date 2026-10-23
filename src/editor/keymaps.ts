import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

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

/**
 * Editing keymap: Ctrl+/ toggle line comment, Alt+Up/Down move line,
 * duplicate line, Ctrl+D select next occurrence.
 * Skeleton: final signature, inert body — filled by "Add editing keymaps for
 * comments and line moves" (tests in keymaps.test.ts).
 */
export function editingKeymap(): Extension {
  return [];
}
