import type { AppStoreHandle } from './AppStore';

/**
 * Registers the command handlers for file.save, file.saveAs and file.saveAll
 * (line-ending preservation, trim/final-newline on save). Called ONCE by
 * AppStore; returns a function that unregisters them again.
 *
 * Skeleton: final signature, inert body — filled by "Implement saving with
 * line-ending preservation".
 */
export function registerSaveHandlers(store: AppStoreHandle): () => void {
  void store;
  return () => undefined;
}
