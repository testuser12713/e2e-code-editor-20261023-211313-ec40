import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Api } from '../platform';
import type { DirEntry } from '../types';

const holder = vi.hoisted(() => ({ api: null as unknown as Api }));
const openFileMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../platform')>();
  return {
    ...actual,
    get api() {
      return holder.api;
    },
  };
});

vi.mock('../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../state/actions')>();
  return { ...actual, openFile: openFileMock };
});

import { createDemoApi } from '../platform/demoFs';
import { AppStoreProvider, createAppStore, createInitialState, type AppStoreHandle } from '../state/AppStore';
import {
  Explorer,
  ROW_HEIGHT,
  baseName,
  flattenTree,
  joinPath,
  onExplorerContextMenu,
  parentPath,
  pathKey,
  pathSep,
  samePath,
  sortEntries,
  visibleRange,
} from './Explorer';

const ROOT = 'C:\\Work\\my-project';

const FILES: Record<string, string> = {
  'README.md': '# hi\n',
  'b.txt': 'b\n',
  'A.ts': 'a\n',
  'src\\main.ts': 'x\n',
  'src\\util\\path.ts': 'y\n',
  'docs\\usage.md': 'z\n',
  'node_modules\\pkg\\index.js': 'n\n',
  '.git\\HEAD': 'ref\n',
};

function setup(files: Record<string, string> = FILES, workspace: string | null = ROOT, activeTab: string | null = null) {
  holder.api = createDemoApi({ root: ROOT, files });
  const readDir = vi.spyOn(holder.api.fs, 'readDir');
  const store: AppStoreHandle = createAppStore(createInitialState({ workspace, activeTab }));
  const utils = render(
    <AppStoreProvider store={store}>
      <Explorer />
    </AppStoreProvider>,
  );
  return { ...utils, store, readDir };
}

function rowNames(): string[] {
  return within(screen.getByTestId('explorer-tree'))
    .getAllByRole('treeitem')
    .map((li) => li.querySelector('.tree-name')?.textContent ?? '');
}

beforeEach(() => {
  openFileMock.mockClear();
  // Session sync (inside the provider) must not restore anything into the tests.
  holder.api = createDemoApi({ root: ROOT, files: FILES });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('explorer path helpers', () => {
  it('handles Windows backslash paths', () => {
    expect(pathSep(ROOT)).toBe('\\');
    expect(baseName(ROOT)).toBe('my-project');
    expect(baseName(ROOT + '\\')).toBe('my-project');
    expect(parentPath('C:\\Work\\my-project\\src\\main.ts')).toBe('C:\\Work\\my-project\\src');
    expect(parentPath('C:\\Work')).toBe('C:\\');
    expect(parentPath('C:\\')).toBeNull();
    expect(joinPath(ROOT, 'src')).toBe('C:\\Work\\my-project\\src');
    expect(joinPath('C:\\', 'src')).toBe('C:\\src');
  });

  it('compares Windows paths case-insensitively and with either separator', () => {
    expect(samePath('C:\\Work\\My-Project\\A.ts', 'c:/work/my-project/a.ts')).toBe(true);
    expect(samePath('C:\\Work\\a.ts', 'C:\\Work\\b.ts')).toBe(false);
    expect(pathKey('C:\\Work\\Dir\\')).toBe('c:\\work\\dir');
    expect(samePath(null, ROOT)).toBe(false);
  });

  it('handles POSIX paths exactly', () => {
    expect(pathSep('/home/me/proj')).toBe('/');
    expect(baseName('/home/me/proj')).toBe('proj');
    expect(parentPath('/home')).toBe('/');
    expect(parentPath('/')).toBeNull();
    expect(joinPath('/home/me', 'x')).toBe('/home/me/x');
    expect(samePath('/a/B', '/a/b')).toBe(false);
  });
});

describe('tree ordering and flattening', () => {
  const e = (name: string, isDir: boolean): DirEntry => ({ name, path: `${ROOT}\\${name}`, isDir });

  it('sorts folders first, then files, alphabetically, and hides node_modules and .git', () => {
    const sorted = sortEntries([e('b.txt', false), e('node_modules', true), e('src', true), e('A.ts', false), e('.git', true), e('Docs', true), e('file10.txt', false), e('file2.txt', false)]);
    expect(sorted.map((x) => x.name)).toEqual(['Docs', 'src', 'A.ts', 'b.txt', 'file2.txt', 'file10.txt']);
  });

  it('flattens only expanded and loaded folders, with depth', () => {
    const src = e('src', true);
    const children = new Map<string, DirEntry[]>([
      [pathKey(ROOT), [src, e('a.ts', false)]],
      [pathKey(src.path), [{ name: 'main.ts', path: `${src.path}\\main.ts`, isDir: false }]],
    ]);
    expect(flattenTree(ROOT, children, new Set()).map((r) => r.type === 'entry' && r.entry.name)).toEqual(['src', 'a.ts']);
    const open = flattenTree(ROOT, children, new Set([pathKey(src.path)]));
    expect(open.map((r) => (r.type === 'entry' ? `${r.depth}:${r.entry.name}` : 'error'))).toEqual(['0:src', '1:main.ts', '0:a.ts']);
  });

  it('computes a bounded window of rows', () => {
    const { first, last } = visibleRange(0, 240, 10000);
    expect(first).toBe(0);
    expect(last).toBeLessThan(40);
    const mid = visibleRange(5000 * ROW_HEIGHT, 240, 10000);
    expect(mid.first).toBeGreaterThan(4900);
    expect(mid.last - mid.first).toBeLessThan(50);
    expect(visibleRange(0, 240, 3).last).toBe(3);
  });
});

describe('<Explorer />', () => {
  it('shows the empty state with an Open Folder button that opens a workspace', async () => {
    const { store } = setup(FILES, null);
    expect(screen.getByText('No folder opened')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await waitFor(() => expect(store.getState().workspace).toBe(ROOT));
  });

  it('shows the folder name and the root entries, folders first, without node_modules or .git', async () => {
    setup();
    expect(screen.getByTestId('explorer-folder-name').textContent).toBe('my-project');
    await screen.findByTestId('explorer-tree');
    expect(screen.getByRole('tree', { name: 'Files in my-project' })).toBeTruthy();
    expect(rowNames()).toEqual(['docs', 'src', 'A.ts', 'b.txt', 'README.md']);
  });

  it('loads a folder lazily on expand and collapses it again', async () => {
    const { readDir } = setup();
    await screen.findByTestId('explorer-tree');
    expect(readDir).toHaveBeenCalledTimes(1);
    expect(readDir).toHaveBeenCalledWith(ROOT);

    fireEvent.click(screen.getByTestId('tree-row-src'));
    await waitFor(() => expect(rowNames()).toEqual(['docs', 'src', 'util', 'main.ts', 'A.ts', 'b.txt', 'README.md']));
    expect(readDir).toHaveBeenLastCalledWith(`${ROOT}\\src`);
    const srcItem = screen.getByTestId('tree-row-src').closest('li');
    expect(srcItem?.getAttribute('aria-expanded')).toBe('true');
    expect((screen.getByTestId('tree-row-main.ts') as HTMLElement).style.getPropertyValue('--depth')).toBe('1');

    fireEvent.click(screen.getByTestId('tree-row-src'));
    expect(rowNames()).toEqual(['docs', 'src', 'A.ts', 'b.txt', 'README.md']);
    // expanding again uses the loaded children
    fireEvent.click(screen.getByTestId('tree-row-src'));
    expect(rowNames()).toContain('main.ts');
    expect(readDir).toHaveBeenCalledTimes(2);
  });

  it('opens a preview tab on click and a permanent tab on double click', async () => {
    setup();
    await screen.findByTestId('explorer-tree');
    fireEvent.click(screen.getByTestId('tree-row-A.ts'));
    expect(openFileMock).toHaveBeenLastCalledWith(`${ROOT}\\A.ts`, { preview: true });
    fireEvent.doubleClick(screen.getByTestId('tree-row-A.ts'));
    expect(openFileMock).toHaveBeenLastCalledWith(`${ROOT}\\A.ts`, { preview: false });
  });

  it('navigates with the keyboard: arrows move, right expands, left goes to the parent', async () => {
    setup();
    await screen.findByTestId('explorer-tree');
    const docs = screen.getByTestId('tree-row-docs');
    docs.focus();
    fireEvent.keyDown(docs, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('tree-row-src'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    await waitFor(() => expect(rowNames()).toContain('main.ts'));
    fireEvent.keyDown(screen.getByTestId('tree-row-src'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('tree-row-util'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByTestId('tree-row-src'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('tree-row-README.md'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });
    expect(openFileMock).toHaveBeenLastCalledWith(`${ROOT}\\README.md`, { preview: false });
  });

  it('re-reads the disk when explorerVersion changes', async () => {
    const { store } = setup();
    await screen.findByTestId('explorer-tree');
    fireEvent.click(screen.getByTestId('tree-row-src'));
    await waitFor(() => expect(rowNames()).toContain('main.ts'));
    await holder.api.fs.createFile(`${ROOT}\\src\\added.ts`);
    await holder.api.fs.createDir(`${ROOT}\\aaa`);
    act(() => store.dispatch({ type: 'explorer/bump' }));
    await waitFor(() => expect(rowNames()).toEqual(['aaa', 'docs', 'src', 'util', 'added.ts', 'main.ts', 'A.ts', 'b.txt', 'README.md']));
  });

  it('marks the active tab file and hands a right-clicked node to the context menu', async () => {
    setup(FILES, ROOT, `${ROOT}\\b.txt`);
    await screen.findByTestId('explorer-tree');
    expect(screen.getByTestId('tree-row-b.txt').className).toContain('is-active');

    const requests: unknown[] = [];
    const off = onExplorerContextMenu((r) => requests.push(r));
    fireEvent.contextMenu(screen.getByTestId('tree-row-docs'), { clientX: 10, clientY: 20 });
    off();
    expect(requests).toEqual([{ node: { name: 'docs', path: `${ROOT}\\docs`, isDir: true }, x: 10, y: 20 }]);
    expect(screen.getByTestId('tree-row-docs').className).toContain('is-menu-target');
  });

  it('renders only a window of rows for a folder with 10,000 files', async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 10000; i++) many[`file${String(i).padStart(5, '0')}.txt`] = '';
    setup(many);
    await screen.findByTestId('explorer-tree');
    const items = within(screen.getByTestId('explorer-tree')).getAllByRole('treeitem');
    expect(items.length).toBeGreaterThan(10);
    expect(items.length).toBeLessThan(200);
    expect(rowNames()[0]).toBe('file00000.txt');
  });
});
