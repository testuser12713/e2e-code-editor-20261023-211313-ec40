import { forwardRef, type ButtonHTMLAttributes, type KeyboardEventHandler, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

/* ---------- title bar (design/mockups/editor.html: header.titlebar) ---------- */

/**
 * The window's title area: brand mark, menu bar slot, centred window title and
 * the window controls. The controls are drawn as in the mockup and hidden from
 * assistive technology — the operating system's own frame owns them.
 */
export function TitleBar({ menu, title, testId = 'title-bar' }: { menu?: ReactNode; title: ReactNode; testId?: string }) {
  return (
    <header className="titlebar" data-testid={testId}>
      <span className="titlebar-brand">
        <Icon name="logo" />
      </span>
      {menu}
      <div className="titlebar-title" data-testid="window-title">
        {title}
      </div>
      <WindowControls />
    </header>
  );
}

/** Minimise / maximise / close glyphs (design: `.window-controls`, aria-hidden decoration). */
export function WindowControls() {
  const glyphs: IconName[] = ['win-min', 'win-max', 'win-close'];
  return (
    <div className="window-controls" aria-hidden="true">
      {glyphs.map((g) => (
        <span key={g}>
          <Icon name={g} />
        </span>
      ))}
    </div>
  );
}

/** The horizontal menu bar container (design: `nav.menubar`). */
export const MenuBar = forwardRef<HTMLElement, { children: ReactNode; label?: string; onKeyDown?: KeyboardEventHandler<HTMLElement> }>(function MenuBar(
  { children, label = 'Application menu', onKeyDown },
  ref,
) {
  return (
    <nav ref={ref} className="menubar" aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </nav>
  );
});

/** One top-level menu with its popup, positioned below its button (design: menu bar dropdown). */
export function MenuBarEntry({ children }: { children: ReactNode }) {
  return <div className="menubar-entry">{children}</div>;
}

export interface MenuBarItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  expanded: boolean;
}

/** A top-level menu button such as File or Edit (design: `.menubar-item`, `aria-expanded`). */
export const MenuBarItem = forwardRef<HTMLButtonElement, MenuBarItemProps>(function MenuBarItem({ expanded, className, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={cn('menubar-item', className)} aria-haspopup="menu" aria-expanded={expanded} {...rest} />;
});

/* ---------- activity bar (design: nav.activitybar) ---------- */

/** The vertical view switcher on the left edge; put ActivityButtons and one ActivitySpacer inside. */
export function ActivityBar({ children, label = 'Views', testId = 'activity-bar' }: { children: ReactNode; label?: string; testId?: string }) {
  return (
    <nav className="activitybar" aria-label={label} data-testid={testId}>
      {children}
    </nav>
  );
}

/** Pushes the following activity buttons to the bottom (design: `.activity-spacer`). */
export function ActivitySpacer() {
  return <span className="activity-spacer" />;
}

/* ---------- status bar frame (design: footer.statusbar) ---------- */

/** The status bar strip: a left and a right StatusGroup. */
export function StatusBarFrame({ children, testId = 'status-bar' }: { children: ReactNode; testId?: string }) {
  return (
    <footer className="statusbar" data-testid={testId}>
      {children}
    </footer>
  );
}

/** A run of status items (design: `.status-group`). */
export function StatusGroup({ children }: { children: ReactNode }) {
  return <div className="status-group">{children}</div>;
}

export interface StatusItemProps {
  children: ReactNode;
  /** Tooltip; for a button also what pressing it does. */
  title?: string;
  /** Given: the item is a button (language, indentation, line ending). */
  onPress?: () => void;
  icon?: IconName;
  testId?: string;
  className?: string;
}

/** One status entry: plain text, or a button when it can be pressed (design: `.status-item`). */
export function StatusItem({ children, title, onPress, icon, testId, className }: StatusItemProps) {
  const content = (
    <>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <button className={cn('status-item', className)} type="button" title={title} onClick={onPress} data-testid={testId}>
        {content}
      </button>
    );
  }
  return (
    <span className={cn('status-item', className)} title={title} data-testid={testId}>
      {content}
    </span>
  );
}
