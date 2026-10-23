import type { DragEventHandler } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface TabItemProps {
  name: string;
  /** Full path, shown as tooltip. */
  title?: string;
  active?: boolean;
  dirty?: boolean;
  /** Preview tab, name in italics until it is pinned. */
  preview?: boolean;
  readOnly?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onSelect?: () => void;
  onClose?: () => void;
  /** Double-click pins a preview tab. */
  onPin?: () => void;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  testId?: string;
  className?: string;
}

/**
 * One editor tab with its states: active, dirty (dot that turns into the close
 * cross on hover), preview (italic), read-only (lock), dragging and drop target
 * (design: `.tab`, editor.html).
 */
export function TabItem({
  name,
  title,
  active = false,
  dirty = false,
  preview = false,
  readOnly = false,
  dragging = false,
  dropTarget = false,
  onSelect,
  onClose,
  onPin,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  testId,
  className,
}: TabItemProps) {
  return (
    <div
      className={cn(
        'tab',
        active && 'is-active',
        dirty && 'is-dirty',
        preview && 'is-preview',
        dragging && 'is-dragging',
        dropTarget && 'is-drop-target',
        className,
      )}
      role="tab"
      aria-selected={active}
      title={title}
      draggable={draggable}
      data-testid={testId}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onAuxClick={(e) => {
        if (e.button === 1 && onClose) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <button className="tab-label" type="button" onClick={onSelect} onDoubleClick={onPin}>
        {readOnly ? <Icon name="lock" className="tab-lock" /> : null}
        <span className="tab-name">{name}</span>
        {dirty ? <span className="sr-only tab-dirty-label"> (unsaved)</span> : null}
      </button>
      <button className="tab-close" type="button" aria-label={`Close ${name}`} title={`Close ${name}`} onClick={onClose} disabled={!onClose}>
        <Icon name="close" />
        {/* The dot itself names the unsaved state (class, accessible name and
            tooltip), so the marker is identifiable inside the tab and not only
            through the `is-dirty` class on the tab element. */}
        {dirty ? (
          <span
            className="tab-dot tab-dirty-dot"
            role="img"
            aria-label="Unsaved changes"
            title="Unsaved changes"
            data-testid="tab-dirty-dot"
          />
        ) : (
          <span className="tab-dot" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
