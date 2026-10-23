import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  default: undefined,
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

/** Text button (design: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', block = false, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('btn', VARIANT_CLASS[variant], size === 'sm' && 'btn-sm', block && 'btn-block', className)}
      {...rest}
    />
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName;
  /** Accessible name; also the tooltip unless `title` is given. */
  label: string;
}

/** Square icon-only button (design: `.icon-btn`, find bar arrows and close). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, title, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn('icon-btn', className)} aria-label={label} title={title ?? label} {...rest}>
      <Icon name={icon} />
    </button>
  );
});

export interface ActivityButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName;
  label: string;
  /** The view this button shows is the current one. */
  current?: boolean;
}

/** Activity bar button (design: `.activity-btn`, `aria-current="page"` when selected). */
export function ActivityButton({ icon, label, current = false, className, type = 'button', ...rest }: ActivityButtonProps) {
  return (
    <button
      type={type}
      className={cn('activity-btn', className)}
      aria-label={label}
      title={label}
      aria-current={current ? 'page' : undefined}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export interface ToggleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'onChange'> {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  label: string;
  children: ReactNode;
}

/** Two-state option button (design: `.toggle`, match case / whole word / regex). */
export function ToggleButton({ pressed, onPressedChange, label, title, className, onClick, type = 'button', ...rest }: ToggleButtonProps) {
  return (
    <button
      type={type}
      className={cn('toggle', className)}
      aria-pressed={pressed}
      aria-label={label}
      title={title ?? label}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onPressedChange?.(!pressed);
      }}
      {...rest}
    />
  );
}

/** A keyboard shortcut such as `Ctrl+K Ctrl+O` drawn as key caps (design: `.keys` / `.kbd`). */
export function Keys({ shortcut, className }: { shortcut: string; className?: string }) {
  const chords = shortcut.split(' ').filter(Boolean);
  return (
    <span className={cn('keys', className)}>
      {chords.map((chord, i) => (
        <span key={`${chord}-${i}`} style={{ display: 'contents' }}>
          {i > 0 && <span className="gap" />}
          {chord.split('+').map((k, j) => (
            <kbd className="kbd" key={`${k}-${j}`}>
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

/** Small pill label (design: `.badge`, `.badge-accent`, `.badge-warn`). */
export function Badge({ tone = 'default', children }: { tone?: 'default' | 'accent' | 'warn'; children: ReactNode }) {
  return <span className={cn('badge', tone === 'accent' && 'badge-accent', tone === 'warn' && 'badge-warn')}>{children}</span>;
}
