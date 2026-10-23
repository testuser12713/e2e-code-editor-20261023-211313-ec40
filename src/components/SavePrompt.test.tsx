import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppStoreProvider, createAppStore, createInitialState, type AppStoreHandle } from '../state/AppStore';
import { runCommand } from '../commands/registry';
import { api } from '../platform';
import { closeTabWithPrompt, confirmWindowClose, dirtyPaths, isDirty, SavePrompt, type SaveChoice } from './SavePrompt';
import type { Doc } from '../types';

const A = 'C:\\w\\src\\args.ts';
const B = 'C:\\w\\b.ts';

function doc(path: string, dirty: boolean): Doc {
  return {
    path,
    text: dirty ? 'changed\n' : 'saved\n',
    savedText: 'saved\n',
    eol: 'lf',
    language: 'typescript',
    indent: { useTabs: false, size: 2 },
    readOnly: false,
    tooLarge: false,
    conflict: false,
  };
}

/** The store, recording every dispatched action (tab closing is asserted on the dispatched action, not on the tab reducer). */
type SpyStore = AppStoreHandle & { closed: string[] };

function makeStore(dirtyA = true, dirtyB = false): SpyStore {
  const inner = createAppStore(
    createInitialState({
      tabs: [
        { path: A, preview: false },
        { path: B, preview: false },
      ],
      activeTab: A,
      docs: { [A]: doc(A, dirtyA), [B]: doc(B, dirtyB) },
    }),
  );
  const closed: string[] = [];
  return {
    getState: inner.getState,
    subscribe: inner.subscribe,
    dispatch(action) {
      if (action.type === 'tab/close') closed.push(action.path);
      inner.dispatch(action);
    },
    closed,
  };
}

function deps(store: AppStoreHandle, choices: SaveChoice[], saveOk = true) {
  const ask = vi.fn(async () => choices.shift() ?? 'cancel');
  const save = vi.fn(async (s: AppStoreHandle, path: string) => {
    if (!saveOk) return false;
    const d = s.getState().docs[path];
    s.dispatch({ type: 'doc/setSaved', path, savedText: d.text });
    return true;
  });
  return { store, ask, save };
}


afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('dirty detection', () => {
  it('lists dirty docs in tab order', () => {
    const store = makeStore(true, true);
    expect(dirtyPaths(store.getState())).toEqual([A, B]);
    expect(isDirty(doc(A, false))).toBe(false);
    expect(isDirty(undefined)).toBe(false);
  });
});

describe('closeTabWithPrompt', () => {
  it('closes a clean tab without asking', async () => {
    const store = makeStore(false);
    const d = deps(store, []);
    expect(await closeTabWithPrompt(A, d)).toBe(true);
    expect(d.ask).not.toHaveBeenCalled();
    expect(store.closed).toEqual([A]);
  });

  it('Cancel keeps the dirty tab open with its changes', async () => {
    const store = makeStore();
    const d = deps(store, ['cancel']);
    expect(await closeTabWithPrompt(A, d)).toBe(false);
    expect(store.closed).toEqual([]);
    expect(store.getState().docs[A].text).toBe('changed\n');
    expect(d.save).not.toHaveBeenCalled();
  });

  it("Don't Save closes without writing", async () => {
    const store = makeStore();
    const d = deps(store, ['dontSave']);
    expect(await closeTabWithPrompt(A, d)).toBe(true);
    expect(d.save).not.toHaveBeenCalled();
    expect(store.closed).toEqual([A]);
  });

  it('Save writes the doc and then closes', async () => {
    const store = makeStore();
    const d = deps(store, ['save']);
    expect(await closeTabWithPrompt(A, d)).toBe(true);
    expect(d.save).toHaveBeenCalledWith(store, A);
    expect(store.closed).toEqual([A]);
  });

  it('a failed save keeps the tab open', async () => {
    const store = makeStore();
    const d = deps(store, ['save'], false);
    expect(await closeTabWithPrompt(A, d)).toBe(false);
    expect(store.closed).toEqual([]);
  });
});

describe('confirmWindowClose', () => {
  it('allows closing right away without dirty docs', async () => {
    const d = deps(makeStore(false, false), []);
    expect(await confirmWindowClose(d)).toBe(true);
    expect(d.ask).not.toHaveBeenCalled();
  });

  it('asks about every dirty doc in tab order, activating each', async () => {
    const store = makeStore(true, true);
    const d = deps(store, ['save', 'dontSave']);
    expect(await confirmWindowClose(d)).toBe(true);
    expect(d.ask.mock.calls.map((c) => (c as unknown[])[0])).toEqual([A, B]);
    expect(store.getState().activeTab).toBe(B);
  });

  it('Cancel or a failed save keeps the window open', async () => {
    expect(await confirmWindowClose(deps(makeStore(true, true), ['dontSave', 'cancel']))).toBe(false);
    expect(await confirmWindowClose(deps(makeStore(true, false), ['save'], false))).toBe(false);
  });
});

describe('<SavePrompt />', () => {
  function renderPrompt(store: AppStoreHandle) {
    return render(
      <AppStoreProvider store={store}>
        <SavePrompt />
      </AppStoreProvider>,
    );
  }

  it('shows nothing until a question is asked', () => {
    renderPrompt(makeStore());
    expect(screen.queryByTestId('unsaved-dialog')).toBeNull();
  });

  it('closing a dirty tab (tab.close) shows the prompt; Cancel leaves the tab open', async () => {
    const store = makeStore();
    renderPrompt(store);
    act(() => {
      runCommand('tab.close');
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Save changes to args.ts?');
    expect(dialog.textContent).toContain("Your changes will be lost if you don't save them.");
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Don't Save" })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(store.closed).toEqual([]);
    expect(store.getState().docs[A].text).toBe('changed\n');
  });

  it("Don't Save closes the tab, Escape cancels", async () => {
    const store = makeStore();
    renderPrompt(store);
    act(() => {
      runCommand('tab.close');
    });
    fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(store.closed).toEqual([]);

    act(() => {
      runCommand('tab.close');
    });
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }));
    await waitFor(() => expect(store.closed).toEqual([A]));
  });

  it('Save writes the file through the bridge and closes the tab', async () => {
    const write = vi.spyOn(api.fs, 'writeFile').mockResolvedValue(undefined);
    const store = makeStore();
    renderPrompt(store);
    act(() => {
      runCommand('tab.close', A);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.closed).toEqual([A]));
    expect(write).toHaveBeenCalledWith(A, 'changed\n');
  });

  it('answers the window close request through app.confirmClose', async () => {
    let beforeClose: () => void = () => undefined;
    vi.spyOn(api.app, 'onBeforeClose').mockImplementation((cb) => {
      beforeClose = cb;
      return () => undefined;
    });
    const confirm = vi.spyOn(api.app, 'confirmClose').mockResolvedValue(undefined);
    const store = makeStore();
    renderPrompt(store);

    act(() => beforeClose());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(false));
    expect(store.closed).toEqual([]);

    act(() => beforeClose());
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }));
    await waitFor(() => expect(confirm).toHaveBeenLastCalledWith(true));
  });
});
