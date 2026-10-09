'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from './cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand/90 shadow-sm active:bg-brand/95',
  secondary: 'bg-surface text-ink-muted border border-line hover:border-brand/40 hover:text-ink active:bg-surface-alt',
  accent: 'bg-accent text-accent-contrast hover:bg-accent/90 shadow-sm active:bg-accent/95',
  outline: 'border border-line/60 text-ink-muted hover:border-brand/50 hover:bg-brand/5 hover:text-ink active:bg-brand/10',
  ghost: 'text-ink-muted hover:bg-ink/5 active:bg-ink/10',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-sm active:bg-danger/95',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-label gap-1.5 rounded-pill',
  md: 'h-11 px-5 text-label gap-2 rounded-pill',
  lg: 'h-12 px-7 text-body-lg gap-2 rounded-pill',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; loading?: boolean;
  /** Text shown next to the spinner while loading. Falls back to children when omitted. */
  loadingText?: ReactNode;
  /** When false, do NOT auto-enter loading from parent <form action> pending state. Default true for submit buttons. */
  autoLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, loadingText, autoLoading, disabled, type, className, children, ...rest }, ref,
) {
  // Auto-loading: a submit button inside `<form action={serverAction}>` shows its
  // spinner as soon as the form is submitted — no wiring needed at call sites.
  // `useFormStatus` returns idle state outside a form, so this is safe everywhere.
  const { pending: formPending } = useFormStatus();
  const isSubmit = (type ?? 'submit') === 'submit';
  const autoBusy = (autoLoading ?? isSubmit) && formPending;
  const busy = Boolean(loading) || autoBusy;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-loading={busy || undefined}
      className={cn(
        'inline-flex select-none touch-manipulation items-center justify-center gap-2 font-sans transition-all duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none',
        'data-[loading=true]:cursor-wait data-[loading=true]:opacity-90',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      <span className={cn('inline-flex items-center gap-2', busy && 'animate-fade-in-fast')}>
        {busy && loadingText ? loadingText : children}
      </span>
      {busy ? <span className="sr-only">Loading</span> : null}
    </button>
  );
});

