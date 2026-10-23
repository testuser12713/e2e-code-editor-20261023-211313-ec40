/**
 * The one app store. Components read it with useApp(); code outside React
 * (command handlers, openFile) uses the module-level `appStore` handle, which
 * always points at the store of the mounted <AppStoreProvider>.
 */
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { AppAction } from './actions';
import type { Cursor, Doc, FindMode, Overlay, Session, Settings, SidebarView, Tab } from '../types';
import { tabsReducer } from '../core/tabs';
import { DEFAULT_SETTINGS } from '../core/settings';
import { DEFAULT_SESSION } from '../core/session';
import { registerSaveHandlers } from './saveActions';
import { useExternalChanges } from './externalChanges';
import { useSessionSync } from './sessionSync';
import { useMenuCommands } from '../components/AboutDialog';

export type { AppAction } from './actions';

export interface AppState {
  workspace: string | null;
  tabs: Tab[];
  activeTab: string | null;
  docs: Record<string, Doc>;
  settings: Settings;
  session: Session;
  sidebarView: SidebarView;
  overlay: Overlay;
  findOpen: FindMode;
  cursor: Cursor;
  explorerVersion: number;
}

export interface AppStoreHandle {
  getState(): AppState;
  dispatch(action: AppAction): void;
  subscribe(listener: () => void): () => void;
}

export function createInitialState(overrides: Partial<AppState> = {}): AppState {
  return {
    workspace: null,
    tabs: [],
    activeTab: null,
    docs: {},
    settings: { ...DEFAULT_SETTINGS },
    session: { ...DEFAULT_SESSION, recentWorkspaces: [], openTabs: [] },
    sidebarView: 'explorer',
    overlay: null,
    findOpen: null,
    cursor: { line: 1, col: 1, selLength: 0 },
    explorerVersion: 0,
    ...overrides,
  };
}

/* ---------- reducer ---------- */

/** Maps `p` when `from` (a file or a folder) was renamed to `to`. */
function remapPath(p: string, from: string, to: string): string {
  if (p === from) return to;
  if (p.startsWith(from + '\\') || p.startsWith(from + '/')) return to + p.slice(from.length);
  return p;
}

function dropDocs(docs: Record<string, Doc>, paths: string[]): Record<string, Doc> {
  if (paths.length === 0) return docs;
  const next = { ...docs };
  for (const p of paths) delete next[p];
  return next;
}

function updateDoc(state: AppState, path: string, patch: Partial<Doc>): AppState {
  const doc = state.docs[path];
  if (!doc) return state;
  return { ...state, docs: { ...state.docs, [path]: { ...doc, ...patch } } };
}

function withTabs(state: AppState, tabs: Tab[], activeTab: string | null): AppState {
  const kept = new Set(tabs.map((t) => t.path));
  const removed = state.tabs.filter((t) => !kept.has(t.path)).map((t) => t.path);
  const active = activeTab !== null && kept.has(activeTab) ? activeTab : null;
  return { ...state, tabs, activeTab: active, docs: dropDocs(state.docs, removed) };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'tab/open': {
      const tabs = tabsReducer(state.tabs, { type: 'open', path: action.path, preview: action.preview });
      const opened = tabs.some((t) => t.path === action.path);
      return withTabs(state, tabs, opened ? action.path : state.activeTab);
    }
    case 'tab/close': {
      const index = state.tabs.findIndex((t) => t.path === action.path);
      const tabs = tabsReducer(state.tabs, { type: 'close', path: action.path });
      let active = state.activeTab;
      if (active === action.path || !tabs.some((t) => t.path === active)) {
        active = tabs.length > 0 ? tabs[Math.min(Math.max(index, 0), tabs.length - 1)].path : null;
      }
      return withTabs(state, tabs, active);
    }
    case 'tab/closeAll':
      return withTabs(state, tabsReducer(state.tabs, { type: 'closeAll' }), null);
    case 'tab/activate':
      return state.tabs.some((t) => t.path === action.path) ? { ...state, activeTab: action.path } : state;
    case 'tab/pin':
      return { ...state, tabs: tabsReducer(state.tabs, { type: 'pin', path: action.path }) };
    case 'tab/reorder':
      return { ...state, tabs: tabsReducer(state.tabs, { type: 'reorder', from: action.from, to: action.to }) };
    case 'tab/restore': {
      const tabs = tabsReducer(state.tabs, { type: 'restore', tabs: action.tabs });
      return withTabs(state, tabs, action.activeTab ?? tabs[0]?.path ?? null);
    }
    case 'doc/open':
      return { ...state, docs: { ...state.docs, [action.doc.path]: action.doc } };
    case 'doc/close':
      return { ...state, docs: dropDocs(state.docs, [action.path]) };
    case 'doc/setText':
      return updateDoc(state, action.path, { text: action.text });
    case 'doc/setEol':
      return updateDoc(state, action.path, { eol: action.eol });
    case 'doc/setLanguage':
      return updateDoc(state, action.path, { language: action.language });
    case 'doc/setIndent':
      return updateDoc(state, action.path, { indent: action.indent });
    case 'doc/setSaved':
      return updateDoc(state, action.path, { savedText: action.savedText });
    case 'doc/setConflict':
      return updateDoc(state, action.path, { conflict: action.conflict });
    case 'doc/reload':
      return updateDoc(state, action.path, { text: action.text, savedText: action.text, eol: action.eol, conflict: false });
    case 'path/rename': {
      const { from, to } = action;
      const tabs = tabsReducer(state.tabs, { type: 'rename', from, to });
      const docs: Record<string, Doc> = {};
      for (const [p, doc] of Object.entries(state.docs)) {
        const np = remapPath(p, from, to);
        docs[np] = np === p ? doc : { ...doc, path: np };
      }
      const activeTab = state.activeTab === null ? null : remapPath(state.activeTab, from, to);
      return { ...state, tabs, docs, activeTab };
    }
    case 'settings/set':
      return { ...state, settings: action.settings };
    case 'session/set':
      return { ...state, session: action.session };
    case 'workspace/set':
      return { ...state, workspace: action.workspace };
    case 'overlay/set':
      return { ...state, overlay: action.overlay };
    case 'find/set':
      return { ...state, findOpen: action.findOpen };
    case 'explorer/bump':
      return { ...state, explorerVersion: state.explorerVersion + 1 };
    case 'cursor/set':
      return { ...state, cursor: action.cursor };
    case 'sidebar/setView':
      return { ...state, sidebarView: action.view };
    default: {
      const unknown: never = action;
      void unknown;
      return state;
    }
  }
}

/* ---------- store ---------- */

export function createAppStore(initial: AppState = createInitialState()): AppStoreHandle {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action: AppAction) {
      const next = appReducer(state, action);
      if (next === state) return;
      state = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const defaultStore = createAppStore();
let activeStore: AppStoreHandle = defaultStore;

/**
 * Handle for code outside React. Always forwards to the store of the mounted
 * provider (the default store before anything is mounted).
 */
export const appStore: AppStoreHandle = {
  getState: () => activeStore.getState(),
  dispatch: (action) => activeStore.dispatch(action),
  subscribe: (listener) => activeStore.subscribe(listener),
};

const StoreContext = createContext<AppStoreHandle | null>(null);

/** Runs the app-wide effects once, inside the provider so they can use useApp(). */
function StoreEffects({ store }: { store: AppStoreHandle }): null {
  useEffect(() => registerSaveHandlers(store), [store]);
  useMenuCommands();
  useExternalChanges();
  useSessionSync();
  return null;
}

export function AppStoreProvider({ children, store }: { children: ReactNode; store?: AppStoreHandle }) {
  const current = store ?? defaultStore;
  activeStore = current;
  return (
    <StoreContext.Provider value={current}>
      <StoreEffects store={current} />
      {children}
    </StoreContext.Provider>
  );
}

export function useApp(): { state: AppState; dispatch: (a: AppAction) => void } {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useApp must be used inside <AppStoreProvider>');
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { state, dispatch: store.dispatch };
}

/** The raw store of the surrounding provider (stable getState for callbacks). */
export function useAppStore(): AppStoreHandle {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return store;
}
