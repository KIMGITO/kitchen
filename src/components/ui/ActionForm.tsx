'use client';
import { useActionState, type ReactNode } from 'react';
import { Button } from './Button';
import type { ActionResult } from '@/lib/actions/result';

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Wraps a server action with pending/success/error states. Keeps pages free of boilerplate. */
export function ActionForm({ action, submitLabel, children, className, variant = 'primary' }:
  { action: Action; submitLabel: string; children?: ReactNode; className?: string; variant?: 'primary' | 'accent' | 'outline' | 'danger' }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? 'flex flex-col gap-4'}>
      {children}
      {state && !state.ok ? <p role="alert" className="text-caption text-danger">{state.error}</p> : null}
      {state && state.ok && state.message ? <p role="status" className="text-caption text-success">{state.message}</p> : null}
      <div><Button type="submit" variant={variant} loading={pending}>{submitLabel}</Button></div>
    </form>
  );
}
