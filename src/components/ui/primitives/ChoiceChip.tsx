import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface ChoiceChipProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'ref'> {
  label: string;
  /** Render as a "crusty" (outlined) chip with a label + description. */
  crusty?: boolean;
  description?: string;
}

export const ChoiceChip = forwardRef<HTMLInputElement, ChoiceChipProps>(function ChoiceChip(
  { label, description, crusty = false, className, id, ...rest }, ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label className={cn('choice-chip', crusty ? 'choice-chip--crusty' : '')}>
      <input ref={ref} id={inputId} className="sr-only" {...rest} />
      <span className="flex items-center gap-3">
        <span className="text-body font-semibold text-ink-muted">{label}</span>
        {description ? <span className="text-caption text-ink-muted/60">{description}</span> : null}
      </span>
      {description ? <span className="text-caption text-ink-muted/40">{description}</span> : null}
    </label>
  );
});
