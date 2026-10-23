import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Settings } from '../types';

/**
 * Editor extensions that depend on the settings (font, tab size, insert
 * spaces, word wrap, line numbers), held in compartments so a change applies
 * live to every open editor.
 * Skeleton: final signatures, inert bodies — filled by "Implement settings
 * view and themes".
 */
export function settingsExtensions(s: Settings): Extension {
  void s;
  return [];
}

/** Reconfigures an existing editor for new settings. */
export function applySettingsToView(view: EditorView, s: Settings): void {
  void view;
  void s;
}
