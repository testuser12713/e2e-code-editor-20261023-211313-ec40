/**
 * Save / Don't Save / Cancel prompt for closing a dirty tab or the window
 * (design/mockups/unsaved-changes.html).
 *
 * - `requestCloseTab(path)` closes a tab, asking first when its doc is dirty.
 *   The `tab.close` command (Ctrl+W, menu) goes through it; the tab bar's close
 *   button and middle click should call it too instead of dispatching
 *   `tab/close` directly.
 * - Closing the window (app.onBeforeClose) asks for every dirty doc in tab
 *   order and answers through app.confirmClose.
 *
 * The flows (`closeTabWithPrompt`, `confirmWindowClose`) take their store,
 * question and save function as arguments so they are testable without React.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { appStore, type AppState, type AppStoreHandle } from '../state/AppStore';
import { saveDoc } from '../state/saveActions';
import { registerHandler } from '../commands/registry';
import { api, errorCode, isDesktop } from '../platform';
import type { Doc } from '../types';
import { Dialog, Scrim } from '../ui/Dialog';
import { Button } from '../ui/Button';

export type SaveChoice = 'save' | 'dontSave' | 'cancel';

/* ---------- decision logic ---------- */

export function isDirty(doc: Pick<Doc, 'text' | 'savedText'> | undefined): boolean {
  return doc !== undefined && doc.text !== doc.savedText;
}

/** Paths of every dirty open doc, in tab order. */
export function dirtyPaths(state: Pick<AppState, 'tabs' | 'docs'>): string[] {
  return state.tabs.map((t) => t.path).filter((p) => isDirty(state.docs[p]));
}

export interface PromptDeps {
  store: AppStoreHandle;
  /** Asks the user about one dirty doc. */
  ask: (path: string) => Promise<SaveChoice>;
  /** Writes the doc to disk; true on success. */
  save: (store: AppStoreHandle, path: string) => Promise<boolean>;
}

/**
 * Closes the tab at `path`; a dirty doc is asked about first. Save closes only
 * once the write succeeded, Don't Save closes and drops the changes, Cancel
 * keeps everything. Returns true when the tab was closed.
 */
export async function closeTabWithPrompt(path: string, deps: PromptDeps): Promise<boolean> {
  const { store } = deps;
  if (!store.getState().tabs.some((t) => t.path === path)) return false;
  if (isDirty(store.getState().docs[path])) {
    const choice = await deps.ask(path);
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await deps.save(store, path))) return false;
  }
  store.dispatch({ type: 'tab/close', path });
  return true;
}

/**
 * Before the window closes: asks about every dirty doc (activating it so it is
 * visible). Returns true when the window may close; Cancel or a failed save
 * keeps it open.
 */
export async function confirmWindowClose(deps: PromptDeps): Promise<boolean> {
  const { store } = deps;
  for (const path of dirtyPaths(store.getState())) {
    // The doc may have been saved or closed while an earlier question was open.
    if (!isDirty(store.getState().docs[path])) continue;
    store.dispatch({ type: 'tab/activate', path });
    const choice = await deps.ask(path);
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await deps.save(store, path))) return false;
  }
  return true;
}

/* ---------- the pending question (one at a time) ---------- */

interface Pending {
  path: string;
  resolve: (choice: SaveChoice) => void;
}

let pending: Pending | null = null;
const queue: Pending[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of [...listeners]) l();
}

function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPending(): Pending | null {
  return pending;
}

/** Shows the prompt for `path` and resolves with the user's choice. */
export function askSaveChanges(path: string): Promise<SaveChoice> {
  return new Promise<SaveChoice>((resolve) => {
    const entry = { path, resolve };
    if (pending) queue.push(entry);
    else pending = entry;
    notify();
  });
}

function answer(choice: SaveChoice): void {
  const current = pending;
  if (!current) return;
  pending = queue.shift() ?? null;
  notify();
  current.resolve(choice);
}

const defaultDeps = (): PromptDeps => ({ store: appStore, ask: askSaveChanges, save: saveDoc });

/** Closes a tab of the app, asking first when it has unsaved changes. */
export function requestCloseTab(path: string): Promise<boolean> {
  return closeTabWithPrompt(path, defaultDeps());
}

/* ---------- component ---------- */

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

/** Wires tab.close and the window's close request to the prompt. */
function useCloseGuards(): void {
  useEffect(() => {
    const offCommand = registerHandler('tab.close', (arg?: unknown) => {
      const path = typeof arg === 'string' ? arg : appStore.getState().activeTab;
      if (path) return requestCloseTab(path);
    });

    let asking = false;
    const offBeforeClose = api.app.onBeforeClose(() => {
      if (asking) return; // a second close request while we are still asking
      asking = true;
      confirmWindowClose(defaultDeps())
        .then((allow) => api.app.confirmClose(allow))
        .catch((err: unknown) => console.error('[close] confirm failed:', errorCode(err)))
        .finally(() => {
          asking = false;
        });
    });

    // The browser build cannot show its own prompt on unload; the browser's
    // built-in "leave site?" question protects the dirty buffers there.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyPaths(appStore.getState()).length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    if (!isDesktop) window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      offCommand();
      offBeforeClose();
      if (!isDesktop) window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);
}

export function SavePrompt() {
  useCloseGuards();
  const current = useSyncExternalStore(subscribePending, getPending, getPending);
  if (!current) return null;

  return (
    <>
      <Scrim />
      <Dialog
        key={current.path}
        role="alertdialog"
        testId="unsaved-dialog"
        title={`Save changes to ${baseName(current.path)}?`}
        onClose={() => answer('cancel')}
        actions={
          <>
            <Button variant="ghost" data-testid="unsaved-cancel" onClick={() => answer('cancel')}>
              Cancel
            </Button>
            <Button data-testid="unsaved-dont-save" onClick={() => answer('dontSave')}>
              Don't Save
            </Button>
            <Button variant="primary" data-testid="unsaved-save" onClick={() => answer('save')}>
              Save
            </Button>
          </>
        }
      >
        Your changes will be lost if you don't save them.
      </Dialog>
    </>
  );
}
