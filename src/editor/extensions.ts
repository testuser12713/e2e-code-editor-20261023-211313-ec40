import type { Extension } from '@codemirror/state';
import type { Doc, Settings } from '../types';

export interface EditorExtensionOptions {
  doc: Doc;
  settings: Settings;
  /** Called with the new (LF) text after every change. */
  onDocChanged?: (text: string) => void;
  /** Called with the 1-based cursor position and the selection length. */
  onCursor?: (cursor: { line: number; col: number; selLength: number }) => void;
}

/**
 * The full extension set of one editor: basics, language, highlighting,
 * editing keymap, settings compartments, read-only state and the change and
 * cursor listeners.
 * Skeleton: final signature, inert body — filled by "Implement tabs and the
 * CodeMirror editor host".
 */
export function buildExtensions(opts: EditorExtensionOptions): Extension[] {
  void opts;
  return [];
}
