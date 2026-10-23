import type { Session } from '../types';

/** Default sidebar width in px (matches --sidebar-w of the design). */
export const DEFAULT_SIDEBAR_WIDTH = 260;

/** The session of a first start; a missing or corrupt session file yields this. */
export const DEFAULT_SESSION: Session = {
  recentWorkspaces: [],
  lastWorkspace: null,
  openTabs: [],
  activeTab: null,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  windowBounds: null,
};

/**
 * Parses a stored session (a JSON string or an already parsed object) and
 * falls back to the defaults for anything missing, invalid or corrupt —
 * never throws. Only paths and geometry are kept, never contents.
 * Skeleton: final signature, inert body — filled by "Persist settings, session
 * and window geometry" (tests in session.test.ts).
 */
export function parseSession(raw: unknown): Session {
  void raw;
  return { ...DEFAULT_SESSION, recentWorkspaces: [], openTabs: [] };
}

/** Serializes a session as JSON (paths and geometry only). */
export function serializeSession(s: Session): string {
  return JSON.stringify(s, null, 2);
}
