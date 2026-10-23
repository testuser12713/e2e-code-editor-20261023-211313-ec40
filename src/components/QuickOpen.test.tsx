import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const openFileMock = vi.fn((_path: string, _opts?: unknown) => Promise.resolve());
vi.mock('../state/openFile', () => ({ openFile: (path: string, opts?: unknown) => openFileMock(path, opts) }));

import { QuickOpen, clearQuickOpenCache, clearRecentFiles, rankFiles, relativePath } from './QuickOpen';
import { AppStoreProvider, createAppStore, createInitialState } from '../state/AppStore';
import { runCommand } from '../commands/registry';
import { api } from '../platform';

const ROOT = 'C:\\w';
const FILES = [
  'C:\\w\\package.json',
  'C:\\w\\README.md',
  'C:\\w\\src\\api\\cache.ts',
  'C:\\w\\src\\api\\forecast.ts',
  'C:\\w\\src\\cli\\args.ts',
];

function setup(overrides: Parameters<typeof createInitialState>[0] = {}) {
  const store = createAppStore(createInitialState({ workspace: ROOT, ...overrides }));
  const listFiles = vi.spyOn(api.fs, 'listFiles').mockResolvedValue(FILES);
  render(
    <AppStoreProvider store={store}>
      <QuickOpen />
    </AppStoreProvider>,
  );
  return { store, listFiles };
}

beforeEach(() => {
  clearQuickOpenCache();
  clearRecentFiles();
  openFileMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const titles = () => screen.queryAllByTestId('quick-open-row').map((r) => r.querySelector('.qp-title')?.textContent);

describe('QuickOpen', () => {
  it('opens through the view.quickOpen command and closes on Escape', async () => {
    const { store } = setup();
    expect(screen.queryByTestId('quick-open')).toBeNull();
    act(() => {
      expect(runCommand('view.quickOpen')).toBe(true);
    });
    expect(store.getState().overlay).toBe('quickOpen');
    const input = await screen.findByTestId('quick-open-input');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(store.getState().overlay).toBeNull();
    expect(screen.queryByTestId('quick-open')).toBeNull();
  });

  it('shows recently opened files first for an empty query', async () => {
    const { store } = setup({
      tabs: [
        { path: 'C:\\w\\src\\cli\\args.ts', preview: false },
        { path: 'C:\\w\\src\\api\\forecast.ts', preview: false },
      ],
      activeTab: 'C:\\w\\src\\api\\forecast.ts',
    });
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'quickOpen' }));
    await waitFor(() => expect(titles().length).toBe(FILES.length));
    expect(screen.getByText('Recently opened')).toBeTruthy();
    expect(titles().slice(0, 2)).toEqual(['forecast.ts', 'args.ts']);
  });

  it('ranks matches, moves with the arrow keys and opens the selection on Enter', async () => {
    const { store } = setup();
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'quickOpen' }));
    const input = await screen.findByTestId('quick-open-input');
    await waitFor(() => expect(titles().length).toBe(FILES.length));
    fireEvent.change(input, { target: { value: 'ca' } });
    expect(titles().slice(0, 2)).toEqual(['cache.ts', 'forecast.ts']);
    expect(screen.queryByText('Recently opened')).toBeNull();
    const rows = () => screen.getAllByTestId('quick-open-row');
    expect(rows()[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(rows()[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(openFileMock).toHaveBeenCalledWith('C:\\w\\src\\api\\forecast.ts', { preview: false });
    expect(store.getState().overlay).toBeNull();
  });

  it('shows an empty state for no matches', async () => {
    const { store } = setup();
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'quickOpen' }));
    const input = await screen.findByTestId('quick-open-input');
    await waitFor(() => expect(titles().length).toBe(FILES.length));
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No matching files')).toBeTruthy();
  });

  it('lists the workspace files once and reuses them on the next open', async () => {
    const { store, listFiles } = setup();
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'quickOpen' }));
    await waitFor(() => expect(titles().length).toBe(FILES.length));
    act(() => store.dispatch({ type: 'overlay/set', overlay: null }));
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'quickOpen' }));
    await waitFor(() => expect(titles().length).toBe(FILES.length));
    expect(listFiles).toHaveBeenCalledTimes(1);
    expect(listFiles).toHaveBeenCalledWith(ROOT);
  });
});

describe('rankFiles', () => {
  it('limits the result rows and stays fast with 10,000 files', () => {
    const many = Array.from({ length: 10000 }, (_, i) => `C:\\w\\pkg${i % 50}\\src\\file${i}.ts`);
    const t0 = Date.now();
    const rows = rankFiles('file', many, ROOT, 100);
    expect(rows.length).toBe(100);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('computes workspace-relative paths', () => {
    expect(relativePath('C:\\w', 'C:\\w\\src\\a.ts')).toBe('src\\a.ts');
    expect(relativePath('/home/w', '/home/w/a.ts')).toBe('a.ts');
    expect(relativePath('/home/w', '/other/a.ts')).toBe('/other/a.ts');
  });
});
