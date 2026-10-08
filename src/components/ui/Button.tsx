import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand/90 shadow-sm',
  secondary: 'bg-surface text-ink-muted border border-line hover:border-brand/40 hover:text-ink',
  accent: 'bg-accent text-accent-contrast hover:bg-accent/90 shadow-sm',
  outline: 'border border-line/60 text-ink-muted hover:border-brand/50 hover:bg-brand/5 hover:text-ink',
  ghost: 'text-ink-muted hover:bg-ink/5',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-sm',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-label gap-1.5 rounded-pill',
  md: 'h-11 px-5 text-label gap-2 rounded-pill',
  lg: 'h-12 px-7 text-body-lg gap-2 rounded-pill',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-body transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading ? <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
