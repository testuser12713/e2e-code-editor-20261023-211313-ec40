/**
 * The ONE door from the renderer to the operating system.
 *
 * In Electron the preload script (electron/preload.cjs) exposes `window.api`
 * via contextBridge. In a plain browser (the renderer's web build) there is no
 * preload, so every call falls back to the in-memory demo workspace in
 * src/platform/demoFs.ts and the UI stays fully usable.
 *
 * Every call is promise based; errors reject with an Error whose message is a
 * short code string (e.g. "not-found"), never file contents or full paths.
 */
import type {
  AppInfo,
  DirEntry,
  FileStat,
  FsChangeEvent,
  MenuState,
  ReadFileResult,
  SearchRequest,
  SearchResponse,
  Session,
  Settings,
} from './types';
import { createDemoApi } from './platform/demoFs';

export type {
  AppInfo,
  DirEntry,
  FileStat,
  FsChangeEvent,
  MenuState,
  ReadFileResult,
  SearchRequest,
  SearchResponse,
} from './types';

export interface FsApi {
  openFolderDialog(): Promise<string | null>;
  openFileDialog(): Promise<string | null>;
  /** A path chosen in the dialog becomes an allowed path in the main process. */
  saveAsDialog(defaultPath?: string): Promise<string | null>;
  /** Folders first, then files, alphabetical; node_modules and .git hidden. */
  readDir(dir: string): Promise<DirEntry[]>;
  /** Every file below root (same ignores), absolute paths. */
  listFiles(root: string): Promise<string[]>;
  readFile(path: string): Promise<ReadFileResult>;
  /** UTF-8; content already carries its final line endings. */
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  trash(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
  watch(root: string): Promise<void>;
  unwatch(): Promise<void>;
  onChange(cb: (e: FsChangeEvent) => void): () => void;
}

export interface SearchApi {
  run(req: SearchRequest): Promise<SearchResponse>;
  cancel(id: string): Promise<void>;
}

export interface SettingsApi {
  load(): Promise<Settings>;
  save(s: Settings): Promise<void>;
}

export interface SessionApi {
  load(): Promise<Session>;
  save(s: Session): Promise<void>;
  clearRecent(): Promise<void>;
}

export interface AppApi {
  setTitle(t: string): Promise<void>;
  onMenuCommand(cb: (commandId: string) => void): () => void;
  onBeforeClose(cb: () => void): () => void;
  confirmClose(allow: boolean): Promise<void>;
  getVersion(): Promise<AppInfo>;
  /** https: URLs only. */
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  setMenuState(s: MenuState): Promise<void>;
}

export interface Api {
  fs: FsApi;
  search: SearchApi;
  settings: SettingsApi;
  session: SessionApi;
  app: AppApi;
}

declare global {
  interface Window {
    /** Present only inside Electron (exposed by electron/preload.cjs). */
    api?: Api;
  }
}

function resolveApi(): { api: Api; isDesktop: boolean } {
  if (typeof window !== 'undefined' && window.api) {
    return { api: window.api, isDesktop: true };
  }
  return { api: createDemoApi(), isDesktop: false };
}

const resolved = resolveApi();

/** The bridge every renderer module uses. */
export const api: Api = resolved.api;

/** true inside Electron, false in the browser web build (demo workspace). */
export const isDesktop: boolean = resolved.isDesktop;

/** Extracts the short error code of a rejected bridge call. */
export function errorCode(err: unknown): string {
  if (err instanceof Error && /^[a-z][a-z0-9-]{0,40}$/i.test(err.message)) return err.message;
  return 'unknown-error';
}
