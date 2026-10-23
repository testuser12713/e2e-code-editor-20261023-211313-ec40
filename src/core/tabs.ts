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

/**
 * Pure reducer of the tab list.
 * Skeleton: final signature, inert body — filled by "Implement tabs and the
 * CodeMirror editor host" (tests in tabs.test.ts).
 */
export function tabsReducer(state: Tab[], action: TabAction): Tab[] {
  void action;
  return state;
}
