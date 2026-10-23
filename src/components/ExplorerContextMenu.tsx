/**
 * Explorer context menu (design/mockups/explorer-context-menu.html): New File,
 * New Folder, Rename, Delete (with confirmation, moved to the Recycle Bin),
 * Reveal in File Explorer and Copy Path, with an inline name field.
 *
 * The explorer tree hands the exact node (absolute path, isDir) over through
 * onExplorerContextMenu() from src/views/Explorer.tsx; the menu calls
 * closeExplorerContextMenu() when it closes so the row loses its outline.
 * A right-click on the empty explorer area (no row) targets the workspace
 * root. F2 and Delete on a focused tree row go through the same hand-off and
 * start Rename and Delete directly. Every operation bumps
 * state.explorerVersion so the tree re-reads the disk at once; the
 * useExplorerRefresh hook (mounted here) does the same for changes on disk.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { api, errorCode } from '../platform';
import { useApp, useAppStore } from '../state/AppStore';
import { Button, Dialog, FieldError, Menu, MenuItem, MenuSeparator, Scrim, Toast, TreeInputRow } from '../ui';
import { baseName, isSameOrInside, joinPath, parentPath, selectionEnd, validateName } from '../core/fileNames';
import { closeExplorerContextMenu, onExplorerContextMenu, revealInExplorer, samePath } from '../views/Explorer';

/* ---------- target ---------- */

/** What the menu was opened on. */
export interface ExplorerMenuTarget {
  /** Absolute path of the file or folder (the workspace root for the empty area). */
  path: string;
  isDir: boolean;
  /** Indentation depth of the row (0 = top level, -1 = the workspace root itself). */
  depth: number;
  /** Viewport position of the pointer. */
  x: number;
  y: number;
  /** The row element, used to place the inline name field. */
  anchor?: HTMLElement | null;
}

/** Depth of `path` below `workspace` (0 = directly inside it, -1 = the workspace itself). */
export function depthIn(workspace: string, path: string): number {
  if (samePath(workspace, path)) return -1;
  const rest = path.slice(workspace.replace(/[\\/]+$/, '').length).replace(/^[\\/]+/, '');
  return Math.max(0, rest.split(/[\\/]+/).filter(Boolean).length - 1);
}

/** The tree row under a viewport point, if the platform can tell. */
function rowAt(x: number, y: number): HTMLElement | null {
  if (typeof document.elementFromPoint !== 'function') return null;
  const el = document.elementFromPoint(x, y);
  return el ? el.closest<HTMLElement>('.tree-row') : null;
}

/* ---------- disk changes ---------- */

/** Coalescing window for bursts of disk events (one tree refresh per burst). */
export const REFRESH_COALESCE_MS = 50;

/**
 * Watches the open workspace on disk (fs.watch) and bumps state.explorerVersion
 * for every change event (fs.onChange), coalesced per burst.
 */
export function useExplorerRefresh(): void {
  const { state, dispatch } = useApp();
  const workspace = state.workspace;

  useEffect(() => {
    let timer: number | null = null;
    const off = api.fs.onChange(() => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        dispatch({ type: 'explorer/bump' });
      }, REFRESH_COALESCE_MS);
    });
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [dispatch]);

  useEffect(() => {
    if (!workspace) return;
    let active = true;
    api.fs.watch(workspace).catch((err: unknown) => {
      if (active) console.warn(`[explorer] watching the workspace failed: ${errorCode(err)}`);
    });
    return () => {
      active = false;
      api.fs.unwatch().catch((err: unknown) => {
        console.warn(`[explorer] unwatch failed: ${errorCode(err)}`);
      });
    };
  }, [workspace]);
}

/* ---------- the component ---------- */

/** Where the inline name field floats: over the renamed row or just below the folder row. */
interface Placement {
  top: number;
  left: number;
  width: number;
}

type Edit =
  | { kind: 'new'; isDir: boolean; parent: string; depth: number; place: Placement | null }
  | { kind: 'rename'; path: string; isDir: boolean; depth: number; place: Placement | null };

/** Placement for a row; without one, the top of the explorer's tree area. */
function placementFor(row: HTMLElement | null | undefined, below: boolean): Placement | null {
  if (row) {
    const r = row.getBoundingClientRect();
    return { top: below ? r.bottom : r.top - 1, left: r.left, width: r.width };
  }
  const body = document.querySelector<HTMLElement>('[data-testid="sidebar"] .sidebar-body');
  if (!body) return null;
  const r = body.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width };
}

interface MenuState {
  target: ExplorerMenuTarget;
  isRoot: boolean;
}

const MENU_MARGIN = 8;
const MENU_WIDTH_GUESS = 220;

/** Human text for a failed operation (short code from the bridge). */
function failureText(action: string, name: string, code: string): string {
  if (code === 'already-exists') return `${name} already exists.`;
  if (code === 'access-denied' || code === 'path-not-allowed') return `Could not ${action} ${name}: access denied.`;
  if (code === 'not-found') return `Could not ${action} ${name}: it no longer exists.`;
  return `Could not ${action} ${name} (${code}).`;
}

export function ExplorerContextMenu() {
  useExplorerRefresh();
  const { state, dispatch } = useApp();
  const store = useAppStore();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; isDir: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Set while F2 / Delete asks the tree for its focused node: act directly instead of showing the menu. */
  const keyAction = useRef<{ action: 'rename' | 'delete'; row: HTMLElement } | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
    closeExplorerContextMenu();
  }, []);

  const bump = useCallback(() => dispatch({ type: 'explorer/bump' }), [dispatch]);

  /* opening: the explorer's hand-off for rows, the empty explorer area for the root, F2 / Delete on rows */
  useEffect(() => {
    const offTree = onExplorerContextMenu(({ node, x, y }) => {
      const workspace = store.getState().workspace;
      if (!workspace) return;
      const pending = keyAction.current;
      keyAction.current = null;
      const depth = Math.max(0, depthIn(workspace, node.path));
      if (pending) {
        closeExplorerContextMenu();
        if (pending.action === 'rename') {
          setEdit({ kind: 'rename', path: node.path, isDir: node.isDir, depth, place: placementFor(pending.row, false) });
        } else {
          setConfirmDelete({ path: node.path, isDir: node.isDir });
        }
        return;
      }
      setEdit(null);
      setMenu({ target: { path: node.path, isDir: node.isDir, depth, x, y, anchor: rowAt(x, y) }, isRoot: samePath(node.path, workspace) });
    });
    const onContextMenu = (e: MouseEvent) => {
      // A row's right-click was already handed over (and prevented) by the explorer.
      if (e.defaultPrevented) return;
      const el = e.target instanceof Element ? e.target : null;
      const sidebar = el?.closest<HTMLElement>('[data-testid="sidebar"]');
      if (!el || !sidebar || sidebar.dataset.view !== 'explorer') return;
      if (el.closest('.tree-row') || !el.closest('.sidebar-body')) return;
      const workspace = store.getState().workspace;
      if (!workspace) return;
      e.preventDefault();
      setEdit(null);
      setMenu({ target: { path: workspace, isDir: true, depth: -1, x: e.clientX, y: e.clientY, anchor: null }, isRoot: true });
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'F2' && e.key !== 'Delete') return;
      const row = e.target instanceof Element ? e.target.closest<HTMLElement>('.tree-row') : null;
      if (!row || !row.closest('[data-testid="sidebar"]') || !store.getState().workspace) return;
      e.preventDefault();
      // Ask the explorer for the exact node of this row through its own right-click hand-off.
      keyAction.current = { action: e.key === 'F2' ? 'rename' : 'delete', row };
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom }));
      keyAction.current = null;
    };
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      offTree();
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [store]);

  /* closing the menu: outside press, window resize / blur */
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      closeMenu();
    };
    const onClose = () => closeMenu();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [menu, closeMenu]);

  /* keep the menu inside the window and focus its first entry */
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!menu) {
      setMenuPos(null);
      return;
    }
    const el = menuRef.current;
    const w = el?.offsetWidth || MENU_WIDTH_GUESS;
    const h = el?.offsetHeight || 0;
    const left = Math.max(MENU_MARGIN, Math.min(menu.target.x, window.innerWidth - w - MENU_MARGIN));
    const top = Math.max(MENU_MARGIN, Math.min(menu.target.y, window.innerHeight - h - MENU_MARGIN));
    setMenuPos({ left, top });
    el?.querySelector<HTMLButtonElement>('.menu-item:not([disabled])')?.focus();
  }, [menu]);

  /* ---------- the operations ---------- */

  const startNew = (isDir: boolean) => {
    if (!menu) return;
    const { target } = menu;
    const parent = target.isDir ? target.path : parentPath(target.path);
    const depth = target.isDir ? target.depth + 1 : target.depth;
    const place = placementFor(target.anchor, true);
    closeMenu();
    // The entry goes inside a clicked folder: open it so the new entry has a visible place in the tree.
    if (target.isDir && !menu.isRoot) revealInExplorer(parent, { expandSelf: true });
    setEdit({ kind: 'new', isDir, parent, depth: Math.max(0, depth), place });
  };

  const startRename = () => {
    if (!menu) return;
    const { target } = menu;
    const place = placementFor(target.anchor, false);
    closeMenu();
    setEdit({ kind: 'rename', path: target.path, isDir: target.isDir, depth: Math.max(0, target.depth), place });
  };

  const startDelete = () => {
    if (!menu) return;
    const { path, isDir } = menu.target;
    closeMenu();
    setConfirmDelete({ path, isDir });
  };

  const reveal = async () => {
    if (!menu) return;
    const { path } = menu.target;
    closeMenu();
    try {
      await api.fs.reveal(path);
      setToast('Revealed in File Explorer');
    } catch (err) {
      setToast(failureText('reveal', baseName(path), errorCode(err)));
    }
  };

  const copyPath = async () => {
    if (!menu) return;
    const { path } = menu.target;
    closeMenu();
    try {
      await api.app.copyText(path);
      setToast('Path copied to clipboard');
    } catch (err) {
      setToast(failureText('copy the path of', baseName(path), errorCode(err)));
    }
  };

  /** Runs the inline edit; resolves to an error message to show, or null when done. */
  const commitEdit = async (current: Edit, name: string): Promise<string | null> => {
    try {
      if (current.kind === 'new') {
        const path = joinPath(current.parent, name);
        if (current.isDir) await api.fs.createDir(path);
        else await api.fs.createFile(path);
        setEdit(null);
        // Expands every folder down to the new entry and selects it once the re-read tree shows it.
        revealInExplorer(path);
        bump();
        setToast(current.isDir ? 'Folder created' : 'File created');
        return null;
      }
      const to = joinPath(parentPath(current.path), name);
      if (to === current.path) {
        setEdit(null);
        return null;
      }
      await api.fs.rename(current.path, to);
      setEdit(null);
      dispatch({ type: 'path/rename', from: current.path, to });
      bump();
      setToast(`Renamed to ${name}`);
      return null;
    } catch (err) {
      const code = errorCode(err);
      const what = current.kind === 'new' ? 'create' : 'rename';
      return failureText(what, name, code);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { path } = confirmDelete;
    setConfirmDelete(null);
    const name = baseName(path);
    try {
      await api.fs.trash(path);
    } catch (err) {
      setToast(failureText('delete', name, errorCode(err)));
      return;
    }
    // Tabs of the removed entry close; a tab with unsaved edits stays open so they are not lost.
    const { tabs, docs } = store.getState();
    for (const tab of tabs) {
      if (!isSameOrInside(tab.path, path)) continue;
      const doc = docs[tab.path];
      if (doc && doc.text !== doc.savedText) continue;
      dispatch({ type: 'tab/close', path: tab.path });
    }
    bump();
    setToast(`${name} moved to the Recycle Bin`);
  };

  /* ---------- rendering ---------- */

  const isRoot = menu?.isRoot ?? false;
  const menuStyle: CSSProperties = {
    position: 'fixed',
    left: menuPos?.left ?? menu?.target.x ?? 0,
    top: menuPos?.top ?? menu?.target.y ?? 0,
  };

  return (
    <>
      {menu && state.workspace ? (
        <Menu ref={menuRef} label="Explorer actions" style={menuStyle} testId="explorer-context-menu" onClose={closeMenu}>
          <MenuItem label="New File" onSelect={() => startNew(false)} testId="ctx-new-file" />
          <MenuItem label="New Folder" onSelect={() => startNew(true)} testId="ctx-new-folder" />
          <MenuSeparator />
          <MenuItem
            label="Rename"
            shortcut="F2"
            disabled={isRoot}
            disabledReason="The workspace folder cannot be renamed here"
            onSelect={startRename}
            testId="ctx-rename"
          />
          <MenuItem
            label="Delete"
            shortcut="Del"
            danger
            disabled={isRoot}
            disabledReason="The workspace folder cannot be deleted here"
            onSelect={startDelete}
            testId="ctx-delete"
          />
          <MenuSeparator />
          <MenuItem label="Reveal in File Explorer" onSelect={() => void reveal()} testId="ctx-reveal" />
          <MenuItem label="Copy Path" onSelect={() => void copyPath()} testId="ctx-copy-path" />
        </Menu>
      ) : null}
      {edit ? <InlineNameEdit key={edit.kind === 'new' ? `new:${edit.parent}` : `rename:${edit.path}`} edit={edit} onCommit={commitEdit} onCancel={() => setEdit(null)} /> : null}
      {confirmDelete ? (
        <>
          <Scrim onPress={() => setConfirmDelete(null)} />
          <Dialog
            role="alertdialog"
            title={`Delete ${baseName(confirmDelete.path)}?`}
            onClose={() => setConfirmDelete(null)}
            testId="delete-dialog"
            actions={
              <>
                <Button onClick={() => setConfirmDelete(null)} data-testid="delete-cancel">
                  Cancel
                </Button>
                {/* The visible label is the design's; the accessible name starts with it (label in name)
                    and also names the action the user chose, so the confirmation reads as "Delete". */}
                <Button
                  variant="danger"
                  onClick={() => void doDelete()}
                  aria-label="Move to Recycle Bin (Delete)"
                  data-testid="delete-confirm"
                >
                  Move to Recycle Bin
                </Button>
              </>
            }
          >
            <p>It will be moved to the Recycle Bin. You can restore it from there.</p>
          </Dialog>
        </>
      ) : null}
      {toast ? <Toast onDismiss={() => setToast(null)}>{toast}</Toast> : null}
    </>
  );
}

/* ---------- inline name field ---------- */

function InlineNameEdit({
  edit,
  onCommit,
  onCancel,
}: {
  edit: Edit;
  onCommit: (edit: Edit, name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const initial = edit.kind === 'rename' ? baseName(edit.path) : '';
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const errorId = 'explorer-name-error';

  const folder = edit.kind === 'new' ? edit.parent : parentPath(edit.path);

  useEffect(() => {
    let active = true;
    api.fs
      .readDir(folder)
      .then((entries) => {
        if (active) setSiblings(entries.map((e) => e.name));
      })
      .catch(() => {
        // Without the listing the duplicate check falls back to the error of the operation itself.
      });
    return () => {
      active = false;
    };
  }, [folder]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (edit.kind === 'rename') input.setSelectionRange(0, edit.isDir ? initial.length : selectionEnd(initial));
  }, [edit, initial]);

  const validation = validateName(value, siblings, edit.kind === 'rename' ? initial : undefined);
  const shownError = submitError ?? (touched ? validation : null);

  const submit = async () => {
    const name = value.trim();
    if (name.length === 0 || (edit.kind === 'rename' && name === initial)) {
      done.current = true;
      onCancel();
      return;
    }
    setTouched(true);
    if (validation) return;
    busyRef.current = true;
    setBusy(true);
    const error = await onCommit(edit, name);
    busyRef.current = false;
    setBusy(false);
    if (error) {
      setSubmitError(error);
      inputRef.current?.focus();
    } else {
      done.current = true;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      done.current = true;
      onCancel();
    }
  };

  const style: CSSProperties = edit.place ?? { top: 0, left: 0, width: 'var(--sidebar-w)' };

  return (
    <div className="explorer-inline-edit" style={style} data-testid="explorer-inline-edit">
      <ul className="tree" role="none">
        <TreeInputRow
          ref={inputRef}
          depth={edit.depth}
          label={edit.kind === 'rename' ? 'New name' : edit.isDir ? 'Folder name' : 'File name'}
          value={value}
          readOnly={busy}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            setTouched(true);
            setSubmitError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!done.current && !busyRef.current) onCancel();
          }}
          data-testid="explorer-name-input"
        />
      </ul>
      {shownError ? (
        <div className="explorer-inline-error">
          <FieldError id={errorId}>{shownError}</FieldError>
        </div>
      ) : null}
    </div>
  );
}
