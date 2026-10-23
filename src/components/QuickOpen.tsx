/**
 * Quick Open (Ctrl+P): fuzzy file search across the workspace, recent files
 * for an empty query. Shown while state.overlay === 'quickOpen'
 * (design/mockups/quick-open.html).
 *
 * The file list comes from fs.listFiles(workspace), loaded once per workspace
 * and cached at module level; it is re-read only when the explorer was bumped
 * (disk changed) since the last load. Only the first MAX_ROWS results are
 * rendered so a 10,000-file workspace stays responsive.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useApp, useAppStore } from '../state/AppStore';
import { openFile } from '../state/actions';
import { api, errorCode } from '../platform';
import { registerHandler } from '../commands/registry';
import { fuzzyMatchPath } from '../core/fuzzy';
import { getActiveView } from '../editor/keymaps';
import { Scrim } from '../ui/Dialog';
import {
  HighlightedText,
  ListRow,
  OverlayEmpty,
  OverlayFooter,
  OverlayHeading,
  OverlayInput,
  OverlayList,
  OverlayListBox,
} from '../ui/OverlayList';

/** Upper bound of rendered result rows. */
export const MAX_ROWS = 100;
/** How many recently opened files the empty query lists. */
export const MAX_RECENT = 20;

const LIST_ID = 'quick-open-list';

/* ---------- file list cache (per workspace) ---------- */

interface CacheEntry {
  version: number;
  files: Promise<string[]>;
}

const fileCache = new Map<string, CacheEntry>();

/** The files of `workspace`, read once and reused until `version` changes. */
export function loadWorkspaceFiles(workspace: string, version: number): Promise<string[]> {
  const hit = fileCache.get(workspace);
  if (hit && hit.version === version) return hit.files;
  const files = api.fs.listFiles(workspace).then(
    (list) => (Array.isArray(list) ? list : []),
    (err: unknown) => {
      fileCache.delete(workspace);
      throw err;
    },
  );
  fileCache.set(workspace, { version, files });
  return files;
}

/** Drops every cached file list (tests). */
export function clearQuickOpenCache(): void {
  fileCache.clear();
}

/* ---------- recently opened files (most recent first) ---------- */

const recentFiles: string[] = [];

function noteRecent(path: string): void {
  const at = recentFiles.indexOf(path);
  if (at >= 0) recentFiles.splice(at, 1);
  recentFiles.unshift(path);
  if (recentFiles.length > MAX_RECENT * 2) recentFiles.length = MAX_RECENT * 2;
}

/** Clears the recent-file history (tests). */
export function clearRecentFiles(): void {
  recentFiles.length = 0;
}

/* ---------- path helpers ---------- */

function separatorOf(path: string): string {
  return path.includes('\\') ? '\\' : '/';
}

/** `path` relative to `root` when it lies below it, else `path` unchanged. */
export function relativePath(root: string | null, path: string): string {
  if (!root) return path;
  const sep = separatorOf(root);
  const prefix = root.endsWith(sep) ? root : root + sep;
  const norm = (s: string) => (sep === '\\' ? s.toLowerCase() : s);
  return norm(path).startsWith(norm(prefix)) ? path.slice(prefix.length) : path;
}

function splitName(rel: string): { dir: string; base: number } {
  const base = Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\')) + 1;
  return { dir: base > 0 ? rel.slice(0, base - 1) : '', base };
}

interface Row {
  path: string;
  rel: string;
  indices: number[];
  group: 'recent' | 'files' | 'match';
}

/** Ranks `files` (absolute) against `query`; best first, at most `limit`. */
export function rankFiles(query: string, files: string[], root: string | null, limit = MAX_ROWS): Row[] {
  const scored: { row: Row; score: number; index: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = files[i];
    const rel = relativePath(root, path);
    const m = fuzzyMatchPath(query, rel);
    if (m) scored.push({ row: { path, rel, indices: m.indices, group: 'match' }, score: m.score, index: i });
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((s) => s.row);
}

/* ---------- component ---------- */

type LoadState = { status: 'idle' | 'loading' | 'ready'; files: string[] } | { status: 'error'; files: string[]; code: string };

export function QuickOpen() {
  const { state, dispatch } = useApp();
  const store = useAppStore();
  const open = state.overlay === 'quickOpen';
  const { workspace, explorerVersion, activeTab, tabs } = state;

  // Register the command once per store.
  useEffect(
    () =>
      registerHandler('view.quickOpen', () => {
        store.dispatch({ type: 'overlay/set', overlay: 'quickOpen' });
      }),
    [store],
  );

  // Track the most recently activated files.
  useEffect(() => {
    if (activeTab) noteRecent(activeTab);
  }, [activeTab]);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: 'idle', files: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Reset and (re)load on open.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setSelected(0);
    inputRef.current?.focus();
    if (!workspace) {
      setLoad({ status: 'ready', files: [] });
      return;
    }
    let alive = true;
    setLoad((prev) => ({ status: 'loading', files: prev.files }));
    loadWorkspaceFiles(workspace, explorerVersion).then(
      (files) => {
        if (alive) setLoad({ status: 'ready', files });
      },
      (err: unknown) => {
        if (alive) setLoad({ status: 'error', files: [], code: errorCode(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, [open, workspace, explorerVersion]);

  const q = query.trim();

  const rows = useMemo<Row[]>(() => {
    if (!open) return [];
    if (q) return rankFiles(q, load.files, workspace);
    const seen = new Set<string>();
    const recent: Row[] = [];
    const addRecent = (path: string) => {
      if (seen.has(path) || recent.length >= MAX_RECENT) return;
      seen.add(path);
      recent.push({ path, rel: relativePath(workspace, path), indices: [], group: 'recent' });
    };
    for (const p of recentFiles) {
      if (tabs.some((t) => t.path === p) || load.files.includes(p)) addRecent(p);
    }
    for (const t of tabs) addRecent(t.path);
    const rest: Row[] = [];
    for (const path of load.files) {
      if (recent.length + rest.length >= MAX_ROWS) break;
      if (!seen.has(path)) rest.push({ path, rel: relativePath(workspace, path), indices: [], group: 'files' });
    }
    return [...recent, ...rest];
  }, [open, q, load.files, workspace, tabs]);

  const sel = rows.length ? Math.min(selected, rows.length - 1) : -1;

  // Keep the selected row visible.
  useEffect(() => {
    if (!open || sel < 0) return;
    const el = document.getElementById(`${LIST_ID}-${sel}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [open, sel]);

  if (!open) return null;

  const close = (refocus = true) => {
    dispatch({ type: 'overlay/set', overlay: null });
    if (!refocus) return;
    const target = returnFocus.current;
    if (target && target.isConnected) target.focus();
    else getActiveView()?.focus();
  };

  const pick = (index: number) => {
    const row = rows[index];
    if (!row) return;
    close(false);
    openFile(row.path, { preview: false }).then(
      () => getActiveView()?.focus(),
      (err: unknown) => console.error(`[quick-open] open failed: ${errorCode(err)}`),
    );
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (rows.length) setSelected((sel + 1) % rows.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (rows.length) setSelected((sel - 1 + rows.length) % rows.length);
        break;
      case 'PageDown':
        e.preventDefault();
        if (rows.length) setSelected(Math.min(rows.length - 1, sel + 10));
        break;
      case 'PageUp':
        e.preventDefault();
        if (rows.length) setSelected(Math.max(0, sel - 10));
        break;
      case 'Enter':
        e.preventDefault();
        pick(sel);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      default:
        break;
    }
  };

  let empty: string | null = null;
  if (rows.length === 0) {
    if (load.status === 'error') empty = 'Could not list the files of this folder';
    else if (load.status === 'loading' || load.status === 'idle') empty = 'Loading files…';
    else if (!workspace && !q) empty = 'Open a folder to search its files';
    else empty = q ? 'No matching files' : 'No files in this folder';
  }

  const renderRow = (row: Row, index: number) => {
    const { dir, base } = splitName(row.rel);
    const nameHits = row.indices.filter((i) => i >= base).map((i) => i - base);
    const dirHits = row.indices.filter((i) => i < base - 1);
    return (
      <ListRow
        key={row.path}
        id={`${LIST_ID}-${index}`}
        title={<HighlightedText text={row.rel.slice(base)} indices={nameHits} />}
        subtitle={dir ? <HighlightedText text={dir} indices={dirHits} /> : undefined}
        selected={index === sel}
        onSelect={() => pick(index)}
        onHover={() => {
          if (index !== sel) setSelected(index);
        }}
        testId="quick-open-row"
      />
    );
  };

  const firstFiles = rows.findIndex((r) => r.group === 'files');
  const hasRecent = rows.length > 0 && rows[0].group === 'recent';

  return (
    <>
      <Scrim onPress={() => close()} />
      <OverlayList label="Quick Open" testId="quick-open">
        <OverlayInput
          ref={inputRef}
          label="Search files by name"
          placeholder="Search files by name"
          listId={LIST_ID}
          activeOptionId={sel >= 0 ? `${LIST_ID}-${sel}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          data-testid="quick-open-input"
        />
        <OverlayListBox id={LIST_ID} label="Files">
          {!q && hasRecent && <OverlayHeading>Recently opened</OverlayHeading>}
          {rows.map((row, i) => (
            <QuickOpenGroup key={row.path} showFilesHeading={!q && hasRecent && i === firstFiles}>
              {renderRow(row, i)}
            </QuickOpenGroup>
          ))}
          {empty && <OverlayEmpty>{empty}</OverlayEmpty>}
        </OverlayListBox>
        <OverlayFooter
          hints={[
            { keys: 'Up Down', label: 'navigate' },
            { keys: 'Enter', label: 'open' },
            { keys: 'Esc', label: 'close' },
          ]}
        />
      </OverlayList>
    </>
  );
}

function QuickOpenGroup({ showFilesHeading, children }: { showFilesHeading: boolean; children: ReactNode }) {
  return (
    <>
      {showFilesHeading && <OverlayHeading>Files</OverlayHeading>}
      {children}
    </>
  );
}
