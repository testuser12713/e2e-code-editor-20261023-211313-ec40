import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Monospace variant for paths, globs and numbers (design: `.input-mono`). */
  mono?: boolean;
  /** Marks the field invalid for assistive technology; the visual error is FieldError / InputGroup. */
  invalid?: boolean;
}

/** Single-line text input (design: `.input`). */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { mono = false, invalid = false, className, type = 'text', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn('input', mono && 'input-mono', type === 'number' && 'input-number', className)}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      autoComplete="off"
      {...rest}
    />
  );
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** On/off switch backed by a real checkbox (design: `.switch` in settings.html). */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, className, ...rest },
  ref,
) {
  return (
    <span className={cn('switch', className)}>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.currentTarget.checked)}
        {...rest}
      />
      <span className="switch-track" />
    </span>
  );
});
