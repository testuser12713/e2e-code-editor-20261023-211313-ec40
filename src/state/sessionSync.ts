/**
 * Loads settings and session on start (restoring the last workspace, open
 * tabs, active tab and sidebar width) and saves them when they change
 * (debounced). Opening a workspace moves it to the front of the recent list.
 * Called ONCE inside AppStore. Only paths, tab flags and geometry are stored.
 */
import { useEffect } from 'react';
import { api as platformApi, type Api } from '../platform';
import { addRecentWorkspace, parseSession } from '../core/session';
import { parseSettings } from '../core/settings';
import type { Session } from '../types';
import { appStore, type AppState, type AppStoreHandle } from './AppStore';
import { openFile as defaultOpenFile } from './actions';

export const SAVE_DEBOUNCE_MS = 400;

export interface SessionSyncDeps {
  store: AppStoreHandle;
  api: Pick<Api, 'settings' | 'session'>;
  openFile: (path: string, opts?: { preview?: boolean }) => Promise<void>;
  delayMs?: number;
}

/** The session the current state should be stored as. */
export function sessionFromState(state: AppState): Session {
  return parseSession({
    ...state.session,
    lastWorkspace: state.workspace,
    openTabs: state.workspace ? state.tabs.map((t) => ({ path: t.path, preview: t.preview })) : [],
    activeTab: state.workspace ? state.activeTab : null,
  });
}

/** Restores, then keeps persisting. Returns a stop function. */
export function startSessionSync(deps: SessionSyncDeps): () => void {
  const { store, api, openFile } = deps;
  const delay = deps.delayMs ?? SAVE_DEBOUNCE_MS;
  let stopped = false;
  let ready = false;
  let unsubscribe: () => void = () => {};
  let sessionTimer: ReturnType<typeof setTimeout> | null = null;
  let settingsTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSession = '';
  let lastSettings = '';
  let lastWorkspace: string | null = null;

  const flushSession = () => {
    sessionTimer = null;
    const s = sessionFromState(store.getState());
    const key = JSON.stringify(s);
    if (key === lastSession) return;
    lastSession = key;
    api.session.save(s).catch(() => {
      lastSession = '';
    });
  };
  const flushSettings = () => {
    settingsTimer = null;
    const s = store.getState().settings;
    const key = JSON.stringify(s);
    if (key === lastSettings) return;
    lastSettings = key;
    api.settings.save(s).catch(() => {
      lastSettings = '';
    });
  };

  const onChange = () => {
    if (!ready || stopped) return;
    const state = store.getState();
    if (state.workspace !== lastWorkspace) {
      lastWorkspace = state.workspace;
      if (state.workspace) {
        const recent = addRecentWorkspace(state.session.recentWorkspaces, state.workspace);
        if (recent.join('\n') !== state.session.recentWorkspaces.join('\n')) {
          store.dispatch({ type: 'session/set', session: { ...state.session, recentWorkspaces: recent } });
          return; // the dispatch re-enters onChange
        }
      }
    }
    if (JSON.stringify(sessionFromState(state)) !== lastSession) {
      if (sessionTimer) clearTimeout(sessionTimer);
      sessionTimer = setTimeout(flushSession, delay);
    }
    if (JSON.stringify(state.settings) !== lastSettings) {
      if (settingsTimer) clearTimeout(settingsTimer);
      settingsTimer = setTimeout(flushSettings, delay);
    }
  };

  const restore = async () => {
    const [settings, session] = await Promise.all([
      api.settings.load().then(parseSettings, () => null),
      api.session.load().then(parseSession, () => parseSession(null)),
    ]);
    if (stopped) return;
    if (settings) {
      store.dispatch({ type: 'settings/set', settings });
      lastSettings = JSON.stringify(settings);
    }
    store.dispatch({ type: 'session/set', session });
    lastSession = JSON.stringify(session);
    if (session.lastWorkspace && store.getState().workspace === null) {
      store.dispatch({ type: 'workspace/set', workspace: session.lastWorkspace });
      for (const tab of session.openTabs) {
        if (stopped) return;
        try {
          await openFile(tab.path, { preview: tab.preview });
        } catch {
          // a vanished file is simply not restored
        }
      }
      const active = session.openTabs.find((t) => t.path === session.activeTab);
      if (active && !stopped) {
        // openFile focuses an already open tab, making it the active one again
        await openFile(active.path, { preview: active.preview }).catch(() => undefined);
      }
    }
  };

  restore()
    .catch(() => undefined)
    .finally(() => {
      if (stopped) return;
      lastWorkspace = store.getState().workspace;
      ready = true;
      unsubscribe = store.subscribe(onChange);
      onChange();
    });

  return () => {
    stopped = true;
    unsubscribe();
    if (sessionTimer) flushSession();
    if (settingsTimer) flushSettings();
  };
}

export function useSessionSync(): void {
  useEffect(() => startSessionSync({ store: appStore, api: platformApi, openFile: defaultOpenFile }), []);
}
