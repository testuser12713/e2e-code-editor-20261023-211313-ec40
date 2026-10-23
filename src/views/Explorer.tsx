/**
 * Explorer sidebar: the workspace folder name and its lazily expanded tree.
 * Skeleton: inert placeholder — filled by "Implement the explorer tree"
 * (design/mockups/editor.html, welcome.html).
 */
export function Explorer() {
  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Explorer</span>
      </div>
      <div className="sidebar-body">
        <div className="empty-state">
          <p>
            <strong>No folder opened</strong>
          </p>
          <p>Open a folder to browse its files and search across them.</p>
        </div>
      </div>
    </>
  );
}
