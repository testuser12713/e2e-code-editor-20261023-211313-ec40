import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  options: SelectOption[];
  value: string;
  onValueChange?: (value: string) => void;
}

/** Native drop-down (design: `.select`, settings.html theme / font family / tab size). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, value, onValueChange, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn('select', className)}
      value={value}
      onChange={(e) => onValueChange?.(e.currentTarget.value)}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
});
