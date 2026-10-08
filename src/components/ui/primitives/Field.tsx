import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface FieldProps {
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ error, className, children }: FieldProps) {
  return (
    <div className={cn('field', error ? 'field--error' : '', className)}>
      {children}
    </div>
  );
}
