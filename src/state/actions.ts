/**
 * Every action the app store understands — the complete union, written once
 * by the skeleton. Feature tickets dispatch these; they do not add a second
 * spelling for the same change.
 */
import type {
  Cursor,
  Doc,
  Eol,
  FindMode,
  LanguageId,
  Overlay,
  Session,
  Settings,
  SidebarView,
  Tab,
} from '../types';

export type AppAction =
  /* ---- tabs (the list itself is reduced by tabsReducer in src/core/tabs.ts) ---- */
  /** Opens (or focuses) a tab and makes it active. */
  | { type: 'tab/open'; path: string; preview: boolean }
  /** Closes a tab; its doc is dropped and a neighbour becomes active. */
  | { type: 'tab/close'; path: string }
  | { type: 'tab/closeAll' }
  | { type: 'tab/activate'; path: string }
  /** Makes a preview tab permanent. */
  | { type: 'tab/pin'; path: string }
  | { type: 'tab/reorder'; from: number; to: number }
  /** Restores tabs from the session. */
  | { type: 'tab/restore'; tabs: Tab[]; activeTab: string | null }
  /* ---- documents ---- */
  | { type: 'doc/open'; doc: Doc }
  | { type: 'doc/close'; path: string }
  | { type: 'doc/setText'; path: string; text: string }
  | { type: 'doc/setEol'; path: string; eol: Eol }
  | { type: 'doc/setLanguage'; path: string; language: LanguageId }
  | { type: 'doc/setIndent'; path: string; indent: Doc['indent'] }
  /** After a successful save: `savedText` is the (LF) text now on disk. */
  | { type: 'doc/setSaved'; path: string; savedText: string }
  | { type: 'doc/setConflict'; path: string; conflict: boolean }
  /** Replaces a clean doc with the version on disk (external change / "Reload"). */
  | { type: 'doc/reload'; path: string; text: string; eol: Eol }
  /** A file or folder was renamed (explorer, Save As): tabs, docs and the active tab follow. */
  | { type: 'path/rename'; from: string; to: string }
  /* ---- settings, session, workspace ---- */
  | { type: 'settings/set'; settings: Settings }
  | { type: 'session/set'; session: Session }
  | { type: 'workspace/set'; workspace: string | null }
  /* ---- ui ---- */
  | { type: 'overlay/set'; overlay: Overlay }
  | { type: 'find/set'; findOpen: FindMode }
  /** Asks the explorer tree to re-read the disk. */
  | { type: 'explorer/bump' }
  | { type: 'cursor/set'; cursor: Cursor }
  | { type: 'sidebar/setView'; view: SidebarView };

export { openFile } from './openFile';
export type { OpenFileOptions } from './openFile';
