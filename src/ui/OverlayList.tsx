import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { Keys } from './Button';

/**
 * The picker overlay shared by Quick Open, the Command Palette and Go to Line
 * (design: `.qp`, quick-open.html, command-palette.html, go-to-line.html).
 */
export function OverlayList({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="qp" role="dialog" aria-label={label} data-testid={testId}>
      {children}
    </div>
  );
}

export interface OverlayInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-label'> {
  label: string;
  /** The id of the listbox this combobox controls; omit when there is none (Go to Line). */
  listId?: string;
  activeOptionId?: string;
}

/** The search field at the top of a picker (design: `.qp-input-wrap .input`). */
export const OverlayInput = forwardRef<HTMLInputElement, OverlayInputProps>(function OverlayInput(
  { label, listId, activeOptionId, className, ...rest },
  ref,
) {
  return (
    <div className="qp-input-wrap">
      <input
        ref={ref}
        className={cn('input', 'qp-input', className)}
        type="text"
        aria-label={label}
        role={listId ? 'combobox' : undefined}
        aria-expanded={listId ? true : undefined}
        aria-controls={listId}
        aria-activedescendant={activeOptionId}
        spellCheck={false}
        autoComplete="off"
        {...rest}
      />
    </div>
  );
});

/** The scrolling option list of a picker (design: `.qp-list`, role listbox). */
export function OverlayListBox({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div className="qp-list" role="listbox" id={id} aria-label={label}>
      {children}
    </div>
  );
}

/** Group heading inside a picker list, e.g. "Recently opened" (design: `.qp-heading`). */
export function OverlayHeading({ children }: { children: ReactNode }) {
  return (
    <div className="qp-heading" role="presentation">
      {children}
    </div>
  );
}

/** "No matching files" (design: `.qp-empty`). */
export function OverlayEmpty({ children }: { children: ReactNode }) {
  return <div className="qp-empty">{children}</div>;
}

/** Hint text below the input, e.g. "Current line: 30 of 37" (design: `.qp-hint`). */
export function OverlayHint({ children, invalid = false }: { children: ReactNode; invalid?: boolean }) {
  return (
    <div className={cn('qp-hint', invalid && 'is-invalid')} aria-live="polite">
      {children}
    </div>
  );
}

/** Key legend at the bottom of a picker (design: `.qp-footer`). */
export function OverlayFooter({ hints }: { hints: { keys: string; label: string }[] }) {
  return (
    <div className="qp-footer">
      {hints.map((h) => (
        <span key={h.label}>
          <Keys shortcut={h.keys} /> {h.label}
        </span>
      ))}
    </div>
  );
}

export interface ListRowProps {
  id?: string;
  title: ReactNode;
  /** Muted second part, e.g. the folder of a file (design: `.qp-sub`). */
  subtitle?: ReactNode;
  shortcut?: string;
  selected?: boolean;
  onSelect?: () => void;
  onHover?: () => void;
  className?: string;
  testId?: string;
}

/** One option of a picker list; the selected row carries the accent tint (design: `.qp-row.is-selected`). */
export function ListRow({ id, title, subtitle, shortcut, selected = false, onSelect, onHover, className, testId }: ListRowProps) {
  return (
    <div
      id={id}
      className={cn('qp-row', selected && 'is-selected', className)}
      role="option"
      aria-selected={selected}
      data-testid={testId}
      onClick={onSelect}
      onMouseMove={onHover}
    >
      <span className="qp-title">{title}</span>
      {subtitle ? <span className="qp-sub">{subtitle}</span> : null}
      {shortcut ? <Keys shortcut={shortcut} /> : null}
    </div>
  );
}

/** Text with the characters at `indices` emphasised as fuzzy-match hits (design: `.hl`). */
export function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const hits = new Set(indices);
  const parts: ReactNode[] = [];
  let run = '';
  let runHit = false;
  const flush = (key: number) => {
    if (!run) return;
    parts.push(runHit ? <span className="hl" key={key}>{run}</span> : <span key={key}>{run}</span>);
    run = '';
  };
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    if (hit !== runHit) {
      flush(i);
      runHit = hit;
    }
    run += text[i];
  }
  flush(text.length);
  return <>{parts}</>;
}
