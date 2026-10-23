import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import type { Doc, Settings } from '../types';
import { basicExtensions } from './basics';
import { highlightExtension, languageExtension } from './languages';
import { editingKeymap } from './keymaps';
import { settingsExtensions } from './settingsExtensions';

export interface EditorExtensionOptions {
  doc: Doc;
  settings: Settings;
  /** Called with the new (LF) text after every change. */
  onDocChanged?: (text: string) => void;
  /** Called with the 1-based cursor position and the selection length. */
  onCursor?: (cursor: { line: number; col: number; selLength: number }) => void;
}

/**
 * Marks a transaction that brings the editor in line with the store (reload
 * from disk, save transform). Such a change is not reported back through
 * onDocChanged — the store already holds that text.
 */
export const syncFromStore = Annotation.define<boolean>();

/** Per-document indentation (tabs or spaces and their width). */
export const indentCompartment = new Compartment();
/** Read-only state of a document (large files). */
export const readOnlyCompartment = new Compartment();

/** The indentation extensions of a doc. */
export function indentExtension(indent: Doc['indent']): Extension {
  const size = Number.isInteger(indent.size) && indent.size > 0 && indent.size <= 16 ? indent.size : 4;
  return [indentUnit.of(indent.useTabs ? '\t' : ' '.repeat(size)), EditorState.tabSize.of(size)];
}

export function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

/** 1-based line/column of the main selection head plus the selected length. */
export function cursorOf(state: EditorState): { line: number; col: number; selLength: number } {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.head);
  let selLength = 0;
  for (const r of state.selection.ranges) selLength += r.to - r.from;
  return { line: line.number, col: main.head - line.from + 1, selLength };
}

/**
 * The full extension set of one editor: basics, language, highlighting,
 * editing keymap, settings compartments, read-only state and the change and
 * cursor listeners.
 */
export function buildExtensions(opts: EditorExtensionOptions): Extension[] {
  const { doc, settings, onDocChanged, onCursor } = opts;
  return [
    editingKeymap(),
    basicExtensions(),
    languageExtension(doc.language),
    highlightExtension(),
    settingsExtensions(settings),
    indentCompartment.of(indentExtension(doc.indent)),
    readOnlyCompartment.of(readOnlyExtension(doc.readOnly)),
    EditorView.contentAttributes.of({ 'aria-label': `Editor: ${baseName(doc.path)}` }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && onDocChanged) {
        const fromStore = update.transactions.every((tr) => tr.annotation(syncFromStore) === true);
        if (!fromStore) onDocChanged(update.state.doc.toString());
      }
      if ((update.selectionSet || update.docChanged) && onCursor) onCursor(cursorOf(update.state));
    }),
  ];
}

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}
