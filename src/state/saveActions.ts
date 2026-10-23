import type { AppStoreHandle } from './AppStore';
import { registerHandler } from '../commands/registry';
import { api, errorCode } from '../platform';
import { applyEol } from '../core/lineEndings';
import { transformForSave } from '../core/saveTransform';

/**
 * Writes the doc at `path` to `target` (defaults to its own path): applies the
 * enabled save transforms, restores the doc's line ending and marks it saved.
 * Returns true on success.
 */
export async function saveDoc(store: AppStoreHandle, path: string, target: string = path): Promise<boolean> {
  const state = store.getState();
  const doc = state.docs[path];
  if (!doc || doc.readOnly || doc.tooLarge) return false;
  const text = transformForSave(doc.text, state.settings);
  try {
    await api.fs.writeFile(target, applyEol(text, doc.eol));
  } catch (err) {
    console.error('[save] write failed:', errorCode(err));
    return false;
  }
  if (target !== path) {
    const existing = store.getState().tabs.some((t) => t.path === target);
    if (existing) store.dispatch({ type: 'tab/close', path: target });
    store.dispatch({ type: 'path/rename', from: path, to: target });
  }
  if (text !== doc.text) store.dispatch({ type: 'doc/setText', path: target, text });
  store.dispatch({ type: 'doc/setSaved', path: target, savedText: text });
  store.dispatch({ type: 'tab/pin', path: target });
  return true;
}

/**
 * Registers the command handlers for file.save, file.saveAs and file.saveAll.
 * Called ONCE by AppStore; returns a function that unregisters them again.
 */
export function registerSaveHandlers(store: AppStoreHandle): () => void {
  const offs = [
    registerHandler('file.save', () => {
      const active = store.getState().activeTab;
      if (active) void saveDoc(store, active);
    }),
    registerHandler('file.saveAs', () => {
      const active = store.getState().activeTab;
      if (!active) return;
      api.fs
        .saveAsDialog(active)
        .then((target) => (target ? saveDoc(store, active, target) : false))
        .catch((err: unknown) => console.error('[save] save as failed:', errorCode(err)));
    }),
    registerHandler('file.saveAll', () => {
      const { docs } = store.getState();
      for (const doc of Object.values(docs)) {
        if (doc.text !== doc.savedText) void saveDoc(store, doc.path);
      }
    }),
  ];
  return () => offs.forEach((off) => off());
}
