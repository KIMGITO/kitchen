import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { Field } from './primitives/Field';
// import { Field } from './Field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Adds the custom-field wrapper with label/hint/error support. */
  asField?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, asField = true, ...rest }, ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

  if (asField) {
    return (
      <Field error={error}>
        <label htmlFor={inputId} className="field-label">{label}</label>
        <input
          ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          className={cn(
            'field-input h-11 w-full rounded-md border bg-surface px-3.5 text-body text-ink-muted placeholder:text-ink-muted/50',
            'focus:border-brand focus:bg-surface focus:shadow-xs transition-colors outline-none',
            error ? 'border-danger' : 'border-line',
            className,
          )}
          {...rest}
        />
        {error ? <p id={`${inputId}-err`} role="alert" className="field-error">{error}</p> : null}
        {hint ? <p id={`${inputId}-hint`} className="field-hint">{hint}</p> : null}
      </Field>
    );
  }

  return (
    <input
      ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
      className={cn(
        'h-11 rounded-md border bg-surface px-3.5 text-body text-ink-muted placeholder:text-ink-muted/50',
        'focus:border-brand focus:bg-surface focus:shadow-xs transition-colors outline-none',
        error ? 'border-danger' : 'border-line',
        className,
      )}
      {...rest}
    />
  );
});
