import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppStoreProvider, createAppStore, createInitialState, type AppStoreHandle } from '../state/AppStore';
import { api } from '../platform';
import { ConflictBanner } from './ConflictBanner';
import type { Doc } from '../types';

const PATH = 'C:\\w\\src\\args.ts';

function makeStore(conflict: boolean): AppStoreHandle {
  const doc: Doc = {
    path: PATH,
    text: 'mine\n',
    savedText: 'old\n',
    eol: 'lf',
    language: 'typescript',
    indent: { useTabs: false, size: 2 },
    readOnly: false,
    tooLarge: false,
    conflict,
  };
  return createAppStore(createInitialState({ tabs: [{ path: PATH, preview: false }], activeTab: PATH, docs: { [PATH]: doc } }));
}

function renderBanner(store: AppStoreHandle) {
  return render(
    <AppStoreProvider store={store}>
      <ConflictBanner />
    </AppStoreProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<ConflictBanner />', () => {
  it('is hidden while the active doc has no conflict', () => {
    renderBanner(makeStore(false));
    expect(screen.queryByTestId('conflict-banner')).toBeNull();
  });

  it('names the file and offers Reload and Keep mine', () => {
    renderBanner(makeStore(true));
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('args.ts was changed on disk by another program, and you have unsaved changes here.');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeTruthy();
  });

  it('Keep mine hides the banner and keeps the buffer', () => {
    const store = makeStore(true);
    renderBanner(store);
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(screen.queryByTestId('conflict-banner')).toBeNull();
    expect(store.getState().docs[PATH].text).toBe('mine\n');
  });

  it('Reload loads the disk version and hides the banner', async () => {
    vi.spyOn(api.fs, 'readFile').mockResolvedValue({ content: 'disk\r\n', eol: 'crlf', size: 6, tooLarge: false });
    const store = makeStore(true);
    renderBanner(store);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.queryByTestId('conflict-banner')).toBeNull());
    const doc = store.getState().docs[PATH];
    expect(doc.text).toBe('disk\n');
    expect(doc.eol).toBe('crlf');
  });
});
