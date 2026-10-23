import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from '../platform';
import { runCommand } from '../commands/registry';
import { AppStoreProvider, createAppStore, createInitialState, type AppStoreHandle } from '../state/AppStore';
import { Welcome, workspaceName } from './Welcome';

const RECENT = ['C:\\Users\\Anna\\Projects\\weather-cli', 'D:\\Work\\notes-app'];

function renderWelcome(recent: string[] = RECENT): AppStoreHandle {
  const base = createInitialState();
  const session = { ...base.session, recentWorkspaces: [...recent], lastWorkspace: null, sidebarWidth: 300 };
  // The provider's session sync restores what session.load answers: answer the same session.
  vi.spyOn(api.session, 'load').mockResolvedValue(session);
  const store = createAppStore(createInitialState({ session }));
  render(
    <AppStoreProvider store={store}>
      <Welcome />
    </AppStoreProvider>,
  );
  return store;
}

/** Lets the provider's session restore finish, so it cannot overwrite what the test does next. */
async function settleRestore(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  // Keep the session sync started by the provider from touching the demo storage.
  vi.spyOn(api.settings, 'load').mockResolvedValue(createInitialState().settings);
  vi.spyOn(api.session, 'save').mockResolvedValue();
  vi.spyOn(api.settings, 'save').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Welcome', () => {
  it('shows the title, the actions and every recent workspace with name and path', () => {
    renderWelcome();
    expect(screen.getByTestId('welcome-title').textContent).toBe('Code Editor');
    expect(screen.getByTestId('welcome-open-folder').textContent).toContain('Open Folder');
    expect(screen.getByTestId('welcome-open-file').textContent).toBe('Open File');
    const items = screen.getAllByTestId('recent-item');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('weather-cli')).toBeTruthy();
    expect(within(items[0]).getByText(RECENT[0])).toBeTruthy();
    expect(within(items[1]).getByText('notes-app')).toBeTruthy();
  });

  it('opens a recent workspace when it is clicked', () => {
    const store = renderWelcome();
    fireEvent.click(screen.getAllByTestId('recent-item')[1]);
    expect(store.getState().workspace).toBe(RECENT[1]);
  });

  it('clears the list through session.clearRecent and the store', async () => {
    const clear = vi.spyOn(api.session, 'clearRecent').mockResolvedValue();
    const store = renderWelcome();
    await settleRestore();
    fireEvent.click(screen.getByTestId('clear-recent'));
    await waitFor(() => expect(screen.getByTestId('recent-empty').textContent).toBe('No recent workspaces'));
    expect(clear).toHaveBeenCalledTimes(1);
    expect(store.getState().session.recentWorkspaces).toEqual([]);
    expect(store.getState().session.sidebarWidth).toBe(300);
    expect(screen.queryAllByTestId('recent-item')).toHaveLength(0);
    expect((screen.getByTestId('clear-recent') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('toast').textContent).toBe('Recent workspaces cleared');
  });

  it('shows the empty list state with a disabled clear control', () => {
    renderWelcome([]);
    expect(screen.getByTestId('recent-empty')).toBeTruthy();
    expect((screen.getByTestId('clear-recent') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Open Folder sets the chosen folder as workspace; cancelling changes nothing', async () => {
    const dialog = vi.spyOn(api.fs, 'openFolderDialog').mockResolvedValueOnce(null).mockResolvedValueOnce('C:\\picked');
    const store = renderWelcome();
    fireEvent.click(screen.getByTestId('welcome-open-folder'));
    await waitFor(() => expect(dialog).toHaveBeenCalledTimes(1));
    expect(store.getState().workspace).toBeNull();
    fireEvent.click(screen.getByTestId('welcome-open-folder'));
    await waitFor(() => expect(store.getState().workspace).toBe('C:\\picked'));
  });

  it('registers the file.openFolder command', async () => {
    vi.spyOn(api.fs, 'openFolderDialog').mockResolvedValue('C:\\via-command');
    const store = renderWelcome();
    await act(async () => {
      expect(runCommand('file.openFolder')).toBe(true);
    });
    await waitFor(() => expect(store.getState().workspace).toBe('C:\\via-command'));
  });

  it('Open File asks for a file', async () => {
    const dialog = vi.spyOn(api.fs, 'openFileDialog').mockResolvedValue(null);
    renderWelcome();
    fireEvent.click(screen.getByTestId('welcome-open-file'));
    await waitFor(() => expect(dialog).toHaveBeenCalledTimes(1));
  });
});

describe('workspaceName', () => {
  it('takes the last path segment of Windows and POSIX paths', () => {
    expect(workspaceName('C:\\Users\\Anna\\dotfiles')).toBe('dotfiles');
    expect(workspaceName('/home/a/blog-theme/')).toBe('blog-theme');
    expect(workspaceName('C:\\')).toBe('C:');
  });
});
