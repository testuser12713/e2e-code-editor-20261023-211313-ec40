import { forwardRef, type CSSProperties, type InputHTMLAttributes, type MouseEventHandler, type KeyboardEventHandler, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

/** The root list of a file tree (design: `ul.tree[role=tree]`, explorer-context-menu.html). */
export function Tree({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <ul className="tree" role="tree" aria-label={label} data-testid={testId}>
      {children}
    </ul>
  );
}

export interface TreeItemProps {
  /** A folder passes its expanded state; a file leaves it undefined. */
  expanded?: boolean;
  /** The row (TreeRow) of this item. */
  row: ReactNode;
  /** Child items, rendered only when expanded. */
  children?: ReactNode;
  selected?: boolean;
}

/** One node of the tree with its nested group (design: `li.tree-item[role=treeitem]`). */
export function TreeItem({ expanded, row, children, selected }: TreeItemProps) {
  return (
    <li className="tree-item" role="treeitem" aria-expanded={expanded} aria-selected={selected}>
      {row}
      {expanded && children ? (
        <ul className="tree-children" role="group">
          {children}
        </ul>
      ) : null}
    </li>
  );
}

export interface TreeRowProps {
  name: string;
  kind: 'dir' | 'file';
  depth: number;
  /** The file open in the active tab. */
  active?: boolean;
  /** The row a context menu was opened on. */
  menuTarget?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  title?: string;
  testId?: string;
  className?: string;
}

/**
 * The clickable line of a tree node: chevron for folders, kind icon, name;
 * indented by depth (design: `.tree-row`, `.is-active`, `.is-menu-target`).
 */
export const TreeRow = forwardRef<HTMLButtonElement, TreeRowProps>(function TreeRow(
  { name, kind, depth, active = false, menuTarget = false, onClick, onDoubleClick, onContextMenu, onKeyDown, title, testId, className },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn('tree-row', active && 'is-active', menuTarget && 'is-menu-target', className)}
      type="button"
      style={{ '--depth': depth } as CSSProperties}
      data-kind={kind}
      title={title}
      data-testid={testId}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      {kind === 'dir' ? <Icon name="chevron-right" className="tree-chevron" /> : <span className="tree-spacer" />}
      <Icon name={kind === 'dir' ? 'folder' : 'file'} className="tree-kind" />
      <span className="tree-name">{name}</span>
    </button>
  );
});

export interface TreeInputRowProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-label'> {
  depth: number;
  label: string;
}

/** Inline name field for new file / folder and rename (design: `.tree-input-row`). */
export const TreeInputRow = forwardRef<HTMLInputElement, TreeInputRowProps>(function TreeInputRow({ depth, label, className, ...rest }, ref) {
  return (
    <li className="tree-input-row" style={{ '--depth': depth } as CSSProperties} role="none">
      <input ref={ref} className={cn('input', className)} type="text" aria-label={label} spellCheck={false} autoComplete="off" {...rest} />
    </li>
  );
});
