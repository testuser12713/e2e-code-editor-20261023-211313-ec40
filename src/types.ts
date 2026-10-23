/**
 * Shared types of the renderer — written once by the skeleton. Every module
 * imports these; never redefine a local copy with different fields.
 */

export type LanguageId =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'python'
  | 'cpp'
  | 'java'
  | 'go'
  | 'rust'
  | 'plaintext';

export type Eol = 'lf' | 'crlf';

export type ThemeSetting = 'system' | 'dark' | 'light';

export interface Settings {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  trimOnSave: boolean;
  finalNewlineOnSave: boolean;
  theme: ThemeSetting;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Session {
  recentWorkspaces: string[];
  lastWorkspace: string | null;
  openTabs: { path: string; preview: boolean }[];
  activeTab: string | null;
  sidebarWidth: number;
  windowBounds: WindowBounds | null;
}

export interface Doc {
  path: string;
  text: string;
  savedText: string;
  eol: Eol;
  language: LanguageId;
  indent: { useTabs: boolean; size: number };
  readOnly: boolean;
  tooLarge: boolean;
  conflict: boolean;
}

export interface Tab {
  path: string;
  preview: boolean;
}

export type SidebarView = 'explorer' | 'search' | 'settings';

export type Overlay = null | 'quickOpen' | 'palette' | 'goToLine' | 'about';

export type FindMode = null | 'find' | 'replace';

export interface Cursor {
  line: number;
  col: number;
  selLength: number;
}

/* ---------- Bridge payloads (window.api, see src/platform.ts) ---------- */

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface ReadFileResult {
  content: string;
  eol: Eol;
  size: number;
  /** true when size > 5 MB; content is then empty. */
  tooLarge: boolean;
}

export interface FileStat {
  size: number;
  mtimeMs: number;
  isDir: boolean;
}

export type FsChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface FsChangeEvent {
  type: FsChangeType;
  path: string;
}

export interface SearchRequest {
  id: string;
  root: string;
  /** max 500 characters */
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  include: string;
  exclude: string;
}

export interface SearchMatch {
  /** 1-based line number */
  line: number;
  start: number;
  end: number;
  preview: string;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  id: string;
  files: SearchFileResult[];
  truncated: boolean;
  timedOut: boolean;
  error?: string;
}

export interface MenuState {
  wordWrap: boolean;
  theme: 'dark' | 'light';
}

export interface AppInfo {
  name: string;
  version: string;
}

/** Limits shared by the main process and the browser fallback. */
export const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxQueryLength: 500,
  maxSearchMatches: 5000,
  searchTimeoutMs: 10_000,
} as const;
