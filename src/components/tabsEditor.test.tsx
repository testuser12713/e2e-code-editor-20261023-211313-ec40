import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { undo } from '@codemirror/commands';
import { AppStoreProvider, createAppStore, type AppStoreHandle } from '../state/AppStore';
import { openFile } from '../state/openFile';
import { api } from '../platform';
import { runCommand } from '../commands/registry';
import { getActiveView } from '../editor/keymaps';
import { TabBar } from './TabBar';
import { EditorPane } from './EditorPane';
import type { ReadFileResult } from '../types';

// jsdom has no layout: CodeMirror's measuring needs these Range methods to exist.
if (typeof Range !== 'undefined') {
  const empty = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);
}

const FILES: Record<string, ReadFileResult> = {
  'C:\\w\\a.ts': { content: 'const a = 1;\nconst b = 2;\nconst c = 3;\n', eol: 'lf', size: 40, tooLarge: false },
  'C:\\w\\b.md': { content: '# Title\r\ntext\r\n', eol: 'crlf', size: 15, tooLarge: false },
  'C:\\w\\c.py': { content: 'x = 1\n', eol: 'lf', size: 6, tooLarge: false },
  'C:\\w\\big.json': { content: '', eol: 'lf', size: 13_002_342, tooLarge: true },
};
const A = 'C:\\w\\a.ts';
const B = 'C:\\w\\b.md';
const C = 'C:\\w\\c.py';

function setup(): AppStoreHandle {
  vi.spyOn(api.fs, 'readFile').mockImplementation(async (p: string) => {
    const r = FILES[p];
    if (!r) throw new Error('not-found');
    return r;
  });
  vi.spyOn(api.fs, 'stat').mockImplementation(async (p: string) => ({ size: FILES[p]?.size ?? 0, mtimeMs: 0, isDir: false }));
  const store = createAppStore();
  render(
    <AppStoreProvider store={store}>
      <TabBar />
      <EditorPane />
    </AppStoreProvider>,
  );
  return store;
}

async function open(store: AppStoreHandle, path: string, opts: Parameters<typeof openFile>[1] = {}) {
  await act(async () => {
    await openFile(path, opts, store);
  });
}

function editorText(): string {
  return getActiveView()?.state.doc.toString() ?? '';
}

function typeInEditor(text: string) {
  const view = getActiveView();
  if (!view) throw new Error('no view');
  act(() => {
    view.dispatch({ changes: { from: 0, insert: text }, userEvent: 'input.type' });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('tabs and editor host', () => {
  it('shows the welcome screen while no tab is open', () => {
    setup();
    expect(screen.getByTestId('welcome')).toBeTruthy();
  });

  it('opens a preview tab in italics with the file text in the editor', async () => {
    const store = setup();
    await open(store, A, { preview: true });
    const tab = screen.getByTestId('tab-a.ts');
    expect(tab.className).toContain('is-preview');
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(editorText()).toBe(FILES[A].content);
    expect(screen.getByTestId('editor-host').querySelector('.cm-editor')).toBeTruthy();
  });

  it('a second preview replaces the first; double click makes a tab permanent', async () => {
    const store = setup();
    await open(store, A, { preview: true });
    await open(store, B, { preview: true });
    expect(screen.queryByTestId('tab-a.ts')).toBeNull();
    const tab = screen.getByTestId('tab-b.md');
    fireEvent.doubleClick(tab.querySelector('.tab-label') as Element);
    expect(screen.getByTestId('tab-b.md').className).not.toContain('is-preview');
    expect(editorText()).toBe('# Title\ntext\n');
  });

  it('typing makes a preview tab permanent and shows the dirty dot', async () => {
    const store = setup();
    await open(store, A, { preview: true });
    typeInEditor('// x\n');
    const tab = screen.getByTestId('tab-a.ts');
    expect(tab.className).not.toContain('is-preview');
    expect(tab.className).toContain('is-dirty');
    expect(store.getState().docs[A].text.startsWith('// x\n')).toBe(true);
  });

  it('keeps undo history per document across tab switches', async () => {
    const store = setup();
    await open(store, A);
    typeInEditor('X');
    await open(store, B);
    expect(editorText()).toBe('# Title\ntext\n');
    fireEvent.click(screen.getByTestId('tab-a.ts').querySelector('.tab-label') as Element);
    expect(editorText().startsWith('Xconst')).toBe(true);
    act(() => {
      undo(getActiveView()!);
    });
    expect(store.getState().docs[A].text).toBe(FILES[A].content);
  });

  it('cycles with tab.next / tab.prev and closes with tab.close and the close button', async () => {
    const store = setup();
    await open(store, A);
    await open(store, B);
    await open(store, C);
    act(() => void runCommand('tab.next'));
    expect(store.getState().activeTab).toBe(A);
    act(() => void runCommand('tab.prev'));
    expect(store.getState().activeTab).toBe(C);
    act(() => void runCommand('tab.close'));
    expect(store.getState().tabs.map((t) => t.path)).toEqual([A, B]);
    fireEvent.click(screen.getByRole('button', { name: 'Close a.ts' }));
    expect(store.getState().tabs.map((t) => t.path)).toEqual([B]);
    fireEvent(screen.getByTestId('tab-b.md'), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(store.getState().tabs).toEqual([]);
    expect(screen.getByTestId('welcome')).toBeTruthy();
  });

  it('reorders tabs by drag and drop', async () => {
    const store = setup();
    await open(store, A);
    await open(store, B);
    await open(store, C);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(screen.getByTestId('tab-a.ts'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('tab-c.py'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('tab-c.py'), { dataTransfer });
    expect(store.getState().tabs.map((t) => t.path)).toEqual([B, C, A]);
  });

  it('reveals the requested line', async () => {
    const store = setup();
    await open(store, A, { line: 3 });
    await waitFor(() => expect(store.getState().cursor.line).toBe(3));
    await open(store, A, { selectFrom: 6, selectTo: 7 });
    expect(store.getState().cursor).toMatchObject({ line: 1, selLength: 1 });
  });

  it('shows the read-only warning instead of the content of a file over 5 MB', async () => {
    const store = setup();
    await open(store, 'C:\\w\\big.json');
    expect(screen.getByTestId('large-file-message').textContent).toContain('This file is too large to edit');
    await waitFor(() => expect(screen.getByTestId('large-file-banner').textContent).toContain('big.json is 12.4 MB'));
    expect(screen.getByTestId('editor-host').querySelector('.cm-editor')).toBeNull();
    expect(screen.getByTestId('tab-big.json').querySelector('.tab-lock')).toBeTruthy();
    expect(store.getState().docs['C:\\w\\big.json'].readOnly).toBe(true);
  });

  it('pushes a reload from the store into the editor', async () => {
    const store = setup();
    await open(store, A);
    act(() => store.dispatch({ type: 'doc/reload', path: A, text: 'fresh\n', eol: 'lf' }));
    expect(editorText()).toBe('fresh\n');
    expect(screen.getByTestId('tab-a.ts').className).not.toContain('is-dirty');
  });
});
