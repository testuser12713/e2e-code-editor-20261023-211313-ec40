import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** Small muted label above a field (design: `.field-label`, workspace-search.html). */
export function FieldLabel({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('field-label', className)} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

/** Inline validation message (design: `.field-error`, find bar invalid regex). */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className="field-error" id={id} role="alert">
      {children}
    </p>
  );
}

/** Label + control + optional error, stacked (design: `.field`). */
export function Field({
  label,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  /** Shown only once the caller decided the field was touched or submitted. */
  error?: ReactNode;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  invalid?: boolean;
}

/** An input with trailing controls in one frame (design: `.input-group`, find bar). */
export function InputGroup({ invalid = false, className, ...rest }: InputGroupProps) {
  return <div className={cn('input-group', invalid && 'is-invalid', className)} {...rest} />;
}

/** A titled block of settings (design: `.settings-group` with an `h3`, settings.html). */
export function SettingsGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

/** One setting: label left, control right, optional description below (design: `.setting-row`). */
export function SettingRow({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <label className="setting-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {description ? <p className="setting-desc">{description}</p> : null}
    </div>
  );
}
