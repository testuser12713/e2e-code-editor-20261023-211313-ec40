import type { Tab } from '../types';

/**
 * Every change the tab list knows. The active tab is NOT part of this state;
 * AppStore derives it after the reducer ran.
 */
export type TabAction =
  /** Opens a tab; a preview tab replaces the existing preview tab. An already open path is kept. */
  | { type: 'open'; path: string; preview: boolean }
  /** Closes the tab of `path`. */
  | { type: 'close'; path: string }
  /** Closes every tab. */
  | { type: 'closeAll' }
  /** Makes a preview tab permanent (double click or first edit). */
  | { type: 'pin'; path: string }
  /** Moves the tab at index `from` to index `to` (drag and drop). */
  | { type: 'reorder'; from: number; to: number }
  /** A file or folder was renamed on disk: every tab at or below `from` moves to `to`. */
  | { type: 'rename'; from: string; to: string }
  /** Replaces the whole list (session restore). */
  | { type: 'restore'; tabs: Tab[] };

function remap(p: string, from: string, to: string): string {
  if (p === from) return to;
  if (p.startsWith(from + '\\') || p.startsWith(from + '/')) return to + p.slice(from.length);
  return p;
}

/** Drops duplicate paths (first one wins) and keeps at most one preview tab (the last one). */
function normalize(tabs: Tab[]): Tab[] {
  const seen = new Set<string>();
  const unique: Tab[] = [];
  for (const t of tabs) {
    if (!t || typeof t.path !== 'string' || t.path === '' || seen.has(t.path)) continue;
    seen.add(t.path);
    unique.push({ path: t.path, preview: t.preview === true });
  }
  let lastPreview = -1;
  unique.forEach((t, i) => {
    if (t.preview) lastPreview = i;
  });
  return unique.map((t, i) => (t.preview && i !== lastPreview ? { ...t, preview: false } : t));
}

/**
 * Pure reducer of the tab list.
 * - open preview: replaces the current preview tab in place (or is appended);
 * - open permanent: appended, or an open preview tab of that path is pinned;
 * - an already open path is otherwise kept as it is (a preview open never demotes);
 * - pin promotes a preview tab (double click, first edit, save);
 * - reorder moves a tab, rename follows a file or folder, restore replaces the list.
 */
export function tabsReducer(state: Tab[], action: TabAction): Tab[] {
  switch (action.type) {
    case 'open': {
      const existing = state.find((t) => t.path === action.path);
      if (existing) {
        if (!action.preview && existing.preview) return tabsReducer(state, { type: 'pin', path: action.path });
        return state;
      }
      const tab: Tab = { path: action.path, preview: action.preview };
      if (action.preview) {
        const i = state.findIndex((t) => t.preview);
        if (i >= 0) return [...state.slice(0, i), tab, ...state.slice(i + 1)];
      }
      return [...state, tab];
    }
    case 'close': {
      const next = state.filter((t) => t.path !== action.path);
      return next.length === state.length ? state : next;
    }
    case 'closeAll':
      return state.length === 0 ? state : [];
    case 'pin': {
      const i = state.findIndex((t) => t.path === action.path);
      if (i < 0 || !state[i].preview) return state;
      const next = [...state];
      next[i] = { ...state[i], preview: false };
      return next;
    }
    case 'reorder': {
      const { from } = action;
      if (!Number.isInteger(from) || !Number.isInteger(action.to)) return state;
      if (from < 0 || from >= state.length) return state;
      const to = Math.min(Math.max(action.to, 0), state.length - 1);
      if (to === from) return state;
      const next = [...state];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    }
    case 'rename': {
      if (action.from === action.to) return state;
      let changed = false;
      const mapped = state.map((t) => {
        const p = remap(t.path, action.from, action.to);
        if (p === t.path) return t;
        changed = true;
        return { ...t, path: p };
      });
      return changed ? normalize(mapped) : state;
    }
    case 'restore':
      return normalize(Array.isArray(action.tabs) ? action.tabs : []);
    default: {
      const unknown: never = action;
      void unknown;
      return state;
    }
  }
}

/**
 * The path of the tab `step` places after `active` (wrapping around), for
 * Ctrl+Tab (+1) and Ctrl+Shift+Tab (-1). null when there are no tabs.
 */
export function cycleTab(tabs: Tab[], active: string | null, step: 1 | -1): string | null {
  if (tabs.length === 0) return null;
  const i = tabs.findIndex((t) => t.path === active);
  if (i < 0) return tabs[step === 1 ? 0 : tabs.length - 1].path;
  return tabs[(i + step + tabs.length) % tabs.length].path;
}
