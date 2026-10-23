/**
 * Explorer sidebar: the workspace folder name and its lazily expanded tree
 * (design/mockups/editor.html `sidebar-explorer`, welcome.html
 * `sidebar-explorer-empty`).
 *
 * - Without a workspace: the "No folder opened" empty state with Open Folder.
 * - With one: header, folder name, and a tree whose folders read their
 *   children through fs.readDir the first time they are expanded. The whole
 *   tree re-reads the disk whenever state.explorerVersion changes.
 * - The visible rows are flattened and windowed (only the rows in view plus a
 *   small overscan are in the DOM), so folders with 10,000 files stay smooth.
 * - Single click opens a preview tab, double click (or Enter) a permanent one;
 *   right click hands the node to the ExplorerContextMenu through
 *   onExplorerContextMenu().
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useApp } from '../state/AppStore';
import { openFile } from '../state/actions';
import { runCommand } from '../commands/registry';
import { api, errorCode } from '../platform';
import type { DirEntry } from '../types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { SidebarBody, SidebarHeader, SidebarSubtitle } from '../ui/Sidebar';
import { Tree, TreeItem, TreeRow } from '../ui/Tree';

/* ---------- path helpers (Windows backslash and POSIX paths) ---------- */

const WIN_DRIVE = /^[a-zA-Z]:/;

function isWindowsPath(p: string): boolean {
  return p.includes('\\') || WIN_DRIVE.test(p);
}

/** The separator a path uses: backslash for Windows paths, else slash. */
export function pathSep(p: string): '\\' | '/' {
  return isWindowsPath(p) ? '\\' : '/';
}

/** Removes trailing separators, keeping a root such as `C:\` or `/`. */
function trimTrailingSep(p: string): string {
  let end = p.length;
  while (end > 1 && (p[end - 1] === '\\' || p[end - 1] === '/')) {
    if (end === 3 && WIN_DRIVE.test(p)) break; // "C:\"
    end--;
  }
  return p.slice(0, end);
}

/** The last segment of a path: `C:\Demo\weather-cli` → `weather-cli`. */
export function baseName(p: string): string {
  const t = trimTrailingSep(p);
  const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'));
  const name = i >= 0 ? t.slice(i + 1) : t;
  return name || t;
}

/** The folder containing a path, or null at a root. */
export function parentPath(p: string): string | null {
  const t = trimTrailingSep(p);
  const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'));
  if (i < 0) return null;
  if (i === t.length - 1) return null; // a root such as "C:\" or "/"
  if (i === 0) return t.slice(0, 1); // "/home" → "/"
  if (i === 2 && WIN_DRIVE.test(t)) return t.slice(0, 3); // "C:\Demo" → "C:\"
  return t.slice(0, i);
}

/** Joins a folder and a name with the folder's own separator. */
export function joinPath(dir: string, name: string): string {
  const sep = pathSep(dir);
  const d = trimTrailingSep(dir);
  return d.endsWith('\\') || d.endsWith('/') ? d + name : d + sep + name;
}

/**
 * A comparison key: Windows paths compare case-insensitively and with either
 * separator; POSIX paths compare exactly.
 */
export function pathKey(p: string): string {
  const t = trimTrailingSep(p);
  return isWindowsPath(t) ? t.replace(/\//g, '\\').toLowerCase() : t;
}

export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return pathKey(a) === pathKey(b);
}

/* ---------- tree model (pure) ---------- */

const IGNORED = new Set(['node_modules', '.git']);

/**
 * Folders first, then files, each alphabetical (case-insensitive, natural
 * numbers); node_modules and .git are hidden. The main process already sorts,
 * the renderer keeps the order guaranteed for every bridge implementation.
 */
export function sortEntries(entries: DirEntry[]): DirEntry[] {
  return entries
    .filter((e) => !(e.isDir && IGNORED.has(e.name.toLowerCase())))
    .slice()
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
}

export type FlatRow =
  | { type: 'entry'; entry: DirEntry; depth: number; expanded: boolean }
  | { type: 'error'; key: string; depth: number };

/**
 * The rows the tree shows, top to bottom: a folder's children follow it when
 * it is expanded and its children are loaded; a folder that failed to load
 * shows one error row.
 */
export function flattenTree(
  root: string,
  children: ReadonlyMap<string, DirEntry[]>,
  expanded: { has(key: string): boolean },
  errors: ReadonlySet<string> = new Set(),
): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (dir: string, depth: number) => {
    const list = children.get(pathKey(dir));
    if (!list) {
      if (depth > 0 && errors.has(pathKey(dir))) out.push({ type: 'error', key: pathKey(dir), depth });
      return;
    }
    for (const entry of list) {
      const isOpen = entry.isDir && expanded.has(pathKey(entry.path));
      out.push({ type: 'entry', entry, depth, expanded: isOpen });
      if (isOpen) walk(entry.path, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/** The first and last (exclusive) row index to render for a scroll position. */
export function visibleRange(scrollTop: number, viewportHeight: number, total: number, rowHeight = ROW_HEIGHT, overscan = OVERSCAN) {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  return { first, last: Math.max(first, last) };
}

/* ---------- context menu hand-off ---------- */

export interface ExplorerContextMenuRequest {
  node: DirEntry;
  /** Viewport coordinates of the pointer (or of the row for the keyboard). */
  x: number;
  y: number;
}

const menuListeners = new Set<(req: ExplorerContextMenuRequest) => void>();
const menuTargetListeners = new Set<(path: string | null) => void>();

/** The ExplorerContextMenu subscribes here to open on a tree node. */
export function onExplorerContextMenu(cb: (req: ExplorerContextMenuRequest) => void): () => void {
  menuListeners.add(cb);
  return () => {
    menuListeners.delete(cb);
  };
}

/** The menu calls this when it closes, so the row loses its menu-target outline. */
export function closeExplorerContextMenu(): void {
  for (const l of [...menuTargetListeners]) l(null);
}

function requestContextMenu(req: ExplorerContextMenuRequest): boolean {
  if (menuListeners.size === 0) return false;
  for (const l of [...menuTargetListeners]) l(req.node.path);
  for (const l of [...menuListeners]) l(req);
  return true;
}

/* ---------- component ---------- */

export const ROW_HEIGHT = 24;
const OVERSCAN = 12;
/** Used until the scroll container has been measured (and in jsdom). */
const FALLBACK_VIEWPORT = 800;

function reportError(where: string, err: unknown): void {
  console.error(`[explorer] ${where} failed: ${errorCode(err)}`);
}

async function openFolder(dispatch: (a: { type: 'workspace/set'; workspace: string | null }) => void): Promise<void> {
  if (runCommand('file.openFolder')) return;
  // No command handler registered (yet): open the folder directly.
  try {
    const dir = await api.fs.openFolderDialog();
    if (dir) dispatch({ type: 'workspace/set', workspace: dir });
  } catch (err) {
    reportError('openFolder', err);
  }
}

export function Explorer() {
  const { state, dispatch } = useApp();
  const { workspace, explorerVersion, activeTab } = state;

  if (!workspace) {
    return (
      <>
        <SidebarHeader title="Explorer" />
        <EmptyState
          title="No folder opened"
          testId="explorer-empty"
          action={
            <Button variant="primary" data-testid="explorer-open-folder" onClick={() => void openFolder(dispatch)}>
              Open Folder
            </Button>
          }
        >
          Open a folder to browse its files and search across them.
        </EmptyState>
      </>
    );
  }

  return <WorkspaceTree key={pathKey(workspace)} root={workspace} version={explorerVersion} activeTab={activeTab} />;
}

function WorkspaceTree({ root, version, activeTab }: { root: string; version: number; activeTab: string | null }) {
  const name = baseName(root);
  const [children, setChildren] = useState<Map<string, DirEntry[]>>(() => new Map());
  const [expanded, setExpanded] = useState<Map<string, string>>(() => new Map());
  const [errors, setErrors] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  const alive = useRef(true);
  const inflight = useRef(new Map<string, number>());
  const loadSeq = useRef(0);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => menuTargetSubscribe(setMenuTarget), []);

  /** Reads one folder; a newer read of the same folder wins. Resolves false on failure. */
  const loadDir = useCallback(async (dir: string): Promise<boolean> => {
    const key = pathKey(dir);
    const seq = ++loadSeq.current;
    inflight.current.set(key, seq);
    try {
      const entries = sortEntries(await api.fs.readDir(dir));
      if (!alive.current || inflight.current.get(key) !== seq) return true;
      setChildren((m) => new Map(m).set(key, entries));
      setErrors((s) => {
        if (!s.has(key)) return s;
        const n = new Set(s);
        n.delete(key);
        return n;
      });
      return true;
    } catch (err) {
      if (!alive.current || inflight.current.get(key) !== seq) return false;
      reportError('readDir', err);
      setChildren((m) => {
        if (!m.has(key)) return m;
        const n = new Map(m);
        n.delete(key);
        return n;
      });
      setErrors((s) => new Set(s).add(key));
      return false;
    } finally {
      if (inflight.current.get(key) === seq) inflight.current.delete(key);
    }
  }, []);

  // First load and every explorerVersion bump: re-read the root and every
  // expanded folder; drop cached children of collapsed folders (they reload
  // on their next expand).
  useEffect(() => {
    const open = [...expandedRef.current];
    const keep = new Set([pathKey(root), ...open.map(([k]) => k)]);
    setChildren((m) => {
      const n = new Map<string, DirEntry[]>();
      for (const [k, v] of m) if (keep.has(k)) n.set(k, v);
      return n;
    });
    void loadDir(root);
    for (const [key, path] of open) {
      void loadDir(path).then((ok) => {
        if (ok || !alive.current) return;
        // A folder that vanished collapses instead of showing an error.
        setExpanded((s) => {
          if (!s.has(key)) return s;
          const n = new Map(s);
          n.delete(key);
          return n;
        });
        setErrors((s) => {
          if (!s.has(key)) return s;
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      });
    }
  }, [root, version, loadDir]);

  const rows = useMemo(() => flattenTree(root, children, expanded, errors), [root, children, expanded, errors]);
  const rootLoaded = children.has(pathKey(root));
  const rootFailed = errors.has(pathKey(root));

  /* -- measuring the scroll container (the SidebarBody around the tree) -- */

  const scrollEl = useCallback((): HTMLElement | null => wrapRef.current?.parentElement ?? null, []);

  useLayoutEffect(() => {
    const el = scrollEl();
    if (!el) return;
    const measure = () => setViewport(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [scrollEl, rootLoaded]);

  const height = viewport > 0 ? viewport : FALLBACK_VIEWPORT;
  const { first, last } = visibleRange(scrollTop, height, rows.length);

  /* -- focus management for keyboard navigation -- */

  const indexOf = useCallback(
    (path: string | null) => (path === null ? -1 : rows.findIndex((r) => r.type === 'entry' && samePath(r.entry.path, path))),
    [rows],
  );

  const scrollIntoView = useCallback(
    (index: number) => {
      const el = scrollEl();
      if (!el) return;
      const top = index * ROW_HEIGHT;
      const h = el.clientHeight || FALLBACK_VIEWPORT;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_HEIGHT > el.scrollTop + h) el.scrollTop = top + ROW_HEIGHT - h;
      setScrollTop(el.scrollTop);
    },
    [scrollEl],
  );

  const moveFocus = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row || row.type !== 'entry') return;
      pendingFocus.current = row.entry.path;
      setFocused(row.entry.path);
      scrollIntoView(index);
    },
    [rows, scrollIntoView],
  );

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const el = rowRefs.current.get(pathKey(target));
    if (el) {
      pendingFocus.current = null;
      el.focus();
    }
  });

  /* -- actions -- */

  const toggle = useCallback(
    (entry: DirEntry, open?: boolean) => {
      const key = pathKey(entry.path);
      const isOpen = expandedRef.current.has(key);
      const next = open ?? !isOpen;
      if (next === isOpen) return;
      setExpanded((s) => {
        const n = new Map(s);
        if (next) n.set(key, entry.path);
        else n.delete(key);
        return n;
      });
      if (next && !children.has(key) && !inflight.current.has(key)) void loadDir(entry.path);
    },
    [children, loadDir],
  );

  const open = (entry: DirEntry, preview: boolean) => {
    openFile(entry.path, { preview }).catch((err: unknown) => reportError('openFile', err));
  };

  const onRowClick = (entry: DirEntry) => {
    setFocused(entry.path);
    if (entry.isDir) toggle(entry);
    else open(entry, true);
  };

  const onRowDoubleClick = (entry: DirEntry) => {
    if (!entry.isDir) open(entry, false);
  };

  const showMenu = (entry: DirEntry, x: number, y: number) => {
    setFocused(entry.path);
    requestContextMenu({ node: entry, x, y });
  };

  const onRowContextMenu = (e: MouseEvent<HTMLButtonElement>, entry: DirEntry) => {
    e.preventDefault();
    showMenu(entry, e.clientX, e.clientY);
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number, entry: DirEntry, depth: number, isOpen: boolean) => {
    switch (e.key) {
      case 'ArrowDown': {
        let i = index + 1;
        while (i < rows.length && rows[i].type !== 'entry') i++;
        moveFocus(i);
        break;
      }
      case 'ArrowUp': {
        let i = index - 1;
        while (i >= 0 && rows[i].type !== 'entry') i--;
        moveFocus(i);
        break;
      }
      case 'Home':
        moveFocus(0);
        break;
      case 'End': {
        let i = rows.length - 1;
        while (i >= 0 && rows[i].type !== 'entry') i--;
        moveFocus(i);
        break;
      }
      case 'ArrowRight':
        if (!entry.isDir) return;
        if (!isOpen) toggle(entry, true);
        else {
          const next = rows[index + 1];
          if (next && next.type === 'entry' && next.depth > depth) moveFocus(index + 1);
        }
        break;
      case 'ArrowLeft':
        if (entry.isDir && isOpen) {
          toggle(entry, false);
        } else {
          const parent = parentPath(entry.path);
          const i = parent && !samePath(parent, root) ? indexOf(parent) : -1;
          if (i >= 0) moveFocus(i);
        }
        break;
      case 'Enter':
        if (entry.isDir) toggle(entry);
        else open(entry, false);
        break;
      case 'ContextMenu':
      case 'F10': {
        if (e.key === 'F10' && !e.shiftKey) return;
        const r = e.currentTarget.getBoundingClientRect();
        showMenu(entry, r.left + 24, r.bottom);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  /* -- render -- */

  const setRowRef = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  };

  let body: ReactNode;
  if (rootFailed && !rootLoaded) {
    body = (
      <EmptyState title="Folder could not be read" testId="explorer-error">
        The folder may have been moved or you may not have access to it.
      </EmptyState>
    );
  } else if (rootLoaded && rows.length === 0) {
    body = <EmptyState title="This folder is empty" testId="explorer-folder-empty" />;
  } else {
    const slice = rows.slice(first, last);
    body = (
      <Tree label={`Files in ${name}`} testId="explorer-tree">
        {first > 0 && <li role="none" aria-hidden="true" style={{ height: first * ROW_HEIGHT }} />}
        {slice.map((row, i) => {
          const index = first + i;
          if (row.type === 'error') {
            return (
              <li key={`error:${row.key}`} role="none" className="notice" data-testid="explorer-row-error">
                Could not read this folder.
              </li>
            );
          }
          const { entry, depth, expanded: isOpen } = row;
          const key = pathKey(entry.path);
          return (
            <TreeItem
              key={key}
              expanded={entry.isDir ? isOpen : undefined}
              selected={samePath(focused, entry.path)}
              row={
                <TreeRow
                  ref={setRowRef(key)}
                  name={entry.name}
                  kind={entry.isDir ? 'dir' : 'file'}
                  depth={depth}
                  active={!entry.isDir && samePath(activeTab, entry.path)}
                  menuTarget={samePath(menuTarget, entry.path)}
                  title={entry.name}
                  testId={`tree-row-${entry.name}`}
                  onClick={() => onRowClick(entry)}
                  onDoubleClick={() => onRowDoubleClick(entry)}
                  onContextMenu={(e) => onRowContextMenu(e, entry)}
                  onKeyDown={(e) => onRowKeyDown(e, index, entry, depth, isOpen)}
                />
              }
            />
          );
        })}
        {last < rows.length && <li role="none" aria-hidden="true" style={{ height: (rows.length - last) * ROW_HEIGHT }} />}
      </Tree>
    );
  }

  return (
    <>
      <SidebarHeader title="Explorer" />
      <SidebarSubtitle title={name}>
        <span data-testid="explorer-folder-name">{name}</span>
      </SidebarSubtitle>
      <SidebarBody>
        <div ref={wrapRef} data-testid="explorer-body">
          {body}
        </div>
      </SidebarBody>
    </>
  );
}

function menuTargetSubscribe(cb: (path: string | null) => void): () => void {
  menuTargetListeners.add(cb);
  return () => {
    menuTargetListeners.delete(cb);
  };
}
