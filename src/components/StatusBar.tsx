import { useApp } from '../state/AppStore';

/**
 * Status bar: cursor position and selection, read-only marker, language,
 * indentation, line ending (clickable) and encoding.
 * Skeleton: inert placeholder — filled by "Implement the status bar"
 * (design/mockups/editor.html, welcome.html).
 */
export function StatusBar() {
  const { state } = useApp();
  return (
    <footer className="statusbar" data-testid="status-bar">
      <div className="status-group">
        {state.workspace === null && <span className="status-item">No folder open</span>}
      </div>
      <div className="status-group">
        <span className="status-item" title="Encoding">
          UTF-8
        </span>
      </div>
    </footer>
  );
}
