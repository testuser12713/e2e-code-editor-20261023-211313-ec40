import type { ReactNode } from 'react';

/** Header line of a sidebar view: upper-case title, optional actions right (design: `.sidebar-header`). */
export function SidebarHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="sidebar-header">
      <SidebarTitle>{title}</SidebarTitle>
      {actions ? <div className="sidebar-actions">{actions}</div> : null}
    </div>
  );
}

/** The small upper-case caption (design: `.sidebar-title`). */
export function SidebarTitle({ children }: { children: ReactNode }) {
  return <span className="sidebar-title">{children}</span>;
}

/** Second line, e.g. the workspace folder name (design: `.sidebar-subtitle`). */
export function SidebarSubtitle({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="sidebar-subtitle">
      <span className="truncate" title={title}>
        {children}
      </span>
    </div>
  );
}

/** The scrolling content region of a sidebar view (design: `.sidebar-body`). */
export function SidebarBody({ children }: { children: ReactNode }) {
  return <div className="sidebar-body">{children}</div>;
}
