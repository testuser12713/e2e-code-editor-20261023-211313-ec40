/**
 * Welcome screen (design/mockups/welcome.html), shown in the editor area while
 * no folder and no file is open: Open Folder, Open File and the list of recent
 * workspaces with "Clear list".
 *
 * This module also owns the `file.openFolder` command. It is registered when
 * the module is loaded (App imports it once), so the shortcut Ctrl+K Ctrl+O,
 * the menus, the palette and the explorer's button work whether or not the
 * welcome screen is currently shown.
 */
import { useCallback, useState } from 'react';
import { api, errorCode } from '../platform';
import { getCommand, registerHandler } from '../commands/registry';
import { clearRecentSession } from '../core/session';
import { appStore, useApp } from '../state/AppStore';
import { openFile } from '../state/actions';
import { Button, Icon, Keys, Toast } from '../ui';

/** Last segment of a Windows or POSIX path ("C:\a\notes-app" -> "notes-app"). */
export function workspaceName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  const name = i >= 0 ? trimmed.slice(i + 1) : trimmed;
  return name || path;
}

/** Makes `path` the open workspace (no-op when it already is). */
export function openWorkspace(path: string): void {
  if (appStore.getState().workspace === path) return;
  appStore.dispatch({ type: 'workspace/set', workspace: path });
}

/** Asks for a folder and opens it as the workspace. Cancelling changes nothing. */
export async function openFolder(): Promise<void> {
  const chosen = await api.fs.openFolderDialog();
  if (chosen) openWorkspace(chosen);
}

/** Asks for a single file and opens it in a tab. Cancelling changes nothing. */
export async function openSingleFile(): Promise<void> {
  const chosen = await api.fs.openFileDialog();
  if (chosen) await openFile(chosen);
}

registerHandler('file.openFolder', () => openFolder());

const CLEARED_MESSAGE = 'Recent workspaces cleared';

export function Welcome() {
  const { state, dispatch } = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const recent = state.session.recentWorkspaces;
  const openFolderShortcut = getCommand('file.openFolder')?.shortcut;

  const report = (what: string) => (err: unknown) => console.error(`[welcome] ${what} failed: ${errorCode(err)}`);

  const clearRecent = async () => {
    try {
      await api.session.clearRecent();
    } catch (err) {
      report('clear recent')(err);
    }
    // The store is the source of truth; session sync persists it either way.
    dispatch({ type: 'session/set', session: clearRecentSession(appStore.getState().session) });
    setToast(CLEARED_MESSAGE);
  };

  return (
    <section className="welcome" data-testid="welcome">
      <div className="welcome-inner">
        <Icon name="logo" className="welcome-logo" />
        <h1 data-testid="welcome-title">Code Editor</h1>
        <p className="welcome-lede">Fast, keyboard-driven editing for the folders you work in.</p>
        <div className="welcome-actions">
          <Button variant="primary" data-testid="welcome-open-folder" onClick={() => openFolder().catch(report('open folder'))}>
            Open Folder {openFolderShortcut ? <Keys shortcut={openFolderShortcut} /> : null}
          </Button>
          <Button data-testid="welcome-open-file" onClick={() => openSingleFile().catch(report('open file'))}>
            Open File
          </Button>
        </div>
        <section className="recent" aria-labelledby="recent-title" data-testid="recent-workspaces">
          <div className="recent-head">
            <h2 id="recent-title">Recent workspaces</h2>
            <Button
              variant="ghost"
              size="sm"
              data-testid="clear-recent"
              disabled={recent.length === 0}
              onClick={() => void clearRecent()}
            >
              Clear list
            </Button>
          </div>
          <div className="recent-list" data-testid="recent-list">
            {recent.length === 0 ? (
              <div className="recent-empty" data-testid="recent-empty">
                No recent workspaces
              </div>
            ) : (
              recent.map((path) => (
                <button
                  key={path}
                  className="recent-item"
                  type="button"
                  title={path}
                  data-testid="recent-item"
                  onClick={() => openWorkspace(path)}
                >
                  <span className="recent-name">{workspaceName(path)}</span>
                  <span className="recent-path">{path}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
      {toast ? <Toast onDismiss={dismissToast}>{toast}</Toast> : null}
    </section>
  );
}
