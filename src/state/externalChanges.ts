/**
 * Watches the workspace for changes on disk: a clean open file reloads
 * automatically, a dirty one gets the conflict notice (Reload / Keep mine),
 * and the explorer is bumped. Called ONCE inside AppStore.
 *
 * The decision itself is the pure `decideExternalChange`; `startExternalChanges`
 * wires it to the store and the bridge (testable without React), and
 * `useExternalChanges` runs it for the app's store.
 */
import { useEffect } from 'react';
import { appStore, type AppStoreHandle } from './AppStore';
import { api as platformApi, errorCode, type Api } from '../platform';
import { normalizeToLf } from '../core/lineEndings';
import type { Doc, FsChangeEvent } from '../types';

export type ExternalChangeDecision =
  /** Disk holds what we last saved (e.g. our own save): nothing to do. */
  | 'ignore'
  /** The buffer is clean: replace it with the disk version silently. */
  | 'reload'
  /** The buffer is dirty but already equals the disk version: just mark it saved. */
  | 'markSaved'
  /** The buffer is dirty and differs from disk: show Reload / Keep mine. */
  | 'conflict';

/** Decides what an external change of an open file means for its doc. `diskText` is LF-normalized. */
export function decideExternalChange(doc: Pick<Doc, 'text' | 'savedText'>, diskText: string): ExternalChangeDecision {
  if (diskText === doc.savedText) return 'ignore';
  if (doc.text === doc.savedText) return 'reload';
  if (doc.text === diskText) return 'markSaved';
  return 'conflict';
}

export interface ExternalChangesDeps {
  store: AppStoreHandle;
  api: Pick<Api, 'fs'>;
}

/** Reads the file and applies the decision to its open doc (if any). */
export async function applyExternalChange(deps: ExternalChangesDeps, path: string): Promise<void> {
  const { store, api } = deps;
  if (!store.getState().docs[path]) return;
  let result;
  try {
    result = await api.fs.readFile(path);
  } catch (err) {
    console.error('[external] read failed:', errorCode(err));
    return;
  }
  // Re-read the doc: it may have been edited, saved or closed while we waited.
  const doc = store.getState().docs[path];
  if (!doc || result.tooLarge || doc.tooLarge) return;
  const diskText = normalizeToLf(result.content);
  switch (decideExternalChange(doc, diskText)) {
    case 'ignore':
      return;
    case 'reload':
      store.dispatch({ type: 'doc/reload', path, text: diskText, eol: result.eol });
      return;
    case 'markSaved':
      store.dispatch({ type: 'doc/setSaved', path, savedText: diskText });
      store.dispatch({ type: 'doc/setConflict', path, conflict: false });
      return;
    case 'conflict':
      store.dispatch({ type: 'doc/setConflict', path, conflict: true });
      return;
  }
}

/** "Reload" on the conflict notice: replaces the buffer with the disk version. */
export async function reloadFromDisk(deps: ExternalChangesDeps, path: string): Promise<boolean> {
  const { store, api } = deps;
  try {
    const result = await api.fs.readFile(path);
    if (result.tooLarge || !store.getState().docs[path]) return false;
    store.dispatch({ type: 'doc/reload', path, text: normalizeToLf(result.content), eol: result.eol });
    return true;
  } catch (err) {
    console.error('[external] reload failed:', errorCode(err));
    return false;
  }
}

/** "Keep mine" on the conflict notice: the buffer stays as it is (and stays dirty). */
export function keepMine(store: AppStoreHandle, path: string): void {
  store.dispatch({ type: 'doc/setConflict', path, conflict: false });
}

function isFileContentEvent(e: FsChangeEvent): boolean {
  return e.type === 'change' || e.type === 'add';
}

/**
 * Subscribes to fs.onChange and keeps the workspace watched while one is open.
 * Returns the function that stops everything again.
 */
export function startExternalChanges(deps: ExternalChangesDeps): () => void {
  const { store, api } = deps;
  let watched: string | null = null;
  let stopped = false;

  const syncWatch = () => {
    const ws = store.getState().workspace;
    if (ws === watched) return;
    watched = ws;
    const call = ws ? api.fs.watch(ws) : api.fs.unwatch();
    call.catch((err: unknown) => {
      if (!stopped) console.warn('[external] watch failed:', errorCode(err));
    });
  };

  const offChange = api.fs.onChange((e) => {
    if (stopped || !e || typeof e.path !== 'string') return;
    if (e.type !== 'change') store.dispatch({ type: 'explorer/bump' });
    if (isFileContentEvent(e)) void applyExternalChange(deps, e.path);
  });

  syncWatch();
  const offStore = store.subscribe(syncWatch);

  return () => {
    stopped = true;
    offStore();
    offChange();
  };
}

export function useExternalChanges(): void {
  useEffect(() => startExternalChanges({ store: appStore, api: platformApi }), []);
}
