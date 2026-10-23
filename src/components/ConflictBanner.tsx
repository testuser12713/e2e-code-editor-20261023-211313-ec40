/**
 * Notice for a dirty file that changed on disk, with Reload and Keep mine
 * (design/mockups/file-conflict.html). Shown above the editor of the active
 * doc while its `conflict` flag is set (set by src/state/externalChanges.ts).
 */
import { useState } from 'react';
import { useApp, useAppStore } from '../state/AppStore';
import { keepMine, reloadFromDisk } from '../state/externalChanges';
import { api } from '../platform';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function ConflictBanner() {
  const { state } = useApp();
  const store = useAppStore();
  const [busy, setBusy] = useState(false);
  const path = state.activeTab;
  const doc = path ? state.docs[path] : undefined;
  if (!path || !doc || !doc.conflict) return null;

  const reload = () => {
    setBusy(true);
    void reloadFromDisk({ store, api }, path).finally(() => setBusy(false));
  };

  return (
    <Banner
      testId="conflict-banner"
      actions={
        <>
          <Button variant="primary" size="sm" data-testid="conflict-reload" disabled={busy} onClick={reload}>
            Reload
          </Button>
          <Button size="sm" data-testid="conflict-keep" disabled={busy} onClick={() => keepMine(store, path)}>
            Keep mine
          </Button>
        </>
      }
    >
      <strong>{baseName(path)}</strong> was changed on disk by another program, and you have unsaved changes here.
    </Banner>
  );
}
