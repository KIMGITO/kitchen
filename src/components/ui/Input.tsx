'use client';
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './cn';
import { Field } from './primitives/Field';
import { Icon } from './primitives/Icon';

export type InputVariant =
  | 'border'
  | 'bordered'
  | 'borderless'
  | 'ghost'
  | 'flush'
  | 'underline'
  | 'dotted';
export type InputSize = 'sm' | 'md' | 'lg';
export type InputWidth = 'full' | 'auto' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type LabelPlacement = 'top' | 'left' | 'hidden';
export type IconPosition = 'left' | 'right';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  error?: string;
  hint?: string;
  supportingText?: string;
  variant?: InputVariant;
  size?: InputSize;
  width?: InputWidth;
  labelPlacement?: LabelPlacement;
  labelWidthClassName?: string;
  classNameLabel?: string;
  icon?: ReactNode;
  iconPosition?: IconPosition;
  classNameInput?: string;
  classNameField?: string;
  asField?: boolean;
}

type ResolvedVariant = 'bordered' | 'borderless' | 'flush' | 'dotted';

function resolveVariant(v: InputVariant): ResolvedVariant {
  if (v === 'borderless' || v === 'ghost') return 'borderless';
  if (v === 'flush' || v === 'underline') return 'flush';
  if (v === 'dotted') return 'dotted';
  return 'bordered';
}

const widthStyles: Record<InputWidth, string> = {
  full: 'w-full',
  auto: 'w-auto',
  xs: 'w-28',
  sm: 'w-44',
  md: 'w-64',
  lg: 'w-96',
  xl: 'w-[32rem] max-w-full',
};

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-9 px-3 text-body',
  md: 'h-11 px-3.5 text-body',
  lg: 'h-12 px-4 text-body-lg',
};

const sizeIconBox: Record<InputSize, string> = {
  sm: 'size-4',
  md: 'size-[18px]',
  lg: 'size-5',
};

function variantStyles(variant: ResolvedVariant, hasError: boolean): string {
  switch (variant) {
    case 'borderless':
      return cn(
        'rounded-md border-0 bg-surface shadow-none outline-none ring-0',
        'focus:border-0 focus:shadow-none focus:ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0',
        hasError ? 'text-danger placeholder:text-danger/60' : '',
      );
    case 'flush':
      return cn(
        'rounded-none border-0 border-b bg-transparent px-1 shadow-none outline-none ring-0',
        'focus:shadow-none focus:ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0',
        hasError
          ? 'border-danger focus:border-danger'
          : 'border-line focus:border-brand',
      );
    case 'dotted':
      return cn(
        'rounded-md border border-dotted bg-surface outline-none transition-colors',
        'focus:border-brand focus:bg-surface focus:shadow-xs',
        hasError ? 'border-danger' : 'border-line',
      );
    case 'bordered':
    default:
      return cn(
        'rounded-md border bg-surface outline-none transition-colors',
        'focus:border-brand focus:bg-surface focus:shadow-xs',
        hasError ? 'border-danger' : 'border-line',
      );
  }
}

function iconPadding(
  size: InputSize,
  hasIcon: boolean,
  pos?: IconPosition,
): string {
  if (!hasIcon) return '';
  if (pos === 'right')
    return size === 'sm' ? 'pr-9' : size === 'lg' ? 'pr-11' : 'pr-10';
  return size === 'sm' ? 'pl-9' : size === 'lg' ? 'pl-11' : 'pl-10';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    supportingText,
    variant = 'border',
    size = 'sm',
    width = 'full',
    labelPlacement = 'top',
    labelWidthClassName,
    classNameLabel,
    icon,
    iconPosition = 'left',
    className,
    classNameInput,
    classNameField,
    id,
    required,
    disabled,
    asField = true,
    ...rest
  },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const helpText = supportingText ?? hint;
  const describedBy = error
    ? `${inputId}-err`
    : helpText
      ? `${inputId}-hint`
      : undefined;
  const resolved = resolveVariant(variant);
  const hasError = Boolean(error);
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = rest.type === 'password';

  const inputClasses = cn(
    'field-input w-full text-ink-muted placeholder:text-ink-soft',
    'disabled:cursor-not-allowed disabled:opacity-60',
    sizeStyles[size],
    variantStyles(resolved, hasError),
    iconPadding(size, Boolean(icon), iconPosition),
    classNameInput,
    className,
  );

  const renderControl = () => {
    if (isPassword) {
      // Every password field gets a show/hide toggle.
      const { type: _type, ...inputRest } = rest;
      void _type;
      return (
        <span className="relative block w-full">
          <input
            ref={ref}
            id={inputId}
            required={required}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(inputClasses, 'pr-11')}
            autoCapitalize="none"
            spellCheck={false}
            {...inputRest}
            type={showPassword ? 'text' : 'password'}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            disabled={disabled}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-soft transition-colors hover:bg-accent-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Icon name={showPassword ? 'eye-slash' : 'eye'} size={18} />
          </button>
        </span>
      );
    }
    if (!icon) {
      return (
        <input
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClasses}
          {...rest}
        />
      );
    }
    return (
      <span className="relative block w-full">
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-soft',
            iconPosition === 'right' ? 'right-3' : 'left-3',
            sizeIconBox[size],
            '[&>svg]:size-full',
            hasError ? 'text-danger' : '',
          )}
        >
          {icon}
        </span>
        <input
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClasses}
          {...rest}
        />
      </span>
    );
  };

  const renderHelp = () => (
    <>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      {helpText ? (
        <p id={`${inputId}-hint`} className="field-hint text-[10px]">
          {helpText}
        </p>
      ) : null}
    </>
  );

  if (!asField) return renderControl();

  const labelNode = (
    <label
      htmlFor={inputId}
      className={cn(
        'text-body block text-ink',
        labelPlacement === 'hidden' ? 'sr-only' : '',
        labelPlacement === 'left'
          ? cn('shrink-0 pt-2.5', labelWidthClassName ?? 'w-28')
          : '',
        classNameLabel,
      )}
    >
      {label}
      {required ? (
        <span aria-hidden className="ml-1 text-danger">
          *
        </span>
      ) : null}
    </label>
  );

  if (labelPlacement === 'left') {
    return (
      <Field error={error} className={cn(widthStyles[width], classNameField)}>
        <div className="flex items-start gap-3">
          {labelNode}
          <div className="min-w-0 flex-1">
            {renderControl()}
            {renderHelp()}
          </div>
        </div>
      </Field>
    );
  }

  return (
    <Field error={error} className={cn(widthStyles[width], classNameField)}>
      {labelNode}
      {renderControl()}
      {renderHelp()}
    </Field>
  );
});
