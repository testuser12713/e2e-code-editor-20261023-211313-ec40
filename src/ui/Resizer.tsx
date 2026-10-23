import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from './cn';

export interface ResizerProps {
  /** Current size of the pane left of the resizer, in px. */
  value: number;
  min: number;
  max: number;
  onResize: (value: number) => void;
  label: string;
  testId?: string;
  className?: string;
}

export const clampSize = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)));

/**
 * Vertical drag handle between two panes (design: `.resizer`, role separator).
 * Pointer drag, and from the keyboard: arrows by 16 px (48 with Shift), Home / End.
 */
export function Resizer({ value, min, max, onResize, label, testId, className }: ResizerProps) {
  const drag = useRef<{ startX: number; startValue: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { startX: e.clientX, startValue: value };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(clampSize(drag.current.startValue + e.clientX - drag.current.startX, min, max));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') onResize(clampSize(value - step, min, max));
    else if (e.key === 'ArrowRight') onResize(clampSize(value + step, min, max));
    else if (e.key === 'Home') onResize(min);
    else if (e.key === 'End') onResize(max);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={cn('resizer', className)}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      data-dragging={dragging ? 'true' : undefined}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}
