import type { Session, WindowBounds } from '../types';

/** Default sidebar width in px (matches --sidebar-w of the design). */
export const DEFAULT_SIDEBAR_WIDTH = 260;
/** Sidebar width limits accepted from a stored session. */
export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 800;
/** How many recent workspaces are remembered. */
export const MAX_RECENT_WORKSPACES = 10;
/** How many tabs are remembered. */
export const MAX_OPEN_TABS = 50;
const MAX_PATH_LENGTH = 4096;

/** The session of a first start; a missing or corrupt session file yields this. */
export const DEFAULT_SESSION: Session = {
  recentWorkspaces: [],
  lastWorkspace: null,
  openTabs: [],
  activeTab: null,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  windowBounds: null,
};

function isPath(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_PATH_LENGTH && !v.includes('\0');
}

function parseBounds(v: unknown): WindowBounds | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  const nums = [b.x, b.y, b.width, b.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const width = Math.round(b.width as number);
  const height = Math.round(b.height as number);
  if (width < 200 || height < 150 || width > 20000 || height > 20000) return null;
  return { x: Math.round(b.x as number), y: Math.round(b.y as number), width, height };
}

/** Adds `path` to the front of the recent list (deduplicated, capped). */
export function addRecentWorkspace(list: string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT_WORKSPACES);
}

/**
 * Parses a stored session (a JSON string or an already parsed object) and
 * falls back to the defaults for anything missing, invalid or corrupt —
 * never throws. Only paths, tab flags, sidebar width and geometry are kept,
 * never contents.
 */
export function parseSession(raw: unknown): Session {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  const out: Session = { ...DEFAULT_SESSION, recentWorkspaces: [], openTabs: [] };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.recentWorkspaces)) {
    const seen = new Set<string>();
    for (const p of d.recentWorkspaces) {
      if (isPath(p) && !seen.has(p)) {
        seen.add(p);
        out.recentWorkspaces.push(p);
      }
      if (out.recentWorkspaces.length >= MAX_RECENT_WORKSPACES) break;
    }
  }
  if (isPath(d.lastWorkspace)) out.lastWorkspace = d.lastWorkspace;
  if (Array.isArray(d.openTabs)) {
    const seen = new Set<string>();
    for (const t of d.openTabs) {
      if (!t || typeof t !== 'object') continue;
      const tab = t as Record<string, unknown>;
      if (!isPath(tab.path) || seen.has(tab.path)) continue;
      seen.add(tab.path);
      out.openTabs.push({ path: tab.path, preview: tab.preview === true });
      if (out.openTabs.length >= MAX_OPEN_TABS) break;
    }
  }
  if (isPath(d.activeTab) && out.openTabs.some((t) => t.path === d.activeTab)) out.activeTab = d.activeTab;
  if (typeof d.sidebarWidth === 'number' && Number.isFinite(d.sidebarWidth)) {
    out.sidebarWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(d.sidebarWidth)));
  }
  out.windowBounds = parseBounds(d.windowBounds);
  return out;
}

/** Serializes a session as JSON (paths and geometry only — unknown fields are dropped). */
export function serializeSession(s: Session): string {
  return JSON.stringify(parseSession(s), null, 2);
}

/** The session after "clear recent": no workspace path is left in it. */
export function clearRecentSession(s: Session): Session {
  const p = parseSession(s);
  return { ...p, recentWorkspaces: [], lastWorkspace: null, openTabs: [], activeTab: null };
}
