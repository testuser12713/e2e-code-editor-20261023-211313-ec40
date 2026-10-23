// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { FindBar, buildQuery, countMatches, counterLabel, regexError } from './FindBar';
import { AppStoreProvider, createAppStore, createInitialState, type AppStoreHandle } from '../state/AppStore';
import { hasHandler, runCommand } from '../commands/registry';
import { setActiveView } from '../editor/keymaps';
import type { Doc } from '../types';

const PATH = 'C:\\ws\\src\\notes.ts';
const TEXT = 'cache one\ncache two\nmy cache three\ncached\n';

function makeDoc(text: string): Doc {
  return {
    path: PATH,
    text,
    savedText: text,
    eol: 'lf',
    language: 'typescript',
    indent: { useTabs: false, size: 2 },
    readOnly: false,
    tooLarge: false,
    conflict: false,
  };
}

let view: EditorView | null = null;

function setup(text = TEXT): { store: AppStoreHandle; view: EditorView } {
  view = new EditorView({ state: EditorState.create({ doc: text }), parent: document.body });
  setActiveView(view);
  const store = createAppStore(
    createInitialState({
      workspace: 'C:\\ws',
      tabs: [{ path: PATH, preview: false }],
      activeTab: PATH,
      docs: { [PATH]: makeDoc(text) },
    }),
  );
  render(
    <AppStoreProvider store={store}>
      <FindBar />
    </AppStoreProvider>,
  );
  return { store, view };
}

afterEach(() => {
  cleanup();
  view?.destroy();
  view = null;
  setActiveView(null);
});

const typeFind = (value: string) => fireEvent.change(screen.getByTestId('find-input'), { target: { value } });

describe('find helpers', () => {
  it('counts matches and finds the selected one', () => {
    const state = EditorState.create({ doc: TEXT, selection: { anchor: 10, head: 15 } });
    const q = buildQuery('cache', '', { caseSensitive: false, wholeWord: false, regex: false });
    expect(countMatches(state, q)).toEqual({ total: 4, current: 2, capped: false });
    const word = buildQuery('cache', '', { caseSensitive: false, wholeWord: true, regex: false });
    expect(countMatches(state, word).total).toBe(3);
  });

  it('labels the counter', () => {
    expect(counterLabel('', false, { total: 0, current: 0, capped: false })).toBe('No results');
    expect(counterLabel('x', false, { total: 9, current: 1, capped: false })).toBe('1 of 9');
    expect(counterLabel('x', true, { total: 0, current: 0, capped: false })).toBe('—');
  });

  it('reports invalid regular expressions only in regex mode', () => {
    expect(regexError('(abc', false)).toBeNull();
    expect(regexError('(abc', true)).toMatch(/^Invalid regular expression: /);
    expect(regexError('a+b', true)).toBeNull();
  });
});

describe('FindBar', () => {
  it('registers view.find and view.replace', () => {
    setup();
    expect(hasHandler('view.find')).toBe(true);
    expect(hasHandler('view.replace')).toBe(true);
  });

  it('opens on view.find with a live match counter', () => {
    setup();
    expect(screen.queryByTestId('find-bar')).toBeNull();
    act(() => {
      runCommand('view.find');
    });
    expect(screen.getByTestId('find-bar')).toBeTruthy();
    expect(screen.queryByTestId('replace-input')).toBeNull();
    expect(screen.getByTestId('find-count').textContent).toBe('No results');
    typeFind('cache');
    expect(screen.getByTestId('find-count').textContent).toBe('1 of 4');
    fireEvent.click(screen.getByTestId('find-next'));
    expect(screen.getByTestId('find-count').textContent).toBe('2 of 4');
    fireEvent.click(screen.getByTestId('find-prev'));
    expect(screen.getByTestId('find-count').textContent).toBe('1 of 4');
    fireEvent.click(screen.getByTestId('find-toggle-word'));
    expect(screen.getByTestId('find-count').textContent).toBe('1 of 3');
    typeFind('missing');
    expect(screen.getByTestId('find-count').textContent).toBe('No results');
  });

  it('shows the invalid-regex error only after the user typed', () => {
    const { view: v } = setup('(abc def\n');
    // A selection seeds the field without counting as typing.
    v.dispatch({ selection: { anchor: 0, head: 4 } });
    act(() => {
      runCommand('view.find');
    });
    expect((screen.getByTestId('find-input') as HTMLInputElement).value).toBe('(abc');
    fireEvent.click(screen.getByTestId('find-toggle-regex'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('find-count').textContent).toBe('—');

    typeFind('(ab');
    expect(screen.getByRole('alert').textContent).toMatch(/^Invalid regular expression: /);
    expect(screen.getByTestId('find-input').getAttribute('aria-invalid')).toBe('true');

    typeFind('\\(ab');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('find-count').textContent).toBe('1 of 1');
  });

  it('replaces one match and then all matches', () => {
    const { view: v } = setup();
    act(() => {
      runCommand('view.replace');
    });
    typeFind('cache');
    fireEvent.change(screen.getByTestId('replace-input'), { target: { value: 'memo' } });
    fireEvent.click(screen.getByTestId('find-replace-one'));
    expect(v.state.doc.toString()).toBe('memo one\ncache two\nmy cache three\ncached\n');
    fireEvent.click(screen.getByTestId('find-replace-all'));
    expect(v.state.doc.toString()).toBe('memo one\nmemo two\nmy memo three\nmemod\n');
    expect(screen.getByTestId('find-count').textContent).toBe('No results');
  });

  it('closes on Escape and removes the highlighting', () => {
    const { store } = setup();
    act(() => {
      runCommand('view.find');
    });
    typeFind('cache');
    fireEvent.keyDown(screen.getByTestId('find-input'), { key: 'Escape' });
    expect(store.getState().findOpen).toBeNull();
    expect(screen.queryByTestId('find-bar')).toBeNull();
  });
});
