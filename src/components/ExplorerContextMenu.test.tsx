import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ExplorerContextMenu, depthIn } from './ExplorerContextMenu';
import { AppStoreProvider, createAppStore, createInitialState, type AppAction, type AppStoreHandle } from '../state/AppStore';
import { Explorer } from '../views/Explorer';
import { api } from '../platform';
import { DEMO_ROOT } from '../platform/demoFs';

const WS = DEMO_ROOT;

/** The real explorer view inside the sidebar, as App renders it, plus the menu. */
function Harness({ store }: { store: AppStoreHandle }) {
  return (
    <AppStoreProvider store={store}>
      <aside data-testid="sidebar" data-view="explorer">
        <Explorer />
      </aside>
      <ExplorerContextMenu />
    </AppStoreProvider>
  );
}

async function setup(overrides: Parameters<typeof createInitialState>[0] = {}) {
  const store = createAppStore(createInitialState({ workspace: WS, ...overrides }));
  const dispatch = store.dispatch;
  const actions: AppAction[] = [];
  store.dispatch = (a: AppAction) => {
    actions.push(a);
    dispatch(a);
  };
  render(<Harness store={store} />);
  await screen.findByTestId('tree-row-package.json');
  return Object.assign(store, { actions });
}

/** Expands the top-level src folder of the demo workspace and returns the row of src\\index.ts. */
async function nestedIndexRow(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId('tree-row-src'));
  return screen.findByTestId('tree-row-index.ts');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('depthIn', () => {
  it('counts the folders between the workspace and the entry', () => {
    expect(depthIn(WS, WS)).toBe(-1);
    expect(depthIn(WS, `${WS}\\package.json`)).toBe(0);
    expect(depthIn(WS, `${WS}\\src\\api\\cache.ts`)).toBe(2);
    expect(depthIn('/home/u/ws', '/home/u/ws/src/a.ts')).toBe(1);
  });
});

describe('ExplorerContextMenu', () => {
  it('opens on right-click of a file with every operation, and marks the row', async () => {
    await setup();
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'), { clientX: 40, clientY: 60 });
    const menu = screen.getByRole('menu', { name: 'Explorer actions' });
    const labels = Array.from(menu.querySelectorAll('.menu-item')).map((b) => b.querySelector('span')?.textContent);
    expect(labels).toEqual(['New File', 'New Folder', 'Rename', 'Delete', 'Reveal in File Explorer', 'Copy Path']);
    expect(menu.querySelectorAll('.menu-item[disabled]')).toHaveLength(0);
    expect(screen.getByTestId('tree-row-package.json').classList.contains('is-menu-target')).toBe(true);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByTestId('tree-row-package.json').classList.contains('is-menu-target')).toBe(false);
  });

  it('does nothing without a workspace', () => {
    const store = createAppStore(createInitialState({ workspace: null }));
    render(<Harness store={store} />);
    fireEvent.contextMenu(screen.getByTestId('explorer-empty'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens once per right-click on a row (the explorer hand-off, not a second DOM listener)', async () => {
    await setup();
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    // the root-only state would disable Rename: the row's own node was used
    expect((screen.getByTestId('ctx-rename') as HTMLButtonElement).disabled).toBe(false);
  });

  it('acts on the exact nested path the explorer hands over', async () => {
    await setup();
    const trash = vi.spyOn(api.fs, 'trash').mockResolvedValue(undefined);
    const row = await nestedIndexRow();
    fireEvent.contextMenu(row, { clientX: 30, clientY: 80 });
    fireEvent.click(screen.getByTestId('ctx-delete'));
    expect(screen.getByRole('alertdialog').textContent).toContain('Delete index.ts?');
    fireEvent.click(screen.getByTestId('delete-confirm'));
    await waitFor(() => expect(trash).toHaveBeenCalledWith(`${WS}\\src\\index.ts`));
    expect(trash).toHaveBeenCalledTimes(1);
  });

  it('New File creates the file in the folder and bumps the explorer', async () => {
    const store = await setup();
    const create = vi.spyOn(api.fs, 'createFile');
    const before = store.getState().explorerVersion;
    await nestedIndexRow(); // src is expanded
    fireEvent.contextMenu(screen.getByTestId('tree-row-src'));
    fireEvent.click(screen.getByTestId('ctx-new-file'));
    const input = screen.getByTestId('explorer-name-input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBeNull(); // starts neutral
    fireEvent.change(input, { target: { value: 'created-by-menu.ts' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledWith(`${WS}\\src\\created-by-menu.ts`));
    await waitFor(() => expect(store.getState().explorerVersion).toBeGreaterThan(before));
    expect(screen.queryByTestId('explorer-name-input')).toBeNull();
    expect(screen.getByTestId('toast').textContent).toBe('File created');
    // the new file appears in the real tree at once
    expect(await screen.findByTestId('tree-row-created-by-menu.ts')).toBeTruthy();
  });

  it('regression: New File on a collapsed folder makes the new file appear in the tree at once', async () => {
    await setup();
    // test\ is collapsed: right-click it, New File, type a name, Enter
    expect(screen.queryByTestId('tree-row-args.test.ts')).toBeNull();
    fireEvent.contextMenu(screen.getByTestId('tree-row-test'));
    fireEvent.click(screen.getByTestId('ctx-new-file'));
    const input = screen.getByTestId('explorer-name-input');
    fireEvent.change(input, { target: { value: 'from-collapsed.txt' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const row = await screen.findByTestId('tree-row-from-collapsed.txt');
    expect(row.closest('[role="treeitem"]')?.textContent).toBe('from-collapsed.txt');
    // the folder it went into is open, and the new entry is selected
    expect(screen.getByTestId('tree-row-test').closest('[role="treeitem"]')?.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(row.closest('[role="treeitem"]')?.getAttribute('aria-selected')).toBe('true'));
    expect(await api.fs.stat(`${WS}\\test\\from-collapsed.txt`)).toMatchObject({ isDir: false });
  });

  it('a name with angle brackets is never inserted as HTML: the validation message and a disk entry stay plain text', async () => {
    await setup();
    const create = vi.spyOn(api.fs, 'createFile');
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'));
    fireEvent.click(screen.getByTestId('ctx-new-file'));
    const input = screen.getByTestId('explorer-name-input');
    fireEvent.change(input, { target: { value: '<b>bold.txt' } });
    expect(screen.getByRole('alert').textContent).toMatch(/cannot contain/);
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => {});
    expect(create).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    // An entry with such a name that already exists on disk (allowed outside Windows) shows as text.
    await act(async () => {
      await api.fs.writeFile(`${WS}\\<b>bold.txt`, 'x');
    });
    const row = await screen.findByTestId('tree-row-<b>bold.txt');
    expect(row.textContent).toBe('<b>bold.txt');
    expect(row.querySelector('b')).toBeNull();
    await act(async () => {
      await api.fs.trash(`${WS}\\<b>bold.txt`);
    });
  });

  it('New Folder on a file creates the folder next to it', async () => {
    await setup();
    const createDir = vi.spyOn(api.fs, 'createDir');
    fireEvent.contextMenu(await nestedIndexRow());
    fireEvent.click(screen.getByTestId('ctx-new-folder'));
    const input = screen.getByTestId('explorer-name-input');
    fireEvent.change(input, { target: { value: 'helpers' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(createDir).toHaveBeenCalledWith(`${WS}\\src\\helpers`));
  });

  it('shows a validation error for an invalid name and does not call the file system', async () => {
    await setup();
    const create = vi.spyOn(api.fs, 'createFile');
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'));
    fireEvent.click(screen.getByTestId('ctx-new-file'));
    const input = screen.getByTestId('explorer-name-input');
    fireEvent.change(input, { target: { value: 'bad:name' } });
    expect(screen.getByRole('alert').textContent).toMatch(/cannot contain/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => {});
    expect(create).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('explorer-name-input')).toBeNull();
  });

  it('reports an existing sibling name', async () => {
    await setup();
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'));
    fireEvent.click(screen.getByTestId('ctx-new-file'));
    const input = screen.getByTestId('explorer-name-input');
    await act(async () => {}); // sibling listing
    fireEvent.change(input, { target: { value: 'PACKAGE.json' } });
    expect(screen.getByRole('alert').textContent).toMatch(/already exists/);
  });

  it('Rename renames on disk and lets open tabs follow', async () => {
    const store = await setup();
    const from = `${WS}\\package.json`;
    const rename = vi.spyOn(api.fs, 'rename').mockResolvedValue(undefined);
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'));
    fireEvent.click(screen.getByTestId('ctx-rename'));
    const input = screen.getByTestId('explorer-name-input') as HTMLInputElement;
    expect(input.value).toBe('package.json');
    fireEvent.change(input, { target: { value: 'pkg.json' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(rename).toHaveBeenCalledWith(from, `${WS}\\pkg.json`));
    await waitFor(() => expect(store.actions).toContainEqual({ type: 'path/rename', from, to: `${WS}\\pkg.json` }));
    expect(screen.getByTestId('toast').textContent).toBe('Renamed to pkg.json');
  });

  it('Delete asks for confirmation; Cancel keeps the file', async () => {
    await setup();
    const trash = vi.spyOn(api.fs, 'trash').mockResolvedValue(undefined);
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'));
    fireEvent.click(screen.getByTestId('ctx-delete'));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Delete package.json?');
    expect(dialog.textContent).toContain('Recycle Bin');
    expect(trash).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('delete-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(trash).not.toHaveBeenCalled();
  });

  it('Delete confirmed moves to the trash, closes the clean tab and bumps the explorer', async () => {
    const path = `${WS}\\package.json`;
    const store = await setup({ tabs: [{ path, preview: false }], activeTab: path });
    const trash = vi.spyOn(api.fs, 'trash').mockResolvedValue(undefined);
    const before = store.getState().explorerVersion;
    fireEvent.contextMenu(screen.getByTestId('tree-row-package.json'));
    fireEvent.click(screen.getByTestId('ctx-delete'));
    fireEvent.click(screen.getByTestId('delete-confirm'));
    await waitFor(() => expect(trash).toHaveBeenCalledWith(path));
    await waitFor(() => expect(store.getState().explorerVersion).toBeGreaterThan(before));
    expect(store.actions).toContainEqual({ type: 'tab/close', path });
    expect(screen.getByTestId('toast').textContent).toBe('package.json moved to the Recycle Bin');
  });

  it('regression: the delete confirmation is a dialog whose confirm button is named for deleting and removes the file from the tree', async () => {
    await setup();
    await act(async () => {
      await api.fs.writeFile(`${WS}\\delete-me.txt`, 'x');
    });
    const row = await screen.findByTestId('tree-row-delete-me.txt');
    fireEvent.contextMenu(row, { clientX: 20, clientY: 40 });
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete delete-me.txt?' });
    // the query an end-to-end check uses to find the confirm button
    const confirm = within(dialog).getByRole('button', { name: /delete|yes|ok/i });
    // the visible label stays the design's (explorer-context-menu: "Move to Recycle Bin")
    expect(confirm.textContent).toBe('Move to Recycle Bin');
    expect(within(dialog).getAllByRole('button', { name: /delete|yes|ok/i })).toHaveLength(1);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByTestId('tree-row-delete-me.txt')).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await expect(api.fs.stat(`${WS}\\delete-me.txt`)).rejects.toThrow();
  });

  it('F2 on a nested row opens the rename field with its name', async () => {
    await setup();
    fireEvent.keyDown(await nestedIndexRow(), { key: 'F2' });
    expect((screen.getByTestId('explorer-name-input') as HTMLInputElement).value).toBe('index.ts');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Delete key on a focused row opens the confirmation', async () => {
    await setup();
    fireEvent.keyDown(await nestedIndexRow(), { key: 'Delete' });
    expect(screen.getByRole('alertdialog').textContent).toContain('Delete index.ts?');
  });

  it('Reveal and Copy Path call the bridge with the path', async () => {
    await setup();
    const reveal = vi.spyOn(api.fs, 'reveal').mockResolvedValue(undefined);
    const copy = vi.spyOn(api.app, 'copyText').mockResolvedValue(undefined);
    const row = await nestedIndexRow();
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByTestId('ctx-reveal'));
    await waitFor(() => expect(reveal).toHaveBeenCalledWith(`${WS}\\src\\index.ts`));
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByTestId('ctx-copy-path'));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(`${WS}\\src\\index.ts`));
    expect(screen.getByTestId('toast').textContent).toBe('Path copied to clipboard');
  });

  it('the empty explorer area targets the workspace root; rename and delete are unavailable there', async () => {
    await setup();
    fireEvent.contextMenu(screen.getByTestId('explorer-body'));
    expect((screen.getByTestId('ctx-rename') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('ctx-delete') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('ctx-new-file') as HTMLButtonElement).disabled).toBe(false);
  });

});

describe('useExplorerRefresh', () => {
  it('watches the workspace and bumps the explorer when the disk changes', async () => {
    const watch = vi.spyOn(api.fs, 'watch');
    const store = await setup();
    expect(watch).toHaveBeenCalledWith(WS);
    await act(async () => {});
    const before = store.getState().explorerVersion;
    // A write through the bridge is what a change on disk looks like to the renderer.
    await act(async () => {
      await api.fs.writeFile(`${WS}\\from-disk.txt`, 'x');
    });
    await waitFor(() => expect(store.getState().explorerVersion).toBeGreaterThan(before));
  });

  it('stops watching on unmount', async () => {
    const unwatch = vi.spyOn(api.fs, 'unwatch');
    await setup();
    cleanup();
    expect(unwatch).toHaveBeenCalled();
  });
});
