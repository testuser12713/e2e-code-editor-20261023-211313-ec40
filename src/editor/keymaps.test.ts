// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState, type StateCommand } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { editingKeymap, setActiveView, toggleLineComment, toggleHtmlBlockLines } from './keymaps';
import { runCommand, hasHandler } from '../commands/registry';

function run(cmd: StateCommand, doc: string, ext: unknown[] = [], cursor = 0): string {
  let state = EditorState.create({ doc, selection: { anchor: cursor }, extensions: ext as never });
  cmd({ state, dispatch: (tr) => { state = tr.state; } });
  return state.doc.toString();
}

describe('toggleLineComment', () => {
  it('uses // for JavaScript and toggles back', () => {
    const once = run(toggleLineComment, 'let a = 1;', [javascript()]);
    expect(once).toBe('// let a = 1;');
    expect(run(toggleLineComment, once, [javascript()])).toBe('let a = 1;');
  });
  it('uses # for Python', () => {
    expect(run(toggleLineComment, 'x = 1', [python()])).toBe('# x = 1');
  });
  it('uses <!-- --> for HTML', () => {
    expect(run(toggleLineComment, '<p>hi</p>', [html()])).toContain('<!--');
  });
  it('falls back to HTML block comments without language data', () => {
    const once = run(toggleLineComment, '# Title', []);
    expect(once).toBe('<!-- # Title -->');
    expect(run(toggleHtmlBlockLines, once, [])).toBe('# Title');
  });
});

describe('editor commands', () => {
  let view: EditorView | null = null;
  afterEach(() => { view?.destroy(); setActiveView(null); });

  function make(doc: string, cursor: number) {
    view = new EditorView({
      state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: [editingKeymap(), javascript()] }),
      parent: document.body,
    });
    setActiveView(view);
    return view;
  }

  it('registers the editor command handlers', () => {
    for (const id of ['editor.toggleComment', 'editor.moveLineUp', 'editor.moveLineDown', 'editor.duplicateLine']) {
      expect(hasHandler(id)).toBe(true);
    }
  });
  it('moves lines down and up', () => {
    const v = make('a\nb\nc', 0);
    runCommand('editor.moveLineDown');
    expect(v.state.doc.toString()).toBe('b\na\nc');
    runCommand('editor.moveLineUp');
    expect(v.state.doc.toString()).toBe('a\nb\nc');
  });
  it('duplicates the current line', () => {
    const v = make('a\nb', 2);
    runCommand('editor.duplicateLine');
    expect(v.state.doc.toString()).toBe('a\nb\nb');
  });
  it('toggles comment through the command', () => {
    const v = make('x()', 0);
    runCommand('editor.toggleComment');
    expect(v.state.doc.toString()).toBe('// x()');
  });
  it('does nothing without an active view', () => {
    expect(() => runCommand('editor.moveLineUp')).not.toThrow();
  });
});
