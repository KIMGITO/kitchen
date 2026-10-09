'use client';
import { useId, useState } from 'react';
import { Field } from './primitives/Field';
import { cn } from './cn';
import { PHONE_ERROR, kePhoneLocal, sanitizeLocalDigits } from '@/lib/phone';

export interface PhoneInputProps {
  label: string;
  /** Name of the (hidden) field that carries the normalised +254XXXXXXXXX value. Empty until the number is valid. */
  name?: string;
  defaultValue?: string | null;
  /** Called with +254XXXXXXXXX when valid, or '' while incomplete. */
  onValueChange?: (e164: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
}

/** Kenyan mobile field: fixed "+254" prefix, 9 digits. Pasting 0712…, 254712… or +254 712… all work. */
export function PhoneInput({ label, name, defaultValue, onValueChange, required, hint, error, disabled, autoComplete = 'tel-national', className }: PhoneInputProps) {
  const id = useId();
  const [digits, setDigits] = useState(() => kePhoneLocal(defaultValue));
  const [touched, setTouched] = useState(false);
  const valid = /^[17]\d{8}$/.test(digits);
  const e164 = valid ? `+254${digits}` : '';
  const shownError = error ?? (touched && digits.length > 0 && !valid ? PHONE_ERROR : touched && required && digits.length === 0 ? 'Enter your mobile number.' : undefined);
  const describedBy = shownError ? `${id}-err` : hint ? `${id}-hint` : undefined;

  return (
    <Field error={shownError} className={className}>
      <label htmlFor={id} className="text-body block text-ink">
        {label}{required ? <span aria-hidden className="ml-1 text-danger">*</span> : null}
      </label>
      <div className={cn('flex h-11 w-full overflow-hidden rounded-md border bg-surface transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-accent/40',
        shownError ? 'border-danger' : 'border-line', disabled && 'opacity-60')}>
        <span aria-hidden className="grid select-none place-items-center border-r border-line bg-tint-alt px-3 text-body font-medium text-ink">+254</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete={autoComplete}
          placeholder="712 345 678"
          value={digits}
          disabled={disabled}
          required={required}
          maxLength={14}
          pattern="[17][0-9]{8}"
          title="9 digits starting with 7 or 1, e.g. 712345678"
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            const next = sanitizeLocalDigits(e.target.value);
            setDigits(next);
            onValueChange?.(/^[17]\d{8}$/.test(next) ? `+254${next}` : '');
          }}
          onBlur={() => setTouched(true)}
          className="min-w-0 flex-1 bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-soft"
        />
      </div>
      {name ? <input type="hidden" name={name} value={e164} /> : null}
      {shownError ? <p id={`${id}-err`} role="alert" className="field-error">{shownError}</p> : null}
      {hint && !shownError ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
    </Field>
  );
}
