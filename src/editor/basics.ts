import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import {
  lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars, keymap,
} from '@codemirror/view';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { selectNextOccurrence, highlightSelectionMatches } from '@codemirror/search';
import { registerHandler } from '../commands/registry';
import { getActiveView } from './keymaps';

// editor.selectNext from the palette / menu acts on the active editor.
registerHandler('editor.selectNext', () => {
  const view = getActiveView();
  if (view) {
    selectNextOccurrence(view);
    view.focus();
  }
});

/**
 * The editing basics every editor gets: line numbers, active line, bracket
 * matching, auto-closing brackets, auto-indent, code folding, multiple
 * cursors, history and the default keymaps.
 */
export function basicExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
    foldGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightSelectionMatches(),
    keymap.of([
      { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
  ];
}
