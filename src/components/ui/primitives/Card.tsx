import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface CardProps {
  raised?: boolean;
  className?: string;
  children: ReactNode;
}

/** Elevated card with a warm border and soft shadow. */
export function Card({ raised = false, className, children }: CardProps) {
  return (
    <div className={cn('card', raised ? 'card-raised' : '', className)}>
      {children}
    </div>
  );
}

/** A minimal single-element card. */
export function CardBlock({ raised = false, className, children }: CardProps) {
  return (
    <div className={cn('rounded-lg border border-line/70 bg-surface shadow-card', raised ? 'shadow-raised' : '', className)}>
      {children}
    </div>
  );
}
