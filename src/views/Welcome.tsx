/**
 * Welcome screen (no folder open): Open Folder, Open File and the list of
 * recent workspaces with "Clear list".
 * Skeleton: inert placeholder — filled by "Build the welcome screen with
 * recent workspaces" (design/mockups/welcome.html).
 */
export function Welcome() {
  return (
    <section className="welcome" data-testid="welcome">
      <div className="welcome-inner">
        <svg className="icon welcome-logo" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3.5L2 8l4 4.5M10 3.5L14 8l-4 4.5" />
        </svg>
        <h1>Code Editor</h1>
        <p className="welcome-lede">Fast, keyboard-driven editing for the folders you work in.</p>
      </div>
    </section>
  );
}
