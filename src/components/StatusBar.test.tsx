import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StatusBar, EOL_CHANGED_MARKER, cursorLabel, indentLabel, toggleDocEol } from './StatusBar';
import { AppStoreProvider, createAppStore, createInitialState, type AppStoreHandle } from '../state/AppStore';
import { hasHandler, runCommand } from '../commands/registry';
import type { Doc } from '../types';

const PATH = 'C:\\ws\\src\\main.ts';

function makeDoc(patch: Partial<Doc> = {}): Doc {
  return {
    path: PATH,
    text: 'const a = 1;\n',
    savedText: 'const a = 1;\n',
    eol: 'lf',
    language: 'typescript',
    indent: { useTabs: false, size: 2 },
    readOnly: false,
    tooLarge: false,
    conflict: false,
    ...patch,
  };
}

function withDoc(patch: Partial<Doc> = {}): AppStoreHandle {
  return createAppStore(
    createInitialState({
      workspace: 'C:\\ws',
      tabs: [{ path: PATH, preview: false }],
      activeTab: PATH,
      docs: { [PATH]: makeDoc(patch) },
      cursor: { line: 30, col: 22, selLength: 0 },
    }),
  );
}

function renderBar(store: AppStoreHandle) {
  render(
    <AppStoreProvider store={store}>
      <StatusBar />
    </AppStoreProvider>,
  );
  return store;
}

const isDirty = (d: Doc) => d.text !== d.savedText;

afterEach(() => cleanup());

describe('status bar labels', () => {
  it('formats cursor and indentation', () => {
    expect(cursorLabel({ line: 3, col: 7, selLength: 0 })).toBe('Ln 3, Col 7');
    expect(cursorLabel({ line: 3, col: 7, selLength: 5 })).toBe('Ln 3, Col 7 (5 selected)');
    expect(indentLabel({ useTabs: false, size: 4 })).toBe('Spaces: 4');
    expect(indentLabel({ useTabs: true, size: 4 })).toBe('Tabs: 4');
  });
});

describe('StatusBar', () => {
  it('without a file: items are disabled, encoding is plain text, commands are not registered', () => {
    renderBar(createAppStore());
    expect(screen.getByText('No folder open')).toBeTruthy();
    expect((screen.getByTestId('status-language') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('status-indent') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('status-eol') as HTMLButtonElement).disabled).toBe(true);
    const enc = screen.getByTestId('status-encoding');
    expect(enc.tagName).toBe('SPAN');
    expect(enc.textContent).toBe('UTF-8');
    expect(screen.queryByTestId('status-cursor')).toBeNull();
    expect(hasHandler('editor.toggleEol')).toBe(false);
  });

  it('shows cursor, language, indentation and line ending of the active doc', () => {
    const store = renderBar(withDoc());
    expect(screen.getByTestId('status-cursor').textContent).toBe('Ln 30, Col 22');
    expect(screen.getByTestId('status-language').textContent).toBe('TypeScript');
    expect(screen.getByTestId('status-indent').textContent).toBe('Spaces: 2');
    expect(screen.getByTestId('status-eol').textContent).toBe('LF');
    act(() => store.dispatch({ type: 'cursor/set', cursor: { line: 2, col: 4, selLength: 3 } }));
    expect(screen.getByTestId('status-cursor').textContent).toBe('Ln 2, Col 4 (3 selected)');
  });

  it('clicking the line ending toggles LF/CRLF and marks the doc dirty; toggling back is clean', () => {
    const store = renderBar(withDoc());
    fireEvent.click(screen.getByTestId('status-eol'));
    expect(store.getState().docs[PATH].eol).toBe('crlf');
    expect(isDirty(store.getState().docs[PATH])).toBe(true);
    expect(screen.getByTestId('status-eol').textContent).toBe('CRLF');
    expect(screen.getByTestId('toast').textContent).toContain('CRLF');
    fireEvent.click(screen.getByTestId('status-eol'));
    expect(store.getState().docs[PATH].eol).toBe('lf');
    expect(isDirty(store.getState().docs[PATH])).toBe(false);
  });

  it('a save after the toggle clears the marker', () => {
    const store = withDoc();
    toggleDocEol(store, PATH);
    expect(store.getState().docs[PATH].savedText.endsWith(EOL_CHANGED_MARKER)).toBe(true);
    store.dispatch({ type: 'doc/setSaved', path: PATH, savedText: store.getState().docs[PATH].text });
    expect(isDirty(store.getState().docs[PATH])).toBe(false);
    expect(store.getState().docs[PATH].eol).toBe('crlf');
  });

  it('the language picker lists every mode and changes doc.language', () => {
    const store = renderBar(withDoc());
    fireEvent.click(screen.getByTestId('status-language'));
    const menu = screen.getByTestId('status-language-menu');
    expect(menu.querySelectorAll('.menu-item').length).toBe(12);
    fireEvent.click(screen.getByTestId('language-option-python'));
    expect(store.getState().docs[PATH].language).toBe('python');
    expect(screen.queryByTestId('status-language-menu')).toBeNull();
    expect(screen.getByTestId('status-language').textContent).toBe('Python');
  });

  it('the indentation picker changes doc.indent', () => {
    const store = renderBar(withDoc());
    fireEvent.click(screen.getByTestId('status-indent'));
    fireEvent.click(screen.getByTestId('indent-option-tabs-4'));
    expect(store.getState().docs[PATH].indent).toEqual({ useTabs: true, size: 4 });
    expect(screen.getByTestId('status-indent').textContent).toBe('Tabs: 4');
  });

  it('Escape closes the picker', () => {
    renderBar(withDoc());
    fireEvent.click(screen.getByTestId('status-indent'));
    fireEvent.keyDown(screen.getByTestId('status-indent-menu'), { key: 'Escape' });
    expect(screen.queryByTestId('status-indent-menu')).toBeNull();
  });

  it('wires editor.changeLanguage, editor.changeIndent and editor.toggleEol', () => {
    const store = renderBar(withDoc());
    act(() => {
      runCommand('editor.changeLanguage');
    });
    expect(screen.getByTestId('status-language-menu')).toBeTruthy();
    act(() => {
      runCommand('editor.changeLanguage', 'rust');
    });
    expect(store.getState().docs[PATH].language).toBe('rust');
    act(() => {
      runCommand('editor.changeIndent', { useTabs: false, size: 8 });
    });
    expect(store.getState().docs[PATH].indent).toEqual({ useTabs: false, size: 8 });
    act(() => {
      runCommand('editor.toggleEol');
    });
    expect(store.getState().docs[PATH].eol).toBe('crlf');
  });

  it('read-only docs show the marker and cannot toggle the line ending', () => {
    renderBar(withDoc({ readOnly: true }));
    expect(screen.getByTestId('status-readonly').textContent).toContain('Read-only');
    expect((screen.getByTestId('status-eol') as HTMLButtonElement).disabled).toBe(true);
  });
});
