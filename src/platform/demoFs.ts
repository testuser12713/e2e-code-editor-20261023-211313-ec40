/**
 * Browser fallback of the preload bridge: a complete, in-memory demo
 * workspace that implements every method of `Api` (src/platform.ts), so the
 * renderer's web build can be exercised without Electron.
 *
 * - Paths look like Windows paths (backslashes, drive letter) and compare
 *   case-insensitively, exactly as on the target OS.
 * - Only paths inside the demo workspace are allowed (mirrors the main
 *   process' workspace restriction); errors reject with short codes only.
 * - Settings and session are kept in localStorage (memory if unavailable).
 * - Nothing here touches the network.
 */
import type { Api } from '../platform';
import type {
  AppInfo,
  DirEntry,
  FileStat,
  FsChangeEvent,
  FsChangeType,
  MenuState,
  ReadFileResult,
  SearchFileResult,
  SearchRequest,
  SearchResponse,
  Session,
  Settings,
} from '../types';
import { LIMITS } from '../types';
import { detectEol } from '../core/lineEndings';
import { matchGlob } from '../core/glob';
import { searchText } from '../core/workspaceSearch';
import { parseSettings, serializeSettings } from '../core/settings';
import { DEFAULT_SESSION, parseSession, serializeSession } from '../core/session';

declare const __APP_NAME__: string;
declare const __APP_VERSION__: string;

export const DEMO_ROOT = 'C:\\Demo\\weather-cli';
const SEP = '\\';
const IGNORED_DIRS = new Set(['node_modules', '.git']);
const SETTINGS_KEY = 'code-editor.settings';
const SESSION_KEY = 'code-editor.session';

/* ---------- demo content ---------- */

const lines = (...l: string[]): string => l.join('\n') + '\n';

/** Files of the demo workspace, relative to DEMO_ROOT. */
const DEMO_FILES: Record<string, string> = {
  '.gitignore': lines('node_modules/', 'dist/', '*.log'),
  'package.json': lines(
    '{',
    '  "name": "weather-cli",',
    '  "version": "0.4.2",',
    '  "private": true,',
    '  "type": "module",',
    '  "bin": { "weather": "dist/index.js" },',
    '  "scripts": {',
    '    "build": "tsc -p .",',
    '    "test": "vitest run"',
    '  },',
    '  "devDependencies": {',
    '    "typescript": "^5.4.5",',
    '    "vitest": "^1.6.0"',
    '  }',
    '}',
  ),
  'tsconfig.json': lines(
    '{',
    '  "compilerOptions": {',
    '    "target": "ES2022",',
    '    "module": "NodeNext",',
    '    "outDir": "dist",',
    '    "strict": true',
    '  },',
    '  "include": ["src"]',
    '}',
  ),
  'README.md': lines(
    '# weather-cli',
    '',
    'A small command line tool that prints the weather forecast for a city.',
    '',
    '## Usage',
    '',
    '```',
    'weather Berlin --days 3 --units metric',
    '```',
    '',
    'See `docs/usage.md` for every flag.',
  ),
  'docs\\usage.md': [
    '# Usage',
    '',
    '| Flag      | Meaning                         |',
    '|-----------|---------------------------------|',
    '| `--days`  | Number of days, 1 to 7          |',
    '| `--units` | `metric` or `imperial`          |',
    '| `--json`  | Print raw JSON instead of table |',
    '',
    'This file uses Windows line endings (CRLF).',
    '',
  ].join('\r\n'),
  'src\\types.ts': lines(
    'export type Units = "metric" | "imperial";',
    '',
    'export interface Location {',
    '  name: string;',
    '  lat: number;',
    '  lon: number;',
    '}',
    '',
    'export interface DailyForecast {',
    '  date: string;',
    '  min: number;',
    '  max: number;',
    '  rain: number;',
    '}',
    '',
    'export interface Forecast {',
    '  location: Location;',
    '  days: DailyForecast[];',
    '}',
  ),
  'src\\index.ts': lines(
    '// Entry point of weather-cli: prints a short forecast summary.',
    'const CITIES: Record<string, { lat: number; lon: number }> = {',
    '  Berlin: { lat: 52.52, lon: 13.41 },',
    '  Hamburg: { lat: 53.55, lon: 9.99 },',
    '  Munich: { lat: 48.14, lon: 11.58 },',
    '};',
    '',
    'async function main(): Promise<void> {',
    '  const [city = "Berlin"] = process.argv.slice(2);',
    '  const coords = CITIES[city];',
    '  if (!coords) throw new Error("Unknown city: " + city);',
    '  console.log(city + " at " + coords.lat + ", " + coords.lon);',
    '}',
    '',
    'main().catch((err) => {',
    '  console.error(err instanceof Error ? err.message : err);',
    '  process.exitCode = 1;',
    '});',
  ),
  'src\\api\\cache.ts': lines(
    'interface Entry<T> {',
    '  value: T;',
    '  storedAt: number;',
    '}',
    '',
    'const store = new Map<string, Entry<unknown>>();',
    '',
    'export function cacheGet<T>(key: string, maxAgeMs: number): T | undefined {',
    '  const entry = store.get(key);',
    '  if (!entry || Date.now() - entry.storedAt > maxAgeMs) return undefined;',
    '  return entry.value as T;',
    '}',
    '',
    'export function cacheSet<T>(key: string, value: T): void {',
    '  store.set(key, { value, storedAt: Date.now() });',
    '}',
  ),
  'src\\api\\forecast.ts': lines(
    'const BASE_URL = "https://api.open-meteo.com/v1/forecast";',
    'const MAX_AGE_MS = 10 * 60 * 1000;',
    '',
    'export interface Location {',
    '  name: string;',
    '  lat: number;',
    '  lon: number;',
    '}',
    '',
    'export interface Forecast {',
    '  location: Location;',
    '  days: { date: string; min: number; max: number; rain: number }[];',
    '}',
    '',
    'export interface ForecastOptions {',
    '  days: number;',
    '  units: "metric" | "imperial";',
    '}',
    '',
    'const cache = new Map<string, { value: Forecast; storedAt: number }>();',
    '',
    '/**',
    ' * Loads the daily forecast for a location.',
    ' * Results are cached for ten minutes.',
    ' */',
    'export async function loadForecast(',
    '  place: Location,',
    '  options: ForecastOptions = { days: 3, units: "metric" },',
    '): Promise<Forecast> {',
    '  const key = [place.lat, place.lon, options.days].join(":");',
    '  const cached = cache.get(key);',
    '  if (cached && Date.now() - cached.storedAt < MAX_AGE_MS) return cached.value;',
    '',
    '  const url = new URL(BASE_URL);',
    '  url.searchParams.set("latitude", String(place.lat));',
    '  url.searchParams.set("longitude", String(place.lon));',
    '  url.searchParams.set("forecast_days", String(options.days));',
    '',
    '  const response = await fetch(url);',
    '  if (!response.ok) {',
    '    throw new Error("Forecast request failed: " + response.status);',
    '  }',
    '',
    '  const forecast = (await response.json()) as Forecast;',
    '  cache.set(key, { value: forecast, storedAt: Date.now() });',
    '  return forecast;',
    '}',
  ),
  'src\\cli\\args.ts': lines(
    'export type Units = "metric" | "imperial";',
    '',
    'export interface CliArgs {',
    '  city: string;',
    '  days: number;',
    '  units: Units;',
    '  json: boolean;',
    '}',
    '',
    'const DEFAULTS: CliArgs = { city: "Berlin", days: 3, units: "metric", json: false };',
    '',
    'export function parseArgs(argv: string[]): CliArgs {',
    '  const args = { ...DEFAULTS };',
    '  for (let i = 0; i < argv.length; i++) {',
    '    const flag = argv[i];',
    '    if (flag === "--days") args.days = Number(argv[++i]);',
    '    else if (flag === "--units") args.units = argv[++i] as Units;',
    '    else if (flag === "--json") args.json = true;',
    '    else args.city = flag;',
    '  }',
    '  return args;',
    '}',
  ),
  'src\\cli\\commands.ts': lines(
    'export interface Command {',
    '  name: string;',
    '  description: string;',
    '}',
    '',
    'export const COMMANDS: Command[] = [',
    '  { name: "forecast", description: "Print the daily forecast for a city" },',
    '  { name: "cities", description: "List the known cities" },',
    '  { name: "help", description: "Show this help" },',
    '];',
    '',
    'export function renderHelp(): string {',
    '  const width = Math.max(...COMMANDS.map((c) => c.name.length));',
    '  return COMMANDS.map((c) => c.name.padEnd(width + 2) + c.description).join("\\n");',
    '}',
  ),
  'src\\format\\table.ts': lines(
    'export interface Row {',
    '  date: string;',
    '  min: string;',
    '  max: string;',
    '  rain: string;',
    '}',
    '',
    'export function renderTable(title: string, rows: Row[]): string {',
    '  const lines = rows.map((r) => [r.date, r.min, r.max, r.rain].join("  "));',
    '  return [title, ...lines].join("\\n");',
    '}',
  ),
  'src\\format\\units.ts': lines(
    'export type Units = "metric" | "imperial";',
    '',
    'export function formatTemperature(celsius: number, units: Units): string {',
    '  if (units === "imperial") return Math.round(celsius * 1.8 + 32) + " °F";',
    '  return Math.round(celsius) + " °C";',
    '}',
  ),
  'test\\args.test.ts': lines(
    'import { describe, expect, it } from "vitest";',
    '',
    'describe("command line flags", () => {',
    '  it("reads the value after --days", () => {',
    '    const argv = ["Hamburg", "--days", "5", "--json"];',
    '    expect(Number(argv[argv.indexOf("--days") + 1])).toBe(5);',
    '  });',
    '',
    '  it("treats the first plain word as the city", () => {',
    '    expect(["Munich", "--json"].find((a) => !a.startsWith("--"))).toBe("Munich");',
    '  });',
    '});',
  ),
  'test\\forecast.test.ts': lines(
    'import { describe, expect, it } from "vitest";',
    '',
    'describe("temperature rounding", () => {',
    '  it("rounds metric values", () => {',
    '    expect(Math.round(21.6)).toBe(22);',
    '  });',
    '',
    '  it("converts to Fahrenheit", () => {',
    '    expect(Math.round(20 * 1.8 + 32)).toBe(68);',
    '  });',
    '});',
  ),
  'scripts\\plot.py': lines(
    'import json',
    'import sys',
    '',
    '',
    'def main(path: str) -> None:',
    '    with open(path, encoding="utf-8") as fh:',
    '        data = json.load(fh)',
    '    for day in data["days"]:',
    '        print(day["date"], "#" * int(day["max"]))',
    '',
    '',
    'if __name__ == "__main__":',
    '    main(sys.argv[1])',
  ),
  'node_modules\\left-pad\\index.js': lines('module.exports = (s, n) => String(s).padStart(n);'),
  '.git\\HEAD': lines('ref: refs/heads/main'),
};

/** Files whose size is simulated (too large to keep in memory). */
const VIRTUAL_SIZES: Record<string, number> = {
  'data\\archive-2025.json': 6_500_000,
};

/* ---------- path helpers ---------- */

function normalizePath(input: string): string {
  const raw = input.replace(/\//g, SEP);
  const drive = /^[a-zA-Z]:/.exec(raw)?.[0] ?? '';
  const rest = raw.slice(drive.length);
  const parts: string[] = [];
  for (const part of rest.split(SEP)) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return drive + SEP + parts.join(SEP);
}

const keyOf = (p: string): string => normalizePath(p).toLowerCase();

function parentOf(p: string): string {
  const n = normalizePath(p);
  const i = n.lastIndexOf(SEP);
  return i <= 2 ? n.slice(0, 3) : n.slice(0, i);
}

function baseName(p: string): string {
  const n = normalizePath(p);
  return n.slice(n.lastIndexOf(SEP) + 1);
}

function isInside(child: string, root: string): boolean {
  const c = keyOf(child);
  const r = keyOf(root);
  return c === r || c.startsWith(r + SEP);
}

function relativeTo(root: string, p: string): string {
  return normalizePath(p).slice(normalizePath(root).length + 1);
}

function fail(code: string): never {
  throw new Error(code);
}

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/* ---------- storage ---------- */

function createStorage() {
  const memory = new Map<string, string>();
  return {
    get(key: string): string | null {
      try {
        const v = window.localStorage.getItem(key);
        if (v !== null) return v;
      } catch {
        /* storage unavailable: fall through to memory */
      }
      return memory.get(key) ?? null;
    },
    set(key: string, value: string): void {
      memory.set(key, value);
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage unavailable or full: the memory copy stays valid */
      }
    },
  };
}

/* ---------- the demo file system ---------- */

interface FileNode {
  kind: 'file';
  path: string;
  content: string;
  virtualSize?: number;
  mtimeMs: number;
}

interface DirNode {
  kind: 'dir';
  path: string;
  mtimeMs: number;
}

type Node = FileNode | DirNode;

export interface DemoApiOptions {
  /** Workspace root; defaults to DEMO_ROOT. */
  root?: string;
  /** Replaces the default demo files (paths relative to root, backslashes). */
  files?: Record<string, string>;
}

/** Creates an independent in-memory implementation of the whole bridge. */
export function createDemoApi(options: DemoApiOptions = {}): Api {
  const root = normalizePath(options.root ?? DEMO_ROOT);
  const nodes = new Map<string, Node>();
  const storage = createStorage();
  const changeListeners = new Set<(e: FsChangeEvent) => void>();
  const menuListeners = new Set<(id: string) => void>();
  const closeListeners = new Set<() => void>();
  const cancelled = new Set<string>();
  let watchedRoot: string | null = null;

  const now = () => Date.now();

  function ensureDir(path: string): void {
    const n = normalizePath(path);
    if (!isInside(n, root)) return;
    if (nodes.has(keyOf(n))) return;
    if (keyOf(n) !== keyOf(root)) ensureDir(parentOf(n));
    nodes.set(keyOf(n), { kind: 'dir', path: n, mtimeMs: now() });
  }

  function seed(rel: string, content: string, virtualSize?: number): void {
    const p = normalizePath(root + SEP + rel);
    ensureDir(parentOf(p));
    nodes.set(keyOf(p), { kind: 'file', path: p, content, virtualSize, mtimeMs: now() });
  }

  ensureDir(root);
  const files = options.files ?? DEMO_FILES;
  for (const [rel, content] of Object.entries(files)) seed(rel, content);
  if (!options.files) {
    for (const [rel, size] of Object.entries(VIRTUAL_SIZES)) seed(rel, '', size);
  }

  /* -- guards -- */

  function allowed(path: unknown): string {
    if (typeof path !== 'string' || path.length === 0 || path.length > 4096) fail('invalid-argument');
    const n = normalizePath(path);
    if (!isInside(n, root)) fail('path-not-allowed');
    return n;
  }

  function getNode(path: string): Node {
    const node = nodes.get(keyOf(path));
    if (!node) fail('not-found');
    return node;
  }

  function getDir(path: string): DirNode {
    const node = getNode(path);
    if (node.kind !== 'dir') fail('not-a-directory');
    return node;
  }

  function getFile(path: string): FileNode {
    const node = getNode(path);
    if (node.kind !== 'file') fail('is-a-directory');
    return node;
  }

  function sizeOf(node: FileNode): number {
    return node.virtualSize ?? byteLength(node.content);
  }

  function isIgnored(path: string): boolean {
    return relativeTo(root, path)
      .split(SEP)
      .some((seg) => IGNORED_DIRS.has(seg.toLowerCase()));
  }

  function childrenOf(dir: string): Node[] {
    const dirKey = keyOf(dir);
    const out: Node[] = [];
    for (const [key, node] of nodes) {
      if (key !== dirKey && parentOf(key) === dirKey) out.push(node);
    }
    return out;
  }

  function subtreeKeys(path: string): string[] {
    const k = keyOf(path);
    return [...nodes.keys()].filter((key) => key === k || key.startsWith(k + SEP));
  }

  function emit(type: FsChangeType, path: string): void {
    if (!watchedRoot || !isInside(path, watchedRoot)) return;
    const event: FsChangeEvent = { type, path };
    setTimeout(() => {
      for (const cb of [...changeListeners]) cb(event);
    }, 0);
  }

  function requireParentDir(path: string): void {
    const parent = parentOf(path);
    if (!nodes.has(keyOf(parent))) fail('not-found');
    getDir(parent);
  }

  function listAllFiles(start: string): string[] {
    const startKey = keyOf(start);
    const out: string[] = [];
    for (const [key, node] of nodes) {
      if (node.kind !== 'file') continue;
      if (!key.startsWith(startKey + SEP)) continue;
      if (isIgnored(node.path)) continue;
      out.push(node.path);
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  /* -- settings + session -- */

  function loadSession(): Session {
    return parseSession(storage.get(SESSION_KEY));
  }

  function saveSession(s: Session): void {
    storage.set(SESSION_KEY, serializeSession(s));
  }

  const api: Api = {
    fs: {
      async openFolderDialog(): Promise<string | null> {
        return root;
      },
      async openFileDialog(): Promise<string | null> {
        return normalizePath(root + SEP + 'README.md');
      },
      async saveAsDialog(defaultPath?: string): Promise<string | null> {
        if (defaultPath !== undefined) {
          const p = allowed(defaultPath);
          const dot = p.lastIndexOf('.');
          const hasExt = dot > p.lastIndexOf(SEP) + 1;
          return hasExt ? `${p.slice(0, dot)}-copy${p.slice(dot)}` : `${p}-copy`;
        }
        return normalizePath(root + SEP + 'untitled.txt');
      },
      async readDir(dir: string): Promise<DirEntry[]> {
        const d = allowed(dir);
        getDir(d);
        return childrenOf(d)
          .filter((n) => !(n.kind === 'dir' && IGNORED_DIRS.has(baseName(n.path).toLowerCase())))
          .map((n) => ({ name: baseName(n.path), path: n.path, isDir: n.kind === 'dir' }))
          .sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });
      },
      async listFiles(start: string): Promise<string[]> {
        const d = allowed(start);
        getDir(d);
        return listAllFiles(d);
      },
      async readFile(path: string): Promise<ReadFileResult> {
        const node = getFile(allowed(path));
        const size = sizeOf(node);
        if (size > LIMITS.maxFileBytes) return { content: '', eol: 'lf', size, tooLarge: true };
        return { content: node.content, eol: detectEol(node.content), size, tooLarge: false };
      },
      async writeFile(path: string, content: string): Promise<void> {
        const p = allowed(path);
        if (typeof content !== 'string') fail('invalid-argument');
        const existing = nodes.get(keyOf(p));
        if (existing && existing.kind === 'dir') fail('is-a-directory');
        requireParentDir(p);
        nodes.set(keyOf(p), { kind: 'file', path: existing?.path ?? p, content, mtimeMs: now() });
        emit(existing ? 'change' : 'add', existing?.path ?? p);
      },
      async createFile(path: string): Promise<void> {
        const p = allowed(path);
        if (nodes.has(keyOf(p))) fail('already-exists');
        requireParentDir(p);
        nodes.set(keyOf(p), { kind: 'file', path: p, content: '', mtimeMs: now() });
        emit('add', p);
      },
      async createDir(path: string): Promise<void> {
        const p = allowed(path);
        if (nodes.has(keyOf(p))) fail('already-exists');
        requireParentDir(p);
        nodes.set(keyOf(p), { kind: 'dir', path: p, mtimeMs: now() });
        emit('addDir', p);
      },
      async rename(from: string, to: string): Promise<void> {
        const src = allowed(from);
        const dst = allowed(to);
        const node = getNode(src);
        if (keyOf(src) === keyOf(root)) fail('path-not-allowed');
        if (isInside(dst, src) && keyOf(dst) !== keyOf(src)) fail('invalid-argument');
        const caseOnly = keyOf(src) === keyOf(dst);
        if (!caseOnly && nodes.has(keyOf(dst))) fail('already-exists');
        requireParentDir(dst);
        const srcNorm = normalizePath(src);
        const moved: Node[] = subtreeKeys(src).map((k) => nodes.get(k) as Node);
        for (const k of subtreeKeys(src)) nodes.delete(k);
        for (const n of moved) {
          const newPath = normalizePath(dst + n.path.slice(srcNorm.length));
          nodes.set(keyOf(newPath), { ...n, path: newPath, mtimeMs: now() });
        }
        const isDir = node.kind === 'dir';
        emit(isDir ? 'unlinkDir' : 'unlink', node.path);
        emit(isDir ? 'addDir' : 'add', normalizePath(dst));
      },
      async trash(path: string): Promise<void> {
        const p = allowed(path);
        if (keyOf(p) === keyOf(root)) fail('path-not-allowed');
        const node = getNode(p);
        for (const k of subtreeKeys(p)) nodes.delete(k);
        emit(node.kind === 'dir' ? 'unlinkDir' : 'unlink', node.path);
      },
      async reveal(path: string): Promise<void> {
        // A browser has no file manager to reveal a file in; the path is only validated.
        getNode(allowed(path));
      },
      async stat(path: string): Promise<FileStat> {
        const node = getNode(allowed(path));
        return node.kind === 'dir'
          ? { size: 0, mtimeMs: node.mtimeMs, isDir: true }
          : { size: sizeOf(node), mtimeMs: node.mtimeMs, isDir: false };
      },
      async watch(path: string): Promise<void> {
        const p = allowed(path);
        getDir(p);
        watchedRoot = p;
      },
      async unwatch(): Promise<void> {
        watchedRoot = null;
      },
      onChange(cb: (e: FsChangeEvent) => void): () => void {
        changeListeners.add(cb);
        return () => {
          changeListeners.delete(cb);
        };
      },
    },

    search: {
      async run(req: SearchRequest): Promise<SearchResponse> {
        if (!req || typeof req.id !== 'string' || typeof req.query !== 'string') fail('invalid-argument');
        if (req.query.length > LIMITS.maxQueryLength) fail('invalid-argument');
        const start = allowed(req.root);
        getDir(start);
        const response: SearchResponse = { id: req.id, files: [], truncated: false, timedOut: false };
        if (req.query.length === 0) return response;

        const startedAt = now();
        let total = 0;
        const results: SearchFileResult[] = [];
        const candidates = listAllFiles(start);
        for (let i = 0; i < candidates.length; i++) {
          if (cancelled.has(req.id)) break;
          if (now() - startedAt > LIMITS.searchTimeoutMs) {
            response.timedOut = true;
            break;
          }
          const path = candidates[i];
          const rel = relativeTo(start, path).replace(/\\/g, '/');
          if (req.include.trim() && !matchGlob(req.include, rel)) continue;
          if (req.exclude.trim() && matchGlob(req.exclude, rel)) continue;
          const node = nodes.get(keyOf(path));
          if (!node || node.kind !== 'file' || sizeOf(node) > LIMITS.maxFileBytes) continue;
          let matches;
          try {
            matches = searchText(node.content, {
              query: req.query,
              caseSensitive: req.caseSensitive,
              wholeWord: req.wholeWord,
              regex: req.regex,
              maxMatches: LIMITS.maxSearchMatches - total,
            });
          } catch (err) {
            const code = err instanceof Error && err.message === 'invalid-regex' ? 'invalid-regex' : 'search-failed';
            cancelled.delete(req.id);
            return { ...response, error: code };
          }
          if (matches.length > 0) {
            results.push({ path, matches });
            total += matches.length;
            if (total >= LIMITS.maxSearchMatches) {
              response.truncated = true;
              break;
            }
          }
          // Keep the UI responsive on large workspaces.
          if (i % 200 === 199) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        cancelled.delete(req.id);
        response.files = results;
        return response;
      },
      async cancel(id: string): Promise<void> {
        if (typeof id !== 'string') fail('invalid-argument');
        cancelled.add(id);
      },
    },

    settings: {
      async load(): Promise<Settings> {
        return parseSettings(storage.get(SETTINGS_KEY));
      },
      async save(s: Settings): Promise<void> {
        storage.set(SETTINGS_KEY, serializeSettings(s));
      },
    },

    session: {
      async load(): Promise<Session> {
        return loadSession();
      },
      async save(s: Session): Promise<void> {
        saveSession(s);
      },
      async clearRecent(): Promise<void> {
        const s = loadSession();
        saveSession({
          ...DEFAULT_SESSION,
          sidebarWidth: s.sidebarWidth,
          windowBounds: s.windowBounds,
          recentWorkspaces: [],
          lastWorkspace: null,
          openTabs: [],
          activeTab: null,
        });
      },
    },

    app: {
      async setTitle(t: string): Promise<void> {
        if (typeof t !== 'string') fail('invalid-argument');
        document.title = t.slice(0, 300);
      },
      onMenuCommand(cb: (commandId: string) => void): () => void {
        // A browser has no native menu; the in-page title bar runs commands directly.
        menuListeners.add(cb);
        return () => {
          menuListeners.delete(cb);
        };
      },
      onBeforeClose(cb: () => void): () => void {
        // A browser tab cannot be held open by a custom prompt; listeners are kept for symmetry.
        closeListeners.add(cb);
        return () => {
          closeListeners.delete(cb);
        };
      },
      async confirmClose(allow: boolean): Promise<void> {
        if (typeof allow !== 'boolean') fail('invalid-argument');
      },
      async getVersion(): Promise<AppInfo> {
        return { name: __APP_NAME__, version: __APP_VERSION__ };
      },
      async openExternal(url: string): Promise<void> {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          fail('invalid-url');
        }
        if (parsed.protocol !== 'https:') fail('invalid-url');
        window.open(parsed.href, '_blank', 'noopener,noreferrer');
      },
      async copyText(text: string): Promise<void> {
        if (typeof text !== 'string') fail('invalid-argument');
        if (!navigator.clipboard) fail('clipboard-unavailable');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          fail('clipboard-unavailable');
        }
      },
      async setMenuState(s: MenuState): Promise<void> {
        if (!s || typeof s.wordWrap !== 'boolean') fail('invalid-argument');
      },
    },
  };

  return api;
}
