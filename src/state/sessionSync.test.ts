import { describe, expect, it, vi } from 'vitest';
import { createAppStore } from './AppStore';
import { startSessionSync, sessionFromState } from './sessionSync';
import { DEFAULT_SESSION } from '../core/session';
import type { Session } from '../types';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(stored: Session) {
  const store = createAppStore();
  const saved: Session[] = [];
  const api = {
    settings: { load: vi.fn(async () => ({})), save: vi.fn(async () => undefined) },
    session: {
      load: vi.fn(async () => stored),
      save: vi.fn(async (s: Session) => {
        saved.push(s);
      }),
      clearRecent: vi.fn(async () => undefined),
    },
  };
  const openFile = vi.fn(async (path: string, opts?: { preview?: boolean }) => {
    store.dispatch({ type: 'tab/open', path, preview: opts?.preview ?? false });
  });
  const stop = startSessionSync({ store, api: api as never, openFile, delayMs: 1 });
  return { store, saved, openFile, stop };
}

describe('sessionSync', () => {
  it('restores workspace, tabs, active tab and sidebar width', async () => {
    const { store, openFile, stop } = setup({
      ...DEFAULT_SESSION,
      recentWorkspaces: ['C:\\w'],
      lastWorkspace: 'C:\\w',
      openTabs: [
        { path: 'C:\\w\\a.ts', preview: false },
        { path: 'C:\\w\\b.ts', preview: false },
      ],
      activeTab: 'C:\\w\\a.ts',
      sidebarWidth: 333,
    });
    await flush();
    await flush();
    const s = store.getState();
    expect(s.workspace).toBe('C:\\w');
    expect(openFile).toHaveBeenCalledWith('C:\\w\\b.ts', { preview: false });
    expect(openFile.mock.calls.at(-1)?.[0]).toBe('C:\\w\\a.ts');
    expect(s.session.sidebarWidth).toBe(333);
    stop();
  });

  it('adds a newly opened workspace to the recent list and saves it debounced', async () => {
    const { store, saved, stop } = setup({ ...DEFAULT_SESSION });
    await flush();
    store.dispatch({ type: 'workspace/set', workspace: 'C:\\new' });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getState().session.recentWorkspaces[0]).toBe('C:\\new');
    expect(saved.at(-1)?.lastWorkspace).toBe('C:\\new');
    expect(saved.at(-1)?.recentWorkspaces).toEqual(['C:\\new']);
    stop();
  });

  it('stores no document contents', async () => {
    const { store, stop } = setup({ ...DEFAULT_SESSION });
    await flush();
    store.dispatch({ type: 'workspace/set', workspace: 'C:\\w' });
    store.dispatch({ type: 'tab/open', path: 'C:\\w\\a.ts', preview: false });
    expect(JSON.stringify(sessionFromState(store.getState()))).not.toContain('text');
    stop();
  });
});
